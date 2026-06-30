// Listing text generation — ported from index.html

export function cleanTitle(s) {
  return s
    .replace(/[™®©]/g, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim();
}

export function genGame({ name, platform, normalPrice, premiumPrice, storeUrl = '' }) {
  const isPS = platform === 'ps45' || platform === 'ps5';
  const yt = 'www.youtube.com/results?search_query=' +
    name.trim().replace(/\s+/g, '+') +
    (isPS ? '+playstation+trailer' : '+switch+trailer');

  let bl, ss, nd, ol, ts, tag;

  if (platform === 'ns12') {
    bl  = '\u{1D401}\u{1D428}\u{1D42B} \u{1D40D}\u{1D422}\u{1D427}\u{1D42D}\u{1D41E}\u{1D427}\u{1D41D}\u{1D428} \u{1D412}\u{1D430}\u{1D422}\u{1D42D}\u{1D41C}\u{1D421} \u{1D7F1} / \u{1D412}\u{1D430}\u{1D422}\u{1D42D}\u{1D41C}\u{1D421} \u{1D40E}\u{1D42D}\u{1D408}\u{1D403} / \u{1D412}\u{1D430}\u{1D422}\u{1D42D}\u{1D41C}\u{1D421} \u{1D7EF}';
    bl  = '𝐅𝐨𝐫 𝐍𝐢𝐧𝐭𝐞𝐧𝐝𝐨 𝐒𝐰𝐢𝐭𝐜𝐡 𝟯 / 𝐒𝐰𝐢𝐭𝐜𝐡 𝐎𝐋𝐄𝐃 / 𝐒𝐰𝐢𝐭𝐜𝐡 𝟮';
    ss  = 'Nintendo eShop';
    nd  = 'Play on provided account (Offline only / Airplane Mode)';
    ol  = '𝐎𝐟𝐟𝐢𝐜𝐢𝐚𝐥 𝐍𝐢𝐧𝐭𝐞𝐧𝐝𝐨 𝐈𝐧𝐟𝐨:';
    ts  = 'Nintendo Switch 2 / Nintendo Switch 1 / Switch OLED - Digital Game Download NS1 NS2 Game Nintendo Switch Digital Games | Instant Delivery | Instant Access | Safe & Affordable | Normal & Premium Versions Available';
    tag = 'Nintendo Switch';
  } else if (platform === 'ns2') {
    bl  = '𝐅𝐨𝐫 𝐍𝐢𝐧𝐭𝐞𝐧𝐝𝐨 𝐒𝐰𝐢𝐭𝐜𝐡 𝟯';
    ss  = 'Nintendo eShop';
    nd  = 'Play on provided account (Offline only / Airplane Mode)';
    ol  = '𝐎𝐟𝐟𝐢𝐜𝐢𝐚𝐥 𝐍𝐢𝐧𝐭𝐞𝐧𝐝𝐨 𝐈𝐧𝐟𝐨:';
    ts  = 'Nintendo Switch 2 - Digital Game Download NS2 Game Nintendo Switch Digital Games | Instant Delivery | Instant Access | Safe & Affordable | Normal & Premium Versions Available';
    tag = 'Nintendo Switch 2';
  } else if (platform === 'ps45') {
    bl  = '𝐅𝐨𝐫 𝐏𝐥𝐚𝐲𝐒𝐭𝐚𝐭𝐢𝐨𝐧 𝟯 / 𝐏𝐥𝐚𝐲𝐬𝐭𝐚𝐭𝐢𝐨𝐧 𝟮';
    ss  = 'PlayStation Store';
    nd  = 'Play on provided account (Online only / Internet required)';
    ol  = '𝐎𝐟𝐟𝐢𝐜𝐢𝐚𝐥 𝐏𝐥𝐚𝐲𝐒𝐭𝐚𝐭𝐢𝐨𝐧 𝐈𝐧𝐟𝐨:';
    ts  = 'PlayStation 4 / PlayStation 5 - Digital Game Download PS4 PS5 PS Digital Games | Instant Delivery | Instant Access | Safe & Affordable | Normal & Premium Versions Available';
    tag = 'PlayStation 5 / PlayStation 4';
  } else {
    bl  = '𝐅𝐨𝐫 𝐏𝐥𝐚𝐲𝐒𝐭𝐚𝐭𝐢𝐨𝐧 𝟯';
    ss  = 'PlayStation Store';
    nd  = 'Play on provided account (Online only / Internet required)';
    ol  = '𝐎𝐟𝐟𝐢𝐜𝐢𝐚𝐥 𝐏𝐥𝐚𝐲𝐒𝐭𝐚𝐭𝐢𝐨𝐧 𝐈𝐧𝐟𝐨:';
    ts  = 'PlayStation 5 - Digital Game Download PS5 PS Digital Games | Instant Delivery | Instant Access | Safe & Affordable | Normal & Premium Versions Available';
    tag = 'PlayStation 5';
  }

  const su = storeUrl && !storeUrl.startsWith('http') ? 'https://' + storeUrl : storeUrl;

  return (
    '✅ ' + name + ' – ' + ts + '\n\n' +
    name + ' (Standard Edition)\n\n' +
    bl + '\n\n' +
    '💰 𝐏𝐫𝐢𝐜𝐢𝐧𝐠\n' +
    '🟡 Normal Version - $' + normalPrice + '\n' +
    '🟢 Premium Version - $' + premiumPrice + '\n\n' +
    '✨ 𝐕𝐞𝐫𝐬𝐢𝐨𝐧 𝐃𝐞𝐭𝐚𝐢𝐥𝐬\n' +
    '💛 Normal Version = ' + nd + '\n' +
    '💚 Premium Version = Play on your own account (Online & Offline play supported)\n\n' +
    '⚡ 𝐖𝐡𝐲 𝐁𝐮𝐲 𝐅𝐫𝐨𝐦 𝐌𝐞?\n' +
    '✅ Games are direct purchase from ' + ss + '\n' +
    '✅ Instant delivery within 15 minutes after payment\n' +
    '✅ Game is yours to play & keep forever\n' +
    '✅ Safe, secure & affordable\n\n' +
    '📦 𝐄𝐱𝐭𝐫𝐚𝐬\n' +
    '\t•\tDLC / Deluxe Edition available (enquire for pricing)\n' +
    '\t•\tIf you don\'t see the game you want in my listings, feel free to ask!\n\n' +
    '💳 𝐏𝐚𝐲𝐦𝐞𝐧𝐭 𝐎𝐩𝐭𝐢𝐨𝐧𝐬\n' +
    '✔️ PayNow / PayLah / NS Credits\n\n' +
    '⚠️ 𝐍𝐨𝐭𝐞\n' +
    'No refunds due to the nature of digital products, but we will make sure your game works smoothly.\n\n' +
    '🔗 𝐅𝐮𝐥𝐥 𝐆𝐚𝐦𝐞 𝐋𝐢𝐬𝐭:\n' +
    'www.tinyurl.com/imbbloh-switchgamelist\n\n' +
    '🔗 ' + ol + '\n' +
    (su || '(add store URL)') + '\n\n' +
    '🎥 𝐆𝐚𝐦𝐞𝐩𝐥𝐚𝐲 𝐓𝐫𝐚𝐢𝐥𝐞𝐫:\n' +
    yt + '\n\n' +
    'Tags: ' + tag + ' ' + name
  );
}

export function genCode({ name, platform, codeSub, price }) {
  let bl, tag;
  if (platform === 'ns12') {
    bl  = '𝐅𝐨𝐫 𝐍𝐢𝐧𝐭𝐞𝐧𝐝𝐨 𝐒𝐰𝐢𝐭𝐜𝐡 𝟯 / 𝐒𝐰𝐢𝐭𝐜𝐡 𝐎𝐋𝐄𝐃 / 𝐒𝐰𝐢𝐭𝐜𝐡 𝟮';
    tag = 'Nintendo Switch';
  } else {
    bl  = '𝐅𝐨𝐫 𝐍𝐢𝐧𝐭𝐞𝐧𝐝𝐨 𝐒𝐰𝐢𝐭𝐜𝐡 𝟯';
    tag = 'Nintendo Switch 2';
  }

  const footer =
    '✅ Instant Delivery (within 15 mins)\n' +
    '✅ Code via Nintendo eShop (Region-Free)\n' +
    'SG 🇸🇬 | US 🇺🇸 | EU 🇪🇺 | HK 🇭🇰 | JP 🇯🇵\n\n' +
    '💳 𝐏𝐚𝐲𝐦𝐞𝐧𝐭 𝐎𝐩𝐭𝐢𝐨𝐧𝐬\n' +
    '✔️ PayNow / PayLah / NS Credits\n' +
    '⚠️ No refund once code sent\n\n' +
    '📺 Need Help to Redeem?\n' +
    'youtu.be/ciujtwAh7NY?si=s4ENHl0ifuEVV56-\n\n' +
    '🔗 𝐅𝐮𝐥𝐥 𝐆𝐚𝐦𝐞 𝐋𝐢𝐬𝐭:\n' +
    'www.tinyurl.com/imbbloh-switchgamelist\n\n';

  const hdrNS12 = '<DIGITAL CODE> ' + name + ' Nintendo Switch 1 OLED Switch 2 Edition NS 1 NS1 NS 2 NS2 Redemption Game Code Nintendo Eshop E shop Voucher Download Key';
  const hdrNS2  = '<DIGITAL CODE> ' + name + ' Nintendo Switch 2 Edition NS 2 NS2 Redemption Game Code Nintendo Eshop E shop Voucher Download Key';
  const hdrBase = platform === 'ns2' ? hdrNS2 : hdrNS12;

  if (codeSub === 'dlc') {
    return (
      hdrBase + ' (Upgrade Pack / DLC) [Nintendo Official Digital Codes]\n\n' +
      name + ' (DLC) – Digital Game Code\n\n' +
      bl + '\n\n' +
      '🔹DLC: ' + name + ' - $' + price + '\n\n' +
      footer +
      'Tags: ' + tag + ' DLC ' + name
    );
  } else if (codeSub === 'upgrade') {
    return (
      hdrNS2 + ' (Upgrade Pack / DLC) [Nintendo Official Digital Codes]\n\n' +
      name + ' (Upgrade Pack) – Digital Game Code\n\n' +
      bl + '\n\n' +
      '🔹 Upgrade Pack: Nintendo Switch 2 Edition - $' + price + '\n\n' +
      footer +
      'Tags: ' + tag + ' ' + name + ' Upgrade Pack'
    );
  } else {
    return (
      hdrBase + ' [Nintendo Official Digital Codes]\n\n' +
      name + ' – Digital Game Code\n\n' +
      bl + '\n\n' +
      footer +
      'Tags: ' + tag + ' ' + name
    );
  }
}

export function platformLabel(platform) {
  const map = { ns12: 'Switch 1&2', ns2: 'Switch 2', ps45: 'PS4 & PS5', ps5: 'PS5' };
  return map[platform] || platform;
}

export function codeSubLabel(sub) {
  const map = { full: 'Full Game', dlc: 'DLC', upgrade: 'Upgrade Pack' };
  return map[sub] || sub;
}
