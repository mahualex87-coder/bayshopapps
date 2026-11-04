import { useLiveAccount } from '@/api/context';
import { LiveParcelsRoute } from '@/features/live/routes';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { WarehouseList } from '@/features/parcels/ParcelLists';

function DemoWarehouseScreen() {
  const { view, focus } = useLocalSearchParams<{ view?: string; focus?: string }>();
  if (view === 'waiting') return <Redirect href={{ pathname: '/waiting', params: focus ? { focus } : {} }} />;
  return <WarehouseList mode="stock" />;
}

export default function WarehouseScreen() {
  const { authenticated } = useLiveAccount();
  return authenticated ? <LiveParcelsRoute stage="warehouse" /> : <DemoWarehouseScreen />;
}
