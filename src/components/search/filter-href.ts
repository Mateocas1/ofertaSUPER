/**
 * The URL a filter form navigates to: its action plus every non-empty field.
 * Empty values are dropped so "Todos" and the default sort leave no
 * "?super=&sort=" noise in the address bar or the CDN cache key.
 */
export function filterHref(action: string, entries: Iterable<[string, FormDataEntryValue]>): string {
  const params = new URLSearchParams();
  for (const [key, value] of entries) {
    if (typeof value === "string" && value !== "") params.append(key, value);
  }
  const query = params.toString();
  return query ? `${action}?${query}` : action;
}
