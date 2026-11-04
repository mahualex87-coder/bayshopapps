import test from 'node:test';
import assert from 'node:assert/strict';
import { openTelegramBot, telegramBotLinks } from '../src/api/telegram-link.ts';
import { preferencesData } from '../src/api/account-operations.ts';
const currentBot = 'https://t.me/Bayshopcom_bot';
const flags = { alertOnSystem: 0, obtainSms: 0, obtainGcm: 1, obtainMails: 1, obtainViber: 0, obtainTelegram: 0, hasTelegram: 1 };

test('the web bot URL can be reopened for an already-linked member with Telegram notifications switched off', () => {
  const settings = preferencesData({ ...flags, telegramBotLink: currentBot });
  assert.equal(settings.hasTelegram, true);
  assert.equal(settings.values.obtainTelegram, false);
  assert.deepEqual(telegramBotLinks(settings.telegramBotLink), { https: currentBot, native: 'tg://resolve?domain=Bayshopcom_bot' });
});
test('both canonical Telegram hosts work and only the server-supplied start parameter travels to the bot', () => {
  assert.deepEqual(telegramBotLinks('https://telegram.me/Synthetic_bot/?start=abc_-9'), { https: 'https://t.me/Synthetic_bot?start=abc_-9', native: 'tg://resolve?domain=Synthetic_bot&start=abc_-9' });
  for (const raw of ['https://t.me/../Bayshopcom_bot','https://example.test/Bayshopcom_bot','https://t.me@example.test/Bayshopcom_bot','https://t.me/bayshopmoldova','https://t.me/proxy?server=test','https://t.me/Bayshopcom_bot?phone=123','https://t.me/Bayshopcom_bot?start=valid&other=bad','file:///Bayshopcom_bot','https://t.me/Bayshopcom_bot?start='+'a'.repeat(65)]) assert.equal(telegramBotLinks(raw),null);
});
test('opens Telegram natively or falls back once to the same HTTPS bot without leaking account fields', async () => {
  const opened=[];
  await openTelegramBot(currentBot, async link => { opened.push(link); }, () => true);
  assert.deepEqual(opened,['tg://resolve?domain=Bayshopcom_bot']);
  opened.length=0;
  await openTelegramBot(currentBot, async link => { opened.push(link); if (link.startsWith('tg:')) throw new Error('not installed'); }, () => true);
  assert.deepEqual(opened,['tg://resolve?domain=Bayshopcom_bot',currentBot]);
});
test('a stale account must not launch the browser fallback or an old bot address', async () => {
  const opened=[];let current=true;
  const launch=async url=>{opened.push(url);current=false;throw new Error('stale');};
  await openTelegramBot(currentBot,launch,()=>current);
  await openTelegramBot(currentBot,launch,()=>false);
  assert.deepEqual(opened,['tg://resolve?domain=Bayshopcom_bot']);
});
