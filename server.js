const express = require('express');
const fs      = require('fs');
const path    = require('path');

// Load static assets from disk once at startup — no CDN fetches, no 429 risk
const FRAME_PNG    = fs.readFileSync(path.join(__dirname, 'assets/ns-template-frame.png'));
const FONT_OTF     = fs.readFileSync(path.join(__dirname, 'assets/gagalin.otf'));
const PROMO_PNG    = fs.readFileSync(path.join(__dirname, 'assets/ns-promo-slide.png'));
const FRAME_BASE64 = FRAME_PNG.toString('base64');
const FONT_BASE64  = FONT_OTF.toString('base64');

const CANVAS_W  = 1080;
const CANVAS_H  = 1080;
const COVER_Y   = 295;
const COVER_H   = 640;
const TITLE_Y   = 1008;

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
    const storePage = await fetch(fullUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; imbbloh-bot/1.0)' }
    });
    if (!storePage.ok) throw new Error('Store page fetch failed: ' + storePage.status);
    const html = await storePage.text();

    const { platform, nsuid, hashes } = extractNintendoAssets(html);
    const cdn = buildCdnUrls(platform, nsuid, hashes);

    const imgRes = await fetch(cdn.upload);
    if (!imgRes.ok) throw new Error('Cover image fetch failed: ' + imgRes.status);

    const coverBase64 = toBase64(await imgRes.arrayBuffer());
    const svg = buildThumbnailSvg(gameTitle, coverBase64, FRAME_BASE64, FONT_BASE64);
    const thumbnailDataUrl = 'data:image/svg+xml;base64,' + Buffer.from(svg, 'utf-8').toString('base64');

    res.json({
      thumbnailDataUrl,
      coverBase64,
      coverUrl:       cdn.coverUrl,
      screenshotUrls: cdn.screenshotUrls
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Thumbnail server running on port ${PORT}`));
