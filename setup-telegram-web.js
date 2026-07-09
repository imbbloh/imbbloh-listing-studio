// Captures your Telegram Web session for server-side automation (no API keys needed).
//
// Run once on your Mac:
//   node setup-telegram-web.js
//
// A browser window opens → log in → press Enter → copy the session string to Render.

const { chromium } = require('playwright');
const readline     = require('readline');

const rl  = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(r => rl.question(q, r));

(async () => {
  let browser;

  // Use system Google Chrome if available (saves downloading anything)
  for (const channel of ['chrome', 'chromium', null]) {
    try {
      const opts = { headless: false, args: ['--start-maximized'] };
      if (channel) opts.channel = channel;
      browser = await chromium.launch(opts);
      break;
    } catch (_) {}
  }

  if (!browser) {
    console.error('Could not open a browser. Make sure Chrome is installed or run: npx playwright install chromium');
    process.exit(1);
  }

  const context = await browser.newContext({ viewport: null });
  const page    = await context.newPage();
  await page.goto('https://web.telegram.org/k/');

  console.log('\n✅ Browser opened — log in to Telegram Web (phone number or QR code scan).');
  console.log('   Once you can see your chats, come back here and press Enter.\n');

  await ask('Press Enter when your chats are visible: ');

  const state   = await context.storageState();
  const encoded = Buffer.from(JSON.stringify(state)).toString('base64');

  console.log('\n✅ Session captured! Add this to Render → Environment Variables:\n');
  console.log('   TELEGRAM_WEB_SESSION=' + encoded);
  console.log('\n(Copy the whole value — it is a long string)\n');

  rl.close();
  await browser.close();
  process.exit(0);
})();
