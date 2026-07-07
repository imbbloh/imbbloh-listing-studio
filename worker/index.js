// ── Constants ──────────────────────────────────────────────────────────────
const CANVA_API = 'https://api.canva.com/rest/v1';

// ── Font size by title character count ───────────────────────────────────
function fontSize(title) {
  const n = title.length;
  if (n <= 17) return 72;
  if (n <= 23) return 62;
  if (n <= 25) return 58;
  if (n <= 46) return 46;
  if (n <= 47) return 38;
  if (n <= 71) return 34;
  return 28;
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
// Layout (1280×720):
//   0–90  : dark top bar — game title centred
//  90–632 : cover art (white letterbox + image)
// 632–720 : red bottom bar — "NINTENDO SWITCH"
function buildThumbnailSvg(gameTitle, coverBase64) {
  const fs = fontSize(gameTitle);
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1280" height="720" viewBox="0 0 1280 720">
  <rect width="1280" height="720" fill="#0a0a1a"/>
  <rect x="40" y="90" width="1200" height="542" fill="white" rx="6"/>
  <image href="data:image/jpeg;base64,${coverBase64}" x="40" y="90" width="1200" height="542" preserveAspectRatio="xMidYMid meet"/>
  <rect x="0" y="0" width="1280" height="90" fill="#0a0a1a"/>
  <text x="640" y="45" fill="white" font-size="${fs}" font-family="Arial,Helvetica,sans-serif" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${escapeXml(gameTitle)}</text>
  <rect x="0" y="632" width="1280" height="88" fill="#e63946"/>
  <text x="640" y="676" fill="white" font-size="26" font-family="Arial,Helvetica,sans-serif" font-weight="bold" text-anchor="middle" dominant-baseline="middle" letter-spacing="4">NINTENDO SWITCH</text>
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

      // ── Step 2: Fetch cover image ──────────────────────────────────────
      const imgRes = await fetch(cdn.upload);
      if (!imgRes.ok) throw new Error('Cover image fetch failed: ' + imgRes.status);
      const coverBase64 = toBase64(await imgRes.arrayBuffer());

      // ── Step 3: Build SVG thumbnail ────────────────────────────────────
      const svg = buildThumbnailSvg(gameTitle, coverBase64);
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
