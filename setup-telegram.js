// One-time setup script — generates a TELEGRAM_SESSION string for Render.
// Run locally (not on Render):
//   TELEGRAM_API_ID=12345 TELEGRAM_API_HASH=abc123 node setup-telegram.js
//
// Get API credentials at: https://my.telegram.org → API development tools
// After the script prints the session string, paste it into Render as TELEGRAM_SESSION.

const { TelegramClient } = require('telegram');
const { StringSession }  = require('telegram/sessions');
const readline           = require('readline');

const apiId   = parseInt(process.env.TELEGRAM_API_ID  || '0');
const apiHash = process.env.TELEGRAM_API_HASH || '';

if (!apiId || !apiHash) {
  console.error('Usage: TELEGRAM_API_ID=xxx TELEGRAM_API_HASH=yyy node setup-telegram.js');
  process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(r => rl.question(q, r));

(async () => {
  const client = new TelegramClient(new StringSession(''), apiId, apiHash, { connectionRetries: 5 });

  await client.start({
    phoneNumber: () => ask('Phone number (with country code, e.g. +6591234567): '),
    password:    () => ask('2FA password (press Enter if none): '),
    phoneCode:   () => ask('Telegram OTP code: '),
    onError:     err => console.error('Auth error:', err.message),
  });

  const sessionStr = client.session.save();
  console.log('\n✅ Done! Add this to Render → Environment Variables:');
  console.log('\n  TELEGRAM_SESSION=' + sessionStr + '\n');

  rl.close();
  await client.disconnect();
  process.exit(0);
})();
