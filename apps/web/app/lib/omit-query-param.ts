import type { LocationQuery } from 'vue-router';

/** A copy of the route query without one key, to clean a consumed param out of the URL. */
export function omitQueryParam(
  query: LocationQuery,
  key: string,
): LocationQuery {
  return Object.fromEntries(
    Object.entries(query).filter(([queryKey]) => queryKey !== key),
  );
}
