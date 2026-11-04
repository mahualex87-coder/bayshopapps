import type { Coordinates, PickupPoint } from '@/domain/pickup-points';
export type PickupMapProps = {
  points: PickupPoint[];
  selectedId: string;
  userLocation?: Coordinates | null;
  /** Explicit point/nearest taps may recenter after the user pans the map. */
  recenterKey?: number;
  disabled?: boolean;
  height?: number;
  fill?: boolean;
  onSelect(id: string): void;
};
