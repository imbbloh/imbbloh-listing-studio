import 'dotenv/config';
import { Telegraf, Markup } from 'telegraf';
import { cleanTitle, genGame, genCode, platformLabel, codeSubLabel } from './listing.js';
import { saveGameToSheets, saveCodeToSheets } from './sheets.js';

const bot = new Telegraf(process.env.BOT_TOKEN);

// In-memory session state per chat
// Each session: { step, mode, platform, codeSub, title, normalPrice, premiumPrice, price, storeUrl, listingText }
const sessions = new Map();

function sess(chatId) {
  if (!sessions.has(chatId)) sessions.set(chatId, { step: 'idle' });
  return sessions.get(chatId);
}

function resetSess(chatId) {
  sessions.set(chatId, { step: 'idle' });
}

// ── Keyboards ──────────────────────────────────────────────────────────────

const modeKb = Markup.inlineKeyboard([
  [Markup.button.callback('🎮 Game Listing', 'mode:game')],
  [Markup.button.callback('💿 Digital Code', 'mode:code')],
]);

function platformKb(mode) {
  if (mode === 'code') {
    return Markup.inlineKeyboard([
      [Markup.button.callback('🔴 NS1 & NS2', 'plat:ns12'), Markup.button.callback('🔴 NS2 Only', 'plat:ns2')],
      [Markup.button.callback('❌ Cancel', 'cancel')],
    ]);
  }
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔴 NS1 & NS2', 'plat:ns12'), Markup.button.callback('🔴 NS2 Only', 'plat:ns2')],
    [Markup.button.callback('🔵 PS4 & PS5', 'plat:ps45'), Markup.button.callback('🔵 PS5 Only', 'plat:ps5')],
    [Markup.button.callback('❌ Cancel', 'cancel')],
  ]);
}

const codeSubKb = Markup.inlineKeyboard([
  [Markup.button.callback('📀 Full Game', 'sub:full')],
  [Markup.button.callback('🎁 DLC', 'sub:dlc')],
  [Markup.button.callback('⬆️ Upgrade Pack', 'sub:upgrade')],
  [Markup.button.callback('❌ Cancel', 'cancel')],
]);

const skipUrlKb = Markup.inlineKeyboard([
  [Markup.button.callback('⏭️ Skip URL', 'skip:url'), Markup.button.callback('❌ Cancel', 'cancel')],
]);

function postActionsKb(hasListing) {
  if (!hasListing) return undefined;
  return Markup.inlineKeyboard([
    [Markup.button.callback('📊 Save to Sheets', 'action:sheets')],
    [Markup.button.url('🛒 Open Carousell Sell', 'https://www.carousell.sg/sell/')],
    [Markup.button.callback('🔄 New Listing', 'action:new')],
  ]);
}

// ── Commands ───────────────────────────────────────────────────────────────

bot.start((ctx) => {
  resetSess(ctx.chat.id);
  return ctx.reply(
    '👋 *imbbloh Listing Studio Bot*\n\n' +
    'Generate your Carousell listing description and save it to Google Sheets — right from Telegram.\n\n' +
    '📋 Commands:\n' +
    '`/new` — Create a new listing\n' +
    '`/cancel` — Cancel current wizard\n' +
    '`/help` — Show this message',
    { parse_mode: 'Markdown' }
  );
});

bot.help((ctx) => {
  return ctx.reply(
    '📋 *Commands*\n\n' +
    '`/new` — Start a new listing wizard\n' +
    '`/cancel` — Cancel and reset\n\n' +
    '*Workflow:*\n' +
    '1. Choose Game or Digital Code\n' +
    '2. Pick platform (NS / PS)\n' +
    '3. Enter title & prices\n' +
    '4. Get your formatted listing text\n' +
    '5. Save to Sheets & open Carousell to post',
    { parse_mode: 'Markdown' }
  );
});

bot.command('cancel', (ctx) => {
  resetSess(ctx.chat.id);
  return ctx.reply('✅ Cancelled. Use /new to start again.');
});

bot.command('new', async (ctx) => {
  const s = sess(ctx.chat.id);
  s.step = 'await_mode';
  return ctx.reply('📋 *New Listing*\n\nWhat type of listing?', { parse_mode: 'Markdown', ...modeKb });
});

// ── Callback handlers ──────────────────────────────────────────────────────

bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;
  const chatId = ctx.chat.id;
  const s = sess(chatId);
  await ctx.answerCbQuery();

  if (data === 'cancel') {
    resetSess(chatId);
    return ctx.editMessageText('❌ Cancelled. Use /new to start a new listing.');
  }

  if (data === 'action:new') {
    s.step = 'await_mode';
    return ctx.editMessageText('📋 *New Listing*\n\nWhat type of listing?', { parse_mode: 'Markdown', ...modeKb });
  }

  if (data === 'action:sheets') {
    return handleSaveToSheets(ctx, chatId, s);
  }

  // Mode selection
  if (data.startsWith('mode:') && s.step === 'await_mode') {
    s.mode = data.split(':')[1];
    s.step = 'await_platform';
    return ctx.editMessageText(
      '📋 *New Listing*\n\nSelect platform:',
      { parse_mode: 'Markdown', ...platformKb(s.mode) }
    );
  }

  // Platform selection
  if (data.startsWith('plat:') && s.step === 'await_platform') {
    s.platform = data.split(':')[1];

    if (s.mode === 'code') {
      s.step = 'await_codesub';
      return ctx.editMessageText(
        '📋 *New Listing*\n\nCode type:',
        { parse_mode: 'Markdown', ...codeSubKb }
      );
    } else {
      s.step = 'await_title';
      return ctx.editMessageText('📋 *New Listing*\n\nEnter the game title:', { parse_mode: 'Markdown' });
    }
  }

  // Code subtype selection
  if (data.startsWith('sub:') && s.step === 'await_codesub') {
    s.codeSub = data.split(':')[1];
    s.step = 'await_title';
    return ctx.editMessageText('📋 *New Listing*\n\nEnter the game title:', { parse_mode: 'Markdown' });
  }

  // Skip store URL
  if (data === 'skip:url' && s.step === 'await_store_url') {
    s.storeUrl = '';
    return finaliseListing(ctx, chatId, s);
  }
});

// ── Text message handler ───────────────────────────────────────────────────

bot.on('text', async (ctx) => {
  // Ignore commands
  if (ctx.message.text.startsWith('/')) return;

  const chatId = ctx.chat.id;
  const s = sess(chatId);
  const text = ctx.message.text.trim();

  if (s.step === 'idle') {
    return ctx.reply('Use /new to create a listing, or /help for commands.');
  }

  if (s.step === 'await_title') {
    s.title = cleanTitle(text);
    if (s.mode === 'code') {
      s.step = 'await_price';
      return ctx.reply('💰 Price? (e.g. `9.90`)', { parse_mode: 'Markdown' });
    } else {
      s.step = 'await_normal_price';
      return ctx.reply('💰 Normal Version price? (e.g. `9.90`)', { parse_mode: 'Markdown' });
    }
  }

  if (s.step === 'await_normal_price') {
    if (isNaN(parseFloat(text))) return ctx.reply('⚠️ Enter a valid number (e.g. `9.90`)');
    s.normalPrice = text;
    s.step = 'await_premium_price';
    return ctx.reply('💰 Premium Version price? (e.g. `12.90`)', { parse_mode: 'Markdown' });
  }

  if (s.step === 'await_premium_price') {
    if (isNaN(parseFloat(text))) return ctx.reply('⚠️ Enter a valid number (e.g. `12.90`)');
    s.premiumPrice = text;
    s.step = 'await_store_url';
    return ctx.reply(
      '🔗 Store URL? (paste or tap Skip)',
      skipUrlKb
    );
  }

  if (s.step === 'await_store_url') {
    s.storeUrl = text;
    return finaliseListing(ctx, chatId, s);
  }

  if (s.step === 'await_price') {
    if (isNaN(parseFloat(text))) return ctx.reply('⚠️ Enter a valid number (e.g. `9.90`)');
    s.price = text;
    return finaliseListing(ctx, chatId, s);
  }
});

// ── Finalise & send listing ────────────────────────────────────────────────

async function finaliseListing(ctx, chatId, s) {
  let listingText;

  if (s.mode === 'game') {
    listingText = genGame({
      name: s.title,
      platform: s.platform,
      normalPrice: s.normalPrice,
      premiumPrice: s.premiumPrice,
      storeUrl: s.storeUrl || '',
    });
  } else {
    listingText = genCode({
      name: s.title,
      platform: s.platform,
      codeSub: s.codeSub,
      price: s.price,
    });
  }

  s.listingText = listingText;
  s.step = 'done';

  const summary =
    (s.mode === 'game' ? '🎮' : '💿') + ' *' + s.title + '*\n' +
    '📍 ' + platformLabel(s.platform) +
    (s.mode === 'code' ? ' · ' + codeSubLabel(s.codeSub) : '') + '\n' +
    (s.mode === 'game'
      ? '🟡 $' + s.normalPrice + '  🟢 $' + s.premiumPrice
      : '💰 $' + s.price);

  await ctx.reply(summary + '\n\n✅ *Listing generated!*', { parse_mode: 'Markdown' });

  // Send listing text as a plain message so it's easy to copy
  await ctx.reply(listingText);

  // Action buttons
  await ctx.reply(
    '📌 *What next?*\nSave to Sheets or open Carousell to post:',
    { parse_mode: 'Markdown', ...postActionsKb(true) }
  );
}

// ── Save to Sheets ─────────────────────────────────────────────────────────

async function handleSaveToSheets(ctx, chatId, s) {
  if (!s.listingText) return ctx.reply('No listing to save. Use /new to create one.');

  try {
    if (s.mode === 'game') {
      await saveGameToSheets({
        title: s.title,
        normalPrice: s.normalPrice,
        premiumPrice: s.premiumPrice,
        platform: platformLabel(s.platform),
        storeUrl: s.storeUrl || '',
      });
    } else {
      await saveCodeToSheets({
        title: s.title,
        price: s.price,
        platform: platformLabel(s.platform),
        codeSub: s.codeSub,
      });
    }
    await ctx.editMessageText(
      '✅ *Saved to Google Sheets!*\n\n' +
      '🛒 Now open Carousell, create a new listing, and paste the description above.',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.url('🛒 Open Carousell Sell', 'https://www.carousell.sg/sell/')],
          [Markup.button.callback('🔄 New Listing', 'action:new')],
        ])
      }
    );
  } catch (err) {
    console.error('Sheets save error:', err);
    await ctx.reply('⚠️ Failed to save to Sheets. Please try again.');
  }
}

// ── Error handling & launch ────────────────────────────────────────────────

bot.catch((err, ctx) => {
  console.error('Bot error for', ctx.updateType, err);
});

bot.launch().then(() => {
  console.log('🤖 imbbloh Listing Bot is running…');
});

process.once('SIGINT',  () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
