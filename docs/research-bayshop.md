# BayShop: cercetare funcțională pentru aplicația Android și iPhone

Data verificării: 1 noiembrie 2026.

## Starea cercetării

Acest raport separă trei categorii de informații:

- **Observat direct:** formularele publice și cabinetul autentificat pentru Moldova.
- **Documentat oficial:** funcții descrise de BayShop în ajutor și în listarea aplicației.
- **Propus pentru prototip:** structură mobilă, date de test și comportamente de simulare.

Cabinetul autentificat a fost inspectat după autentificarea utilizatorului, la
1 noiembrie 2026. Au fost citite liste, detalii și formulare; nu au fost create
comenzi, expediate mesaje, salvate adrese, comandate servicii sau efectuate plăți.
Exemplele din aplicație sunt sintetice. Acest raport nu copiază nume, solduri,
adrese, documente ori identificatori din contul inspectat. Rutele site-ului sunt
rute de interfață, nu endpointuri API. Demo-ul nu este conectat la conturi reale.

## 1. Concluziile care schimbă arhitectura aplicației

1. Sunt două fluxuri de cumpărare: utilizatorul cumpără independent și trimite la
   depozit, sau solicită BayShop să cumpere prin link. Acestea trebuie diferențiate.
2. Coșul, comenzile, produsele din depozit și expedierile sunt entități diferite.
   O listă generică de „colete” nu reprezintă întregul cabinet.
3. Formarea expedierii este un flux cu selecție, adresă, metodă, servicii și
   confirmare. Mai multe produse pot intra în aceeași expediere.
4. Declarația, costurile și documentele expedierii sunt părți ale produsului,
   nu doar note sub statusul livrării.
5. Piața și limba trebuie modelate separat. `/ro/` are antet România; unele
   articole de acolo descriu însă operațiuni pentru Moldova.
6. Documentația publică are contradicții. Prețurile, perioadele și regulile
   financiare nu vor deveni reguli de producție fără confirmare actuală.

Surse: [cumpărături prin BayShop](https://bayshop.com/ro/page/purchases-via-bayshop-account.html),
[adresa virtuală](https://bayshop.com/ro/page/mail-forwarding.html),
[formarea coletului](https://bayshop.com/ro/page/parcel-forming.html).

## 2. Autentificare și acces

| Ecran | Confirmat | Limite ale verificării |
|---|---|---|
| Logare | Email, parolă, recuperare; butoane Google și Apple vizibile | Erori, sesiune, limitarea încercărilor, verificări suplimentare |
| Înregistrare | Prenume, nume, email, telefon cu prefix, parolă, acord termeni; Google/Apple | Politica parolei, validare email/telefon, tratarea contului existent |
| Recuperare | Formular public bazat pe email | Mesajul, linkul primit, expirarea și resetarea efectivă |
| Profil | Câmpuri și preferințe inspectate, detalii în secțiunea 12 | Salvarea, verificările și disponibilitatea ștergerii contului |

Logarea și înregistrarea au fost inspectate direct în browser. Butoanele sociale
vizibile nu demonstrează finalizarea cu succes a fluxurilor OAuth.

Surse: [logare](https://bayshop.com/ro/auth/login/),
[înregistrare](https://bayshop.com/ro/auth/register/),
[recuperare](https://bayshop.com/ro/auth/forgot-password/),
[FAQ](https://bayshop.com/ro/faq/).

## 3. Comandă cu link, coș și comenzi

Formularul public și ghidul descriu țara vânzătorului, URL-ul produsului,
denumirea, prețul, livrarea locală, cantitatea, culoarea, mărimea și comentariul.
Ghidul mai menționează identificatorul produsului și verificarea la depozit.

Fluxul documentat este: completare produs → coș → alegerea produselor pentru
achitare → confirmare plată → comenzi. Produsele pot fi grupate după magazin.
Modificarea înainte de plată este diferită de modificarea după începerea cumpărării.
Disponibilitatea produsului (de exemplu, precomandă sau lipsă stoc) nu trebuie
confundată cu starea transportului.

Pentru prototip propunem detalii complete, editare în coș, ștergere, sumar de cost,
confirmare explicită a unei plăți fictive și istoric după plasare. Aceste interacțiuni
trebuie să modifice coerent aceeași stare de test.

Surse: [formular](https://bayshop.com/ro/shop-to-order/),
[ghid comandă](https://bayshop.com/ro/page/order-via-link.html),
[cumpărături prin cont](https://bayshop.com/ro/page/purchases-via-bayshop-account.html),
[achitare](https://bayshop.com/ro/page/payment.html).

## 4. Colete așteptate și depozit

Pentru cumpărături independente, utilizatorul primește o adresă de depozit,
înregistrează un colet așteptat și urmărește transportul local până la recepție.
Adresa depozitului și adresa de facturare au roluri diferite. Ghidul menționează
verificarea identității; câmpurile observate sunt detaliate în secțiunea 12,
dar regulile de aprobare a documentelor nu au fost testate.

După recepție, documentația descrie fotografii, verificarea produsului, reambalare,
ambalaj protector și eliminarea cutiei încălțămintei. Rezultatele verificării pot
include observații și fotografii. Sunt descrise servicii cerute înainte sau după
recepție. Acțiunile vizibile sunt descrise în secțiunea 12; costurile finale și
eligibilitatea serverului nu au fost testate prin comandarea serviciilor.

Surse: [mail forwarding](https://bayshop.com/ro/page/mail-forwarding.html),
[servicii depozit](https://bayshop.com/ro/page/warehouse-services.html),
[cumpărare și transport](https://bayshop.com/ro/page/purchase-and-shipping.html).

## 5. Declarație și formarea expedierii

Declarația documentată conține descrierea completă a produsului, cantitatea,
linkul și valoarea reală. Cabinetul confirmă rânduri repetabile, monedă și documente
justificative; validările serverului nu au fost declanșate pe contul real.

Ghidul formării coletului descrie patru etape principale:

1. Revizuirea produselor selectate, a valorii, cantității și greutății.
2. Alegerea sau adăugarea adresei destinatarului.
3. Alegerea metodei de livrare și consultarea costului.
4. Alegerea serviciilor și confirmarea finală.

Serviciile enumerate includ asigurare, protecție suplimentară, reținere în depozit
și livrare la domiciliu. Utilizatorul poate reveni înainte de confirmare. Produsele
pot fi consolidate, dar condițiile actuale de compatibilitate nu sunt documentate
suficient. Nu vom presupune că pot fi combinate produse din depozite diferite.

Surse: [declarație](https://bayshop.com/ro/page/how-to-make-declaration.html),
[formare](https://bayshop.com/ro/page/parcel-forming.html),
[asigurare](https://bayshop.com/ro/page/parcel-insurance.html).

## 6. Tracking, taxe de import și documente

Listarea oficială Android confirmă tracking local și internațional, notificări
push, formarea coletelor, servicii de depozit, livrare la domiciliu și feedback
după primire. Actualizarea din 26 octombrie 2026 menționează explicit afișarea
taxelor de import, explicația componentelor și accesul la factura taxelor în
detaliile coletului expediat.

Pentru aplicația propusă, detaliul unei expedieri ar trebui să reunească: status,
cronologie, identificatori de tracking, produse, destinatar, metodă, servicii,
costuri și documente. Nu deducem din listare formule fiscale sau coduri de status.

Sursă: [BayShop pe Google Play](https://play.google.com/store/apps/details?id=com.softranger.bayshopmfr2).

## 7. Balanță, adrese, suport și calculator

| Modul | Funcții documentate | Limite ale dovezilor |
|---|---|---|
| Balanță | Plată facturi, istoric, retragere; convertor descris în ajutor | Metode și monede observate în secțiunea 12, procesarea reală netestată |
| Adrese | Mai multe adrese de destinatar; adăugare din date personale | Ajutorul restricționează modificarea adreselor deja folosite; regula actuală necesită verificare |
| Suport | Poștă internă; subiect, categorie, referință comandă și mesaj; ghidul menționează atașamente și urgență | Lista mesajelor, statusurile și limitele fișierelor nu au fost inspectate |
| Calculator | Origine, destinație, regiune, greutate/unitate, dimensiuni și opțiune volumetrică | Tariful depinde de rută/metodă; nu avem un contract API confirmat |
| Notificări | Push și preferințe email/SMS/Push App/Telegram | Livrarea efectivă și deep links neconfirmate |

Surse: [prima utilizare](https://bayshop.com/ro/page/first-time.html),
[FAQ](https://bayshop.com/ro/faq/), [plăți](https://bayshop.com/ro/page/payment.html),
[calculator Moldova](https://bayshop.com/calculator/),
[contact](https://bayshop.com/ro/page/contact-us.html).

## 8. Diferențe regionale și contradicții

- `/ro/` afișează România, prefix telefonic +40 și context de depozit în România.
- `/calculator/` și `/index.amp` au fost observate cu context Moldova.
- Unele pagini cu antet România au corpuri care încă vorbesc despre Moldova.
- FAQ și pagina cumpărăturilor prin cont dau comisioane și minime diferite.
- Ghidurile depozitului și formării coletului indică sume diferite pentru ambalaj.
- Descrierile asigurării și perioadelor de stocare nu sunt consecvente între pagini.
- Unele texte au praguri vamale diferite. Nu sunt o bază suficientă pentru reguli
  fiscale curente și nu vor fi implementate ca adevăr financiar.

Acestea pot proveni din pagini vechi, piețe diferite sau servicii distincte. Nu
alegem arbitrar una dintre variante. În demo folosim scenarii declarate fictive;
în producție tarifele și calculul final trebuie furnizate de sistemul BayShop.

Surse suplimentare: [Moldova AMP](https://bayshop.com/index.amp),
[metode de livrare](https://bayshop.com/ro/page/shipping-methods.html),
[livrare la domiciliu](https://bayshop.com/ro/page/door-to-door-delivery.html).

## 9. Structura mobilă aleasă pentru prototip

Navigare principală: **Acasă · Cumpărături · Depozit · Expedieri · Cont**.

- Acasă: acțiuni prioritare, ce necesită declarație/plată, colete active și notificări.
- Cumpărături: comandă cu link, coș, comenzi și detaliile fiecăreia.
- Depozit: așteptate, primite, detalii produs, declarație, servicii și consolidare.
- Expedieri: filtre, căutare, cronologie, costuri, documente și primire.
- Cont: profil, adrese, adrese depozit, balanță, tranzacții, calculator, suport,
  preferințe, sesiune și resetarea demonstrației.
- Înainte de acces: logare, creare profil de test, recuperare demonstrativă și
  intrare explicită în contul demo.

Aceasta este adaptarea mobilă propusă. Meniul web observat este documentat mai jos.

## 10. Modelul de date propus

| Entitate | Relații și proprietăți esențiale |
|---|---|
| Profil/sesiune | Identitate de test, piață, limbă, autentificare demo |
| Produs de comandat | Magazin, URL, variante, preț, cantitate, cost local |
| Comandă | Produse, sumar, stare de cumpărare, istoric |
| Colet așteptat | Tracking local, depozit, proveniență, produse declarate |
| Produs în depozit | Recepție, greutate, declarație, servicii, eligibilitate |
| Expediere | Produse consolidate, destinatar, metodă, tracking, costuri, evenimente |
| Adresă | Destinatar, țară, oraș, stradă, cod poștal, telefon, stare arhivată |
| Tranzacție | Sumă/monedă, direcție, stare, referință comandă/expediere |
| Notificare | Categorie, citit/necitit, legătură către obiect |
| Tichet | Subiect, categorie, referință, mesaje, stare demonstrativă |

Separăm starea interfeței de datele domeniului. Comanda plătită, tranzacția și
balanța trebuie actualizate coerent. Un produs deja expediat nu poate fi selectat
din nou într-o a doua expediere de test. Acestea sunt invariabile ale demo-ului;
regulile de producție vor fi confirmate prin API.

## 11. Scenarii de test propuse

1. Logare corectă/greșită, deconectare și protejarea ecranelor cabinetului.
2. Recuperare simulată, fără email real; validarea formularului de înregistrare.
3. Produs incomplet, variantă lipsă, URL invalid, cantitate invalidă.
4. Adăugare în coș, editare, ștergere, coș gol și plată fictivă cu sold insuficient.
5. Colet așteptat, tracking local, recepție și produs fără declarație completă.
6. Declarație cu mai multe articole și validarea valorilor/cantităților.
7. Selectare produse compatibile și blocarea celor deja incluse într-o expediere.
8. Formare expediere cu revenire între pași, schimbare adresă și confirmare unică.
9. Expediere în ambalare, în tranzit, în procesare, gata de ridicare și livrată.
10. Taxe demonstrative cu explicații și document de test fără valoare fiscală.
11. Tranzacții și sold consistente după acțiuni; prevenirea confirmării duble.
12. Adrese active/arhivate și adresă folosită de o expediere existentă.
13. Notificări citite/necitite și acces direct la coletul referit.
14. Tichet cu referință la o comandă și răspuns demonstrativ etichetat.
15. Persistență locală, resetare, date corupte, ecran gol și acces la ID necunoscut.

Scenariile și statusurile de mai sus sunt propuneri de test, nu statusuri backend
verificate. Parolele, plățile, mesajele și documentele demo nu vor fi prezentate ca
operațiuni reale pe BayShop.

## 12. Rezultatele inspecției cabinetului autentificat

### Navigare și contexte

Cabinetul observat la rădăcina `bayshop.com` folosește piața Moldova și limba
română. Meniul grupează **Comenzi și colete** (Coș, Comenzi, În așteptare, Depozit,
Trimise), **Cont și plăți** (Plata facturilor, Istoricul plăților, Retragere) și
**Setări** (Date personale, Adrese, Gestionarea serviciilor). Există acces la
programul de loialitate, adresă de depozit și balanțe în mai multe monede.

### În așteptare și declarația

Formularul are depozit, monedă, tracking local și rânduri repetabile cu link,
denumire, cantitate și preț unitar. Permite documente justificative precum factura,
confirmarea plății sau captura comenzii. Interfața indică PNG, JPG, JPEG și PDF,
maximum 25 MB. Destinatarul se alege din adrese, cu căutare și adăugare de adresă.

În depozit, dialogul de editare a declarației are tracking dezactivat, monedă,
mai multe articole și zone separate pentru documente. A fost închis prin anulare,
fără salvare. Regula de 25 MB este un indiciu din interfață, nu un contract de
upload verificat la server.

### Depozit și servicii

Sunt vizibile depozite SUA, România, Regatul Unit, Italia, Germania și Polonia.
Interfața arată ora locală, programul și următoarea expediere. Produsele au
fotografii, identificator, durata stocării, tracking local, greutate, cantitate,
valoare și avertisment de declarație incompletă. Există selecție și total, plus
butonul de creare a coletului. Meniurile observate includ divizare și verificare
produs. Nu a fost apăsat butonul de creare a coletului și nu s-au comandat servicii.
Wizardul din demo este o adaptare a ghidului public, nu o copie a unui wizard
autentificat executat.

### Expedieri și livrare locală

Lista include taburile **Trimise**, **Reținere vamală**, **Primit**, plus filtre de
țară. Detaliul unei expedieri reunește tracking, cronologie (creat, așteaptă
trimiterea, în tranzit), greutate fizică și volumetrică, destinatar, conținut,
transport, taxe de import, explicația calculului, declarație și factura taxelor.
Există atașamente suplimentare și modificarea livrării locale. Formularul observat
arată ridicare la depozit, oficiu Nova Poshta, post-terminal Nova Poshta și livrare
la domiciliu. Formularul a fost inspectat fără salvare.

Existența unui calcul fiscal într-un colet nu confirmă o regulă universală. Demo-ul
folosește costuri fictive, iar taxele reale trebuie furnizate de API pentru fiecare
expediere. Documentele demo nu au valoare fiscală.

### Coș, comenzi și finanțe

Coșul inspectat era gol; fluxul de cumpărare se bazează suplimentar pe ghidul public.
Comenzile arată starea, articolele, variantele, data, cantitatea și defalcarea
produs/livrare locală/comision. Taburile de stare din cont reflectă datele acelui
cont și nu dovedesc lista completă de stări backend.

Finanțele au taburi pentru facturi, retragere și istoric. Facturile sunt grupate
după monedă. Sunt vizibile metode Credit Card, Bpay și Google Pay, fără inițierea
vreunei plăți. Istoricul are perioade azi/săptămână/lună/toate, filtre de monedă,
referință, dată, sumă și sold ulterior. Retragerea arată USD, EUR, GBP, RON și
opțiuni card/PayPal. Demo-ul nu solicită detalii de card și nu integrează acești
procesatori; validează doar coerența soldului fictiv și a tranzacțiilor locale.

### Profil, adrese, preferințe

Profilul are Date personale, Adresă de plată, Adrese de livrare și Gestionarea
serviciilor. Nume, prenume, data nașterii și email erau dezactivate în interfața
observată; țara, limba și telefonul erau editabile. Există schimbare parolă,
documente de identitate și preferințe informații/email/SMS/Push App/Telegram.
Gestionarea serviciilor include alegerea depozitului și Auto trimitere.

Adresele au căutare și paginare, persoană fizică/companie, nume, țară, cod poștal,
regiune, oraș, stradă și telefon. Modalul de adresă de depozit diferențiază adresa
comună/privată și include două linii de adresă, una cu identificatorul clientului.
Adresele de depozit din demo sunt intenționat fictive și nu trebuie folosite pentru
cumpărături reale. Demo-ul păstrează numele și emailul doar pentru vizualizare în
setări; telefonul, țara și preferința de limbă pot fi modificate local.

Rute observate: [coș](https://bayshop.com/cart/),
[comenzi](https://bayshop.com/orders/),
[în așteptare](https://bayshop.com/mf-packages/),
[depozit](https://bayshop.com/storage/),
[expedieri](https://bayshop.com/package/),
[finanțe](https://bayshop.com/member/balance),
[profil](https://bayshop.com/member/profile-edit).
Aceste pagini necesită autentificare și nu sunt documentație API.

## 13. Limitele verificării și implementarea

Inspecția publică și cea autentificată sunt încheiate pentru prototip. Nu au fost
provocate erori prin submit pe contul real; nu au fost verificate OAuth, resetarea
parolei, ștergerea contului, plata, rambursarea, uploadul efectiv, serviciile plătite
sau trimiterea mesajelor. Ghidul public rămâne baza pentru suport și unele etape de
formare. Nu presupunem că butoanele observate garantează operații reușite.

Prototipul implementează stare locală persistentă cu date sintetice și autentificare
demonstrativă. Contractele entităților și regulile de tranziție sunt separate de UI,
pentru înlocuire ulterioară cu API. Formulele, tarifele, recepția și avansarea
trackingului sunt explicit simulări. Conectarea la sistemul real necesită API-ul
autorizat, mediul de test și validarea regulilor comerciale cu echipa BayShop.

## 14. API-ul mobil identificat în grupul de dezvoltare

Actualizare: 1 noiembrie 2026, după finalizarea pachetelor interne 0.4.1 pentru Android și iPhone. La cererea utilizatorului a fost consultat grupul Telegram **Android-iOS App DEV**, fără trimiterea vreunui mesaj.

### Surse și medii

În grup există trimiteri ale dezvoltatorilor la [documentația API-ului mobil](https://bayshop.com/api-docs/bayshop-mf.html), inclusiv autentificare (12 iunie 2026), formarea coletului (11 iunie) și plăți (24 iunie). Pagina publică încarcă [schema OpenAPI MF](https://bayshop.com/api-docs/spec/bayshop-mf.yaml?v=1792586681): **BayShop MF.v2**, versiunea 2.0, 115 paths și 147 operațiuni.

[Documentația depozit/livrare](https://bayshop.com/api-docs/warehouse-and-delivery.html) încarcă [schema operațională](https://bayshop.com/api-docs/spec/warehouse-and-delivery.yaml?v=1790837085), cu 49 paths și 62 operațiuni. Este distinctă de API-ul cabinetului clientului; nu trebuie folosite operațiile interne ale depozitului pentru aplicația clientului doar fiindcă sunt documentate.

Ambele scheme declară `https://dev.bayshop.com` ca server. În discuția din 5 octombrie 2026, Vadim precizează că `api.bayshop.com` este și el un domeniu de test. Acesta este context istoric al echipei, nu o garanție despre configurația curentă. Adresa exactă de producție rămâne de confirmat; nu se deduce din numele subdomeniului. Linkurile mai vechi către Apiary și `bay.prod` nu sunt alese automat drept mediu de integrare.

Verificare limitată, fără credențiale, la 1 noiembrie 2026, 20:06 UTC: `GET https://dev.bayshop.com/api/warehouse-list`, cu Accept JSON, a returnat HTTP **401**, JSON cu mesajul **Invalid Token**. Aceasta confirmă accesibilitatea rutei și necesitatea autorizării, nu funcționarea autentificată sau actualitatea datelor. Nu au fost apelate operații de scriere, plată, trimitere ori creare.

### Autentificare documentată

- `POST /api/auth`: email și parolă; sunt documentate separat opțiuni sociale prin code/type. Câmpurile obligatorii nu sunt marcate formal în schemă.
- Răspunsul folosește code/error/message/data; data poate conține access_token, expires_in, token_type, id, name, surname și uid.
- Cererile autentificate folosesc **HTTP Bearer**. Schema nu declară tokenul principal ca JWT; tokenul Intercom este separat.
- `GET /api/auth`: informații scurte despre utilizator.
- `POST /api/auth/register` și `POST /api/auth/restore`: înregistrare și recuperare.
- `DELETE /api/auth`: deconectare. Parametrul gcm_token are o contradicție între required și descriere.

Tokenurile și parolele nu au fost preluate din conversații și nu au fost incluse în cod. Versiunea instalabilă 0.4.1 păstrează autentificarea și operațiile locale existente; această cercetare nu activează integrarea live.

### Maparea paginilor aplicației

| Funcție | Rută documentată de citire |
| --- | --- |
| Profil | GET /api/member/personal-data |
| Depozite | GET /api/warehouse-list |
| Adrese ale depozitelor pentru utilizator | GET /api/member-storage-address |
| Destinatari | GET /api/member-address |
| Așteptare | GET /api/waiting-mf-list/{storage_id} |
| În stoc | GET /api/mf-list/in-stock/{storage_id} |
| Trimise / Primite | GET /api/parcels/{storage_id}/{parcel_status} sau /api/parcels/all/{status} |
| Detaliu / tracking | GET /api/parcels/view/{parcelId}; GET /api/parcel-tracking/{uid} |
| Contoarele meniului | GET /api/member/counters; GET /api/member/parcels-counter |
| Facturi / istoric | GET /api/payments; GET /api/balance |

Stările din aplicație trebuie mapate la cele returnate de server, nu trimise ca etichete românești. Schema contoarelor oferă nume precum waitingMf, mf, sent, customs-held și received; enumerările complete ale filtrelor și formatul tuturor răspunsurilor trebuie confirmate pe contul de test.

### Condiții pentru integrarea următoare

Prima etapă poate conecta autentificarea și citirea profilului, adreselor, listelor și contoarelor. Înaintea acesteia trebuie confirmate mediul, contul de test și regulile de expirare a sesiunii. Schema impune Bearer global inclusiv loginului, nu documentează refresh, iar majoritatea erorilor nu au contracte distincte. Sunt necesare verificări țintite cu acces autorizat, fără a presupune comportamentul lipsă.

Operațiile de plată și creare a expedierilor necesită validarea separată a contractelor: PUT /api/parcel-create nu are corpul complet documentat, iar unele enumerări de depozite sunt incomplete. Aceste fluxuri nu vor fi activate prin simpla înlocuire a adresei serverului.
