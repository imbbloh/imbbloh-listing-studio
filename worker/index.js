const FRAME_URL = 'https://raw.githubusercontent.com/imbbloh/imbbloh-listing-studio/claude/test-coverage-analysis-7tkqrn/assets/ns-template-frame.png';
const FONT_URL  = 'https://raw.githubusercontent.com/imbbloh/imbbloh-listing-studio/claude/test-coverage-analysis-7tkqrn/assets/gagalin.ttf';
const CANVAS_W  = 1080;
const CANVAS_H  = 1080;
const COVER_Y   = 295;   // top of transparent window in frame PNG
const COVER_H   = 640;   // height of window (y=295 to y=935)
const TITLE_Y   = 1008;  // vertical centre of title text in the bottom bar

// ── Font size for title text (1080px-wide bottom bar) ─────────────────────
function titleFontSize(title) {
  const n = title.length;
  if (n <= 12) return 80;
  if (n <= 18) return 70;
  if (n <= 25) return 62;
  if (n <= 34) return 52;
  if (n <= 45) return 42;
  return 34;
}

// ── Escape XML special characters ─────────────────────────────────────────
function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── ArrayBuffer → base64 (chunked to avoid stack overflow) ───────────────
function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// ── Build thumbnail SVG ────────────────────────────────────────────────────
// Layer order (bottom → top):
//   [1] Red background (full canvas)
//   [2] Cover art      (full width, y=COVER_Y, height=COVER_H — matches transparent window)
//   [3] Frame PNG      (transparent cover window lets cover art show through)
//   [4] Title text     (white uppercase Gagalin bold, centred in bottom bar)
function buildThumbnailSvg(gameTitle, coverBase64, frameBase64, fontBase64) {
  const fs    = titleFontSize(gameTitle);
  const title = escapeXml(gameTitle.toUpperCase());
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}">
  <defs>
    <style>@font-face { font-family: 'Gagalin'; src: url('data:font/truetype;base64,${fontBase64}'); }</style>
  </defs>
  <rect width="${CANVAS_W}" height="${CANVAS_H}" fill="#e8001d"/>
  <image href="data:image/jpeg;base64,${coverBase64}" x="0" y="${COVER_Y}" width="${CANVAS_W}" height="${COVER_H}" preserveAspectRatio="xMidYMid slice"/>
  <image href="data:image/png;base64,${frameBase64}" x="0" y="0" width="${CANVAS_W}" height="${CANVAS_H}"/>
  <text x="${CANVAS_W / 2}" y="${TITLE_Y}" fill="white" font-size="${fs}" font-family="Gagalin,Arial,sans-serif" font-weight="900" text-anchor="middle" dominant-baseline="middle">${title}</text>
</svg>`;
}

// ── Extract NSUID + hash from Nintendo store HTML ─────────────────────────
function extractNintendoAssets(html) {
  const re = /store\/software\/(switch2?)\/(\d{14})\/([a-zA-Z0-9_-]{20,})/;
  const m = html.match(re);
  if (!m) throw new Error('Could not extract NSUID/hash from store page');
  return { platform: m[1], nsuid: m[2], hash: m[3] };
}

function buildCdnUrls(platform, nsuid, hash) {
  const base = 'https://assets.nintendo.com/image/upload';
  const path = `store/software/${platform}/${nsuid}/${hash}`;
  return {
    upload:     `${base}/ar_16:9,c_lpad,w_1240/b_white/f_jpg/q_auto/${path}`,
    display:    `${base}/ar_16:9,c_lpad,w_1240/b_white/f_auto/q_auto/${path}`,
    screenshot: `${base}/ar_16:9,b_auto:border,c_lpad/b_white/f_auto/q_auto/dpr_1.5/${path}`
  };
}

// ── CORS headers ──────────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function corsResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS }
  });
}

// ── Main handler ──────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (request.method !== 'POST') {
      return corsResponse({ error: 'Method not allowed' }, 405);
    }

    let storeUrl, gameTitle;
    try {
      ({ storeUrl, gameTitle } = await request.json());
      if (!storeUrl || !gameTitle) throw new Error('Missing storeUrl or gameTitle');
    } catch (e) {
      return corsResponse({ error: e.message }, 400);
    }

    try {
      // ── Step 1: Fetch Nintendo store page ─────────────────────────────
      const fullUrl = storeUrl.startsWith('http') ? storeUrl : 'https://' + storeUrl;
      const storePage = await fetch(fullUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; imbbloh-bot/1.0)' }
      });
      if (!storePage.ok) throw new Error('Store page fetch failed: ' + storePage.status);
      const html = await storePage.text();

      const { platform, nsuid, hash } = extractNintendoAssets(html);
      const cdn = buildCdnUrls(platform, nsuid, hash);

      // ── Step 2: Fetch cover image, template frame, and font in parallel ─
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

      // ── Step 3: Build SVG thumbnail ────────────────────────────────────
      const svg = buildThumbnailSvg(gameTitle, coverBase64, frameBase64, fontBase64);
      const thumbnailDataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));

      // ── Step 4: Return ─────────────────────────────────────────────────
      return corsResponse({
        thumbnailDataUrl,
        coverUrl:      cdn.display,
        screenshotUrl: cdn.screenshot
      });

    } catch (err) {
      return corsResponse({ error: err.message }, 500);
    }
  }
};
