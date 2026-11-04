import test from 'node:test';
import assert from 'node:assert/strict';
import { bundledDeliveryBrand, deliveryTransportIcon, publicDeliveryLogo } from '../src/domain/delivery-identity.ts';

test('transport symbols use the service identity, not a universal airplane', () => {
  for (const value of ['Air Post', 'airpost', ' AIR-POST ', 'BayShop Air Post']) assert.equal(deliveryTransportIcon(value), 'airplane-outline');
  for (const value of ['Road Express', 'RoadExpress', 'road_express', 'BayShop Road Express']) assert.equal(deliveryTransportIcon(value), 'car-outline');
  for (const value of [null, '', 'Express', 'Not Air Post', 'Air Postage', 'FedEx']) assert.equal(deliveryTransportIcon(value), 'cube-outline');
});

test('public service logos do not accept embedded credentials or non-HTTPS schemes', () => {
  assert.equal(publicDeliveryLogo('https://bayshop.com/upload/shippers/example.png'), 'https://bayshop.com/upload/shippers/example.png');
  for (const value of ['https://user:secret@bayshop.com/logo.png', 'http://bayshop.com/logo.png', 'javascript:alert(1)', 'file:///logo.png', '/unresolved.png', null]) assert.equal(publicDeliveryLogo(value), null);
});

test('DPD branding follows explicit brand names only, without matching unrelated titles', () => {
  for (const title of ['DPD', 'DPD Classic', 'dpd-express', 'BayShop DPD']) assert.equal(bundledDeliveryBrand(title), 'dpd');
  for (const title of ['DPDelivery', 'Not DPD', 'Road Express', null]) assert.equal(bundledDeliveryBrand(title), null);
  assert.equal(bundledDeliveryBrand('USPS Priority Mail'), 'usps');
});
