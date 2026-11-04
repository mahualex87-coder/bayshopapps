import { useLiveAccount } from '@/api/context';
import { LiveParcelsRoute } from '@/features/live/routes';
import { useLocalSearchParams } from 'expo-router';
import { WarehouseList } from '@/features/parcels/ParcelLists';

function DemoWaitingScreen() {
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  return <WarehouseList key={focus ?? 'waiting'} mode="waiting" focus={focus} />;
}

export default function WaitingScreen() {
  const { authenticated } = useLiveAccount();
  return authenticated ? <LiveParcelsRoute stage="waiting" /> : <DemoWaitingScreen />;
}
