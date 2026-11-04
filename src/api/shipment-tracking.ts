import type { LiveShipmentTracking } from './contracts';
import { ApiContractError } from './normalize.ts';
import { serverText } from '../domain/server-text.ts';

const resource = 'istoricul expedierii';
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiContractError(resource);
  return value as Record<string, unknown>;
}
function text(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw new ApiContractError(resource);
  return value;
}
function displayText(value: unknown): string | null { return serverText(text(value)) || null; }

/** MF v2 GetTrackingInfoController's parcel response uses the same merged
 * getTrackingCheckPoints() as the web popup. Preserve its descending order,
 * translated status, local address and courier, including repeated statuses. */
export function normalizeShipmentTracking(data: unknown): LiveShipmentTracking {
  const row = object(data);
  if (!Array.isArray(row.checkpoints)) throw new ApiContractError(resource);
  return {
    serviceName: displayText(row.service_name), trackingStatus: text(row.tracking_status),
    sentAt: text(row.sent_time), updatedAt: text(row.update_time),
    checkpoints: row.checkpoints.map(value => {
      const checkpoint = object(value);
      const courier = checkpoint.courier == null ? null : object(checkpoint.courier);
      return {
        status: displayText(checkpoint.status), location: displayText(checkpoint.location),
        dateTime: text(checkpoint.date_time) ?? text(checkpoint.date), time: text(checkpoint.time),
        courier: courier ? { name: displayText(courier.name), title: displayText(courier.title) } : null,
      };
    }),
  };
}
