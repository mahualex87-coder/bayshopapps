import assert from 'node:assert/strict';
import test from 'node:test';
import { countt } from '../src/i18n/core.ts';

const counts = [0, 1, 2, 20, 21, 22];
const shown = {
  ro: ['0 colete afișate', '1 colet afișat', '2 colete afișate', '20 de colete afișate', '21 de colete afișate', '22 de colete afișate'],
  ru: ['Показано 0 посылок', 'Показана 1 посылка', 'Показаны 2 посылки', 'Показано 20 посылок', 'Показана 21 посылка', 'Показаны 22 посылки'],
  en: ['0 parcels shown', '1 parcel shown', '2 parcels shown', '20 parcels shown', '21 parcels shown', '22 parcels shown'],
};
const loaded = {
  ro: ['0 colete încărcate', '1 colet încărcat', '2 colete încărcate', '20 de colete încărcate', '21 de colete încărcate', '22 de colete încărcate'],
  ru: ['Загружено 0 посылок', 'Загружена 1 посылка', 'Загружены 2 посылки', 'Загружено 20 посылок', 'Загружена 21 посылка', 'Загружены 22 посылки'],
  en: ['0 parcels loaded', '1 parcel loaded', '2 parcels loaded', '20 parcels loaded', '21 parcels loaded', '22 parcels loaded'],
};
const productNouns = {
  ro: ['produse', 'produs', 'produse', 'de produse', 'de produse', 'de produse'],
  ru: ['товаров', 'товара', 'товаров', 'товаров', 'товара', 'товаров'],
  en: ['products', 'product', 'products', 'products', 'products', 'products'],
};
const orderNouns = {
  ro: ['comenzi', 'comandă', 'comenzi', 'de comenzi', 'de comenzi', 'de comenzi'],
  ru: ['заказов', 'заказа', 'заказов', 'заказов', 'заказа', 'заказов'],
  en: ['orders', 'order', 'orders', 'orders', 'orders', 'orders'],
};

function assertLabels() {
  for (const language of ['ro', 'ru', 'en']) {
    counts.forEach((count, index) => {
      assert.equal(countt(language, 'live.parcel.count', count), shown[language][index]);
      assert.equal(countt(language, 'live.pagination.loaded', count), loaded[language][index]);
      // Agreement follows the number shown, independently of the filtered total.
      const suffix = { ro: ' din 111', ru: ' из 111', en: ' of 111' }[language];
      assert.equal(countt(language, 'live.pagination.shownOf', count, { total: '111' }), shown[language][index] + suffix);
      const prefix = { ro: 'Afișare: 1 din ', ru: 'Показано 1 из ', en: 'Showing 1 of ' }[language];
      assert.equal(countt(language, 'commerce.productsRange', count, { range: '1' }), `${prefix}${count} ${productNouns[language][index]}`);
      assert.equal(countt(language, 'commerce.ordersRange', count, { range: '1' }), `${prefix}${count} ${orderNouns[language][index]}`);
    });
  }
  assert.equal(countt('ro', 'live.pagination.shownOf', 1, { total: '1' }), '1 colet afișat din 1');
  assert.equal(countt('en', 'commerce.productsRange', 22, { range: '1–20' }), 'Showing 1–20 of 22 products');
}

test('parcel and commerce counters agree for zero, singular and compound counts in all app languages', assertLabels);

test('the same count labels remain grammatical on Hermes without Intl.PluralRules', () => {
  const descriptor = Object.getOwnPropertyDescriptor(Intl, 'PluralRules');
  try {
    Object.defineProperty(Intl, 'PluralRules', { configurable: true, writable: true, value: undefined });
    assertLabels();
  } finally { Object.defineProperty(Intl, 'PluralRules', descriptor); }
});
