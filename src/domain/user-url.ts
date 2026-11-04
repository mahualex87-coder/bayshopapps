/** Normalize an editable product-link field only. Validation remains the
 * caller's responsibility; server media URLs and navigation must not use this. */
export function normalizeUserUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || /[\u0000-\u001f\u007f]/.test(trimmed)) return trimmed;
  // A dotted website/IP followed by a numeric port is not a URL scheme.
  const hostWithPort = /^(?:[\p{L}\p{N}-]+\.)+[\p{L}\p{N}-]+:\d+(?:[/?#]|$)/u.test(trimmed);
  if (!hostWithPort && /^[a-z][a-z\d+.-]*:/i.test(trimmed)) return trimmed;
  if (/^\/\/[^/\\]/.test(trimmed)) return `https:${trimmed}`;
  // A relative path is not a website address. Leave it for the URL validator.
  if (/^[\/\\?#]/.test(trimmed) || /^\.{1,2}\//.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
