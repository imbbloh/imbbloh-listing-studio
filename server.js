const express = require('express');
const fs      = require('fs');
const path    = require('path');
const multer  = require('multer');

// Telegram (GramJS) — loaded lazily so startup doesn't fail if env vars are absent
let _TelegramClient = null, _StringSession = null, _TelegramApi = null;
try {
  _TelegramClient = require('telegram').TelegramClient;
  _TelegramApi    = require('telegram').Api;
  _StringSession  = require('telegram/sessions').StringSession;
} catch (e) {
  console.warn('telegram package unavailable — /telegram/send disabled');
}

let tgClient = null;

async function getTelegramClient() {
  const apiId   = parseInt(process.env.TELEGRAM_API_ID  || '0');
  const apiHash = process.env.TELEGRAM_API_HASH || '';
  const session = process.env.TELEGRAM_SESSION  || '';
  if (!_TelegramClient) throw new Error('telegram package not installed — run npm install');
  if (!apiId || !apiHash || !session) throw new Error('Telegram env vars not configured (TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_SESSION)');
  if (tgClient && tgClient.connected) return tgClient;
  if (!tgClient) {
    tgClient = new _TelegramClient(new _StringSession(session), apiId, apiHash, { connectionRetries: 5 });
  }
  await tgClient.connect();
  return tgClient;
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 12 } });

// Load static assets from disk once at startup — no CDN fetches, no 429 risk
const FRAME_PNG    = fs.readFileSync(path.join(__dirname, 'assets/ns-template-frame.png'));
const FONT_OTF     = fs.readFileSync(path.join(__dirname, 'assets/gagalin.otf'));
const PROMO_PNG    = fs.readFileSync(path.join(__dirname, 'assets/ns-promo-slide.png'));
const FRAME_BASE64 = FRAME_PNG.toString('base64');
const FONT_BASE64  = FONT_OTF.toString('base64');

let PS_FRAME_PNG = null, PS_FRAME_BASE64 = null;
try {
  PS_FRAME_PNG    = fs.readFileSync(path.join(__dirname, 'assets/ps-template-frame.png'));
  PS_FRAME_BASE64 = PS_FRAME_PNG.toString('base64');
} catch (e) {
  console.warn('ps-template-frame.png not found');
}

const PS_PROMO_PNG = fs.readFileSync(path.join(__dirname, 'assets/ps-promo-slide.png'));

const CANVAS_W    = 1080;
const CANVAS_H    = 1080;
const COVER_Y     = 295;
const COVER_H     = 640;
const TITLE_Y     = 1008;
const COVER_Y_PS  = 295;
const COVER_H_PS  = 640;
const TITLE_Y_PS  = 1008;

function titleFontSize(title) {
  const n = title.length;
  if (n <= 12) return 80;
  if (n <= 18) return 70;
  if (n <= 25) return 62;
  if (n <= 34) return 52;
  if (n <= 45) return 42;
  return 34;
}

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toBase64(buffer) {
  return Buffer.from(buffer).toString('base64');
}

function buildThumbnailSvg(gameTitle, coverBase64, frameBase64, fontBase64) {
  const fontSize = titleFontSize(gameTitle);
  const title    = escapeXml(gameTitle.toUpperCase());
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}">
  <defs>
    <style>@font-face { font-family: 'Gagalin'; src: url('data:font/otf;base64,${fontBase64}'); }</style>
  </defs>
  <rect width="${CANVAS_W}" height="${CANVAS_H}" fill="#e8001d"/>
  <image href="data:image/jpeg;base64,${coverBase64}" x="0" y="${COVER_Y}" width="${CANVAS_W}" height="${COVER_H}" preserveAspectRatio="xMidYMid slice"/>
  <image href="data:image/png;base64,${frameBase64}" x="0" y="0" width="${CANVAS_W}" height="${CANVAS_H}"/>
  <text x="${CANVAS_W / 2}" y="${TITLE_Y}" fill="white" font-size="${fontSize}" font-family="Gagalin,Arial,sans-serif" font-weight="900" text-anchor="middle" dominant-baseline="middle" letter-spacing="3">${title}</text>
</svg>`;
}

function extractNintendoAssets(html) {
  const re = /store\/software\/(switch2?)\/(\d{14})\/([a-zA-Z0-9_-]{20,})/g;
  const matches = [...html.matchAll(re)];
  if (!matches.length) throw new Error('Could not extract NSUID/hash from store page');
  const platform = matches[0][1];
  const nsuid    = matches[0][2];
  const hashes   = [...new Set(
    matches.filter(m => m[1] === platform && m[2] === nsuid).map(m => m[3])
  )].slice(0, 10);
  return { platform, nsuid, hashes };
}

function extractPsAssets(html) {
  const ogMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)
                || html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i);
  const coverUrl = ogMatch ? ogMatch[1] : null;
  if (!coverUrl) throw new Error('Could not extract cover image from PlayStation store page');

  const seen = new Set([coverUrl]);
  const screenshotUrls = [];
  const re = /https:\/\/image\.api\.playstation\.com\/[^"'\s<>\\]+/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const url = m[0].split('"')[0].split("'")[0];
    if (!seen.has(url)) { seen.add(url); screenshotUrls.push(url); }
    if (screenshotUrls.length >= 8) break;
  }
  return { coverUrl, screenshotUrls };
}

function buildPsThumbnailSvg(gameTitle, coverBase64, frameBase64, fontBase64) {
  const fontSize = titleFontSize(gameTitle);
  const title    = escapeXml(gameTitle.toUpperCase());
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}">
  <defs>
    <style>@font-face { font-family: 'Gagalin'; src: url('data:font/otf;base64,${fontBase64}'); }</style>
  </defs>
  <rect width="${CANVAS_W}" height="${CANVAS_H}" fill="#ffffff"/>
  <image href="data:image/jpeg;base64,${coverBase64}" x="0" y="${COVER_Y_PS}" width="${CANVAS_W}" height="${COVER_H_PS}" preserveAspectRatio="xMidYMid slice"/>
  <image href="data:image/png;base64,${frameBase64}" x="0" y="0" width="${CANVAS_W}" height="${CANVAS_H}"/>
  <text x="${CANVAS_W / 2}" y="${TITLE_Y_PS}" fill="white" font-size="${fontSize}" font-family="Gagalin,Arial,sans-serif" font-weight="900" text-anchor="middle" dominant-baseline="middle" letter-spacing="3">${title}</text>
</svg>`;
}

function buildCdnUrls(platform, nsuid, hashes) {
  const base     = 'https://assets.nintendo.com/image/upload';
  const mainPath = `store/software/${platform}/${nsuid}/${hashes[0]}`;
  return {
    upload:         `${base}/ar_16:9,c_lpad,w_1240/b_white/f_jpg/q_auto/${mainPath}`,
    coverUrl:       `${base}/ar_16:9,c_lpad,w_1240/b_white/f_auto/q_auto/${mainPath}`,
    screenshotUrls: hashes.map(h =>
      `${base}/ar_16:9,b_auto:border,c_lpad/b_white/f_auto/q_auto/dpr_1.5/store/software/${platform}/${nsuid}/${h}`
    )
  };
}

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

app.options('*', (req, res) => res.sendStatus(204));

// ── Health check (used by UptimeRobot keep-alive ping) ────────────────────
app.get('/health', (req, res) => res.json({ ok: true }));

// ── Serve frontend ─────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── Static asset endpoints (used by iOS canvas renderer) ──────────────────
app.get('/frame', (req, res) => {
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(FRAME_PNG);
});

app.get('/font', (req, res) => {
  res.setHeader('Content-Type', 'font/otf');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(FONT_OTF);
});

app.get('/ps-frame', (req, res) => {
  if (!PS_FRAME_PNG) return res.status(404).json({ error: 'ps-template-frame.png not found' });
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(PS_FRAME_PNG);
});

app.get('/ps-promo-slide', (req, res) => {
  const filename = req.query.filename ? decodeURIComponent(req.query.filename) + '.png' : 'ps-promo-slide.png';
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(PS_PROMO_PNG);
});

// ── Promo slide endpoint ───────────────────────────────────────────────────
// Serves ns-promo-slide.png from memory (loaded at startup) so the frontend
// can download it via the same /download flow without hitting any CDN.
app.get('/promo-slide', (req, res) => {
  const filename = req.query.filename ? decodeURIComponent(req.query.filename) + '.png' : 'ns-promo-slide.png';
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(PROMO_PNG);
});

// ── Image download proxy ───────────────────────────────────────────────────
// Fetches a Nintendo CDN image server-side and streams it back as an
// attachment, bypassing the browser's cross-origin download restriction.
app.get('/download', async (req, res) => {
  const { url, filename } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url' });
  try {
    const imgRes = await fetch(decodeURIComponent(url));
    if (!imgRes.ok) throw new Error('Image fetch failed: ' + imgRes.status);
    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    const ext  = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
    const name = filename ? decodeURIComponent(filename) + '.' + ext : 'image.' + ext;
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send(Buffer.from(await imgRes.arrayBuffer()));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/', async (req, res) => {
  const { storeUrl, gameTitle } = req.body || {};
  if (!storeUrl || !gameTitle) {
    return res.status(400).json({ error: 'Missing storeUrl or gameTitle' });
  }

  try {
    const fullUrl = storeUrl.startsWith('http') ? storeUrl : 'https://' + storeUrl;
    const isPS    = fullUrl.includes('playstation.com');

    const storePage = await fetch(fullUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' }
    });
    if (!storePage.ok) throw new Error('Store page fetch failed: ' + storePage.status);
    const html = await storePage.text();

    if (isPS) {
      if (!PS_FRAME_BASE64) throw new Error('PS frame asset not found — commit assets/ps-template-frame.png to the repo');
      const { coverUrl, screenshotUrls } = extractPsAssets(html);
      const imgRes = await fetch(coverUrl);
      if (!imgRes.ok) throw new Error('Cover image fetch failed: ' + imgRes.status);
      const coverBase64 = toBase64(await imgRes.arrayBuffer());
      const svg = buildPsThumbnailSvg(gameTitle, coverBase64, PS_FRAME_BASE64, FONT_BASE64);
      const thumbnailDataUrl = 'data:image/svg+xml;base64,' + Buffer.from(svg, 'utf-8').toString('base64');
      return res.json({ thumbnailDataUrl, coverBase64, coverUrl, screenshotUrls });
    }

    const { platform, nsuid, hashes } = extractNintendoAssets(html);
    const cdn = buildCdnUrls(platform, nsuid, hashes);

    const imgRes = await fetch(cdn.upload);
    if (!imgRes.ok) throw new Error('Cover image fetch failed: ' + imgRes.status);

    const coverBase64 = toBase64(await imgRes.arrayBuffer());
    const svg = buildThumbnailSvg(gameTitle, coverBase64, FRAME_BASE64, FONT_BASE64);
    const thumbnailDataUrl = 'data:image/svg+xml;base64,' + Buffer.from(svg, 'utf-8').toString('base64');

    res.json({ thumbnailDataUrl, coverBase64, coverUrl: cdn.coverUrl, screenshotUrls: cdn.screenshotUrls });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Telegram send ──────────────────────────────────────────────────────────
// Two strategies tried in order:
//   1. GramJS / MTProto  — requires TELEGRAM_SESSION (my.telegram.org credentials)
//   2. Playwright        — requires TELEGRAM_WEB_SESSION (captured via setup-telegram-web.js)

async function sendViaGramjs(price, files) {
  const client = await getTelegramClient();
  const Api    = _TelegramApi;

  const inputFiles = [];
  for (const f of files) {
    inputFiles.push(await client.uploadFile({ file: f.buffer, workers: 1 }));
  }

  const caption = `Shirt, M, $${price}`;
  const peer    = await client.getInputEntity('@CarousellOfficialBot');

  if (inputFiles.length === 1) {
    await client.invoke(new Api.messages.SendMedia({
      peer,
      media:    new Api.InputMediaUploadedPhoto({ file: inputFiles[0] }),
      message:  caption,
      randomId: BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)),
    }));
  } else {
    await client.invoke(new Api.messages.SendMultiMedia({
      peer,
      multiMedia: inputFiles.map((f, i) => new Api.InputSingleMedia({
        media:    new Api.InputMediaUploadedPhoto({ file: f }),
        randomId: BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)),
        message:  i === 0 ? caption : '',
        entities: [],
      })),
    }));
  }
}

async function sendViaPlaywright(price, files) {
  const sessionB64 = process.env.TELEGRAM_WEB_SESSION;
  if (!sessionB64) throw new Error('TELEGRAM_WEB_SESSION not set — run setup-telegram-web.js');

  const sparticuz  = require('@sparticuz/chromium');
  const { chromium } = require('playwright-core');
  const storageState = JSON.parse(Buffer.from(sessionB64, 'base64').toString('utf-8'));

  const executablePath = await sparticuz.executablePath();
  const browser = await chromium.launch({
    args: [...sparticuz.args, '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--no-zygote'],
    executablePath,
    headless: true,
  });

  try {
    const context = await browser.newContext({ storageState });
    const page    = await context.newPage();

    await page.goto('https://web.telegram.org/k/#@CarousellOfficialBot', { timeout: 60000 })
      .catch(() => { throw new Error('Step 1/5 failed: page load timed out'); });

    await page.waitForFunction(
      () => !document.querySelector('.auth-form') && (document.querySelector('.chat-input') || document.querySelector('.bubbles')),
      { timeout: 40000 }
    ).catch(() => { throw new Error('Step 2/5 failed: session expired or login page appeared — re-run setup-telegram-web.js'); });

    const inputFiles = files.map((f, i) => ({
      name:     `image${i + 1}.${f.mimetype.includes('png') ? 'png' : 'jpg'}`,
      mimeType: f.mimetype,
      buffer:   f.buffer,
    }));

    // Step 1: Click attach button to open the dropdown menu
    await page.locator('attach-menu-button, .attach-file, [class*="attach-file"]').first()
      .click({ timeout: 10000 })
      .catch(() => { throw new Error('Step 3/5 failed: attach button not found or not clickable'); });
    await page.waitForTimeout(700);

    // Step 2: Click "Photo or Video" menu item — this triggers the file chooser
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 15000 })
        .catch(() => { throw new Error('Step 3/5 failed: file chooser did not open after clicking Photo/Video menu item'); }),
      page.locator([
        'button:has-text("Photo")',
        '.btn-menu-item:has-text("Photo")',
        'button:has-text("Media")',
        '.btn-menu-item:has-text("Media")',
        '.btn-menu-item',
      ].join(', ')).first().click({ timeout: 5000 })
        .catch(() => { throw new Error('Step 3/5 failed: Photo/Video option not found in attach menu'); }),
    ]);
    await fileChooser.setFiles(inputFiles);

    await page.waitForSelector('.popup, .popup-container', { timeout: 20000 })
      .catch(() => { throw new Error('Step 4/5 failed: send-photo popup did not appear'); });

    const captionSelectors = [
      '.popup .input-field-input',
      '.popup [contenteditable="true"]',
      '.popup textarea',
    ];
    for (const sel of captionSelectors) {
      const el = page.locator(sel).first();
      if (await el.count() > 0) {
        await el.click();
        await el.fill(`Shirt, M, $${price}`);
        break;
      }
    }

    const sendSelectors = ['.popup .btn-primary', '.popup .btn-send', '.popup button[class*="send"]'];
    let clicked = false;
    for (const sel of sendSelectors) {
      const el = page.locator(sel).first();
      if (await el.count() > 0) { await el.click(); clicked = true; break; }
    }
    if (!clicked) await page.keyboard.press('Enter');

    await page.waitForTimeout(6000);

  } finally {
    await browser.close();
  }
}

app.post('/telegram/send', upload.array('images'), async (req, res) => {
  try {
    const price = (req.body.price || '').trim();
    if (!price) return res.status(400).json({ error: 'Missing price' });
    const files = req.files;
    if (!files || !files.length) return res.status(400).json({ error: 'No images uploaded' });

    // Prefer GramJS if configured; fall back to Playwright browser automation
    if (process.env.TELEGRAM_SESSION && _TelegramClient) {
      await sendViaGramjs(price, files);
    } else {
      await sendViaPlaywright(price, files);
    }

    res.json({ ok: true, count: files.length });
  } catch (err) {
    console.error('[telegram/send]', err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Thumbnail server running on port ${PORT}`));
