// ── Constants ──────────────────────────────────────────────────────────────
const TEMPLATE_ID    = 'DAHG7ZFb7_k';
const COVER_ELEMENT  = 'PBBMg0PBzsN5P8bS-LBWwC6v2gppr4vRT';
const TITLE_ELEMENT  = 'PBBMg0PBzsN5P8bS-LB5xlCmLRvrG2wpc';
const CANVA_API = 'https://api.canva.com/rest/v1';

// ── Font size by title character count ───────────────────────────────────
function fontSize(title) {
  const n = title.length;
  if (n <= 17) return 100;
  if (n <= 23) return 85;
  if (n <= 25) return 82;
  if (n <= 46) return 65;
  if (n <= 47) return 50;
  if (n <= 71) return 45;
  return 40;
}

// ── Canva REST API helper ─────────────────────────────────────────────────
async function canva(method, path, body, token) {
  const res = await fetch(CANVA_API + path, {
    method,
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json();
  if (!res.ok) throw new Error('Canva ' + path + ' → ' + JSON.stringify(json));
  return json;
}

// ── Poll export until done ─────────────────────────────────────────────────
async function pollExport(exportId, token, maxMs = 30000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 1500));
    const res = await canva('GET', '/exports/' + exportId, null, token);
    if (res.job?.status === 'success') return res.job.urls;
    if (res.job?.status === 'failed') throw new Error('Export failed');
  }
  throw new Error('Export timed out');
}

// ── Extract NSUID + hash from Nintendo store HTML ─────────────────────────
function extractNintendoAssets(html) {
  // Matches CDN paths like store/software/switch/70010000012332/abc123hash
  const re = /store\/software\/(switch2?)\/(\d{14})\/([a-zA-Z0-9_-]{20,})/;
  const m = html.match(re);
  if (!m) throw new Error('Could not extract NSUID/hash from store page');
  return { platform: m[1], nsuid: m[2], hash: m[3] };
}

function buildCdnUrls(platform, nsuid, hash) {
  const base = `https://assets.nintendo.com/image/upload`;
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
    // Preflight
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

    const token = env.CANVA_TOKEN;
    if (!token) return corsResponse({ error: 'CANVA_TOKEN not configured' }, 500);

    let sessionId = null;

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

      // ── Step 2: Parallel — fetch cover image + start editing transaction ─
      const [imgFetch, txRes] = await Promise.all([
        fetch(cdn.upload),
        canva('POST', `/designs/${TEMPLATE_ID}/editing-sessions`, {}, token)
      ]);
      if (!imgFetch.ok) throw new Error('Cover image fetch failed: ' + imgFetch.status);
      const imgBuffer = await imgFetch.arrayBuffer();

      // Upload binary to Canva (octet-stream, not JSON)
      const uploadRaw = await fetch(
        `${CANVA_API}/asset-uploads?name=${encodeURIComponent(gameTitle)}`,
        {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/octet-stream' },
          body: imgBuffer
        }
      );
      const uploadRes = await uploadRaw.json();
      if (!uploadRaw.ok) throw new Error('Canva /asset-uploads → ' + JSON.stringify(uploadRes));

      let assetId = uploadRes.job?.id
        ?? uploadRes.asset?.id
        ?? (() => { throw new Error('No asset ID in upload response: ' + JSON.stringify(uploadRes)); })();
      sessionId = txRes.transaction?.transaction_id
        ?? (() => { throw new Error('No transaction ID in response: ' + JSON.stringify(txRes)); })();

      const pages = txRes.pages;
      if (!pages?.length) throw new Error('No pages in transaction response: ' + JSON.stringify(txRes));

      // Wait for upload to complete if it's async
      if (uploadRes.job?.status === 'in_progress') {
        const deadline = Date.now() + 15000;
        let uploadDone = false;
        while (Date.now() < deadline) {
          await new Promise(r => setTimeout(r, 1000));
          const poll = await canva('GET', '/asset-uploads/' + assetId, null, token);
          if (poll.job?.status === 'success') {
            assetId = poll.job.asset?.id ?? assetId;
            uploadDone = true;
            break;
          }
          if (poll.job?.status === 'failed') throw new Error('Cover upload failed');
        }
        if (!uploadDone) throw new Error('Cover upload timed out');
      }

      // ── Step 3: Bundled edit ──────────────────────────────────────────
      await canva('PATCH', `/designs/${TEMPLATE_ID}/editing-sessions/${sessionId}`, {
        transaction_id: sessionId,
        page_index: 1,
        pages,
        operations: [
          {
            type: 'update_fill',
            element_id: COVER_ELEMENT,
            asset_type: 'image',
            asset_id: assetId,
            alt_text: gameTitle
          },
          {
            type: 'replace_text',
            element_id: TITLE_ELEMENT,
            text: gameTitle
          },
          {
            type: 'format_text',
            element_id: TITLE_ELEMENT,
            formatting: { font_size: fontSize(gameTitle) }
          }
        ]
      }, token);

      // ── Step 4: Commit ────────────────────────────────────────────────
      await canva('POST', `/designs/${TEMPLATE_ID}/editing-sessions/${sessionId}/commit`, {}, token);
      sessionId = null; // committed — no need to cancel on error

      // ── Step 5: Export pages 1 and 10 ────────────────────────────────
      const exportRes = await canva('POST', '/exports', {
        design_id: TEMPLATE_ID,
        format: 'png',
        pages: [1, 10]
      }, token);

      const exportId = exportRes.job?.id ?? exportRes.export_id;
      if (!exportId) throw new Error('No export ID: ' + JSON.stringify(exportRes));

      const exportUrls = await pollExport(exportId, token);

      // ── Step 6: Return copy links ──────────────────────────────────────
      return corsResponse({
        thumbnailUrl:   exportUrls[0] ?? '',
        nsInfoUrl:      exportUrls[1] ?? '',
        coverUrl:       cdn.display,
        screenshotUrl:  cdn.screenshot
      });

    } catch (err) {
      // Cancel transaction if still open
      if (sessionId) {
        try {
          await canva('DELETE', `/designs/${TEMPLATE_ID}/editing-sessions/${sessionId}`, null, token);
        } catch (_) { /* best-effort cancel */ }
      }
      return corsResponse({ error: err.message }, 500);
    }
  }
};
