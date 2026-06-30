import fetch from 'node-fetch';

const GAME_FORM = process.env.GAME_FORM_URL || 'https://docs.google.com/forms/d/e/1FAIpQLSe-0uL1GuyqAR0O5HbXIDoYFlVhGAkQa0zqTHcaYK4d_n7QwQ/formResponse';
const CODE_FORM = process.env.CODE_FORM_URL || 'https://docs.google.com/forms/d/e/1FAIpQLSfTj5GdwtAvIQtEPYofMpKnZm3EtBJ3k0a5IT54gQN0tOS44Q/formResponse';

const GF = {
  title:    process.env.GAME_FIELD_TITLE    || 'entry.2072004085',
  normal:   process.env.GAME_FIELD_NORMAL   || 'entry.710378137',
  premium:  process.env.GAME_FIELD_PREMIUM  || 'entry.1907115641',
  platform: process.env.GAME_FIELD_PLATFORM || 'entry.1583771425',
  url:      process.env.GAME_FIELD_URL      || 'entry.1870493243',
};

const CF = {
  title:    process.env.CODE_FIELD_TITLE    || 'entry.1467854623',
  price:    process.env.CODE_FIELD_PRICE    || 'entry.2053385314',
  platform: process.env.CODE_FIELD_PLATFORM || 'entry.1745955846',
};

export async function saveGameToSheets({ title, normalPrice, premiumPrice, platform, storeUrl }) {
  const fd = new URLSearchParams();
  const su = storeUrl && !storeUrl.startsWith('http') ? 'https://' + storeUrl : storeUrl;
  fd.append(GF.title,    title);
  fd.append(GF.normal,   normalPrice);
  fd.append(GF.premium,  premiumPrice);
  fd.append(GF.platform, platform);
  fd.append(GF.url,      su || '');
  await fetch(GAME_FORM, { method: 'POST', body: fd });
}

export async function saveCodeToSheets({ title, price, platform, codeSub }) {
  const fd = new URLSearchParams();
  let codeTitle = title;
  if (codeSub === 'dlc')     codeTitle = title + ' (DLC)';
  if (codeSub === 'upgrade') codeTitle = title + ' (Upgrade Pack)';
  fd.append(CF.title,    codeTitle);
  fd.append(CF.price,    price);
  fd.append(CF.platform, platform);
  await fetch(CODE_FORM, { method: 'POST', body: fd });
}
