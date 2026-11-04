# BayShop — instalare Android și iPhone

Identificator intern separat: `com.bayshop.mobile.demo`. Din 0.4.1, numele afișat
este **BayShop**. Identificatorii, semnarea și cheile stocării locale rămân
neschimbate, astfel încât actualizarea păstrează datele. Pachetul se instalează
separat de aplicația BayShop publicată. Versiunile de la 0.5.0 conectează contul real
pentru profil, colete, adrese, sold, fidelitate, declarații și documente.
Salvările și cererile din aplicația nativă modifică acest cont numai după
confirmarea explicită în interfață. Previzualizarea sintetică este separată.

## Versiunea 0.6.7 — iPhone

- [Instalează iPhone 0.6.7, build 18](https://expo.dev/accounts/air-post-srl/projects/bayshop/builds/4ddf521a-70bf-42dd-8522-1c1666d64671): **FINISHED — IPA, semnare și profil verificate**.

Instalează peste versiunea existentă. În **La depozit**, bifează coletele
declarate din același depozit și apasă **Creează expedierea**. Urmează pașii
Destinatar → Transport → Livrare locală → Servicii → Verificare.

Include și Italia/Polonia în formularul conectat la API, declarația prioritară,
zoom și swipe la fotografii, QR lângă nume cu reglarea luminozității, tema
automată cu alegere în Setări, profil read-only, ordinea țărilor/valutelor,
logo DPD și corecțiile calculatorului. Pentru această versiune s-a cerut numai
build iOS; Android rămâne la pachetul 0.6.6 de mai jos.

**403/403 teste**, lint, TypeScript, Expo Doctor 20/20 și exporturile
au trecut. Gesturile, zona sigură și luminozitatea pe iPhone rămân de confirmat
fizic. [Raport QA 0.6.7](../../bayshop-audit/QA-0.6.7.txt).

## Versiunea 0.6.6 — istoric, calculator și navigare simplificată

- [iPhone 0.6.6, build 16](https://expo.dev/accounts/air-post-srl/projects/bayshop/builds/37e54598-7ed8-4713-b578-14c4c89f7b21): **FINISHED — IPA, semnare și profil verificate**.
- [Android 0.6.6, versionCode 15](https://expo.dev/accounts/air-post-srl/projects/bayshop/builds/a3aa0fcf-9677-48fc-907c-d824279024dc): **FINISHED — APK verificat**.

Instalează actualizarea peste versiunea existentă. Deschide meniul lateral →
Sold și istoric. Perioada inițială este ultima lună; alege „Tot istoricul”
pentru operațiunile mai vechi. Poți filtra după monedă și statut.

Istoricul se încarcă separat de sold și se actualizează când revii în ecran.
Fiecare rând păstrează suma cu semn, moneda, statutul, descrierea, data și ora,
referința când este furnizată și soldul istoric transmis de server. Referințele
lipsă sau duplicate nu mai ascund întreaga listă. Erorile au buton de reîncercare.

Sunt afișate câte 25 de tranzacții pe pagină. API-ul actual trimite întreaga
perioadă selectată, iar paginarea și filtrele se aplică în aplicație; „Tot istoricul”
poate dura mai mult la conturile mari. Nu există încă paginare pe server pentru
această rută. Nu am modificat serverul sau operațiunile financiare.

În plus, butoanele normale de actualizare au fost eliminate; încărcarea automată,
tragerea pentru reîncărcare și reîncercarea contextuală la erori rămân disponibile.
Calculatorul pornește cu SUA și țara contului când ruta este disponibilă, iar
lungimea, lățimea și înălțimea sunt într-un rând. Linkurile fără protocol primesc
automat https:// la ieșirea din câmp sau salvare; HTTP/HTTPS deja introduse rămân.
Air Post are avion, Road Express mașină; ceilalți transportatori folosesc logo-ul
din API când este disponibil, cu numele păstrat și simbol neutru de rezervă.

Verificări: **346/346 teste**, lint, TypeScript, Expo Doctor **20/20**, exporturi
Android/iOS/web și arhiva EAS identică sursei verificate (**410 fișiere**).
Interfața și navigarea au fost verificate în RO/RU/EN, la 320 și 390 px, cu date
sintetice. Răspunsul exact care a produs problema pe telefonul utilizatorului
nu a fost capturat; afișarea datelor contului său trebuie confirmată pe noul pachet.
[Raport QA 0.6.6](../../bayshop-audit/QA-0.6.6.txt).

Redesignul fidelității din 0.6.5 este inclus. Cronometrul exact pentru date reale
depinde în continuare de completarea API din PR3574, care nu a fost publicată
pe server în această intervenție.

## Versiunea 0.6.5 — fidelitate și reduceri

- [iPhone 0.6.5, build 14](https://expo.dev/accounts/air-post-srl/projects/bayshop/builds/7ae8d006-3eda-43d2-93be-13f73ec39617): **FINISHED — IPA, semnare și profil verificate**.
- [Android 0.6.5, versionCode 13](https://expo.dev/accounts/air-post-srl/projects/bayshop/builds/52a3673a-ac3c-4f79-836e-d4cac116e04b): **FINISHED — APK verificat**.

Instalează actualizarea peste versiunea existentă. Identificatorii și profilul iPhone sunt păstrate.

Pagina are acum introducere și explicații, reducerea contului într-un card Glass,
tariful individual aplicat evidențiat, progres între praguri, puncte rămase și
pași vizuali pentru nivelurile curent și următor. Filtrele au steaguri, iar meniul
de jos rămâne disponibil. Textele interfeței sunt în română, rusă și engleză;
valorile și denumirile primite de la server se reîncarcă la schimbarea limbii.

**Termenul reducerii:** răspunsul actual BayShop folosește același câmp pentru o
perioadă configurată și pentru zile rămase. Aplicația îl prezintă ca perioadă
raportată, fără să inventeze o dată. Cronometrul zile/ore/minute este pregătit și
verificat cu date sintetice, dar expirarea reală necesită aplicarea completării
API din [PR3574](https://bitbucket.org/bayshop/bayshop/pull-requests/3574).
Commitul `2af1315f` este trimis pentru revizuire; nu s-a făcut merge sau deploy. O fereastră de expirare a punctelor nu confirmă aplicarea
reducerii progresive într-un cont cu tarif individual.

Verificări: **311/311 teste**, lint, TypeScript, Expo Doctor **20/20**, exporturi
Android/iOS/web și arhivă EAS comparată cu toate cele **400 de fișiere** relevante.
Previzualizarea a fost verificată pe lățimi de 320 și 390 px cu date sintetice.
Testarea pe telefoane fizice, inclusiv reluarea după repaus, rămâne de efectuat.
[Raport QA 0.6.5](../../bayshop-audit/QA-0.6.5.txt).

## Versiunea 0.6.4 — ambele pachete compilate și verificate

- [iPhone 0.6.4, build 13](https://expo.dev/accounts/air-post-srl/projects/bayshop/builds/ad239911-12b9-47fc-a623-021b2ddad15b): **FINISHED**, pachet și semnare verificate pentru același iPhone înregistrat.
  [IPA local](../../BayShop-0.6.4-iphone.ipa) · [Metadate](../../BayShop-0.6.4-iphone-metadata.json).
- [Android 0.6.4, versionCode 12](https://expo.dev/accounts/air-post-srl/projects/bayshop/builds/c051cbb3-5d08-4437-a90f-18cb4738a64a): **FINISHED**, APK verificat.
  [APK local](../../BayShop-0.6.4-android.apk) · [Metadate](../../BayShop-0.6.4-android.metadata.json).

Deschide linkul pe telefon și instalează actualizarea peste versiunea existentă.
Identitatea aplicației este păstrată. Nu este necesară reînregistrarea iPhone-ului existent.

Această versiune include:

- Țări cu steaguri și selector separat Generală/Privată la adresele depozitelor; selecție memorată pentru fiecare țară și notificările originale ale serverului sub adresă.
- Pagina principală compactă: stări numai în bara de jos, solduri pe monede, acces vizibil la facturi și adrese.
- Facturi și plăți în meniul lateral, cu bara de monitorizare păstrată pe paginile principale.
- Noutăți cu text HTML curățat, imagini originale și vizualizare în aplicație.
- Steaguri în ecranele cu țări și eliminarea e-mailului din adrese.

**299/299 teste**, lint, TypeScript, Expo Doctor **20/20** și exporturile Android/iOS/web au trecut.
Capturile și interacțiunile web au fost verificate cu componente reale și date sintetice;
aceasta nu certifică toate funcțiile contului real sau rularea pe telefoane fizice.
Plata efectivă din aplicație și autentificarea Google/Apple rămân neimplementate.
Problema serverului la salvarea destinatarului pe dev și patchul backend sunt separate de această versiune.
[Raportul QA0.6.4](../../bayshop-audit/QA-0.6.4.txt). Redesignul fidelității cerut ulterior nu este inclus în0.6.4.

## Versiunea 0.6.3 — ambele pachete compilate, testarea fizică în așteptare

Sursa finală a trecut lint, TypeScript, **253/253 teste** și exportul Android/iOS/web.
Include galeria și documentele în aplicație, validările declarațiilor și păstrarea
corectă a valorii totale a rândului la editare. Generarea proiectelor native și a
codului pentru PDF/Blob/WebView a trecut; comportamentul pe telefoane rămâne de
verificat după instalarea noilor pachete.

- [Android 0.6.3, versionCode 11](https://expo.dev/accounts/air-post-srl/projects/bayshop/builds/1b32c807-b516-446c-ba5f-8f792eb674fa): **FINISHED**.
  [APK local](../../BayShop-0.6.3-android.apk), 118.558.332 bytes.
  ZIP-ul, manifestul, numele BayShop, modul de lansare și modulele native
  PDF/Blob/WebView/SecureStore/DocumentPicker/FileSystem sunt verificate;
  PDFium este prezent pentru toate cele patru arhitecturi.
  Semnătura criptografică Android nu a fost verificată independent.
  [Metadate și SHA-256](../../BayShop-0.6.3-android.metadata.json).
  Testarea fizică rămâne în așteptare.
- [iPhone 0.6.3, build 12](https://expo.dev/accounts/air-post-srl/projects/bayshop/builds/895b1b2b-af72-46f2-8493-edb7a991155c): **FINISHED**.
  [IPA local](../../BayShop-0.6.3-iphone.ipa), 11.201.767 bytes.
  Arhiva, semnătura, profilul pentru iPhone-ul deja înregistrat și modulele native
  PDF/WebView/Blob/Glass/SecureStore/DocumentPicker/FileSystem sunt verificate.
  [Metadate și SHA-256](../../BayShop-0.6.3-iphone-metadata.json).
  Testarea fizică rămâne în așteptare.

În mediul de test sunt confirmate crearea și editarea unui colet cu factură PDF,
păstrarea facturii, valoarea totală pentru cantitate mai mare de unu și păstrarea
monedei originale. Preferințele și codul de acces au fost salvate și recitite.
Crearea destinatarului rămâne blocată de răspunsul serverului. Galeria și cititorul
PDF au teste web; verificarea nativă și deschiderea PDF-ului privat pe telefon nu
sunt confirmate. [Raportul QA 0.6.3](../../bayshop-audit/QA-0.6.3.txt) separă exact
aceste rezultate.

Compilarea Android inițială, versionCode 10, a fost anulată după identificarea
unei erori la editarea declarațiilor. Nu a fost livrată. Linkurile 0.6.2 de mai jos
rămân arhivă și nu includ galeria/documentele noi.

## Versiunea 0.6.2 — ambele pachete compilate, verificare fizică în așteptare

- [Android 0.6.2, versionCode 9](https://expo.dev/accounts/air-post-srl/projects/bayshop/builds/f1caf6f7-a433-4871-8c55-76e481fbff4d): **FINISHED**.
  [APK local](../../BayShop-0.6.2-android.apk), 98.180.930 bytes.
  Integritatea ZIP, identitatea aplicației, numele BayShop și modulele native
  SecureStore/DocumentPicker/FileSystem sunt verificate. Semnătura criptografică
  Android nu a fost verificată independent.
  [Metadate și SHA-256](../../BayShop-0.6.2-android.metadata.json).
- [iPhone 0.6.2, build 10](https://expo.dev/accounts/air-post-srl/projects/bayshop/builds/8f058c8f-3491-4f6f-9127-1ea2a82f7026): **FINISHED**.
  [IPA local](../../BayShop-0.6.2-iphone.ipa), 10.934.360 bytes.
  Arhiva, semnătura și profilul ad hoc pentru iPhone-ul deja înregistrat sunt
  verificate. [Metadate și SHA-256](../../BayShop-0.6.2-iphone-metadata.json).

Pachetele includ corecția Intl.PluralRules, înregistrarea/recuperarea native și
regulile documentelor/codurilor de acces confirmate în backend. Sunt candidați
pentru testare; pornirea, autentificarea și absența închiderilor neașteptate pe
telefoane nu sunt încă confirmate. Raport: [QA 0.6.2](../../bayshop-audit/QA-0.6.2.txt).

0.6.1 este păstrată ca versiune intermediară, fără recomandare de instalare:
nu include corecțiile ulterioare bazate pe codul serverului. iPhone build 9 este
compilat și verificat; Android versionCode 8 este de asemenea compilat, cu
integritatea și conținutul APK-ului verificate. Confirmarea fizică rămâne deschisă.

## Versiunea 0.6.0 — compilată, cu eroare raportată pe iPhone

**Nu recomandăm instalarea versiunii 0.6.0.** Utilizatorul a raportat închiderea
aplicației iPhone imediat după autentificare. Înregistrarea redirecționa spre site.

- iPhone: build 8, FINISHED; IPA și semnătura au fost verificate, dar testul utilizatorului a eșuat după logare.
- Android: versionCode 7, FINISHED; APK descărcat, integritatea și conținutul verificate. Nu există confirmare de test pe telefon.

Cele 170 de teste și exporturile Android/iOS/web ale versiunii 0.6.0 nu au acoperit
absența `Intl.PluralRules` pe Hermes. Testul nou reproduce acest caz, iar sursa
include acum alternativa compatibilă. Confirmarea pe iPhone a remedierii rămâne
necesară după un nou pachet. Lipsurile și refuzurile serverului sunt urmărite în
[harta operațiilor](api-operations-map.md).

## Versiunea 0.5.0 — pachete finalizate, integrarea inițială

- [Android 0.5.0, versionCode 6](https://expo.dev/accounts/air-post-srl/projects/bayshop/builds/5e0c482c-f1b0-4efc-b585-28fb30a719d2)
- [iPhone 0.5.0, build 7](https://expo.dev/accounts/air-post-srl/projects/bayshop/builds/35749b24-7618-43df-bbf9-97868c0f1cfb)

Ambele pachete sunt **FINISHED** și au fost descărcate. IPA-ul are verificată
semnătura și configurația ad hoc; APK-ul are verificate integritatea și
conținutul, fără verificare criptografică independentă a semnăturii. Testarea
fizică a versiunii 0.5.0 rămâne neconfirmată.

După instalare, deschide **BayShop → Intră în cont** și folosește emailul și parola
contului BayShop. Dacă ai ales mai întâi previzualizarea, mergi la **Cont →
Conectează contul BayShop**. Nu este necesară reînregistrarea iPhone-ului existent.

Verificări înainte de compilare: **81/81 teste**, lint, TypeScript, Expo Doctor
**20/20**, export Android/iOS/web. Autentificarea de producție și 22 din 23 de
citiri au fost verificate. Ruta auxiliară de numărătoare care răspunde 500 nu este
folosită; aplicația utilizează `member/counters`, care a răspuns corect.

Ecranele reale au fost verificate în browser cu date sintetice și structuri
compatibile cu răspunsurile API: meniu persistent, detalii de colet, adrese
inactive cu copiere blocată, taxă de adresă privată, operații neachitate și erori
independente pentru sold/istoric. Nu au apărut erori de execuție. Aceasta nu este
o verificare a conectării API din browser sau a comportamentului nativ pe telefon.

Pe telefon verifică autentificarea, cele patru liste, soldul și copierea adreselor,
apoi redeschiderea aplicației și deconectarea. Lista „Primite” și paginarea completă
necesită această confirmare; niciun rezultat gol nu înlocuiește o eroare de citire.

## Starea versiunilor

| Versiune | Android | iPhone |
| --- | --- | --- |
| **0.2.0 — arhivă** | Instalare și funcționare confirmate de utilizator. | Instalare și funcționare confirmate de utilizator. |
| **0.3.0 — rezervă** | FINISHED, versionCode 3; APK descărcat și verificat. | FINISHED, build 4; utilizatorul confirmă noul meniu și aspectul. |
| **0.4.0 — arhivă** | FINISHED, versionCode 4; APK verificat. Testarea pe telefon în așteptare. | FINISHED, build 5; IPA verificat. Testarea pe telefon în așteptare. |
| **0.4.1 — rezervă cu date locale** | FINISHED, versionCode 5; integritatea și conținutul APK verificate. Testarea pe telefon în așteptare. | FINISHED, build 6; IPA verificat. Utilizatorul confirmă animația de pornire, haptica, copierea adreselor și meniul de jos. |
| **0.5.0 — cont real** | FINISHED, versionCode 6; APK verificat. | FINISHED, build 7; IPA și semnătură verificate. |
| **0.6.0 — nerecomandată** | FINISHED, versionCode 7; netestată fizic. | FINISHED, build 8; închidere după logare raportată de utilizator. |
| **0.6.1 — intermediară** | FINISHED, versionCode 8; APK verificat, fără confirmare fizică. | FINISHED, build 9; IPA verificat, fără confirmare fizică. |
| **0.6.2 — candidat pentru testare** | FINISHED, versionCode 9; APK verificat, testarea fizică în așteptare. | FINISHED, build 10; IPA și semnătură verificate, testarea fizică în așteptare. |
| **0.6.4 — candidat pentru testare** | FINISHED, versionCode12; APK verificat, testarea fizică în așteptare. | FINISHED, build13; IPA și semnătură verificate, testarea fizică în așteptare. |
| **0.6.3 — candidat pentru testare** | FINISHED, versionCode 11; APK verificat, testarea fizică în așteptare. | FINISHED, build 12; IPA și semnătură verificate, testarea fizică în așteptare. |

Redesignul 0.3.0 este implementat în proiect: patru secțiuni persistente jos
(**Așteptare, În stoc, Trimise, Primite**), meniu în stânga pentru restul funcțiilor,
liste compacte, protecție la abandonarea formularelor și logo-ul oficial BayShop
în antet, icon și ecranul de pornire. Modificările includ materiale native și
necesită pachete noi; APK-ul și IPA-ul 0.2.0 nu conțin redesignul.

Pentru 0.3.0 au trecut **30/30 teste automate**. Pe iPhone, utilizatorul a confirmat
noul meniu și designul Liquid Glass: „Arată bine și funcționează”. Confirmarea nu
înlocuiește auditul de accesibilitate și testarea tuturor gesturilor. Android 0.3.0
are artefactul verificat, fără confirmare de utilizare pe telefon încă. Liquid
Glass nativ se folosește pe iOS 26+ când API-ul este disponibil; iOS 18 și
platformele incompatibile folosesc alternativa blur/opacă.

**0.4.0 include:**

- Logare compactă cu antet glass, parolă afișabilă și acces rapid în demo.
- Pornire cu transformarea coletului în logo-ul oficial și haptică discretă;
  variantă statică pentru Reduce Motion.
- Icon centrat optic pe ecranul principal al telefonului, cu geometria oficială
  păstrată și adaptare pentru iconurile Android.
- Adresele depozitelor apar direct după selectarea țării/tipului; fiecare câmp
  are copiere, iar **Copiază tot** preia adresa completă. Bara de jos rămâne vizibilă.

iPhone build 5 și Android versionCode 4 sunt finalizate, cu artefactele verificate. Testarea fizică 0.4.0 pe ambele telefoane nu a fost încă efectuată.
Pachetele 0.3.0 rămân versiuni de rezervă și nu includ aceste schimbări.

## Versiunea 0.4.1 — pachete finalizate

- Nume afișat **BayShop**, fără modificarea identității aplicației sau a datelor
  locale existente.
- Titluri și acțiuni curate, fără repetarea etichetelor „demo/test”. Setări →
  **Despre aplicație** explică starea locală; confirmările plăților, documentele
  și suportul păstrează scurtele precizări necesare despre simulare.
- Șase țări cu adrese de depozit verificate în cabinet la 1 noiembrie 2026.
  Numele și codul proprietarului apar direct, fără personalizare. Copiere pe câmp
  și integrală; adresa privată este numai pentru SUA, cu supliment de 20 USD/colet.
- Pachet intern personal. Pentru alți utilizatori, identitatea trebuie furnizată
  din sesiunea autentificată. [Detaliile catalogului](adrese-depozite.md).

Pentru sursa finală au trecut **36/36 teste automate** și exportul Android/iOS/web.
În browser au fost verificate adresele personale afișate direct, fără formular,
migrarea corectă a textelor/listelor și lipsa erorilor noi în consolă.

[Instalează iPhone 0.4.1, build 6](https://expo.dev/accounts/air-post-srl/projects/bayshop/builds/3a54cd2b-3fb9-44f8-ac52-ac0a9e2ce063):
**FINISHED**, IPA verificat: `../../BayShop-0.4.1-iphone.ipa`, 10.567.020 bytes.
Verificările au confirmat ZIP-ul, semnătura strictă, profilul ad hoc, numele
**BayShop**, `com.bayshop.mobile.demo` / 0.4.1 / 6 și modulele Glass/Clipboard/SVG.
Aceeași echipă și același iPhone ca în 0.4.0; profil valabil până la 1 noiembrie
2027, iOS minim 16.4. Metadate: `../../BayShop-0.4.1-iphone-metadata.json`.
SHA-256: `72f83e6c2b1f0975e4056604c57d35194a24f05f798367acbe0d4a35af6fea7e`.

[Instalează Android 0.4.1, versionCode 5](https://expo.dev/accounts/air-post-srl/projects/bayshop/builds/20586bc5-f2f9-455e-b1f8-83738a71f31e):
**FINISHED**, `../../BayShop-0.4.1-android.apk`, 97.396.902 bytes. ZIP-ul, manifestul
`com.bayshop.mobile.demo` / 0.4.1 / 5, numele **BayShop**, DEX-ul, pachetul JavaScript
și cele 100 biblioteci native au trecut verificarea. Semnătura criptografică a
APK-ului nu a fost verificată independent. Metadate:
`../../BayShop-0.4.1-android.metadata.json`.
SHA-256: `4788ef589d6a99273a501632f9e28e6359e306ea882464daf9ace8b991c84c2d`.

Ambele pachete sunt disponibile; versiunile anterioare nu includ aceste modificări. Pe iPhone, utilizatorul a confirmat
explicit la 1 noiembrie 2026 animația la pornire, haptica, copierea adreselor
și meniul de jos: „Da, funcționează”. Aceasta este o confirmare limitată la
funcțiile menționate; auditul complet de accesibilitate, gesturile și cazurile
de margine rămân de verificat. Android 0.4.1 nu este încă testat pe telefon.

## Pachetul iPhone 0.4.0 — arhivă

- [Instalează iPhone 0.4.0](https://expo.dev/accounts/air-post-srl/projects/bayshop/builds/56fbb7a3-fab1-4aba-ae38-59f4668449ba):
  **FINISHED**, build **5**. Fișier: `../../BayShop-Demo-0.4.0-iphone.ipa`,
  10.565.104 bytes. Metadate: `../../BayShop-Demo-0.4.0-iphone-metadata.json`.
- Verificate: integritatea ZIP, `com.bayshop.mobile.demo` / 0.4.0 / 5, semnătura
  strictă și profilul ad hoc. Aceeași echipă și același dispozitiv ca în 0.3.0;
  profilul este valabil până la 1 noiembrie 2027. Modulele native Glass, Clipboard
  și SVG sunt prezente; versiunea minimă iOS este 16.4.
- SHA-256: `709ea46a6818f4b608164c49665e123139b259ed558a73175fd60bde74d3ebf3`.

Aceste verificări confirmă pachetul descărcat, nu testarea aplicației pe iPhone.

## Pachetul Android 0.4.0 — arhivă

- [Android 0.4.0](https://expo.dev/accounts/air-post-srl/projects/bayshop/builds/1de85b52-985c-4f93-bb38-89f40d3d4cc7):
  **FINISHED**, versionCode **4**. APK verificat: `../../BayShop-Demo-0.4.0-android.apk`,
  97.395.026 bytes. Metadate: `../../BayShop-Demo-0.4.0-android.metadata.json`.
- Testarea fizică a acestei versiuni pe telefon rămâne în așteptare.

## Arhivă 0.2.0 — instalări confirmate

- [Android 0.2.0 în EAS](https://expo.dev/accounts/air-post-srl/projects/bayshop/builds/e3c6f65c-e28b-4a0b-9c2c-b3fb80705e6b):
  build **FINISHED**, APK semnat cu integritatea verificată, disponibil și în
  `../../BayShop-Demo-0.2.0-android.apk`.
- [iPhone 0.2.0 în EAS](https://expo.dev/accounts/air-post-srl/projects/bayshop/builds/bda453c5-589d-4216-8145-4998f39afed3):
  build **FINISHED**, IPA semnat, versiunea 0.2.0 (3), disponibil și în
  `../../BayShop-Demo-0.2.0-iphone.ipa`. iPhone-ul înregistrat este inclus în profil;
  semnătura și profilul au fost verificate. Profilul expiră la 1 noiembrie 2027.

## Pachetele 0.3.0 — versiune de rezervă

- [Android 0.3.0](https://expo.dev/accounts/air-post-srl/projects/bayshop/builds/5ae7ff02-c833-4017-9fcc-3d108878f395):
  **FINISHED**, versionCode **3**. APK: `../../BayShop-Demo-0.3.0-android.apk`,
  91.260.717 bytes. Verificate: integritatea ZIP, manifestul
  `com.bayshop.mobile.demo` / 0.3.0 / 3, DEX, pachetul JavaScript și 96 biblioteci
  native. SHA-256 și metadate: `../../BayShop-Demo-0.3.0-android.metadata.json`.
- [Instalează iPhone 0.3.0](https://expo.dev/accounts/air-post-srl/projects/bayshop/builds/32673c20-3e24-40e2-9e84-659fa410aade): build **4**, **FINISHED**.
  IPA: `../../BayShop-Demo-0.3.0-iphone.ipa`, 10.211.193 bytes. Integritatea ZIP și
  semnătura strictă au trecut verificarea; același telefon și aceeași echipă ca
  în 0.2.0. Modulul nativ `UIGlassEffect` este inclus.
- QR iPhone nou: `../../bayshop-0.3-iphone-install-qr.png`.

Aspectul și funcționarea iPhone 0.3.0 sunt confirmate de utilizator. Confirmarea
nu acoperă toate testele de accesibilitate. Linkurile de mai sus rămân disponibile
ca rezervă și nu conțin funcțiile 0.4.0; noile linkuri se adaugă după compilare.

Codurile `bayshop-android-install-qr.png` și `bayshop-iphone-install-qr.png`
existente trimit la buildurile 0.2.0. Linkul local cu portul 8767 și
`bayshop-test-qr.png` deschid doar previzualizarea web.

## Instalare și actualizare pe telefoane

1. **Android:** deschide pagina buildului dorit pe telefon, descarcă APK-ul și
   urmează instrucțiunile Android pentru instalare din browser. Pentru actualizare,
   folosește noul APK BayShop semnat cu aceeași identitate.
2. **iPhone:** deschide pagina buildului dorit în Safari, pe telefonul înregistrat,
   și alege **Install**. Dacă sistemul solicită Developer Mode, urmează indicațiile
   din Settings → Privacy & Security → Developer Mode.
3. În versiunea instalată, deschide **BayShop** din icon și autentifică-te în contul propriu.
   Verifică mai întâi pornirea, autentificarea, listele, soldul și
   închiderea/redeschiderea aplicației. Formularele conectate modifică datele reale;
   salvările se testează numai pe date aprobate. [Raportul QA actual](../../bayshop-audit/QA-0.6.6.txt).
   Instrucțiunile **Explorează aplicația** și [scenariile demo](testare-demo.md)
   aparțin versiunilor istorice cu date locale, până la 0.4.1.

Mac-ul și rețeaua Wi-Fi comună nu sunt necesare pentru aplicația instalată:
profilul EAS `preview` generează APK Android și IPA iOS ad hoc în modul Release,
cu datele și codul incluse. Pentru telefoanele deja înregistrate nu trebuie
reluată înregistrarea doar pentru schimbarea designului.

Pentru un iPhone suplimentar, `tools/inregistrare-iphone.command` deschide fluxul
oficial Expo. Autentificarea se face acolo, fără parole în chat. Dispozitivul nou
trebuie inclus într-un profil actualizat și într-un build nou sau resemnat.
[Distribuție internă EAS](https://docs.expo.dev/build/internal-distribution/)

## Pentru persoana care întreține proiectul

Proiectul este asociat cu `@air-post-srl/bayshop`, ID
`79eb6e37-5652-4b5a-80df-861842515e10`; sesiunea Expo de pe Mac este `bayshop.com`.
Certificatul și profilul iOS sunt configurate. Păstrează proiectul și identitatea
aplicației; o nouă inițializare nu este necesară. Node 24.19.0 este fixat pentru
compilare, iar numerele buildurilor se incrementează în EAS.

Din directorul proiectului, cu Node 24:

```sh
npm run check
npm run export:verify
npx expo install --check
npx eas-cli@latest whoami
npx eas-cli@latest project:info
npm run build:status
```

După validare, pentru a genera separat pachetele noi:

```sh
npm run build:android
npm run build:ios
```

Înregistrează rezultatul real în acest document după finalizare: versiune, număr
de build, link EAS, fișier local și verificarea semnării. Nu folosi linkurile versiunilor anterioare
ca dovadă a compilării 0.4.1. Rulează `npm run devices:ios` numai dacă trebuie
înregistrat un alt dispozitiv.

Nu revoca certificate folosite de alte aplicații. Nu introduce chei sau tokenuri
în `extra`, în Git ori în arhiva de compilare. `.easignore` exclude documentația,
testele, fișierele locale și acreditările. Directoarele native sunt generate de
Expo, nu întreținute manual.

## Verificarea nativă 0.4.1

Pe iPhone sunt confirmate de utilizator animația la pornire, haptica, copierea
adreselor și meniul de jos. Lista de mai jos rămâne un plan de regresie complet,
nu o declarație că fiecare scenariu a trecut. Pachetul Android este disponibil;
verificarea pe telefon rămâne de efectuat.

Verifică pornirea la rece până la logare, animația colet → logo, Reduce Motion,
haptica numai cât aplicația este în prim-plan, afișarea/ascunderea parolei,
eroarea de autentificare și intrarea în demo. Repetă la revenirea din fundal;
fluxul nu trebuie să rămână blocat. Verifică iconul centrat și pagina de adrese:
câmpuri afișate direct, copiere pe câmp și integrală, actualizare la schimbarea
depozitului și bara de jos permanent disponibilă în această pagină. Testează
conținutul copiat prin lipire într-o notiță locală: trebuie să corespundă adresei
selectate și identității proprietarului, fără pași de personalizare. Nu include
identitatea personală în rapoarte sau capturi distribuite. Adresa privată și
suplimentul de 20 USD trebuie să apară numai pentru SUA.
Urmează [scenariile complete](testare-demo.md).

În aplicația instalată, copierea folosește clipboardul nativ. Previzualizarea web
depinde de permisiunile și capabilitățile browserului; dacă nu poate copia,
afișează instrucțiuni pentru selectarea manuală. Acest rezultat în browser nu
înlocuiește testul copierii pe Android/iPhone.

## Compatibilitate și distribuție

SDK 58 are ca bază Android 7+ și iOS 16.4+; aspectul materialelor se adaptează
capabilităților sistemului. Testează versiunea concretă a fiecărui telefon, inclusiv
Reduce Motion, Reduce Transparency și text mărit.
[Referință SDK 58](https://docs.expo.dev/versions/v58.0.0/)

TestFlight este o alternativă pentru distribuție mai largă și necesită build cu
profil `store` și configurare în App Store Connect. Nu este configurat pentru
aceste instalări ad hoc. Publicarea în magazine rămâne blocată în `app.config.ts`.
[TestFlight prin EAS](https://docs.expo.dev/submit/ios/)
