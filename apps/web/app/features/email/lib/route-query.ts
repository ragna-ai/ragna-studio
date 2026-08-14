import type { LocationQueryValue } from 'vue-router';

/**
 * Vue Router query values can be repeated (`string[]`), absent (`null`), or
 * missing entirely (`undefined` - `route.query` is a plain index signature,
 * so an unset key reads as `undefined`, not `null`); the email filters are
 * always single-valued.
 */
export function firstQueryValue(
  value: LocationQueryValue | LocationQueryValue[] | undefined,
): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw ?? null;
}
