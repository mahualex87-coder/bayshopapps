import { changeRecipientCity, changeRecipientRegion, changeRecipientScope, recipientFieldLabel, recipientRegions, visibleRecipientFields } from '@/api/recipient-rules';
import { API_ORIGIN } from '@/api/client';
import { RemotePageButton } from '@/features/content/RemotePageButton';
import { useRef, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useLiveAccount } from '@/api/context';
import { addressFormats, emptyRecipient, recipientDetail, validateRecipient, type AddressFormats, type RecipientField, type RecipientInput } from '@/api/account-operations';
import { useI18n } from '@/i18n/context';
import { useDraftGuard } from '@/navigation/useDraftGuard';
import { Button, Choice, Field, Notice, Screen, useUi } from '@/ui';
import { ResourceStatus } from '@/features/live/shared';
import { useOperationView } from '@/features/live/forms/useOperationView';
import { MutationFeedback, OptionPicker, useAccountView } from './shared';
import { recipientCompanyFields, recipientIdentityFields, recipientScanFields, recipientScanUrl, recipientMaxScanBytes, type RecipientScan } from '@/api/recipient-fields';
import { AttachmentsEditor, type StagedFile } from '@/features/live/forms/AttachmentsEditor';
import { RecipientPhoneField } from './RecipientPhoneField';

const labels: Partial<Record<RecipientField,string>> = { shipping_first_name:'field.firstName',shipping_last_name:'field.lastName',shipping_company_name:'field.company',shipping_address:'field.address',shipping_city:'field.city',shipping_zip:'field.postalCode',shipping_phone_code:'accountOps.phoneCode',shipping_phone:'field.phone', passportSeries:'recipientDetails.passportSeries', passportNumber:'recipientDetails.passportNumber', passportIdnp:'recipientDetails.passportIdnp', passportBirthDate:'recipientDetails.passportBirthDate', passportIssued:'recipientDetails.passportIssued', passportIssuedBy:'recipientDetails.passportIssuedBy', ...Object.fromEntries(recipientCompanyFields.map(key=>[key,`recipientDetails.${key}`])) };
function RecipientForm({ id, initial, formats }: { id?:string; initial:RecipientInput; formats:AddressFormats }) {
  const { s } = useUi();
  const { t } = useI18n(); const live = useLiveAccount();
  const [form,setForm]=useState(initial); const [baseline,setBaseline]=useState(initial);
  const [scans,setScans]=useState<Partial<Record<RecipientScan,StagedFile>>>({}); const [checking,setChecking]=useState(false);
  const mounted=useRef(true); useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const [confirmed,setConfirmed]=useState(false); const [deleting,setDeleting]=useState(false);
  const [errors,setErrors]=useState<Partial<Record<RecipientField|'agree',string>>>({});
  const [error,setError]=useState<string|null>(null); const [saved,setSaved]=useState(false); const [unknown,setUnknown]=useState(false);
  const busy=live.mutationPending||checking; const disabled=busy||unknown;
  const dirty=JSON.stringify(form)!==JSON.stringify(baseline)||Object.keys(scans).length>0; const {confirmDiscard,bypass}=useDraftGuard(!unknown&&dirty||busy,{fallbackHref:'/address-book',pending:busy});
  const checkSavedRecipients=()=>bypass(()=>{void live.refresh(['recipients']);router.replace('/address-book');});
  const set=(key:RecipientField,value:string)=>{setForm(previous=>key==='shipping_city'?changeRecipientCity(previous,{id:'',title:value}):({...previous,[key]:value}));setSaved(false);setErrors(previous=>({...previous,[key]:undefined}));};
  const visible = visibleRecipientFields(form, formats);
  const countryRule = formats.countryRules?.[form.countryId];
  const regionOptions = recipientRegions(formats, form.countryId);
  const label = (key: RecipientField, fallback: string) => recipientFieldLabel(formats, form.countryId, key) || t(fallback);
  const changeScope = (change: { countryId: string } | { isLegal: '0' | '1' }) => {
    const next = changeRecipientScope(form, formats, change); const nextVisible = visibleRecipientFields(next, formats);
    setForm(next); setScans(previous => Object.fromEntries(Object.entries(previous).filter(([key]) => nextVisible.has(key as RecipientField))));
    setConfirmed(false); setErrors({}); setError(null); setSaved(false);
  };
  const save=async()=>{
    if(!live.canMutate||unknown||checking)return;
    const validation=validateRecipient(form,formats,confirmed,{initial:baseline,stagedScans:Object.fromEntries(Object.keys(scans).map(key=>[key,true]))});setErrors(validation.errors);setSaved(false);setError(null);
    if(Object.keys(validation.errors).length){setError('accountOps.formError');return;}
    const result=await live.mutate({kind:'recipient.save',...(id?{id}:{}),input:validation.fields,scans:Object.fromEntries(Object.entries(scans).filter(([key])=>visible.has(key as RecipientField)))});
    if(result.ok){
      if(!mounted.current)return;
      if(!id){bypass(()=>router.replace('/address-book'));return;}
      setChecking(true);setBaseline(form);setScans({});
      try { const fresh=recipientDetail(await live.readView({kind:'recipient.detail',id})); if(mounted.current){setForm(fresh.fields);setBaseline(fresh.fields);setSaved(true);setUnknown(false);} }
      catch { if(mounted.current){setError('recipientDetails.readbackFailed');setUnknown(true);} }
      finally { if(mounted.current)setChecking(false); }
    }
    else{setErrors(result.fieldErrors || {});setError(result.error||'errors.loadFailed');setUnknown(result.outcome==='unknown');}
  };
  const remove=async()=>{if(!id||!live.canMutate||unknown)return;setError(null);const result=await live.mutate({kind:'recipient.delete',id});if(result.ok)bypass(()=>router.replace('/address-book'));else{setError(result.error||'accountOps.deleteFailed');setUnknown(result.outcome==='unknown');}};
  const field=(key:RecipientField)=> <Field key={key} label={label(key,labels[key]!)} value={form[key]} onChangeText={value=>set(key,value)} error={errors[key]?t(errors[key]!):undefined} editable={!disabled} placeholder={key==='passportBirthDate'||key==='passportIssued'?t('recipientDetails.dateFormat'):key==='shipping_zip'?countryRule?.zipMask?.replace(/9/g,'0').replace(/a/g,'A').replace(/\*/g,'A')||undefined:undefined} keyboardType={key.includes('phone')?'phone-pad':key==='shipping_zip'&&/^9+$/.test(countryRule?.zipMask||'')?'number-pad':'default'} autoCapitalize={key==='shipping_zip'?'characters':['passportBirthDate','passportIssued','passportNumber','passportIdnp','companyBankCode','companyCif','companyTva'].includes(key)?'none':'sentences'} />;
  const cities=formats.cities.filter(city=>(!city.countryId||city.countryId===form.countryId)&&(!city.regionId||city.regionId===form.regionId));
  return <>
    <Text accessibilityRole="header" style={s.heading}>{t('recipientDetails.person')}</Text>
    <OptionPicker country label={label('countryId','field.country')} options={formats.countries.map(option=>({...option,countryCode:option.code}))} value={form.countryId} disabled={disabled} error={errors.countryId} onChange={countryId=>changeScope({countryId})} />
    <Choice label={t('accountOps.recipientType')} options={[t('accountOps.person'),t('accountOps.company')]} value={t(form.isLegal==='1'?'accountOps.company':'accountOps.person')} onChange={value=>{if(!disabled)changeScope({isLegal:value===t('accountOps.company')?'1':'0'});}} />
    {form.isLegal==='1'?field('shipping_company_name'):<View style={{flexDirection:'row',alignItems:'flex-start',gap:10}}><View style={{flex:1,minWidth:0}}>{field('shipping_first_name')}</View><View style={{flex:1,minWidth:0}}>{field('shipping_last_name')}</View></View>}
    <Text accessibilityRole="header" style={s.heading}>{t('recipientDetails.address')}</Text>
    {countryRule?.addressAlphabet && <Text style={s.small}>{t(`recipientDetails.alphabet.${countryRule.addressAlphabet}`)}</Text>}
    {(regionOptions.options.length>0||regionOptions.required)&&<OptionPicker label={label('regionId','field.region')} options={regionOptions.options} value={form.regionId} disabled={disabled||regionOptions.unavailable} error={regionOptions.unavailable?undefined:errors.regionId} onChange={regionId=>{setForm(previous=>changeRecipientRegion(previous,regionId));setSaved(false);}} />}
    {regionOptions.unavailable&&<Notice error>{t('recipientDetails.regionUnavailable')}</Notice>}
    {cities.length>0?<OptionPicker label={label('shipping_city','field.city')} options={cities} value={form.cityId} disabled={disabled} error={errors.cityId} onChange={cityId=>{setForm(previous=>changeRecipientCity(previous,{id:cityId,title:cities.find(city=>city.id===cityId)?.title||''}));setSaved(false);}} />:field('shipping_city')}
    {field('shipping_address')}{field('shipping_zip')}
    <RecipientPhoneField code={form.shipping_phone_code} phone={form.shipping_phone} countryId={form.countryId} formats={formats} disabled={disabled} onCodeChange={value=>set('shipping_phone_code',value)} onPhoneChange={value=>set('shipping_phone',value)} codeError={errors.shipping_phone_code} phoneError={errors.shipping_phone} />
    {form.isLegal==='1'?recipientCompanyFields.some(key=>visible.has(key))&&<View style={s.card}><Text accessibilityRole="header" style={s.heading}>{t('recipientDetails.company')}</Text>{recipientCompanyFields.filter(key=>visible.has(key)).map(field)}</View>:[...recipientIdentityFields,...recipientScanFields].some(key=>visible.has(key))&&<View style={s.card}>
      <Text accessibilityRole="header" style={s.heading}>{t('recipientDetails.identity')}</Text><Text style={s.small}>{t('recipientDetails.identityHint')}</Text>
      {(['passportSeries','passportNumber','passportIdnp','passportBirthDate','passportIssued','passportIssuedBy'] as RecipientField[]).filter(key=>visible.has(key)).map(field)}
      {visible.has('passportIssuedCountryId')&&<OptionPicker country label={label('passportIssuedCountryId','recipientDetails.passportIssuedCountryId')} options={formats.passportCountries || (form.passportIssuedCountryId?[{id:form.passportIssuedCountryId,title:formats.countries.find(country=>country.id===form.passportIssuedCountryId)?.title || t('recipientDetails.savedIssuer')}]:[])} value={form.passportIssuedCountryId} disabled={disabled||!formats.passportCountries} error={errors.passportIssuedCountryId} onChange={value=>set('passportIssuedCountryId',value)}/>} 
      {visible.has('passportIssuedCountryId')&&!formats.passportCountries&&<Text style={s.small}>{t('recipientDetails.issuerUnavailable')}</Text>}
      {recipientScanFields.some(key=>visible.has(key))&&<Text style={s.small}>{t('recipientDetails.scansHint')}</Text>}
      {recipientScanFields.filter(key=>visible.has(key)).map(key=>{const url=recipientScanUrl(form[key]); return <View key={key}><AttachmentsEditor title={t(`recipientDetails.${key}`)} existing={url?[{id:key,url,displayName:t(`recipientDetails.${key}`)}]:[]} onExistingChange={()=>set(key,'')} staged={scans[key]?[scans[key]!]:[]} onStagedChange={files=>{setScans(previous=>{const next={...previous};if(files[0])next[key]=files[0];else delete next[key];return next;});setSaved(false);}} maxFiles={1} maxBytes={recipientMaxScanBytes} multiple={false} disabled={disabled}/>{errors[key]&&<Notice error>{t(errors[key]!)}</Notice>}</View>;})}
    </View>}
    {form.isLegal==='1'&&<View style={s.card}><Pressable accessibilityRole="checkbox" aria-checked={confirmed} accessibilityState={{ checked:confirmed, disabled }} accessibilityLabel={t('recipientDetails.importAgreement')} disabled={disabled} onPress={()=>setConfirmed(!confirmed)} style={[s.button,s.secondaryButton]}><Text style={s.body}>{`${confirmed?'✓ ':'□ '}${t('recipientDetails.importAgreement')}`}</Text></Pressable>{errors.agree&&<Notice error>{t(errors.agree)}</Notice>}<RemotePageButton url={`${API_ORIGIN}/page/import-rules.html`} label={t('recipientDetails.importRules')}/></View>}
    {checking&&<Notice>{t('recipientDetails.checking')}</Notice>}<MutationFeedback error={error} saved={saved} unknown={unknown} onCheck={checkSavedRecipients}/><Button disabled={!live.canMutate||disabled||regionOptions.unavailable||(!dirty&&!!id)} onPress={()=>{void save();}}>{t(busy?'accountOps.saving':'accountOps.save')}</Button><Button secondary disabled={disabled} onPress={()=>confirmDiscard(()=>bypass(()=>router.back()))}>{t('accountOps.cancel')}</Button>
    {id&&!deleting&&<Button secondary disabled={disabled} onPress={()=>setDeleting(true)}>{t('accountOps.deleteRecipient')}</Button>}
    {deleting&&<View style={s.card}><Text style={s.heading}>{t('accountOps.deleteQuestion')}</Text><Button disabled={!live.canMutate||unknown} onPress={()=>{void remove();}}>{t('accountOps.confirmDelete')}</Button><Button secondary disabled={disabled} onPress={()=>setDeleting(false)}>{t('accountOps.cancel')}</Button></View>}
  </>;
}
function ExistingRecipientForm({id,formats}:{id:string;formats:AddressFormats}) {
  const {resource,reload}=useAccountView({kind:'recipient.detail',id},raw=>recipientDetail(raw).fields);
  return resource.data?<RecipientForm id={id} initial={resource.data} formats={formats}/>:<ResourceStatus resource={resource} onRefresh={reload}/>;
}
export function LiveRecipientEditor({id}:{id?:string}){
  const {t,language}=useI18n(); const live=useLiveAccount();
  const formats=useAccountView({kind:'recipient.formats'},addressFormats);
  const permissions=useOperationView(id?{kind:'recipients.read'}:null);
  const permission=permissions.resource.data?.find(recipient=>recipient.id===id)?.isEditable;
  const allowed=!id||permission===true&&!permissions.resource.loading&&!permissions.resource.error;
  const scope=`${live.resources.profile.data?.id}:${language}:${id||'new'}`;
  return <Screen title={t(id?'accountOps.editRecipient':'accountOps.newRecipient')} subtitle={t('accountOps.recipientIntro')}>
    {id&&!allowed&&<><ResourceStatus resource={permissions.resource} onRefresh={()=>{void permissions.refresh();}}/>{!permissions.resource.loading&&<Notice>{t(permission===false?'accountOps.recipientReadOnly':'accountOps.recipientPermissionUnavailable')}</Notice>}<Button secondary onPress={()=>router.replace('/address-book')}>{t('accountOps.backToRecipients')}</Button></>}
    {allowed&&<>{!formats.resource.data&&<ResourceStatus resource={formats.resource} onRefresh={formats.reload}/>} {formats.resource.data&&(id?<ExistingRecipientForm key={scope} id={id} formats={formats.resource.data}/>:<RecipientForm key={scope} initial={emptyRecipient()} formats={formats.resource.data}/>)}</>}
  </Screen>;
}
