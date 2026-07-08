const express = require('express');

// Pinned to commit SHA so jsDelivr caches permanently
const FRAME_URL = 'https://cdn.jsdelivr.net/gh/imbbloh/imbbloh-listing-studio@54b9ae1/assets/ns-template-frame.png';
const FONT_URL  = 'https://cdn.jsdelivr.net/gh/imbbloh/imbbloh-listing-studio@54b9ae1/assets/gagalin.otf';
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
  const fs    = titleFontSize(gameTitle);
  const title = escapeXml(gameTitle.toUpperCase());
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}">
  <defs>
    <style>@font-face { font-family: 'Gagalin'; src: url('data:font/otf;base64,${fontBase64}'); }</style>
  </defs>
  <rect width="${CANVAS_W}" height="${CANVAS_H}" fill="#e8001d"/>
  <image href="data:image/jpeg;base64,${coverBase64}" x="0" y="${COVER_Y}" width="${CANVAS_W}" height="${COVER_H}" preserveAspectRatio="xMidYMid slice"/>
  <image href="data:image/png;base64,${frameBase64}" x="0" y="0" width="${CANVAS_W}" height="${CANVAS_H}"/>
  <text x="${CANVAS_W / 2}" y="${TITLE_Y}" fill="white" font-size="${fs}" font-family="Gagalin,Arial,sans-serif" font-weight="900" text-anchor="middle" dominant-baseline="middle" letter-spacing="3">${title}</text>
</svg>`;
}

function extractNintendoAssets(html) {
  const re = /store\/software\/(switch2?)\/(\d{14})\/([a-zA-Z0-9_-]{20,})/g;
  const matches = [...html.matchAll(re)];
  if (!matches.length) throw new Error('Could not extract NSUID/hash from store page');
  const platform = matches[0][1];
  const nsuid    = matches[0][2];
  const hashes   = [...new Set(matches.map(m => m[3]))];
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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

app.options('*', (req, res) => res.sendStatus(204));

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

    const [imgRes, frameRes, fontRes] = await Promise.all([
      fetch(cdn.upload),
      fetch(FRAME_URL),
      fetch(FONT_URL)
    ]);
    if (!imgRes.ok)   throw new Error('Cover image fetch failed: ' + imgRes.status);
    if (!frameRes.ok) throw new Error('Template frame fetch failed: ' + frameRes.status);
    if (!fontRes.ok)  throw new Error('Font fetch failed: ' + fontRes.status);

    const [coverBase64, frameBase64, fontBase64] = await Promise.all([
      imgRes.arrayBuffer().then(toBase64),
      frameRes.arrayBuffer().then(toBase64),
      fontRes.arrayBuffer().then(toBase64)
    ]);

    const svg = buildThumbnailSvg(gameTitle, coverBase64, frameBase64, fontBase64);
    const thumbnailDataUrl = 'data:image/svg+xml;base64,' + Buffer.from(svg, 'utf-8').toString('base64');

    res.json({
      thumbnailDataUrl,
      coverUrl:       cdn.coverUrl,
      screenshotUrls: cdn.screenshotUrls
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Thumbnail server running on port ${PORT}`));
