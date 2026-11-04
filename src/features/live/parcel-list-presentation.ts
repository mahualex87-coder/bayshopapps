import type { LiveParcel, LiveParcelStage } from '../../api/contracts.ts';
import type { ParcelPageState } from '../../api/parcel-pagination.ts';

export function parcelSearchHintKey(stage: LiveParcelStage, scope: ParcelPageState['searchScope']): string {
  if (scope === 'page') return 'live.pagination.searchPage';
  // The current received API ignores page/perPage. Its country counters define
  // the returned collection, not a verified lifetime-history total.
  return stage === 'received' ? 'live.pagination.searchLoadedCountry' : 'live.pagination.searchCollection';
}

export function parcelCardIdentity(parcel: Pick<LiveParcel, 'stage' | 'uid' | 'id' | 'tracking' | 'title' | 'declared'>) {
  const incoming = parcel.stage === 'waiting' || parcel.stage === 'warehouse';
  const code = parcel.uid || (incoming ? null : parcel.tracking) || parcel.id;
  // Waiting's packageName is the API declaration summary, but it has no declared flag.
  // Stock's showTitle is meaningful only when a declaration has not been explicitly ruled out.
  const title = parcel.stage === 'warehouse' && parcel.declared === false ? null : parcel.title;
  return { incoming, identifier: incoming && code === parcel.tracking ? null : code, title: title && title !== code && title !== parcel.tracking ? title : null, tracking: incoming ? parcel.tracking : null };
}
