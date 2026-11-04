import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeParcelReview, reviewBaseline, reviewInputFields, validateReviewAgainstCurrent, reviewWriteConfirmed, reviewPhotoMaxBytes } from '../src/api/parcel-review.ts';
import { planRead, planMutation } from '../src/api/operations-contracts.ts';
import { LiveAccountService } from '../src/api/service.ts';
import { API_ORIGIN, ApiError } from '../src/api/client.ts';
import { prepareWriteBody } from '../src/api/mutations.ts';

const raw = (extra={}) => ({id:'501',status:'received',service_rating:null,service_comment:null,service_photo:null,...extra});
const empty = normalizeParcelReview(raw());
const input = (extra={}) => ({rating:5,comment:'Livrare bună',expected:reviewBaseline(empty),...extra});
const photo = {uri:'file:///selected/review.png',name:'review.png',mimeType:'image/png',size:100};
const command = (extra={}) => ({kind:'shipment.review.save',id:'501',input:input(extra)});
const flush = () => new Promise(resolve=>setImmediate(resolve));
const deferred = () => {let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}};

test('review metadata is preserved, absent fields are not invented, and unsafe photo URLs are rejected',()=>{
  assert.deepEqual(empty,{id:'501',received:true,rating:null,comment:null,photo:null});
  const review=normalizeParcelReview(raw({service_rating:'4',service_comment:'Bine <3 & mulțumesc',service_photo:{original:'/thumbs/review.jpg',thumbnail:'https://bayshop.com/thumbs/small.jpg'},token:'not-retained'}));
  assert.equal(review.rating,4);assert.equal(review.comment,'Bine <3 & mulțumesc');assert.equal(review.photo.url,'https://bayshop.com/thumbs/review.jpg');
  assert.equal(JSON.stringify(review).includes('not-retained'),false);
  assert.equal(normalizeParcelReview(raw({service_rating:'0',service_photo:false})).rating,null);
  assert.equal(normalizeParcelReview(raw({status:'sent'})).received,false);
  assert.throws(()=>normalizeParcelReview({id:'501',status:'received'}));
  for(const rating of [false,' ',6,1.5,'5stars'])assert.throws(()=>normalizeParcelReview(raw({service_rating:rating})));
  for(const url of ['javascript:alert(1)','file:///private','https://user:password@bayshop.com/photo','//evil.test/picture'])assert.throws(()=>normalizeParcelReview(raw({service_photo:{original:url}})));
});

test('review uses the documented view POST and single service_photo multipart field without baseline or parcel actions',async()=>{
  assert.equal(planRead({kind:'shipment.review.read',id:'501'}).path,'/api/parcels/view/501');
  const plan=planMutation(command({photo}));
  assert.equal(plan.path,'/api/parcels/view/501');assert.equal(plan.method,'POST');assert.equal(plan.encoding,'multipart');
  assert.deepEqual(plan.fields,{rating:'5',comment:'Livrare bună'});assert.deepEqual(plan.files,[{field:'service_photo',file:photo}]);
  const body=await prepareWriteBody(plan,()=>new Blob(['synthetic-image'],{type:'image/png'}));
  assert.equal(body.contentType,undefined);assert.equal(body.body.get('service_photo').name,'review.png');assert.equal(body.body.get('rating'),'5');
  assert.equal(body.body.has('expected'),false);assert.equal(body.body.has('confirm'),false);assert.equal(body.body.has('sentOnUserAlert'),false);
  assert.equal(planMutation(command({comment:'  '})).encoding,'form');
  assert.deepEqual(plan.normalize({code:200,error:false,message:'Ok'}),{saved:true});
  for(const ack of [{code:200,error:true,message:'Ok'},{code:200,error:false,message:'Error'},{message:'Ok'}])assert.throws(()=>plan.normalize(ack));
});

test('star bounds, retained photo, empty legacy comment and file limits prevent misleading saves',()=>{
  for(const rating of [0,6,1.5,'5'])assert.throws(()=>reviewInputFields(input({rating})));
  assert.throws(()=>reviewInputFields(input({comment:'0'})));
  assert.throws(()=>reviewInputFields(input({comment:'',expected:{rating:4,comment:'Existing',photoUrl:null}})));
  assert.throws(()=>reviewInputFields(input({photo,expected:{rating:4,comment:null,photoUrl:'https://bayshop.com/a.jpg'}})));
  for(const file of [{...photo,uri:'https://bayshop.com/a.png'},{...photo,mimeType:'application/pdf'},{...photo,size:undefined},{...photo,size:0},{...photo,size:reviewPhotoMaxBytes+1}])assert.throws(()=>reviewInputFields(input({photo:file})));
  assert.deepEqual(reviewInputFields(input({photo:{...photo,size:reviewPhotoMaxBytes}})),{rating:'5',comment:'Livrare bună'});
  assert.throws(()=>planMutation({...command(),id:'501/../502'}));
});

test('fresh ownership/status and review baseline must match, and readback includes every requested field',()=>{
  validateReviewAgainstCurrent('501',input(),empty);
  for(const current of [normalizeParcelReview(raw({id:'502'})),normalizeParcelReview(raw({status:'sent'})),normalizeParcelReview(raw({service_rating:'4'})),normalizeParcelReview(raw({service_photo:{original:'https://bayshop.com/saved.jpg'}}))])assert.throws(()=>validateReviewAgainstCurrent('501',input(),current));
  const saved=normalizeParcelReview(raw({service_rating:'5',service_comment:'Livrare bună'}));
  assert.equal(reviewWriteConfirmed('501',input(),saved),true);
  assert.equal(reviewWriteConfirmed('501',input({photo}),saved),false);
  assert.equal(reviewWriteConfirmed('501',input({photo}),{...saved,photo:{url:'https://bayshop.com/new.jpg',thumbnail:null}}),true);
  assert.equal(reviewWriteConfirmed('501',input(),{...saved,comment:'Other'}),false);
  assert.equal(reviewWriteConfirmed('502',input(),saved),false);
});

function fixture(override=()=>undefined){
 const writes=[];let current=raw();const now=1790000000000;
 const service=new LiveAccountService(async(path,options)=>{
  const value=override(path,options);if(value!==undefined)return value;
  if(options.write){writes.push({path,plan:options.write});current=raw({service_rating:options.write.fields.rating,service_comment:options.write.fields.comment||null,service_photo:options.write.files?.length?{original:'https://bayshop.com/saved.jpg'}:null});return{code:200,error:false,message:'Ok'}}
  if(path==='/api/parcels/view/501')return current;
  if(path==='/api/auth')return{id:'7',name:'First',surname:'Last'};
  if(path==='/api/member/me')return{member:{id:'7',email:'qa@example.test'}};
  if(path==='/api/member/personal-data')return{name:'First',surname:'Last',phone:'60000000',phoneCode:'+373'};
  if(path==='/api/member/counters')return{awaiting:0,incoming:0,outgoing:0,received:0};
  if(path==='/api/refund-request')return{memberBalance:[]};
  return[];
 },{read:async()=>JSON.stringify({origin:API_ORIGIN,token:'synthetic-review-only',expiresAt:now+3600000}),write:async()=>{},clear:async()=>{}},()=>now);
 return{service,writes};
}
test('service rechecks received status before one write and allows an explicit readback',async()=>{
 const {service,writes}=fixture();await service.start();await flush();
 const result=await service.mutate(command({photo}));assert.equal(result.ok,true);assert.equal(writes.length,1);
 const saved=await service.readView({kind:'shipment.review.read',id:'501'});assert.equal(reviewWriteConfirmed('501',input({photo}),saved),true);
 assert.equal(JSON.stringify(service.getSnapshot()).includes('Livrare bună'),false);
});
test('ineligible or stale reviews never dispatch, even through a direct command',async()=>{
 for(const value of [raw({status:'sent'}),raw({id:'502'}),raw({service_rating:'4'}),raw({service_photo:{original:'https://bayshop.com/existing.jpg'}})]){
  const {service,writes}=fixture((path,options)=>path==='/api/parcels/view/501'&&!options.write?value:undefined);await service.start();await flush();
  assert.equal((await service.mutate(command())).outcome,'rejected');assert.equal(writes.length,0);
 }
});
test('logout or a duplicate tap during preflight cannot submit a review',async()=>{
 const wait=deferred();const {service,writes}=fixture((path,options)=>path==='/api/parcels/view/501'&&!options.write?wait.promise:undefined);
 await service.start();await flush();const first=service.mutate(command());await flush();
 assert.equal((await service.mutate(command())).error,'errors.mutationInProgress');await service.logout();wait.resolve(raw());
 assert.equal((await first).outcome,'rejected');assert.equal(writes.length,0);
});
test('an uncertain review write is not retried automatically',async()=>{
 let attempts=0;const {service}=fixture((_path,options)=>{if(options.write){attempts++;throw new ApiError(0,'errors.timeout',{}, {outcome:'unknown'})}});
 await service.start();await flush();const result=await service.mutate(command({photo}));await flush();
 assert.equal(result.outcome,'unknown');assert.equal(attempts,1);
 await service.readView({kind:'shipment.review.read',id:'501'});assert.equal(attempts,1);
});
