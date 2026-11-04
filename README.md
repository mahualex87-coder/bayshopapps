# BayShop Mobile

Aplicație internă Android și iPhone, construită cu React Native, TypeScript,
Expo SDK 58 și Expo Router. Interfață în română, rusă și engleză.

[Instalare pe telefoane](docs/instalare-telefoane.md) · [Harta operațiilor și limitele verificării](docs/api-operations-map.md) · [Contractele API](docs/api-integration.md)

## Versiunea curentă: 0.6.2, în verificare

Sursa conectează contul BayShop real prin HTTPS: profil, colete în așteptare,
stoc, expedieri, primite, adrese, sold, fidelitate, declarații și documente.
Salvările din aplicația nativă modifică datele reale la acțiunea utilizatorului.
Previzualizările sintetice sunt separate; rezultatele lor nu confirmă operațiile
în producție sau comportamentul pe telefon.

0.6.0 nu este recomandată: utilizatorul a raportat închiderea pe iPhone după
logare. Testele au reprodus o eroare în absența Intl.PluralRules pe Hermes;
implementarea include acum o alternativă compatibilă. Confirmarea fizică a
remedierii rămâne necesară. 0.6.1 este păstrată ca artefact intermediar și nu
include toate corecțiile confirmate ulterior din codul serverului.

0.6.2 include:

- Înregistrare și recuperare cu formulare native, validare și mesaje din server.
  Contractul celor patru câmpuri de înregistrare este verificat în codul backend.
  Crearea efectivă a unui cont și livrarea emailului nu au fost testate în producție.
- Facturile expedierii sunt accesibile numai în starea cerută de backend;
  declarațiile respectă separat starea și restricția unei singure cutii la editare.
- Editarea codului de acces al coletului așteptat folosește ruta și câmpul exact
  din backend, cu reverificarea permisiunii înainte de salvare.
- Greutatea fizică și volumetrică este convertită conform unității fiecărei rute.
  Moneda produselor nu este dedusă din moneda transportului când API-ul o omite.
- Destinația de ridicare, adresa destinatarului, valoarea produselor, transportul,
  taxele de import și totalul sunt afișate distinct, fără dublarea taxelor.

## Navigare și funcții

Bara de jos păstrează **Așteptare, În stoc, Trimise, Primite** și rămâne
vizibilă în cabinet și în detalii. Meniul lateral conține celelalte secțiuni.
Listele au căutare, filtre și pagini de 20 de înregistrări; căutarea locală
este etichetată ca fiind în selecția încărcată.

Adresele depozitelor sunt citite din contul autentificat, cu copiere pe câmp sau
integrală. Cerința facturii fiscale este preluată din configurația depozitului;
factura și documentele vamale sunt tratate separat. Fidelitatea folosește punctele,
pragurile și tarifele API, fără a inventa o dată de expirare.

Logo-ul oficial este folosit în icon, antet și pornire. Animația colet → logo
durează aproximativ patru secunde. Liquid Glass nativ se folosește pe iOS 26+
când este disponibil; celelalte platforme folosesc materialul compatibil.
Opțiunile Reduce Motion și Reduce Transparency sunt respectate în implementare.
Haptica și accesibilitatea versiunii curente necesită verificare fizică.

## Limite cunoscute

- Contul proprietarului are o limită specială de 39 de înregistrări primite în
  selecția API. La cererea sa, această setare rămâne neschimbată și nu este tratată
  ca defect al contului. Paginarea reală pe server rămâne necesară pentru volume mari:
  ruta actuală ignoră page/perPage. Un patch separat este pregătit pentru review.
- Unele texte de taxe și detalii sunt generate/cache-uite în limba contului de
  către server, chiar dacă aplicația cere altă limbă. Catalogul local RO/RU/EN
  este activ; exportul dicționarului server nu este disponibil printr-o rută
  publică verificată. Nu se pretinde traducerea integrală a tuturor răspunsurilor.
- Plățile și rambursările deschid pagina oficială când continuarea API nu este
  verificată. Notificările push și un chat propriu de suport nu sunt implementate.
- Unele opțiuni IT/PL și livrarea locală din checkout necesită contracte suplimentare.
- Testele sintetice ale fișierelor nu confirmă transferul binar pe iPhone/Android.
  Nicio comandă, expediere ori factură reală nu a fost creată pentru QA.

Codul backend a fost consultat prin Atlassian/Bitbucket, repository
[bayshop/bayshop](https://bitbucket.org/bayshop/bayshop), la revizia
175a0469f4ddd9252f0e3980c613f3932b47f945. Aceasta nu certifică revizia instalată
în producție. Patchurile locale pentru server nu sunt publicate sau aplicate.

## Dezvoltare și verificare

Folosește Node.js 24 LTS conform .nvmrc și instrucțiunilor din AGENTS.md.

```sh
npm ci
npm run check
npm run export:verify
npm start
```

`check` rulează ESLint, TypeScript și testele. Exportul produce codul și resursele
Android/iOS/web, nu un pachet semnat. Starea finală a compilărilor și testelor
fizice este în [ghidul de instalare](docs/instalare-telefoane.md).

Codul este organizat în src/app (rute), src/api (transport și contracte),
src/features/live (ecrane reale), src/navigation (navigare), src/i18n (limbi),
src/features/launch (pornire) și tests (regresii). Datele istorice demonstrative
sunt izolate în src/state; nu reprezintă contul autentificat.

## Distribuție

Proiectul EAS este @air-post-srl/bayshop. Profilul preview produce APK Android
și IPA iOS ad hoc, cu codul inclus și numere de build incrementate automat.
Identitatea internă com.bayshop.mobile.demo este păstrată, separat de aplicațiile
publicate în magazine. Nu este necesar același Wi-Fi sau Mac-ul pornit.

Publicarea în magazine este blocată în app.config.ts. Înaintea lansării trebuie
confirmate identificatorii și semnarea aplicațiilor existente, finalizate testele
fizice și operațiile reale, pregătite paginile de magazin și informațiile despre
confidențialitate. Istoricul versiunilor și linkurile arhivate sunt păstrate în
[ghidul de instalare](docs/instalare-telefoane.md).
