import assert from 'node:assert/strict';
import test from 'node:test';
import { declarationUploads } from '../src/features/live/forms/declaration-attachments.ts';
import { invoiceRequirementError, planMutation } from '../src/api/operations-contracts.ts';

const invoice = { uri: 'file:///invoice.pdf', name: 'invoice.pdf', mimeType: 'application/pdf', size: 1024 };
const proof = { uri: 'file:///proof.jpg', name: 'proof.jpg', mimeType: 'image/jpeg', size: 2048 };
const declaration = [{ title: 'Product', url: 'https://shop.example/product', quantity: '1', price: '10.00' }];

test('warehouse with optional evidence can save without uploads', () => {
  const uploads = declarationUploads(false, [], []);
  assert.equal(invoiceRequirementError(false, 0, 0), null);
  const plan = planMutation({ kind: 'waiting.create', input: { storage: 'usa', tracking: 'TRACK001', declarations: declaration, ...uploads } });
  assert.equal(plan.encoding, 'form');
  assert.equal(plan.files.length, 0);
});

test('warehouse change preserves selected files as customs evidence and original server attachment identities', () => {
  const invoices = [invoice], customsDocuments = [proof, invoice];
  const uploads = declarationUploads(false, invoices, customsDocuments);
  assert.deepEqual(uploads.customsDocuments, [proof, invoice]);
  assert.deepEqual(invoices, [invoice]);
  assert.deepEqual(customsDocuments, [proof, invoice]);
  const plan = planMutation({ kind: 'waiting.edit', id: '7', input: { storage: 'usa', tracking: 'TRACK001', declarations: declaration, invoiceList: ['21'], customsDocsList: ['22'], ...uploads } });
  assert.deepEqual(plan.files.map(file => file.field), ['customsDocs[]', 'customsDocs[]']);
  assert.deepEqual(plan.fields['invoiceList[]'], ['21']);
  assert.deepEqual(plan.fields['customsDocsList[]'], ['22']);
});

test('required and unknown invoice policies keep file categories and validation intact', () => {
  for (const requirement of [true, null, undefined]) {
    const uploads = declarationUploads(requirement, [invoice], [proof]);
    assert.deepEqual(uploads, { invoices: [invoice], customsDocuments: [proof] });
  }
  assert.equal(invoiceRequirementError(true, 0, 0), 'parcelForm.invoiceRequired');
  assert.equal(invoiceRequirementError(null, 0, 1), 'parcelForm.invoiceRuleUnknown');
  const uploads = declarationUploads(true, [invoice], [proof]);
  const plan = planMutation({ kind: 'stock.declaration.save', id: '7', input: { declarationItems: declaration, ...uploads } });
  assert.deepEqual(plan.files.map(file => file.field), ['invoice[]', 'customsDocs[]']);
});
