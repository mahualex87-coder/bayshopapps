import assert from 'node:assert/strict';
import test from 'node:test';
import { groupWarehouseAddresses, resolveWarehouseAddressSelection } from '../src/domain/warehouse-address-selection.ts';
import { normalizeWarehouseAddressesData } from '../src/api/normalize.ts';
import { plainServerText } from '../src/api/account-operations.ts';

const address = (id, countryCode, kind = 'storage', active = true, extra = {}) => ({ id, countryCode, title: countryCode, countryTitle: countryCode, kind, active, fields: [], ...extra });

test('countries appear once in common order and preserve source addresses and notes exactly', () => {
  const rows = Object.freeze([
    Object.freeze(address('us-private', 'USA', 'private', true, { countryTitle: 'SUA', notifications: [{ type: 'warning', text: 'Taxă exactă: 20 USD; numai către Moldova.' }] })),
    Object.freeze(address('ro-general', 'RO', 'storage', true, { countryTitle: 'România' })),
    Object.freeze(address('us-general', 'US', 'storage', true, { countryTitle: 'United States' })),
    Object.freeze(address('gb-general', 'UK', 'storage', true, { countryTitle: 'Regatul Unit' })),
    Object.freeze(address('gb-private', 'GB', 'private', true, { countryTitle: 'United Kingdom' })),
  ]);
  const snapshot = structuredClone(rows);
  const groups = groupWarehouseAddresses(rows);
  assert.deepEqual(groups.map(group => [group.id, group.countryCode, group.countryTitle]), [
    ['country:US', 'US', 'SUA'], ['country:RO', 'RO', 'România'], ['country:GB', 'GB', 'Regatul Unit'],
  ]);
  assert.deepEqual(groups[0].addresses.map(row => row.id), ['us-private', 'us-general']);
  assert.equal(groups[0].addresses[0], rows[0]);
  assert.equal(groups[0].addresses[0].notifications, rows[0].notifications);
  assert.deepEqual(rows, snapshot);
});

test('exact recognized country names may resolve ISO but unknown countries never merge by label', () => {
  const groups = groupWarehouseAddresses([
    address('md-1', '', 'storage', true, { countryTitle: 'Republica Moldova' }),
    address('md-2', 'MD', 'private', true, { countryTitle: 'Молдова' }),
    address('unknown-a', 'ZZ', 'storage', true, { countryTitle: 'Țară necunoscută' }),
    address('unknown-b', 'ZZ', 'private', true, { countryTitle: 'Țară necunoscută' }),
  ]);
  assert.deepEqual(groups.map(group => group.id), ['country:MD', 'address:unknown-a', 'address:unknown-b']);
  assert.equal(groups[0].addresses.length, 2);
  assert.equal(groups[1].countryCode, null);
  assert.equal(groups[2].countryCode, null);
  assert.equal(groups[1].addresses.length, 1);
});

test('unknown duplicate or absent IDs remain separate without colliding with country IDs', () => {
  const rows = [address('x', 'ZZ'), address('x', 'ZZ'), address('x:2', 'ZZ'), address('', 'ZZ'), address('', 'ZZ')];
  const groups = groupWarehouseAddresses(rows);
  assert.equal(groups.length, rows.length);
  assert.equal(new Set(groups.map(group => group.id)).size, rows.length);
  assert.ok(groups.every(group => group.addresses.length === 1));
});

test('default selection prefers an explicitly active general address in the chosen country', () => {
  const groups = groupWarehouseAddresses([
    address('us-private', 'US', 'private'),
    address('us-general', 'US'),
    address('ro-private', 'RO', 'private'),
    address('ro-inactive-general', 'RO', 'storage', false),
  ]);
  assert.equal(resolveWarehouseAddressSelection(groups).address.id, 'us-general');
  assert.equal(resolveWarehouseAddressSelection(groups, 'country:RO').address.id, 'ro-private');
  assert.equal(resolveWarehouseAddressSelection(groups, 'country:RO').group.id, 'country:RO');
});

test('unknown activity never outranks a confirmed active address or silently grants activity', () => {
  const groups = groupWarehouseAddresses([address('general-unknown', 'US', 'storage', null), address('private-active', 'US', 'private', true)]);
  assert.equal(resolveWarehouseAddressSelection(groups).address.id, 'private-active');
  const unknown = groupWarehouseAddresses([address('private-unknown', 'US', 'private', null), address('general-unknown', 'US', 'storage', null, { active: undefined })]);
  const selected = resolveWarehouseAddressSelection(unknown).address;
  assert.equal(selected.id, 'general-unknown');
  assert.equal(selected.active, undefined);
  const missingKind = groupWarehouseAddresses([address('untyped', 'US', 'storage', true, { kind: undefined }), address('general', 'US', 'storage', true)]);
  assert.equal(resolveWarehouseAddressSelection(missingKind).address.id, 'general', 'unknown kind is not assumed to be general');
});

test('switching countries preserves each explicit valid address selection, including an inactive address for inspection', () => {
  const groups = groupWarehouseAddresses([address('us-general', 'US'), address('us-private', 'US', 'private'), address('ro-general', 'RO'), address('ro-private', 'RO', 'private', false)]);
  const memory = Object.freeze({ 'country:US': 'us-private', 'country:RO': 'ro-private' });
  assert.equal(resolveWarehouseAddressSelection(groups, 'country:US', memory).address.id, 'us-private');
  assert.equal(resolveWarehouseAddressSelection(groups, 'country:RO', memory).address.id, 'ro-private');
  assert.equal(resolveWarehouseAddressSelection(groups, 'country:RO', memory).address.active, false);
  assert.equal(resolveWarehouseAddressSelection(groups, 'country:US', memory).address.id, 'us-private');
  assert.deepEqual(memory, { 'country:US': 'us-private', 'country:RO': 'ro-private' });
});

test('a refresh replaces a removed address within its country and a removed country falls back safely', () => {
  const groups = groupWarehouseAddresses([address('us-general', 'US'), address('us-private', 'US', 'private'), address('ro-general', 'RO')]);
  const memory = { 'country:US': 'us-private', 'country:RO': 'ro-removed', 'country:GB': 'gb-removed' };
  assert.equal(resolveWarehouseAddressSelection(groups, 'country:RO', memory).address.id, 'ro-general');
  const fallback = resolveWarehouseAddressSelection(groups, 'country:GB', memory);
  assert.equal(fallback.group.id, 'country:US');
  assert.equal(fallback.address.id, 'us-private');
  assert.equal(resolveWarehouseAddressSelection(groups, 'country:RO', { 'country:RO': 'us-private' }).address.id, 'ro-general', 'memory from another country cannot leak into the selection');
});

test('language refresh changes labels while country keys and remembered address IDs remain stable', () => {
  const first = groupWarehouseAddresses([address('us-general', 'US', 'storage', true, { countryTitle: 'SUA' }), address('us-private', 'US', 'private', true, { countryTitle: 'SUA' })]);
  const memory = { [first[0].id]: 'us-private' };
  const translated = groupWarehouseAddresses([address('us-general', 'USA', 'storage', true, { countryTitle: 'США' }), address('us-private', 'US', 'private', true, { countryTitle: 'США' })]);
  const selected = resolveWarehouseAddressSelection(translated, first[0].id, memory);
  assert.equal(selected.group.id, first[0].id);
  assert.equal(selected.group.countryTitle, 'США');
  assert.equal(selected.address.id, 'us-private');
});

test('all-inactive and empty responses remain inspectable without inventing an active address', () => {
  const first = address('disabled-private', 'US', 'private', false);
  const groups = groupWarehouseAddresses([first, address('disabled-general', 'US', 'storage', false)]);
  assert.equal(resolveWarehouseAddressSelection(groups).address, first);
  assert.equal(resolveWarehouseAddressSelection(groups).address.active, false);
  assert.deepEqual(groupWarehouseAddresses([]), []);
  assert.deepEqual(resolveWarehouseAddressSelection([], 'country:US', { 'country:US': 'old' }), { group: null, address: null });
});

test('private address selection preserves nested API notes and renders decimal prices, currency and destination literally', () => {
  const fee = '<p>Taxă suplimentară: <strong>20,50 USD</strong> pentru fiecare colet.</p>';
  const destination = '<p>Livrare numai către <strong>Republica Moldova</strong>.<br>Valabil pentru adresa privată.</p>';
  const raw = [{ countriesCode: 'US', countryTitle: 'SUA', addresses: {
    storage: [{ id: '1', isActive: 1, notifications: [{ type: 'info', text: '<p>Nota adresei generale.</p>' }] }],
    private: [{ id: '2', isActive: 1, notifications: [[{ type: 'danger', text: fee }, [{ type: 'info', text: destination }]]] }],
  } }];
  const before = structuredClone(raw);
  const groups = groupWarehouseAddresses(normalizeWarehouseAddressesData(raw));
  const selected = resolveWarehouseAddressSelection(groups, 'country:US', { 'country:US': 'US:private:2' }).address;
  assert.equal(selected.kind, 'private');
  assert.deepEqual(selected.notifications, [{ type: 'danger', text: fee }, { type: 'info', text: destination }]);
  assert.deepEqual(selected.notifications.map(note => plainServerText(note.text)), [
    'Taxă suplimentară: 20,50 USD pentru fiecare colet.',
    'Livrare numai către Republica Moldova.\nValabil pentru adresa privată.',
  ]);
  assert.deepEqual(raw, before, 'normalization and presentation must not rewrite server HTML or amounts');
});

test('a language refresh keeps the private selection while showing only the new server notes', () => {
  const response = (countryTitle, text) => [{ countriesCode: 'US', countryTitle, addresses: {
    storage: [{ id: '1', isActive: 1, notifications: [] }],
    private: [{ id: '2', isActive: 1, notifications: [[{ type: 'warning', text }]] }],
  } }];
  const memory = { 'country:US': 'US:private:2' };
  const original = groupWarehouseAddresses(normalizeWarehouseAddressesData(response('SUA', '<p>20,50 USD · Republica Moldova</p>')));
  assert.equal(resolveWarehouseAddressSelection(original, 'country:US', memory).address.id, memory['country:US']);
  const translated = groupWarehouseAddresses(normalizeWarehouseAddressesData(response('США', '<p>Доплата <b>20,50 USD</b> за посылку. Доставка только в Молдову.</p>')));
  const selected = resolveWarehouseAddressSelection(translated, 'country:US', memory);
  assert.equal(selected.group.countryTitle, 'США');
  assert.equal(selected.address.id, memory['country:US']);
  assert.deepEqual(selected.address.notifications.map(note => plainServerText(note.text)), ['Доплата 20,50 USD за посылку. Доставка только в Молдову.']);
  assert.equal(selected.address.notifications[0].type, 'warning');
});
