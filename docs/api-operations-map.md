# Harta paginilor și operațiilor BayShop

Inventar pentru aplicația nativă, actualizat pentru sursa candidatului 0.6.2 la 2 noiembrie 2026. Surse: [Apiary MF v2](https://bayshopmf.docs.apiary.io/), [OpenAPI MF v2](https://bayshop.com/api-docs/bayshop-mf.html), captura controlată inițială, scanarea consultativă completă și codul backend la SHA `175a0469f4ddd9252f0e3980c613f3932b47f945`. Referințele `L…` de mai jos indică liniile sursei înghețate `work/api-auth-docs/legacy-source.txt`, în rădăcina spațiului de lucru; referințele PHP sunt indicate separat. Nu reprezintă apeluri executate de această documentație. SHA-ul backend instalat în producție nu a fost verificat.

Scanarea completă a cuprins 96 de citiri, dintre care 87 reușite. Ea verifică citirea și structura datelor, **nu confirmă salvarea, ștergerea, plata sau expedierea**. Un HTTP 200 poate conține `error: true` ori un formular respins. Refuzurile declarațiilor/facturilor pentru expedieri trimise sau primite au acum o explicație confirmată în cod: endpointurile sunt condiționate de starea expedierii. Candidatul afișează această limită explicit și păstrează produsele/documentele disponibile în detaliu; erorile reale pentru o stare eligibilă rămân vizibile. Nu se inventează un formular gol.

## Pagini și resurse

| Pagină din aplicație | Citire reală | Scrieri documentate / observații |
| --- | --- | --- |
| Login | `POST /api/auth/`; profil `GET /api/auth/` | Formular URL-encoded; tokenul utilizatorului este păstrat securizat. |
| Înregistrare / recuperare | Nu cer o sesiune existentă | `POST /api/auth/register`, `/api/auth/restore`; nu sunt testate prin crearea unui cont ori trimiterea unui email. L82–115. |
| Acasă / patru liste | `/member/counters`, `/waiting-mf-list`, `/mf-list/in-stock/{storageId}`, `/parcels/all`, `/parcels/all/received` | Contoarele și listele trebuie verificate pentru paginare; ruta primitelor a fost accesibilă în scanarea completă. |
| Colet nou în așteptare | `/warehouse-list`; după creare `/waiting-mf/{id}` | `POST /waiting-mf/`; identificatorii depozitelor din documentația de creare sunt neuniformi față de lista actuală. Vezi limita de mai jos. |
| Detaliu așteptare | `/waiting-mf/{id}`, `/waiting-mf-tracking/{id}/` | `POST /waiting-mf/{id}`, `DELETE /waiting-mf/{id}`, servicii `/waiting-mf-service/`, cod `/waiting-mf-passcode/{id}`. |
| Detaliu stoc / declarație | `/mf-list/{id}`, `/mf-storage-declaration/{id}`, `/incoming-tracking/{uid}` | `POST /mf-storage-declaration/{id}`; servicii `/storage/`, divizare `/request-divide?id=…`, etichetă `/label-request/`, eliminare `/dispose-order-storage`. |
| Expediere nouă | `/parcel-create/address/`, `/shipping/`, `/local-shipping/`, `/insurance/` | `PUT /parcel-create`; selecția adreselor, transportatorului și serviciilor provine din răspunsurile serverului. |
| Detaliu expediere / primite | `/parcels/view/{id}`, `/parcel-tracking/{uid}` | Declarație `/package-declaration/{id}/`, facturi `/package-invoice/{id}`, fotografii `/customs-photos/{id}`, livrare `/parcel-local-delivery/{id}`, servicii `/outgoing-service/{id}`. Permisiunile din detaliu controlează acțiunile. |
| Adrese depozite | `/member-storage-address` | Nu există un editor al depozitului personal în această integrare; se afișează și se copiază datele furnizate. |
| Adrese destinatari | `/member-address/`, `/member-address/{id}`, `/member-address/phone-formats?full-data=1` | `POST /member-address/{id}/` sau fără ID pentru creare; `DELETE` cu ID. |
| Profil | `/member/personal-data` | `POST /member/personal-data`; parola `/member/new-password`; dezactivarea `DELETE /member/` este distinctă de ieșirea din cont. |
| Setări | `/member/mail-options/`, `/member/auto-packaging?storage_id=…`, `/languages/?countryId=…` | Preferințe `POST /member/mail-options/`, autopacking `POST /member/auto-packaging`; schimbarea limbii aplicației nu execută automat o scriere de profil. |
| Sold / plăți | `/refund-request/`, `/balance/?period=all`, `/payments`, `/payments/{type}/success/{payment}` | `POST /payments` inițiază o plată; `/refund-request/` creează o retragere. Nu sunt simple calcule și nu se execută la deschiderea paginii. |
| Coș | `/cart-list/{countryCode}`, `/cart/{id}`, `/cart-prices?carts[]=…`, `/cart-link/?url=…` | `POST /cart`, `POST /cart/{id}`, `DELETE /cart?items[]=…`. |
| Cumpărături / comandă | `/order-list/{countryCode}`, `/order/{id}` | Checkout `/order-create/{address,shipping,local-shipping,insurance,payments}/`, salvare `POST /order-create/`, anulare `DELETE /order/{id}`. Detaliul `/order/{id}` este numit „partners” în documentație; accesul contului nu este presupus. |
| Calculator | `GET /calculator` opțiuni | `POST /calculator` calculează oferta și nu creează expedierea. Unitățile și țările provin din opțiuni. |
| Notificări | Preferințe `/member/mail-options/`; știri `/news` | Nu este documentată o listă de notificări personale sau operația „marchează citit”. Știrile nu sunt prezentate ca inbox personal. |
| Suport | Nu există în schema MF un endpoint de ticket/chat general | `/claim-request/` este revendicarea coletelor neidentificate, nu un formular generic de suport. Se pot oferi canalele oficiale, fără a pretinde trimiterea unui ticket. |

Prefixul tuturor rutelor de mai sus este `/api`, pe `https://bayshop.com`.

## Așteptare, declarații și fișiere

**Creare așteptare — L1523–1633.** `storage`, `tracking` (litere/cifre/cratimă), `declarations` JSON cu `title`, `url`, `quantity`, `price`, opțional `currency`, `productType`, `orderNumber`. `currency` general este opțional. `dimensions` JSON folosește `weight` în grame și `x/y/z`. Autopacking și servicii au câmpuri distincte: `useAutoPacking`, `addressId`, `shipperId`, `insurance`, `sentOnUserAlert`, livrare locală, `photosPackageRequested`, `verificationPackageRequested`, comentarii și `additionServices[]`. Nu se adaugă selecții de servicii ascunse în formularul simplu. Răspunsul reușit are `data.id`, `uid` și detalii; exemplul de tracking duplicat are **HTTP 200, `error:false`, `message:"Error"`**, cu `data.tracking.trackingNumberExists`. Acesta este eșec, nu confirmare.

**Editare așteptare — L1635–1703.** `POST /waiting-mf/{id}`, cu tracking, storage și `declarations` JSON; elementele existente includ `id`. Se păstrează indicatorii existenți de fotografiere/verificare și fișierele care trebuie reținute. `autoPackingData` este returnat de detaliu; modificarea lui are o operație separată `/waiting-mf-auto-packing/` (L1726–1758). O editare a declarației nu trebuie să pornească sau să oprească autopacking în fundal.

**Codul coletului — contract confirmat în backend.** `POST /waiting-mf-passcode/{id}` primește exact câmpul formular `passcode`. [WaitingMfPasscodeController.php, liniile 37–65](https://bitbucket.org/bayshop/bayshop/src/175a0469f4ddd9252f0e3980c613f3932b47f945/application/modules/api/controllers/MF/v2/WaitingMfPasscodeController.php#lines-37) verifică proprietarul și `passcodeAllowed()`, păstrează textul nevid și elimină codul pentru o valoare goală. Aplicația permite introducerea/editarea și ștergerea explicită prin `passcode:""`; păstrează zerourile inițiale. Valoarea literală `"0"` este respinsă local deoarece `empty()` din PHP ar interpreta-o ca ștergere. Nu se inventează o lungime sau o regulă numai-cifre. Confirmarea este `code:200,error:false,message:"Ok"`; un răspuns ambiguu nu confirmă salvarea.

Permisiunea și codul actual sunt recitite înaintea trimiterii; serviciul verifică din nou identitatea și permisiunea. Un cod schimbat între deschiderea și verificarea formularului oprește salvarea. Nu există în contract o versiune pentru actualizare condiționată, deci verificarea clientului nu este atomică față de o modificare simultană în altă aplicație. Cererile duplicate sunt blocate, un rezultat incert nu se repetă automat, iar ecranul rămâne deschis cât timp cererea este activă. Aceste verificări au teste locale; **nu s-a salvat sau șters un cod în contul real**.

**Limită storage.** Crearea veche exemplifică `usa/de/uk/ro`; editarea exemplifică `US/GB/DE/UK/USA`. Lista actuală furnizează ID-uri numerice și coduri ISO. Nu se înlocuiește valoarea de scriere cu titlul tradus al țării. La editare se păstrează `storage` returnat de detaliu. Pentru creare, combinațiile documentate sunt `US→usa`, `GB→uk`, `DE→de`, `RO→ro`; acceptarea valorilor pentru IT/PL și a ID-urilor numerice în această scriere nu a fost verificată printr-o creare reală.

**Declarație stoc — L3180–3241 și L3339–3374.** GET returnează `title`, `currency`, `declarationItems`, `invoiceFiles`; scanarea actuală confirmă și `customsFiles`. Elementele au `declarationItemId`, titlu, URL, cantitate/preț și câmpuri suplimentare ale serverului. POST trimite `title`, `declarationItems` JSON, opțional `currency`, `invoice[]`, `invoiceList[]`, `customsDocs[]`, `customsDocsList[]`. Confirmarea documentată este `data.success:true`.

**Declarație expediere — L4295–4361.** GET returnează `items`, `availableStorageCurrencies` (ID→cod), `declarationCurrency`. POST cere `currencyId` și `declarationItems` JSON. **Omiterea ID-ului existent adaugă un element nou și șterge elementul anterior** conform documentației; se încarcă și se păstrează identificatorii. Un răspuns de refuz la GET nu este înlocuit cu un formular gol.

[PackageDeclarationController.php, liniile 26 și 105–118](https://bitbucket.org/bayshop/bayshop/src/175a0469f4ddd9252f0e3980c613f3932b47f945/application/modules/api/controllers/MF/v2/PackageDeclarationController.php#lines-26) cere starea internă `processing` pentru GET și POST, iar POST acceptă exact un singur colet inclus. Starea publică `status` din detaliu este `getStatus()/currentStatus`, nu câmpul intern: `processing`, `processing-storage`, `awaiting-invoice` și `order-invoice` indică `processing`; unele rețineri pot proveni și din `packed`. Pentru aceste stări ambigue aplicația întreabă endpointul, fără să presupună permisiunea. Pentru stările confirmate ca deja ambalate/trimise/primite nu mai cere un formular interzis. Declarațiile incluse în detaliu rămân vizibile și pentru expedieri cu mai multe colete. Regulile stărilor sunt în [Rows/WpPackage.php, liniile 6300–6483](https://bitbucket.org/bayshop/bayshop/src/175a0469f4ddd9252f0e3980c613f3932b47f945/application/models/Rows/WpPackage.php#lines-6300).

[PackageInvoiceController.php, liniile 23, 80–88 și 125](https://bitbucket.org/bayshop/bayshop/src/175a0469f4ddd9252f0e3980c613f3932b47f945/application/modules/api/controllers/MF/v2/PackageInvoiceController.php#lines-80) permite GET/POST/DELETE numai pentru `currentStatus=awaiting-invoice`. POST cere un singur fișier multipart `file`; salvarea reușită înlătură această stare. Aplicația recitește detaliul expedierii după succes, în loc să repete imediat GET-ul facturilor devenit neeligibil. Refuzul „Not required invoices” pentru o expediere trimisă reprezintă o regulă intenționată a endpointului. Nicio încărcare ori ștergere de factură nu a fost executată în producție pentru verificare.

| Fișiere | Citire / forma rezultatului | Încărcare și ștergere |
| --- | --- | --- |
| Facturi așteptare/stoc | Câmpurile `invoices`/`invoiceFiles`; obiecte `{id,url}` sau URL-uri în exemple | La salvarea declarației: `invoice[]` fișiere JPG/PNG/PDF; `invoiceList[]` identificatorii sau URL-urile absolute reținute. |
| Documente vamale așteptare/stoc | `customsDocs` sau `customsFiles` | `customsDocs[]` fișiere JPG/PNG/PDF sau URL-uri conform documentației; `customsDocsList[]` **numai ID-urile existente reținute**. |
| Facturi expediere | GET `/package-invoice/{id}` returnează **la rădăcina învelișului** `maxImages`, `invoiceFiles:[{id,img,thumb}]`, fără `data` | POST cu câmpul `file`, JPG/PNG/PDF; DELETE `/package-invoice/{id}/{fileId}`. L5267–5342. |
| Fotografii vamale expediere | GET `/customs-photos/{id}` returnează **la rădăcină** `maxImages`, `images:[{imageId,img,thumb}]` | POST multipart, câmp `customsPhotos[]`, JPG/JPEG/PNG binare, **nu base64**. DELETE `/customs-photos-delete/{id}/{fileId}`. L5419–5500. |

`maxImages` include fișierele existente și vine din server. Documentația nu furnizează un plafon general de octeți; însă formularul real de declarație, verificat separat pe site, indică JPG/JPEG/PNG/PDF și **25 MB**. Această limită este aplicată numai încărcărilor de documente ale declarației, fără extrapolare la fotografiile vamale ale expedierilor. Fișierele sunt selectate explicit pe dispozitiv; URL-urile returnate de server se deschid separat, fără a trimite tokenul către un domeniu extern. Ștergerea ultimului fișier prin listele de reținere goale din declarația de stoc nu are un exemplu de transport neambiguu; nu se presupune că absența unui câmp înseamnă ștergere.

## Stoc și formarea expedierii

- L3103–3177: detaliul stocului exprimă `weight` în kilograme, spre deosebire de lista în grame. `freeDaysStorage` este număr în exemplul vechi și text în captura actuală; se păstrează fără interpretare greșită. Restricțiile și comentariile de deteriorare/interdicție, `packingDenied`, fotografiile și starea declarației sunt independente.
- Greutatea `boxes[].weight` din detaliul expedierii este în grame și se convertește în `weightKg` prin împărțire la 1.000. [ParcelsController.php, linia 527](https://bitbucket.org/bayshop/bayshop/src/175a0469f4ddd9252f0e3980c613f3932b47f945/application/modules/api/controllers/MF/v2/ParcelsController.php#lines-527) returnează valoarea brută a aceluiași colet pe care [MfListController.php, linia 229](https://bitbucket.org/bayshop/bayshop/src/175a0469f4ddd9252f0e3980c613f3932b47f945/application/modules/api/controllers/MF/v2/MfListController.php#lines-229) îl convertește explicit cu `grToKg`. Lipsa rămâne `null`, iar zero rămâne zero. `boxes[].declarationItems` nu include moneda în acest backend; prețul produsului nu preia arbitrar moneda expedierii.
- L3289–3337: `/additional-services/?storageId=…` și `/additional-services/{type}` oferă prețurile. `POST /storage/` cere ID și indicatori `photo`/`verification` 1 pentru comandă, 0 pentru anulare, plus comentariu (L3514–3535). Este o comandă de serviciu, potențial cu plată.
- L3377–3468: divizarea are GET/POST/DELETE `/request-divide?id=…`; POST trimite `declarationItems` JSON cu `partNumber`. Nu se împarte automat un colet la simpla consultare.
- L3470–3488: `/dispose-order-storage` elimină coletul. Este distinct de ștergerea unei înregistrări de așteptare și necesită o acțiune explicită a utilizatorului.
- L3957–4253: pașii GET ai formării expedierii folosesc `boxes`, apoi `address_id`, `shipper_id`, eventual `local_delivery_id`, `currency_id`, `price`. Listele de adrese au paginare explicită (`page`, `perPage`, implicit 4). Nu se inventează transportatori și tarife.
- L4254–4292: `PUT /parcel-create` trimite `boxes` JSON, `addressId`, `shipperId`, `insurance`, `sentOnUserAlert`, livrare locală, `additionServices[]`. Pentru transportatorul `userSelfSend`, `user_tracking` și eticheta sunt obligatorii. Rezultatul este `data:[{id,codeNumber}]`, nu un singur obiect.
- L4512–4535: schimbarea livrării locale cere ID-ul `local_delivery` și identificatorul de depozit/terminal/adresă aferent opțiunii selectate.
- L5113–5265: confirmare trimitere/colet deteriorat, dezmembrare, retur și marcare primit sunt operații separate. Marcarea primit poate răspunde `error:false` dar `data` conține erori per cod; lista nevidă nu este succes complet.
- Detaliul real furnizează `isAllowedDisbandByUser`, `isAllowedLocalDeliveryChange`, `enableCustomsDocUpload`, `isAllowedHoldParcel`. UI respectă aceste valori; starea „trimis” singură nu acordă toate permisiunile.

## Adrese, profil, setări, coș și comenzi

**Destinatari — L449–477.** Câmpurile de scriere sunt `shipping_first_name`, `shipping_last_name`, `shipping_company_name`, `shipping_email`, `shipping_address`, `shipping_city`, `shipping_zip`, `shipping_phone_code`, `shipping_phone`, `countryId`, `regionId`, `cityId`, `isLegal`, `agree`. Pentru persoană sunt necesare numele/prenumele; pentru entitate juridică sunt necesare compania și acordul. Codurile geografice și formatele telefoanelor se obțin din `/member-address/phone-formats?full-data=1`, fără mapare inventată din textul tradus.

**Profil — L6497–6506.** `surname`, `name`, `phone_code`, `phone` obligatorii; `country_id`, `languageId` opționale. Când este trimis `languageId`, este necesar `token_gcm`. Preferințele de comunicare sunt șase indicatori 0/1, opționali la POST `/member/mail-options/` (L6025–6033). Răspunsul GET furnizează și `hasTelegram`/`telegramBotLink`; o bifă nu dovedește legarea unui cont Telegram.

**Coș — L1841–2179.** Lista este grupată pe magazin: `shopTitle`, `shopId`, `isComplex`, `list[]`. Produsul are ID, `uniqueId`, titlu, preț, cantitate, `localShipping`, culoare/mărime, `customUrl`, monedă. POST de creare/editare cere `storage_id`, `url`, `price`, `quantity`, `shipping`, `title`; `color`, `size`, `comment` sunt opționale. Documentația indică JSON. Totalurile, comisioanele și livrarea locală se citesc din `/cart-prices`; nu se calculează un checkout fictiv. Pentru magazin necomplex, ruta de preț acceptă un singur element. Coșurile scanate au fost goale; formele nevidelor sunt documentate, dar nu au fost capturate în cont.

**Comenzi — L2447–3012.** Lista actuală este `{unpaid:[],paid:[]}`. Fiecare comandă are `paymentStatus`, `canBePayed`, `items`, `priceDetails`, `progressData`, `created`. Pașii checkout furnizează adrese, transport, livrare locală, asigurări și plăți. POST `/order-create/` este documentat cu JSON (`carts`, `useAutoPacking`, adrese/transport, servicii, `waitAllItems`, `allowLowerQuantity`, `allowOverpricing`, `insurance`, `paymentType`). Răspunsul include **`paymentParams` la rădăcină**, cu comenzi și informații de plată. A crea comanda nu dovedește plata acesteia. Rutele `/api/order` marcate „partners” nu sunt tratate automat drept contractul oricărui client mobil.

**Calculator — L6975–7197.** Opțiunile oferă `storageList`, `countriesList`, `units`. POST cere `storage_id`, `country_id`, `weight`, opțional `weightUnit`, `price`, `sizeUnit`, `volume[x/y/z]`. Rezultatul conține `shippers[]` cu titlu, timp, monedă și preț; descrierile pot conține HTML și trebuie afișate ca text sigur, fără executare.

**Plăți / suport — L5716–5994, L7199–7350.** Captura actuală `/payments` are `unpaidInvoices`, `billingData`, `isBillingSet`, `paymentTypes`. POST cere facturile selectate, tipul plății și datele de facturare. Revendicările `/claim-request` au identificator de colet, tracking, stare și fotografii; nu oferă mesaje generale de suport. Eroarea API a acestei rute în contul scanat nu este convertită într-un contor zero.

## Ordinea implementării și verificării

1. Detaliile reale și declarațiile existente, cu afișarea tuturor câmpurilor, avertismentelor, documentelor și permisiunilor relevante.
2. Formulare așteptare/declarație și încărcări de fișiere cu păstrarea ID-urilor existente; confirmare din corpul răspunsului și reîncărcare după salvare.
3. Destinatari, profil, preferințe și calculator pe opțiunile serverului; coș și comenzi fără a inventa prețuri sau stări de plată.
4. Operații de expediere și checkout pe pașii serverului, cu recapitularea selecțiilor înaintea acțiunii utilizatorului. Nu se execută tranzacții pentru a testa automat interfața.
5. Rutele nepermise sau nedocumentate rămân explicit indisponibile. O cerere cu rezultat incert nu se repetă automat; se recitesc datele și se păstrează formularul pentru verificare.

## Factura fiscală: regulă de server și editare

`GET /api/warehouse-list` furnizează `requireInvoiceUpload` ca `"0"`/`"1"` (Apiary L138, L157, L191). Captura reală păstrează această regulă, ID-ul implicit `currencyId` și `availableCurrencies:[{id,title,currency_sign}]`. Normalizatorul expune booleanul sau `null` când regula lipsește. Nu există o regulă locală de tip „dacă țara este România”. Un depozit nou cu flagul activ este tratat identic.

La creare se folosește metadată depozitului ales; la editare, depozitul este identificat prin storageId/countryCode/storage returnate de API. Salvarea așteptării și declarației de stoc cere cel puțin o **factură fiscală** reținută sau selectată când serverul o impune. Documentele vamale au colecție separată și nu satisfac această cerință. Regula lipsă ori metadatele neactualizate blochează salvarea și solicită actualizare. Fișierele existente se păstrează prin ID/URL; o editare nu cere încărcarea repetată a unei facturi deja prezente.

Monedele afișate folosesc titlul returnat de server, fără mapare din simbol. ID-urile numerice ale monedelor sunt păstrate; cererile vechi de declarație cer cod ISO, deci se trimite numai un titlu care este explicit un cod din trei litere sau codul deja returnat de declarație. Moneda existentă a unui articol este păstrată separat de moneda implicită a depozitului.

## Checkout implementat și limitele verificării

`LiveCheckoutScreen` folosește GET `/order-create/address/`, `/shipping/`, `/local-shipping/`, `/insurance/`, `/payments/`, cu `carts[]` și ID-urile opțiunilor primite. Cele șase ecrane includ verificarea finală. POST `/order-create/` trimite JSON numai după confirmarea utilizatorului; nu a fost executat în timpul implementării. Oferta și opțiunile sunt recitite chiar înaintea trimiterii. O schimbare cere confirmare nouă; un rezultat incert nu declanșează repetare automată.

Checkout-ul are un contract de livrare locală diferit de `parcel-create`: exemplul documentat trimite `local_delivery:"storage"` și `localStorage-storage`. Această combinație este suportată exact. Pentru celelalte tipuri, corelația între ID-ul numeric al opțiunii și cheia de scriere nu este suficient documentată și interfața anunță indisponibilitatea în aplicație. Nu se trimite presupusul echivalent din formularul de ambalare.

Metodele care cer facturare suplimentară (`hide_billing=false`) nu sunt trimise fără datele cerute. Sumele și moneda sunt preluate din oferta metodei alese; nu se inventează cursuri de schimb sau totaluri. Răspunsul documentat `paymentParams` confirmă ID-urile comenzilor, **nu plata**. Nu conține un URL verificat al procesatorului; nu se construiește unul. Starea plății se consultă în detaliul comenzii/pagina de plăți.

Listele de coș/comenzi goale au fost verificate în cont; formularele nevidelor și checkout-ul sunt bazate pe contractul oficial și teste locale, fără crearea unei comenzi de test în contul real. Această limită rămâne distinctă de verificarea citirilor.

## Fidelitate: niveluri, tarif individual și activare

`GET /api/shipping-loyalty/` este documentat în Apiary L6589–6652 și verificat în scanarea reală. OpenAPI indică ruta, dar omite forma răspunsului; Apiary și schema capturată o furnizează. Modelul păstrează separat reducerea generală `discountPercent`, punctele `loyaltyReceivedPoints`, nivelul calculat `currentLevel`, destinația `country`, moneda `currencySign`, toate `loyaltyLevels` și oferta `specialPrice`.

Un nivel păstrează ID-ul transportatorului, pragul `condition`, valoarea `result`, perioada `timeLimit`, numărul `level`, punctele rămase `remainPoints`, reducerea procentuală și `loyaltyType`. Pentru tipul documentat `perKg`, `result` este tarif monetar pe kg, **nu procent**. Tipurile necunoscute se păstrează și nu sunt convertite automat în €/kg. Perioada este prezentată ca durată, nu ca numărătoare inversă: endpointul nu furnizează un timestamp de expirare neambiguu.

[Anunțul oficial BayShop din 6 septembrie 2025](https://bayshop.com/gb/news/624-bayshop-launches-warehouse-loyalty-program-in-poland-italy-and-germany.html) explică punctele per kilogram și perioadele de valabilitate pentru PL/IT/DE. Ratele din anunț nu sunt hardcodate: aplicația afișează valorile din cont. Condițiile generale au fost confruntate și cu pagina autenticată `/member/shipping-loyalty`.

`specialPrice.selected=true` confirmă aplicarea unui tarif individual. `fixedTime` este păstrat ca valoare opacă; semnificația de dată/flag nu este presupusă. Nici `currentLevel`, nici existența punctelor nu demonstrează că programul progresiv este activ. O configurație individuală de tarif poate înlocui progresivitatea. Configurația unui cont poate fi schimbată separat în administrare; aplicația nu păstrează o presupunere permanentă despre ea. În schema disponibilă nu există un flag explicit de activare. De aceea interfața arată nivelurile drept **informative**, evidențiază separat oferta individuală și nu promovează un beneficiu progresiv ca activ până la confirmarea unui semnal autoritativ. Nu deduce activarea din comparația unor procente.

Corecție suplimentară pentru detaliul stocului: OpenAPI L2445–2447 definește `photosInProgress` ca stare întreagă `0=not requested`, `1=waiting`, `2=done` (exemplul L2555 folosește 2). Câmpul nu este boolean și nici număr de fotografii. Este păstrat ca enum, iar UI indică cerere în curs numai pentru 1. Anonimizarea inițială a redus numerele la 1, astfel că această diferență a necesitat verificarea documentației, nu doar teste pe captură.

## Taxe la import în detaliul expedierii

OpenAPI L7147–7179 definește `price_import_taxes` drept sumă a taxelor de import în moneda coletului, **deja inclusă în `price_total`**. `import_taxes` conține `total`, `currency` ISO și `lines:[{title,amount,description}]`. Textele fiecărei linii descriu calculul în limba contului: procentul și baza, ori taxa fixă și cursul folosit. Aceste explicații sunt afișate exact; aplicația nu calculează cote TVA și nu adaugă taxele din nou la total.

Pentru o expediere în procesare, suma poate fi estimată; ambalarea finalizează calculul. `import_taxes:null` poate însemna lipsa taxelor **sau** lipsa unei estimări, deci nu se transformă într-un zero inventat. `taxesInvoice` (L7231–7237) este PDF-ul fiscal al TVA/taxelor de import, distinct de factura de transport și factura comercială. Un URL lipsă nu indică automat că plata nu a fost efectuată.

Verificarea checkout-ului include acum detaliile produselor și variantele alese, nu doar suma. Imediat înaintea confirmării se recitesc produsele și oferta; modificările de produs/cantitate/variantă invalidează confirmarea chiar dacă totalul rămâne identic. Limitele pozitive `max_sum` ale metodelor de plată sunt respectate; moneda trebuie să fie în `availableCurrency`, iar metodele cu cerințe de facturare încă nesuportate nu sunt trimise. `insurance_free_limit` este păstrat separat de procentul și prima minimă de asigurare.


## Traducerile administrate pe server — verificare 2 noiembrie 2026

Dicționarul există în administrare: **Languages → Romanian → Translations**,
la `https://bayshop.com/admin/languages/edit/id/1/#_translations`. Interfața
indică **6.407 intrări** pentru română și prezintă o cheie hash plus textul
tradus. Au fost văzute texte pentru TVA, documente vamale, facturi, stări,
adrese, greutate și totaluri; unele includ substituenți `%s` care trebuie
păstrați. În lista limbilor sunt confirmate `1=ro`, `2=ru`, `3=en`; dicționarul
mai include și texte de administrare, deci nu se distribuie integral în aplicația
clientului fără selectarea mesajelor potrivite.

Pagina încarcă dicționarul prin
`/EN/admin/languages/translations/id/1/?render=true&`. Este o resursă a
administrării; verificarea anonimă a acestei rute a răspuns HTTP 403. Nu există
în documentația MF consultată o rută de client pentru descărcarea acestui
dicționar. În schimb, `GET /api/languages/?countryId=…` returnează numai
ID-urile și denumirile limbilor disponibile, nu perechi cheie–traducere.

Pentru sincronizarea automată a interfeței native trebuie confirmată sau
adăugată o rută de citire pentru mesajele clientului, cu limbă, chei stabile și
versiune. Aplicația nu folosește sesiunea de administrator. Simpla existență a
dicționarului nu schimbă regulile unor câmpuri: documentația definește explicit
limba membrului pentru descrierile taxelor și unele stări, iar altele folosesc
limba cererii. Acest comportament trebuie uniformizat sau expus explicit de API.
Nicio traducere și nicio setare de limbă din cont nu au fost modificate în
această verificare.

## Verificarea comparativă pentru candidatul 0.6.1 — 2 noiembrie 2026

Matricea din `work/qa-060-ui-audit.json`, la rădăcina spațiului de lucru, păstrează constatările versiunii 0.6.0 și dovezile noi. `real_read_verified` confirmă **numai câmpurile enumerate pentru exemplul verificat**. `candidateResolved` înseamnă corectat sau atenuat în sursă, încă fără dovada necesară pe ecran ori pe telefon. Nu s-au executat mutații în contul real pentru această verificare.

| Exemplu comparat | Confirmat prin capturi web/aplicație | Limita verificării |
| --- | --- | --- |
| Colet în așteptare | Identificator, tracking, produs, cantitate 1, valoare 12 în simbolul `$`, data vizibilă și starea necunoscută a urmăririi. | Editarea, ștergerea, fișierele și codul de acces nu au fost salvate. |
| Cele trei colete în stoc | SUA: 15,28 kg / 315 `$` și 8,52 kg / 100 `$`; România: 4,7 kg / 804,76 RON. Identitățile, țările și avertismentele de declarație corespund. Galeria web RO a fost ulterior deschisă și indică 1/9, concordant cu cele 9 intrări API. | Nu certifică toate serviciile sau toate imaginile individuale. Cele 3 miniaturi inițiale nu reprezentau numărul total de fotografii; nu s-au eliminat intrări API pe baza lor. |
| Expedierea verificată | Greutatea fizică 1,44 kg și volumetrică 1,44 Vkg; valoarea produselor și declarată 35; transport 0; impozite și total 7,28. Liniile fiscale 7 USD și 0,28 USD corespund. Punctul de ridicare este acum afișat separat de adresa destinatarului și coincide cu webul. | Valoarea volumetrică greșită din captura intermediară a fost corectată și recapturată. Aceasta confirmă exemplul comparat, nu toate unitățile tuturor endpointurilor. Deschiderea documentelor și scrierile nu sunt certificate. |
| Filtrul „Reținut în vamă” | Citirea reală a aplicației afișează 2 rezultate din colecția încărcată de 6, cu fila de jos corect selectată. | Este dovadă pentru acest filtru, nu pentru toate combinațiile de căutare, țară și pagină. |
| Fidelitate SUA / România | 809 puncte și 9 `$`/kg în SUA; 99 puncte și 9 RON/kg în România. Toate cele 9, respectiv 8 tarife și perioade de valabilitate au fost comparate. | Reducerile de 25%/10% sunt vizibile în aplicație/API; capturile text web nu expun separat procentul. Perioadele sunt durate, nu date de expirare; activarea progresivității nu se deduce din puncte. |

Dovezile acestei treceri sunt în `work/web-account-comparison/`: perechile `web/app-waiting-2108192-final`, listele `web-stock-us-final`, `web-stock-ro-final`, `app-stock-list-061`, detaliul `app-stock-ro-061`, `web-stock-ro-declaration`, `app-sent-status-filter-061`, `web-shipment-1829599-final` / `app-shipment-1829599-061-corrected` și perechile `web/app-loyalty-us-061`, `web/app-loyalty-ro-061` (fișiere `.txt`). Verificarea ulterioară a numărului de fotografii este în `web-stock-ro-gallery-062.txt`. Captura intermediară `app-shipment-1829599-061` păstrează dovada problemei de scală. Capturile nu confirmă modificările făcute ulterior în sursă.

**Blocaje și limite rămase:**

- Închiderea raportată pe iPhone după autentificarea în 0.6.0 are un caz reprodus: `Intl.PluralRules` poate lipsi în Hermes. Există fallback testat pentru RO/RU/EN, dar stabilitatea candidatului pe telefon nu este încă confirmată. Înregistrarea și recuperarea au formulare native noi; nu s-au creat conturi și nu s-au trimis mesaje de recuperare în acest audit.
- Istoricul complet al primitelor nu este dovedit de colecția disponibilă prin API. Parametrii de pagină au fost ignorați în probele reale, iar webul are istoric suplimentar. Paginarea locală limitează afișarea; nu dovedește acces la toate coletele istorice.
- Codul de acces are acum formular nativ și contract confirmat direct în backend. Introducerea, înlocuirea, eliminarea și rezultatul incert au verificări locale, însă nu există încă dovada unei scrieri reale și a recitirii ei pe telefon.
- Refuzurile declarațiilor/facturilor în stări neeligibile sunt reguli confirmate ale backendului, tratate explicit în sursa 0.6.2; nu reprezintă toate o eroare de rețea. Pentru stări eligibile, o eroare API rămâne o eroare vizibilă. Încărcarea documentelor vamale PDF de pe web nu este echivalentă cu endpointul de fotografii vamale JPEG/PNG. Crearea așteptării pentru IT/PL și unele variante de checkout rămân blocate de contractele neconfirmate.
- Schimbarea livrării locale este implementată pentru opțiunile documentate: punct de ridicare, terminal sau adresă eligibilă. Se afișează prețul punctului, taxa separată de schimbare și avertismentul consolidării; permisiunea și oferta se recitesc înaintea confirmării. Testele contractului nu demonstrează o salvare reală. Avertismentul facturii obligatorii din detaliul doar pentru citire și pluralurile corectate necesită și verificare în noul build.
- Formularele live care semnalează o operație activă blochează navigarea, gestul Back și schimbarea limbii până la rezultat, fără dialog de abandon în timpul cererii. Confirmarea de abandon deja deschisă își verifică din nou condiția înainte de plecare. Navigarea explicită după salvarea reușită rămâne posibilă. Testele locale verifică politica și momentele de confirmare; gesturile native, închiderea forțată a aplicației și rezultatele reale trebuie verificate distinct pe telefoane.

**Verificare necesară pe fiecare telefon, după instalarea candidatului:**

1. Pornire la rece, autentificare și trecerea la pagina principală; apoi închidere/redeschidere, restaurarea sesiunii, ieșire și autentificare din nou. Notați versiunea instalată și, dacă se închide, momentul exact și jurnalul de eroare.
2. Deschiderea formularelor native de înregistrare/recuperare, tastatură, validări, vizibilitatea parolei, revenire și RO/RU/EN. Trimiterea reală se verifică separat, numai cu datele și contul de test alese de utilizator.
3. Cele patru file permanente, meniul lateral, Back, detaliu deschis direct, schimbarea limbii și avertismentul de abandonare a unui formular modificat. Verificați citirea cu VoiceOver/TalkBack și text mărit.
4. Pentru coletele comparate: sume/monede, greutăți și unități, destinația locală, impozite incluse o singură dată în total, factura obligatorie lipsă, codul de acces și singularul „1 colet”. Testați o actualizare fără internet și revenirea conexiunii.
5. Adresele: copierea fiecărui câmp și a adresei complete, mesajul de confirmare și blocarea copierii unei adrese inactive. Verificați animația pornirii, vibrațiile și opțiunea de mișcare redusă.
6. Formularele: selectarea și eliminarea unui fișier înainte de trimitere, separarea facturilor de actele vamale, limitele acceptate și confirmarea schimbării livrării. Până la confirmarea unei scrieri reale, păstrați acțiunea marcată `synthetic_only` sau `unverified`.
7. Verificarea ulterioară a scrierilor se face distinct, pe date de test controlate: salvare, recitire și comparație cu cabinetul. Un timeout trebuie verificat în cont înaintea unei repetări manuale; nu se validează plăți sau expedieri prin simpla afișare a unui mesaj local.
