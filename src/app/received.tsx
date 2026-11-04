import { useLiveAccount } from '@/api/context';
import { LiveParcelsRoute } from '@/features/live/routes';
import { ShipmentList } from '@/features/parcels/ParcelLists';

function DemoReceivedScreen() {
  return <ShipmentList received />;
}

export default function ReceivedScreen() {
  const { authenticated } = useLiveAccount();
  return authenticated ? <LiveParcelsRoute stage="received" /> : <DemoReceivedScreen />;
}
