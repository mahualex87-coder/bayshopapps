import { useLocalSearchParams } from 'expo-router';
import { LiveIncomingDetailRoute } from '@/features/live';
export default function IncomingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <LiveIncomingDetailRoute id={id} />;
}
