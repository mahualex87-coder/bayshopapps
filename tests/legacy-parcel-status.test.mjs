import assert from 'node:assert/strict';
import test from 'node:test';
import { legacyParcelStatusTone } from '../src/domain/legacy-parcel-status.ts';

test('local prototype parcel labels use the same status meanings as live codes', () => {
  for (const label of ['Așteptat']) assert.equal(legacyParcelStatusTone(label), 'warning');
  assert.equal(legacyParcelStatusTone('Reținere vamală'), 'danger');
  for (const label of ['Recepționat', 'În pregătire', 'Trimise', 'Primit']) assert.equal(legacyParcelStatusTone(label), 'success');
  assert.equal(legacyParcelStatusTone('Status neidentificat'), 'neutral');
});
