import type { LiveParcelStage, LiveWarehouseAddress } from '../../api/contracts.ts';
import { resolveCountryCode } from '../../components/country-code.ts';
import { sortCountries } from '../../domain/option-order.ts';

type CountryCount = { code: string; total: number };

/** Local list filters may show an accessible depot with zero parcels. Received
 * reads are country-specific and must keep exactly the server's allowed set. */
export function parcelFilterCountries(stage: LiveParcelStage, current: readonly CountryCount[], addresses: readonly LiveWarehouseAddress[]): CountryCount[] {
  const countries = [...current];
  if (stage !== 'received') {
    const present = new Set(current.map(item => item.code));
    for (const address of addresses) {
      if (address.active === false) continue;
      const code = resolveCountryCode(address.countryCode, address.countryTitle || address.title);
      if (!code || present.has(code)) continue;
      countries.push({ code, total: 0 });
      present.add(code);
    }
  }
  return sortCountries(countries, item => ({ code: item.code }));
}
