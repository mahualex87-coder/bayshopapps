import { useLocalSearchParams } from 'expo-router';
import { LiveRecipientEditor } from '@/features/accountops/RecipientEditor';
export default function Recipient() { const { id } = useLocalSearchParams<{ id: string }>(); return <LiveRecipientEditor id={id} />; }
