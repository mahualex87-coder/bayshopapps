# Integrarea API BayShop: contracte și verificare

Actualizat la 1 noiembrie 2026. Obiectivul acestei etape este autentificarea și citirea datelor contului: colete, adrese și sold. Contractele API sunt separate de starea locală a prototipului; datele demonstrative nu înlocuiesc răspunsurile nereușite ale serverului.

Sursele sunt [documentația mobilă oficială](https://bayshop.com/api-docs/bayshop-mf.html), [schema OpenAPI BayShop MF.v2](https://bayshop.com/api-docs/spec/bayshop-mf.yaml?v=1792586681) și [sursa originală Apiary](https://bayshopmf.docs.apiary.io/api-description-document), accesibilă din [documentația veche](https://bayshopmf.docs.apiary.io/). Modelul public Apiary indică ultima actualizare la 21 aprilie 2026. Sursa veche păstrează exemple de răspuns pentru mai multe rute ale căror scheme lipsesc din OpenAPI. „Documentat” în tabel înseamnă că există un contract public, nu că răspunsul contului a fost verificat cu succes.

| Resursă | Cerere documentată | Contract disponibil și stare |
| --- | --- | --- |
| Autentificare | `POST /api/auth/` | `data.access_token`, `expires_in`, `token_type`, `id`, `uid`, `name`, `surname`. Autentificare controlată reușită pe contul utilizatorului, după corectarea transportului MF v2. Tokenul este primit prin login și folosit la citirile ulterioare. |
| Profil scurt | `GET /api/auth` | `id`, `uid`, `name`, `surname`. Normalizare implementată. Emailul și telefonul nu sunt inventate din acest răspuns. |
| Profil complet | `GET /api/member/personal-data` | Apiary documentează `name`, `surname`, `phoneCode`, `phone`, `countryId`, `languageCode` și `balance`. Normalizatorul îmbogățește profilul autentificat fără să îi înlocuiască ID-ul, care lipsește din acest răspuns. |
| Sold curent | `GET /api/refund-request` | `data.memberBalance[]` conține `currency_id`, `currency_code`, `currency_sign`, `amount`, toate șiruri. Normalizare și citire implementate. Este citirea datelor paginii de retragere; nu creează o retragere. |
| Istoric financiar | `GET /api/balance?paymentPeriod=all&period=all` | `data.balanceList`, grupat pe cod de monedă, cu `trid`, `type`, `summ`, `total_amount`, `created`, `comment`. Normalizare implementată. `total_amount` este soldul după tranzacția istorică, nu sursa soldului curent. |
| În stoc | `GET /api/mf-list/in-stock/{storage_id}` | `data.list[]`: identificatori, titlu, tracking, greutate, preț, monedă și declarație. Citiri reușite cu ID-urile numerice returnate de producție: `14`, `12`, `7`, `18`, `19`, `20`. Enumerarea veche prin coduri de țară nu înlocuiește această verificare reală. |
| Detaliu expediere | `GET /api/parcels/view/{parcelId}` | Contract detaliat pentru status, conținut, destinatar, greutate, costuri și datele etapelor. Normalizare implementată; validarea și folosirea în interfață sunt distincte. |
| Depozite | `GET /api/warehouse-list` | Apiary: `data[]` cu `id`, `title`, `countryTitle`, `countryCode` și alte metadate. Normalizare implementată; ID-ul și codul țării rămân valori distincte. |
| Metadate pentru calculator | `GET /api/calculator` | `data.storageList[]`: `id`, `code`, `title`, `activeCountries`. Normalizator separat disponibil. Lista poate reprezenta doar depozitele acceptate de calculator; nu este declarată automat lista completă a contului. |
| Adrese depozite actuale | `GET /api/member-storage-address` | Structura Apiary a fost confirmată: `data[]` cu `countryTitle`, `countriesCode`, `addresses.storage[]` și `addresses.private[]`. Răspunsul real adaugă `companyName` și `isActive`. Normalizarea păstrează numele/compania, liniile exacte, tipul, activitatea, ordinea și avertismentele de cost. |
| Adrese depozite, rută veche | `GET /api/get-member-mf-addresses` | `data[]`: `fullName`, `countryTitle`, `countryCode`, `state`, `city`, `zipCode`, `phone`, `address1`, `address2`. Normalizator separat disponibil. Documentația marchează ruta „Old”; nu este activată automat în locul rutei actuale. |
| Destinatari | `GET /api/member-address` | Apiary: `data[]` cu `id`, `first_name`, `last_name`, `company_name`, `country_title`, `city`, `address`, `zip`, `phone`, `isLegal`. Normalizare implementată. |
| În așteptare | `GET /api/waiting-mf-list` | Ruta generală a returnat un colet; variantele cu ID numeric de depozit au returnat liste goale. Se folosește ruta generală validată. Obiectele confirmă `id`, `uid`, `storageId`, `tracking`, `title`, `status`, `createdDate`, `price`, `currency`. |
| Trimise | `GET /api/parcels/all` | Rezultat real grupat după stare, inclusiv grupele noi `held-by-missing` și `ready-to-pickup`. Obiectele confirmă `id`, `codeNumber`, `realWeight`, `fieldTime`, `description`, `status`, `currentStatus`, `storage_id`, `currency`, `totalPrice`. |
| Primite | `GET /api/parcels/all/received` | Rută susținută de contractul filtrării după stare; nu a fost apelată în verificarea contului. Lista generală nu este filtrată local pentru a pretinde că reprezintă istoricul primit. Un contor proaspăt egal cu zero confirmă o secțiune goală; altfel se citește ruta dedicată. |
| Contoare | `GET /api/member/counters` | Răspuns real reușit; `awaiting`, `incoming`, `outgoing`, `received` sunt șiruri numerice. Normalizarea impune întregi nenegativi, fără a transforma valori lipsă în zero. |

## Reguli de normalizare

- Normalizatoarele primesc exclusiv `response.data`, după verificarea erorilor din învelișul răspunsului. Un HTTP 200 nu garantează succesul dacă `error` este adevărat ori `code` indică o eroare.
- Identificatorii din contractele implementate sunt șiruri. Valorile numerice neconfirmate pentru identificatori sunt respinse; numerele precum codul poștal nu sunt convertite și nu își pierd zerourile inițiale.
- În lista de stoc `weight` este în **grame**; în detaliul stocului `/api/mf-list/{id}`, `weight` este în **kilograme**. În detaliul expedierii `realWeight` este în **grame**. Implementarea convertește numai câmpurile cu unitate documentată.
- Câmpurile `currency` ale coletelor pot fi semne monetare, precum `$`, în timp ce `currency_code` pentru sold este codul monedei. Nu se deduce codul ISO dintr-un simbol ambiguu.
- Lipsa unei sume devine `null`, nu `0`. Soldurile nu sunt calculate din tranzacții și nici din valori demonstrative. O sumă zero transmisă explicit de server rămâne zero.
- Soldul și istoricul sunt citite independent. Dacă numai unul eșuează, celălalt poate fi afișat cu o eroare explicită pentru panoul indisponibil. Un HTTP 401 de la oricare dintre ele închide sesiunea; dacă ambele citiri eșuează, resursa are eroare.
- Istoricul real conține și înregistrări `status: unpaid`. Starea se păstrează și se afișează; valoarea unei operațiuni nu este prezentată ca dovadă de plată efectuată.
- Adaptoarele validează formele documentate; o structură necunoscută nu este ascunsă în spatele unui mesaj „nu există colete”. În lista expedierilor, `fieldTime` este păstrat separat de data creării, care nu este furnizată de exemplul listei.
- `personal-data.balance` este o a doua sursă documentată a soldului curent. Nu se confundă cu `balanceList` și nu este calculat din tranzacții. Există un normalizator separat pentru această formă.

## Câmpuri și limbă: auditul pentru 0.5.1

Normalizarea separă datele returnate de server de etichetele interfeței. Numele persoanelor, numerele de urmărire, descrierile, comentariile, notificările și valorile poștale sunt păstrate exact; schimbarea limbii nu le traduce și nu le reformatează. Etichetele adreselor au chei semantice `field.*`, iar tipul `storage`/`private` rămâne separat de `countryTitle`. Eticheta română veche rămâne numai ca variantă de compatibilitate. Evenimentele și costurile din detaliul expedierii au, de asemenea, chei separate de etichetele lor.

| Sursa API | Câmp normalizat | Sens și prezentare |
| --- | --- | --- |
| `personal-data.countryId`, `languageId`, `languageCode`, `languages` | Metadate opționale omonime în profil | Preferințe ale contului; nu sunt schimbate implicit când utilizatorul selectează limba aplicației. Lipsa datelor nu devine automat română. |
| Adrese: `countryTitle`, ramura `storage`/`private` | `countryTitle`, `kind` | Titlul țării este text de server; tipul adresei este tradus în interfață. Valorile câmpurilor copiate rămân neschimbate. |
| Stoc: `isHeldByProhibition`, `isHeldByDamage`, comentariile aferente, `packingDenied` | `restrictions` | Indicatorii documentați `"0"`/`"1"` și booleanul efectiv sunt păstrați ca `false`/`true`; lipsa înseamnă `null`. Nu se inventează o stare de expediere dintr-un avertisment. |
| Așteptare/stoc: `price` | `amount`, `amountKind: productValue` | Valoarea produselor, distinctă de costurile expedierii. Nu se numește automat valoare declarată. |
| Lista expedierilor: `totalPrice` | `amount`, `amountKind: productValue` | Valoarea produselor, verificată cu exemplul oficial și cabinetul web. Nu reprezintă livrarea. |
| Detaliu: `price_boxes`, `price_declarations`, `price_total` | `goodsValue`, `declaredValue`, `shippingTotal` | Valoarea reală, valoarea declarată și totalul expedierii rămân distincte. Nu se reconstruiește totalul și nu se înlocuiește cu valoarea mărfii. |
| Detaliu: `import_taxes` și `price_import_taxes` | `importTaxes` și linia de cost a impozitelor | Titlurile, descrierile de calcul, sumele și moneda vin de la server. Impozitele sunt deja incluse în `price_total`; `null` nu înseamnă zero. |
| Așteptare: `storageId`, `tracking_status`, `service_name` | `storageId`, `trackingStatus`, `serviceName` | ID-ul depozitului rămâne separat de codul țării. Codurile documentate de urmărire sunt `UNKNOWN`, `TRACKED`, `DELIVERED`; alte valori sunt păstrate. |
| Expedieri: `countryTitle`, `shipperTitle`, `fieldTime` | `countryTitle`, `shipperTitle`, `updatedAt` | Țara și transportatorul sunt texte de server. Data nu este prezentată drept data creării. |
| Istoric: `created` în fiecare grupă monetară | `date`, ordonare descrescătoare comună | Timestamps SQL cu componente calendaristice valide sunt ordonate fără presupunerea unui fus orar; datele necunoscute rămân la sfârșit în ordinea inițială. Valorile originale nu sunt modificate. |

Sursa oficială [Apiary](https://bayshopmf.docs.apiary.io/) și [OpenAPI MF v2](https://bayshop.com/api-docs/bayshop-mf.html) exemplifică limbile `1: Romanian`, `2: Russian`, `3: English`; profilul exemplificat are `languageId: "2"`, `languageCode: "ru"`. `GET /api/languages/?countryId=...` oferă limbile țării contului. Site-ul oficial confirmă codurile `ro`, `ru`, `en` pentru Moldova. Captura reală confirmă structura și tipurile metadatelor, însă valorile lor au fost anonimizate; exemplele documentației nu sunt confundate cu preferința actuală a utilizatorului.

`Accept-Language` este documentat explicit pentru `POST /api/member/gcm-token`. Efectul său asupra tuturor citirilor nu a fost verificat prin schimbarea limbii în captura inițială. Nu există dovezi în sursele consultate pentru un antet alternativ `Language` ori un parametru `lang` comun. Modificarea persistentă a limbii contului prin `POST /api/member/personal-data` cere nume, prenume, telefon și `token_gcm` când este trimis `languageId`; această operație nu este activată de normalizatoare și nu se trimite implicit.

Verificare reală din 2 noiembrie 2026: după alegerea limbii ruse, interfața și eticheta locală a stării s-au schimbat, dar o citire nouă a detaliului expedierii a returnat în continuare `progressData.label` și explicațiile `import_taxes.lines` în română. Fluxul verificat trimite `Accept-Language: ru` până la BayShop; acest rezultat nu este prezentat ca traducere completă a API-ului. Contractul descrie explicit explicațiile impozitelor ca fiind în limba membrului, iar limba persistentă a contului este o preferință separată. Nu putem deduce doar din răspuns dacă textul a fost memorat la calcul sau este generat din limba contului. Aplicația păstrează explicațiile fiscale ale serverului, fără traduceri locale presupuse, fără schimbarea automată a contului și fără un token FCM inventat. Nota selectorului de limbă explică această limită.

Grupele reale `held-by-missing` și `ready-to-pickup` sunt păstrate. Pentru `held-by-missing`, captura confirmă existența codului, nu explicația lui; interfața nu trebuie să inventeze dacă lipsesc documente, informații ori coletul. Textele explicative disponibile de la server rămân sursa pentru detaliu.

## Antete și autentificare

OpenAPI declară global un mecanism HTTP Bearer, fără excepție explicită pentru login. Sursa Apiary este mai specifică: pentru `POST /api/auth/` arată antetul personalizat `Bearer: <token>` și `Accept: application/vnd.MF+json; version=2`. Același exemplu de token este repetat în 129 de cereri și în răspunsul demonstrativ al loginului. Niciuna dintre surse nu definește o cheie separată a aplicației, un `client_id` sau un `client_secret`; acest exemplu repetat nu dovedește că trebuie obținut un secret înainte de login.

În grupul Android-iOS App DEV, jurnalul Moya publicat la 30 iunie 2026 confirmă cereri ale aplicației cu `Bearer` ca nume de antet și `Accept: application/vnd.MF+json; version=2; platform=ios`. Pentru cererea observată `POST /api/storage`, corpul este declarat `application/x-www-form-urlencoded; charset=utf-8`. Aceasta confirmă transportul folosit de aplicație pentru acea operație, nu un login reușit în integrarea nouă.

Apiary indică ruta loginului cu slash final (`/api/auth/`), etichetează corpul `application/form-data`, enumeră email/parolă și opțiunile sociale, dar exemplul efectiv al corpului este gol. Nu precizează riguros codificarea formularului. Verificarea controlată ulterioară a reușit cu `application/x-www-form-urlencoded; charset=utf-8` și versiunea MF v2 în `Accept`; citirile autentificate au reușit cu antetul personalizat `Bearer`. Această combinație a fost validată, fără a pretinde că impactul fiecărei diferențe a fost izolat prin încercări suplimentare.

Tokenul găsit în conversația istorică din 25–27 ianuarie 2022 aparține unui cont partener SNEP pentru integrarea livrărilor. Nu este tokenul contului utilizatorului și nu este folosit. Nici tokenurile din jurnalul dezvoltatorului, nici exemplele documentației nu sunt copiate în aplicație sau utilizate pentru acces.

## Paginarea expedierilor

Apiary documentează pentru `/api/parcels/all/{status}` parametrii `page` (implicit 1) și `perPage` (implicit 10), iar `status` este opțional. Răspunsul exemplificat este un obiect de tablouri grupate după stare, fără `total`, `itemsCount`, `pagesCount`, `next` ori antete de paginare. Nu este precizat dacă limita se aplică întregului rezultat sau fiecărei grupe și nici comportamentul ultimei pagini.

Alte rute, precum selectarea adresei la formarea coletului, documentează explicit `itemsCount`, `page`, `perPage`, `pagesCount`, `items`. Această structură nu este transferată automat listei de expedieri. O singură pagină cu mai puțin de `perPage` înregistrări nu dovedește lista completă.

Implementarea citește un contor proaspăt pentru expedieri, partajat între cele două secțiuni în cadrul aceleiași actualizări. Prima pagină folosește ruta validată exact, fără parametri suplimentari; paginile următoare folosesc `page` și `perPage=10`, păstrând dimensiunea implicită documentată. Lista este considerată completă când numărul de ID-uri distincte coincide cu contorul. Fără contor disponibil, citirea continuă până la o pagină explicit goală. O pagină goală care contrazice contorul, o pagină repetată fără progres, un rezultat cu altă stare sau limita de 100 de pagini produce o eroare explicită, nu o listă prezentată ca fiind completă. Comportamentul paginilor ulterioare și al paginii finale rămâne de verificat pe cont; testele locale acoperă aceste reguli, nu comportamentul necapturat al serverului.

Pentru stoc, ambele surse documentează numai `data.list[]` și `data.consolidation`, fără `page`, `perPage` sau metadate de paginare; operația este denumită ca listă a tuturor coletelor în stoc. Nu se inventează parametri de paginare pentru această rută. Nici listele de așteptare și destinatari nu declară paginare în sursele consultate.

## Mediu și limite actuale

Schema publică declară `https://dev.bayshop.com`. În conversația echipei din 5 octombrie 2026, Vadim descrie `api.bayshop.com` tot ca mediu de test. În chatul direct cu Vadim, un mesaj din 27 ianuarie 2022 indică explicit `https://bayshop.com/api/` drept URL de producție. Mențiunea veche și faptul că domeniul găzduiește cabinetul real susțin alegerea acestui domeniu, dar nu confirmă configurația actuală a fiecărei rute mobile.

La 1 noiembrie 2026, utilizatorul a introdus manual datele în verificatorul local, legat exclusiv la `127.0.0.1`. Încercările inițiale JSON/multipart cu transportul nepotrivit au primit HTTP 500. După cercetarea antetelor și o nouă introducere manuală a datelor, autentificarea cu formular URL-encoded a reușit. Nu a fost necesar un token partener sau un token static al aplicației înainte de login.

Verificarea reușită a rulat între **20:39:12 și 20:39:16 UTC**. Dintre cele **23 de citiri** ulterioare, **22 au răspuns HTTP 200**, iar `GET /api/member/parcels-counter?countryCode=all` a întors HTTP 500. Ruta separată `GET /api/member/counters` a funcționat și este cea folosită de aplicație. Profilul, adresele, soldurile, istoricul, lista generală de așteptare, lista generală de expedieri și stocul celor șase depozite au fost accesibile.

Au fost salvate numai scheme și exemple anonimizate, fără parolă ori token utilizabil. Testarea offline a trecut pentru autentificare și cele 22 de răspunsuri reușite, după înlocuirea exclusiv cu valori sintetice a unor enumerări ascunse de anonimizator. Această verificare confirmă compatibilitatea formelor, nu conținutul privat al valorilor. Au fost adăugate teste pentru câmpurile reale suplimentare și pentru contoare.

Integrarea este activată pentru aplicațiile native în codul versiunii interne **0.5.0**. Publicarea în magazine și operațiile comerciale rămân separate. Verificarea API nu confirmă automat finalizarea unui pachet Android/iOS nou sau testarea lui pe telefon. Ruta dedicată coletelor primite și comportamentul de paginare neobservat rămân limite explicite ale verificării.

Fișierele JavaScript publice salvate pentru site (`general.js` și `bundle.js`) au fost verificate pentru indicii despre sold; nu au furnizat un contract suplimentar pentru API-ul mobil. Parolele și cookie-urile browserului nu au fost extrase; tokenurile din exemple sau din conversații nu au fost folosite.

Extinderea ulterioară adaugă formulare pentru operații documentate, trimise numai la acțiunea explicită a utilizatorului. Inventarul, limitele și operațiile neverificate prin scriere se află în `docs/api-operations-map.md`. Nu au fost executate plăți, expedieri sau comenzi reale pentru validarea implementării. Citirile API verificate și testele locale nu înlocuiesc testarea noului pachet pe fiecare telefon.

Actualizare după scanarea completă și comparația cu site-ul: 96 de citiri, 87 reușite. `Accept-Language` a modificat etichetele serverului în RO/RU/EN. Ruta `/parcels/all/received` a răspuns, dar cele 39 de elemente ale sale nu dovedesc totalul tuturor depozitelor; comparația site-ului a arătat un total mai mare, iar agregarea pe depozite este verificată separat în implementare. Capturile anonimizate confirmă forma, nu egalitatea valorilor private dintre site și aplicație.

`warehouse-list.requireInvoiceUpload`, `currencyId` și `availableCurrencies` sunt păstrate în modelul depozitului. Cerința facturii fiscale este aplicată din flagul serverului, separat de actele vamale. Valorile mărfii `price_boxes` și `price_declarations` sunt separate de costurile expedierii; `price_total` rămâne totalul returnat de server. Câmpul `import_taxes` păstrează defalcarea impozitelor și explicațiile localizate de server; calculul este estimativ doar când statusul de bază este `processing`. Evenimentele `heldByDamageTime`/`heldByProhibitionTime` sunt păstrate. URL-urile de fișiere care încep cu o singură bară sunt rezolvate pe originea fixă `https://bayshop.com`; nu se adaugă tokenuri la linkuri externe.
