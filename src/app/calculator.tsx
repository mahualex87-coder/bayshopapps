import { useLiveAccount } from '@/api/context';
import { LiveCalculator } from '@/features/accountops/Calculator';
import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { money } from '@/state/contracts';
import { shipmentQuote } from '@/state/demo';
import { validateWeight } from '@/domain/validation';
import { Button, Choice, Field, Notice, Screen, useUi } from '@/ui';

function DemoCalculator(){
  const { colors, s } = useUi();
  const [origin,setOrigin]=useState('SUA');const [destination,setDestination]=useState('Moldova');
  const [weight,setWeight]=useState('1');const [dimensions,setDimensions]=useState(false);
  const [length,setLength]=useState('30');const [width,setWidth]=useState('20');const [height,setHeight]=useState('15');
  const [result,setResult]=useState<{physical:number;volume:number;billable:number;price:number}|null>(null);const [error,setError]=useState('');
  function calculate(){
    setError('');setResult(null);if(origin===destination){setError('Alege țări diferite.');return;}
    const w=validateWeight(weight);if(!w.ok){setError(w.error);return;}
    const sides=[length,width,height].map(x=>Number(x.replace(',','.')));
    if(dimensions&&sides.some(x=>!Number.isFinite(x)||x<=0||x>300)){setError('Dimensiunile trebuie să fie mai mari de 0 și cel mult 300 cm.');return;}
    const quote=shipmentQuote(w.value,0);
    const volume=dimensions?sides.reduce((a,b)=>a*b,1)/6000:quote.volumetricKg;const billable=Math.max(volume,w.value);
    setResult({physical:w.value,volume,billable,price:dimensions?Math.round((billable*8+8)*100)/100:quote.costs.shipping+quote.costs.handling});
  }
  function clear(){setResult(null);setError('');}
  return <Screen title="Calculator de livrare" subtitle="Estimează costul în funcție de greutate și dimensiuni.">
    
    <Notice>Calcul ilustrativ, cu același tarif pentru toate rutele: 8 USD/kg + 8 USD. Nu este o ofertă BayShop și nu include taxe de import.</Notice>
    <Choice country label="Țara de plecare" options={['SUA','România','Germania','Regatul Unit','Italia','Polonia']} value={origin} onChange={v=>{setOrigin(v);clear();}}/>
    <Choice country label="Destinație" options={['Moldova','România']} value={destination} onChange={v=>{setDestination(v);clear();}}/>
    <Field label="Greutate fizică (kg)" value={weight} onChangeText={v=>{setWeight(v);clear();}} keyboardType="decimal-pad"/>
    <View style={s.setting}><Text style={[s.body,{flex:1}]}>Introdu dimensiuni pentru greutatea volumetrică</Text><Switch accessibilityLabel="Calculează greutatea volumetrică" value={dimensions} onValueChange={v=>{setDimensions(v);clear();}} trackColor={{true:colors.accent,false:colors.border}}/></View>
    {dimensions&&<><Field label="Lungime (cm)" value={length} onChangeText={v=>{setLength(v);clear();}} keyboardType="decimal-pad"/><Field label="Lățime (cm)" value={width} onChangeText={v=>{setWidth(v);clear();}} keyboardType="decimal-pad"/><Field label="Înălțime (cm)" value={height} onChangeText={v=>{setHeight(v);clear();}} keyboardType="decimal-pad"/><Text style={s.small}>Greutate volumetrică: lungime × lățime × înălțime / 6000.</Text></>}
    <Button onPress={calculate}>Calculează</Button>
    {error&&<Notice error>{error}</Notice>}
    {!dimensions&&<Text style={s.small}>Fără dimensiuni, greutatea volumetrică este estimată la 1,2 × greutatea fizică.</Text>}
    {result&&<View style={s.card}><Text style={s.status}>ESTIMARE</Text><Text style={s.heading}>{money(result.price)}</Text><Text style={s.body}>{origin} → {destination}</Text><Text style={s.body}>Greutate fizică: {result.physical.toFixed(2)} kg</Text><Text style={s.body}>Greutate volumetrică: {result.volume.toFixed(2)} kg</Text><Text style={s.body}>Greutate calculată: {result.billable.toFixed(2)} kg</Text><Text style={s.small}>Costul final depinde de dimensiunile măsurate și de serviciile alese.</Text></View>}
  </Screen>;
}

export default function Calculator() { return useLiveAccount().authenticated ? <LiveCalculator /> : <DemoCalculator />; }
