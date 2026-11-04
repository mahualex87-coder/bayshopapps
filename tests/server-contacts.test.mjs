import test from 'node:test';
import assert from 'node:assert/strict';
import { parseServerContacts, readServerContacts } from '../src/features/support/server-contacts.ts';
const html = (locale='ro-MD') => `<html lang="${locale}"><head><script>hidden</script></head><body><header>WRONG PHONE</header><div class="row with-custom-border"><aside>LEFT MENU</aside><div class="col-lg-9"><div class="help-box"><h1 class="h2">Contacte &amp; ajutor</h1></div><p><strong>Țara QA</strong></p><p><strong>Telefon:</strong> +000 111</p><p>Strada Științei, 5<br>09:00–18:00</p><p hidden>HIDDEN</p><div style="display:none">PRIVATE</div><form>FORM</form><script>EXECUTE</script><p><strong>Birou QA</strong></p><p>Email: qa@example.test</p></div></div><footer>FOOTER</footer></body></html>`;
const response=(body=html(),url='https://bayshop.com/page/contact-us.html')=>{const r=new Response(body,{headers:{'content-type':'text/html'}});Object.defineProperty(r,'url',{value:url});return r;};
test('contacts isolate the exact CMS column, preserve paragraphs/Unicode and exclude all chrome/active/hidden content',()=>{
 const value=parseServerContacts(html(),'MD','ro');
 assert.equal(value.title,'Contacte & ajutor');
 assert.deepEqual(value.sections,[{title:'Țara QA',paragraphs:['Telefon: +000 111','Strada Științei, 5\n09:00–18:00']},{title:'Birou QA',paragraphs:['Email: qa@example.test']}]);
 assert.doesNotMatch(JSON.stringify(value),/WRONG|LEFT|HIDDEN|PRIVATE|FORM|EXECUTE|FOOTER/);
});
test('contacts never use another country/language, a missing CMS block or a missing-page notice',()=>{
 for(const body of [html('en-US'),html('ru-MD'),html().replace('row with-custom-border','other'),html().replace('class="row with-custom-border"','hidden class="row with-custom-border"'),html().replace('<h1 class="h2">Contacte &amp; ajutor</h1>','<div>Page not found</div>')])assert.throws(()=>parseServerContacts(body,'MD','ro'));
 assert.throws(()=>parseServerContacts(html(),'1','ro'));
});
test('anonymous contact reads follow only official CMS redirects with newly constructed public locale cookies',async()=>{
 const calls=[];const signal=new AbortController().signal;
 const result=await readServerContacts(async(url,options)=>{calls.push({url,options});return calls.length===1?new Response(null,{status:302,headers:{location:'/page/contact-us.html','set-cookie':'SESSION=never-adopt'}}):response();},'MD','ro',signal);
 assert.equal(result.countryCode,'MD');assert.equal(calls.length,2);
 for(const {options} of calls){assert.equal(options.credentials,'omit');assert.equal(options.redirect,'manual');assert.equal(options.method,'GET');assert.deepEqual(options.headers,{Accept:'text/html','Accept-Language':'ro',Cookie:'change-country=MD; change-lang=RO'});assert.equal(options.signal,signal);}
 assert.equal(calls[0].url,'https://bayshop.com/md_RO/page/contact-us.html');
});
test('unsafe redirects, unexpected formats, blocked requests and aborts remain explicit errors with no fallback contact data',async()=>{
 for(const location of ['https://outside.example/page/contact-us.html','/login','/api/auth','/page/contact-us.html?session=bad'])await assert.rejects(readServerContacts(async()=>new Response(null,{status:302,headers:{location}}),'MD','ro',new AbortController().signal));
 for(const result of [new Response('blocked',{status:403}),new Response('{}',{headers:{'content-type':'application/json'}}),response(html('en-US'))])await assert.rejects(readServerContacts(async()=>result,'MD','ro',new AbortController().signal));
 const controller=new AbortController();controller.abort();let reads=0;await assert.rejects(readServerContacts(async()=>{reads++;return response();},'MD','ro',controller.signal));assert.equal(reads,0);
});
