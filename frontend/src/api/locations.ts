import { api } from './client';
import { ensureInitData, unwrap } from './request';
import type { Location, LocationKind } from './types';

/** Поиск точек по IATA-коду, городу или названию (от 2 символов, до 20 результатов). */
export async function searchLocations(
  q: string,
  kind: LocationKind = 'airport',
): Promise<Location[]> {
  ensureInitData();
  return unwrap(await api.GET('/locations', { params: { query: { q, kind } } }));
}
