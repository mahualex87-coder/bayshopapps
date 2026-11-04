import type { ThemeColors } from '@/theme/palette';
import { useThemeStyles } from '@/theme/context';
import { ServiceIdentity } from '@/components/ServiceIdentity';
import { useState } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLiveAccount } from '@/api/context';
import { calculatorOptions, calculatorQuotes, type CalculatorOptions, type CalculatorQuote, type ServerOption } from '@/api/account-operations';
import { useI18n } from '@/i18n/context';
import { Button, Field, Notice, Screen, useUi } from '@/ui';
import { displayMoney, ResourceStatus } from '@/features/live/shared';
import { calculatorDefaultDestination, calculatorDefaults } from '@/domain/calculator-defaults';
import { OptionPicker, useAccountView } from './shared';

function UnitPicker({ label, value, options, onChange, disabled }: { label: string; value: string; options: ServerOption[]; onChange: (value: string) => void; disabled: boolean }) {
  const { t } = useI18n();
  const { s, colors } = useUi();
  const styles = useThemeStyles(makeStyles);
  const [open, setOpen] = useState(false);
  const selected = options.find(option => option.id === value);
  const symbol = selected && /^[a-z]{1,5}$/i.test(selected.id) ? selected.id : selected?.title;
  return <View style={s.field}>
    <Text style={s.label}>{t('accountOps.measureUnit')}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${selected?.title || t('accountOps.choose')}`} accessibilityState={{ disabled, expanded: open }} disabled={disabled} onPress={() => { Keyboard.dismiss(); setOpen(true); }} style={({ pressed }) => [s.input, styles.unitButton, pressed && s.pressed]}>
      <Text numberOfLines={1} style={styles.unitText}>{symbol || '—'}</Text><Text accessible={false} style={s.small}>⌄</Text>
    </Pressable>
    <Modal visible={open && !disabled} transparent animationType="none" onRequestClose={() => setOpen(false)}>
      <View style={styles.unitBackdrop}>
        <View accessibilityViewIsModal style={styles.unitDialog}>
          <Text accessibilityRole="header" style={s.heading}>{label}</Text>
          <ScrollView accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.unitChoices} keyboardShouldPersistTaps="handled">
            {options.map(option => <Pressable key={option.id} accessibilityRole="radio" aria-checked={option.id === value} accessibilityState={{ checked: option.id === value }} onPress={() => { onChange(option.id); setOpen(false); }} style={({ pressed }) => [styles.unitChoice, option.id === value && { backgroundColor: colors.soft }, pressed && s.pressed]}><Text style={[s.body, styles.unitChoiceText]}>{option.title}</Text>{option.id === value && <Text accessible={false} style={s.body}>✓</Text>}</Pressable>)}
          </ScrollView>
          <Button secondary onPress={() => setOpen(false)}>{t('accountOps.close')}</Button>
        </View>
      </View>
    </Modal>
  </View>;
}

function CalculatorForm({options}:{options:CalculatorOptions}){
  const { s } = useUi();
  const styles = useThemeStyles(makeStyles);
  const {t,formatNumber}=useI18n();const live=useLiveAccount();
  const accountCountryId=live.resources.profile.data?.countryId;
  const defaults=calculatorDefaults(options,accountCountryId);
  // Null route fields follow account defaults until the user explicitly chooses.
  // Late profile data can fill the destination without resetting typed dimensions.
  const [initial]=useState({storage_id:null as string|null,country_id:null as string|null,weight:'',weightUnit:options.weights[0]?.id||'',sizeUnit:options.sizes[0]?.id||'',x:'',y:'',z:''});
  const [draft,setDraft]=useState(initial);
  const storageId=draft.storage_id??defaults.storageId;
  const form={...draft,storage_id:storageId,country_id:draft.country_id??calculatorDefaultDestination(options,storageId,accountCountryId)};
  const formKey=JSON.stringify(form);
  const [result,setResult]=useState<{key:string;quotes:CalculatorQuote[]}|null>(null);const [error,setError]=useState<string|null>(null);
  const quotes=result?.key===formKey?result.quotes:null;
  const update=(key:keyof typeof form,value:string)=>{setDraft(previous=>({...previous,[key]:value,...(key==='storage_id'?{country_id:null}:{})}));setResult(null);setError(null);};
  const selected=options.storages.find(storage=>storage.id===form.storage_id);const countries=options.countries.filter(country=>selected?.activeCountries.includes(country.id));
  const calculate=async()=>{
    setResult(null);setError(null);
    if(!selected){setError('accountOps.required');return;}if(!countries.some(country=>country.id===form.country_id)){setError('accountOps.selectCountry');return;}
    const number=(value:string)=>/^\d+(?:[.,]\d+)?$/.test(value)&&Number.isFinite(Number(value.replace(',','.')))&&Number(value.replace(',','.'))>0;
    if(!number(form.weight)){setError('accountOps.invalidWeight');return;}
    const hasDimensions=!!(form.x||form.y||form.z);if(hasDimensions&&![form.x,form.y,form.z].every(number)){setError('accountOps.invalidDimensions');return;}
    const result=await live.mutate({kind:'calculator.calculate',input:{storage_id:form.storage_id,country_id:form.country_id,weight:form.weight.replace(',','.'),weightUnit:form.weightUnit,...(hasDimensions?{sizeUnit:form.sizeUnit,'volume[x]':form.x.replace(',','.'),'volume[y]':form.y.replace(',','.'),'volume[z]':form.z.replace(',','.')}: {})}});
    if(result.ok){try{setResult({key:formKey,quotes:calculatorQuotes(result.data)});}catch{setError('errors.contract');}}else setError(result.outcome==='unknown'?'errors.loadFailed':result.error||'errors.loadFailed');
  };
  return <><OptionPicker country label={t('accountOps.from')} value={form.storage_id} options={options.storages.map(option => ({ ...option, countryCode: option.code || null }))} onChange={value=>update('storage_id',value)} disabled={live.mutationPending}/><OptionPicker country label={t('accountOps.to')} value={form.country_id} options={countries.map(option => ({ ...option, countryCode: option.code || null }))} onChange={value=>update('country_id',value)} disabled={live.mutationPending||!selected}/>
    <View style={styles.measureRow}>
      <View style={styles.dimension}><Field label={t('accountOps.weight')} value={form.weight} onChangeText={value=>update('weight',value)} keyboardType="decimal-pad" editable={!live.mutationPending}/></View>
      <View style={styles.weightUnit}><UnitPicker label={t('accountOps.weightUnit')} value={form.weightUnit} options={options.weights} onChange={value=>update('weightUnit',value)} disabled={live.mutationPending}/></View>
    </View>
    <View style={s.card}>
      <Text style={s.heading}>{t('accountOps.dimensions')}</Text>
      <Text style={s.small}>{t('accountOps.dimensionsHelp')}</Text>
      <View style={styles.measureRow}>
        {(['x','z','y'] as const).map((key,index)=><View key={key} style={styles.dimension}><Field label={t(['accountOps.lengthShort','accountOps.heightShort','accountOps.depthShort'][index])} accessibilityHint={`${t(['accountOps.length','accountOps.height','accountOps.depth'][index])}, ${options.sizes.find(unit=>unit.id===form.sizeUnit)?.title || ''}`} value={form[key]} onChangeText={value=>update(key,value)} keyboardType="decimal-pad" editable={!live.mutationPending} style={styles.dimensionInput}/></View>)}
        <View style={styles.sizeUnit}><UnitPicker label={t('accountOps.sizeUnit')} value={form.sizeUnit} options={options.sizes} onChange={value=>update('sizeUnit',value)} disabled={live.mutationPending}/></View>
      </View>
    </View>
    {error&&<Notice error>{t(error)}</Notice>}<Button disabled={!live.canMutate} onPress={()=>{void calculate();}}>{t(live.mutationPending?'accountOps.calculating':'accountOps.calculate')}</Button>
    {quotes?.map(quote=><View key={quote.id} style={s.card}><View style={s.row}><ServiceIdentity title={quote.title} logoUrl={quote.logoUrl} textStyle={s.heading} style={{ flex: 1 }} />{quote.amount !== null && <Text style={s.heading}>{displayMoney(quote.amount,quote.currency,formatNumber)}</Text>}</View>{quote.exceeded && <Notice>{t('accountOps.weightExceeded')}</Notice>}{!quote.exceeded && !!quote.duration&&<Text style={s.body}>{quote.duration}</Text>}{!!quote.description&&<Text style={s.small}>{quote.description}</Text>}</View>)}{quotes?.length===0&&<Notice>{t('accountOps.noRates')}</Notice>}<Text style={s.small}>{t('accountOps.quoteNote')}</Text>
  </>;
}
export function LiveCalculator(){const {t}=useI18n();const {resource,reload}=useAccountView({kind:'calculator.options'},calculatorOptions);return <Screen title={t('accountOps.calculator')} subtitle={t('accountOps.calculatorIntro')}>{!resource.data&&<ResourceStatus resource={resource} onRefresh={reload}/>} {resource.data&&<CalculatorForm key={resource.updatedAt} options={resource.data}/>}</Screen>;}

const makeStyles=(colors: ThemeColors) => StyleSheet.create({
  measureRow:{flexDirection:'row',alignItems:'flex-end',gap:8},
  dimension:{flex:1,minWidth:0},
  weightUnit:{width:90}, sizeUnit:{width:64},
  dimensionInput:{paddingHorizontal:6,textAlign:'center'},
  unitButton:{paddingHorizontal:8,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:3},
  unitText:{color:colors.text,fontSize:15,flexShrink:1},
  unitBackdrop:{flex:1,backgroundColor:'rgba(0,0,0,0.38)',justifyContent:'center',padding:20},
  unitDialog:{width:'100%',maxWidth:400,maxHeight:'80%',alignSelf:'center',padding:18,gap:14,borderRadius:22,borderWidth:1,borderColor:colors.glassBorder,backgroundColor:colors.surface},
  unitChoices:{maxHeight:260},
  unitChoice:{minHeight:48,padding:12,borderRadius:12,flexDirection:'row',alignItems:'center',gap:10},
  unitChoiceText:{flex:1},
});
