import type { LiveWarehouse } from '../api/contracts.ts';

export function isWaitingStorageTitle(value: unknown): value is string {
  return typeof value === 'string' && !!value.trim() && !/[\u0000-\u001f\u007f]/.test(value);
}

/** WarehouseListController returns storage.title unchanged. WaitingMfListController
 * resolves the submitted storage with getByTitle(), for both create and edit.
 * Numeric IDs, translated country names and guessed country aliases are not writes. */
export function waitingWarehouseOption(warehouse: LiveWarehouse) {
  const value = warehouse.sourceTitle;
  if (!isWaitingStorageTitle(value)) return null;
  return {
    value, title: warehouse.title, countryCode: warehouse.code,
    currencyId: warehouse.currencyId, availableCurrencies: warehouse.availableCurrencies,
    requireInvoiceUpload: warehouse.requireInvoiceUpload,
  };
}

export function waitingWarehouseOptions(warehouses: readonly LiveWarehouse[]) {
  return warehouses.flatMap(warehouse => {
    const option = waitingWarehouseOption(warehouse);
    return option ? [option] : [];
  });
}
