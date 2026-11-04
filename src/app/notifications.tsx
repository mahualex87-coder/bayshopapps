import { useLiveAccount } from '@/api/context';
import { LiveNews } from '@/features/accountops/NewsAndSupport';
import { router, type Href } from 'expo-router';
import { Text, View } from 'react-native';
import { useDemo } from '@/state/context';
import { Button, Screen, Notice, useUi } from '@/ui';

function DemoNotifications() {
  const { s } = useUi();
  const { state, dispatch } = useDemo();
  return <Screen title="Notificări" subtitle="Noutăți despre comenzile și coletele tale.">
    
    <Button secondary onPress={()=>dispatch({type:'markAllNotifications'})}>Marchează toate ca citite</Button>
    {!state.notifications.length && <Notice>Nu există notificări deocamdată.</Notice>}
    {state.notifications.map(n=><View key={n.id} style={s.card}><View style={s.row}><Text style={s.status}>{n.read?'Citită':'Nouă'}</Text><Text style={s.small}>{new Date(n.date).toLocaleDateString('ro-RO')}</Text></View><Text style={s.heading}>{n.title}</Text><Text style={s.body}>{n.body}</Text><Button secondary onPress={()=>{dispatch({type:'markNotification',id:n.id});if(n.href)router.push(n.href as Href);}}>{n.href?'Vezi detalii →':'Marchează ca citită'}</Button></View>)}
  </Screen>;
}

export default function Notifications() { return useLiveAccount().authenticated ? <LiveNews /> : <DemoNotifications />; }
