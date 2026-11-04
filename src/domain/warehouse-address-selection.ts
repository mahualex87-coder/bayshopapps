import type { LiveWarehouseAddress } from '../api/contracts.ts';
import { resolveCountryCode } from '../components/country-code.ts';
import { sortCountries } from './option-order.ts';

export type WarehouseAddressGroup = {
  id: string;
  countryCode: string | null;
  /** Exact server title from the first address in this country. */
  countryTitle: string;
  addresses: LiveWarehouseAddress[];
};

/** Group known countries in the common ISO order, preserving address order.
 * An unrecognized country gets its own address group; matching unknown labels
 * never establish that two addresses are in the same country. */
export function groupWarehouseAddresses(addresses: readonly LiveWarehouseAddress[]): WarehouseAddressGroup[] {
  const groups: WarehouseAddressGroup[] = [];
  const countries = new Map<string, WarehouseAddressGroup>();
  const unknownIds = new Map<string, number>();
  addresses.forEach((address, index) => {
    const countryTitle = address.countryTitle || address.title || address.countryCode;
    const countryCode = resolveCountryCode(address.countryCode, countryTitle);
    const existing = countryCode ? countries.get(countryCode) : undefined;
    if (existing) {
      existing.addresses.push(address);
      return;
    }

    let id: string;
    if (countryCode) id = `country:${countryCode}`;
    else {
      // IDs normally come from the validated API normalizer. Keep even a
      // repeated or absent unknown ID separate instead of silently merging it.
      const base = address.id ? `address:${encodeURIComponent(address.id)}` : `unidentified:${index}`;
      const occurrence = (unknownIds.get(base) || 0) + 1;
      unknownIds.set(base, occurrence);
      id = occurrence === 1 ? base : `${base}:${occurrence}`;
    }
    const group = { id, countryCode, countryTitle, addresses: [address] };
    groups.push(group);
    if (countryCode) countries.set(countryCode, group);
  });
  return sortCountries(groups, group => ({ code: group.countryCode, id: group.id }));
}

function defaultAddress(addresses: readonly LiveWarehouseAddress[]): LiveWarehouseAddress | null {
  return addresses.find(address => address.active === true && address.kind === 'storage')
    || addresses.find(address => address.active === true)
    || addresses.find(address => address.active !== false && address.kind === 'storage')
    || addresses.find(address => address.active !== false)
    || addresses[0]
    || null;
}

/** Resolve current server data against the UI's per-country selection memory.
 * Existing explicit choices remain inspectable even when inactive. The caller
 * must continue to disable copying for active===false. Missing choices fall
 * back within their country; only a missing country selects the first group. */
export function resolveWarehouseAddressSelection(
  groups: readonly WarehouseAddressGroup[],
  selectedCountryId?: string | null,
  selectedAddressIds: Readonly<Record<string, string>> = {},
): { group: WarehouseAddressGroup | null; address: LiveWarehouseAddress | null } {
  const group = groups.find(candidate => candidate.id === selectedCountryId) || groups[0] || null;
  if (!group) return { group: null, address: null };
  const rememberedId = selectedAddressIds[group.id];
  const address = group.addresses.find(candidate => candidate.id === rememberedId) || defaultAddress(group.addresses);
  return { group, address };
}
