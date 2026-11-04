import { useLiveAccount } from '@/api/context';
import { LiveParcelsRoute } from '@/features/live/routes';
import { ShipmentList } from '@/features/parcels/ParcelLists';

function DemoShipmentsScreen() {
  return <ShipmentList received={false} />;
}

export default function ShipmentsScreen() {
  const { authenticated } = useLiveAccount();
  return authenticated ? <LiveParcelsRoute stage="sent" /> : <DemoShipmentsScreen />;
}
