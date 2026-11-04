/** Match only the service name, never a country or a parcel status. */
export function deliveryTransportIcon(title?: string | null): 'airplane-outline' | 'car-outline' | 'cube-outline' {
  const name = title?.trim().replace(/[\s_-]+/g, '').toLowerCase();
  if (name === 'airpost' || name === 'bayshopairpost') return 'airplane-outline';
  if (name === 'roadexpress' || name === 'bayshoproadexpress') return 'car-outline';
  return 'cube-outline';
}

export function bundledDeliveryBrand(title?: string | null): 'dpd' | 'usps' | null {
  if (/^(?:bayshop[\s_-]+)?dpd(?:[\s_-]|$)/i.test(title?.trim() || '')) return 'dpd';
  if (/\busps\b/i.test(title || '')) return 'usps';
  return null;
}

/** Logos are public presentation assets; never attach account credentials. */
export function publicDeliveryLogo(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
