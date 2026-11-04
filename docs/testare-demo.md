# Testarea aplicației BayShop

Pentru formulare, comenzi și operațiuni folosește date de exemplu. Aplicația nu
efectuează plăți reale, nu expediază colete și nu trimite mesaje către BayShop.
În pachetul intern personal 0.4.1, adresele depozitelor sunt oficiale și includ
direct numele și codul proprietarului. Nu copia identitatea personală în rapoarte
generale sau capturi distribuite.

## Versiunea și mediul testat

- **0.4.1 — pachete finalizate, iPhone confirmat parțial:** textele repetitive au fost simplificate, numele
  afișat este BayShop, iar Setări → Despre aplicație explică starea locală.
  Catalogul adreselor acoperă șase țări și date verificate la 1 noiembrie 2026,
  cu identitatea proprietarului inclusă direct. Adresa privată este numai pentru
  SUA, cu supliment de 20 USD/colet. **36/36 teste automate** și exportul final
  Android/iOS/web au trecut. Browserul confirmă adresele directe fără formular,
  migrarea corectă a textelor/listelor și lipsa erorilor noi în consolă. iPhone
  build **6** este FINISHED, cu IPA-ul verificat: ZIP, semnătură, profil, nume
  BayShop, identitate și module native. Utilizatorul a confirmat pe iPhone
  animația la pornire, haptica, copierea adreselor și meniul de jos:
  „Da, funcționează” (1 noiembrie 2026). Confirmarea nu acoperă auditul complet
  de accesibilitate sau toate cazurile de margine. Android versionCode **5**
  este FINISHED: ZIP-ul, manifestul, numele BayShop și conținutul APK-ului au
  trecut verificarea. Semnătura criptografică Android nu a fost verificată
  independent; testarea fizică Android 0.4.1 rămâne deschisă.

- **0.2.0:** aplicațiile semnate au fost instalate pe Android și iPhone;
  utilizatorul a confirmat că ambele funcționează.
- **0.3.0:** **30/30 teste automate trecute**; Android versionCode 3 și iPhone build
  4 sunt FINISHED, cu artefactele verificate. Pe iPhone, utilizatorul confirmă
  noul meniu și designul: „Arată bine și funcționează”. Nu este o confirmare a
  întregului audit de accesibilitate. Testarea fizică Android 0.3.0 rămâne deschisă.
- **0.4.0:** logare compactă cu antet glass, pornire colet → logo oficial cu
  feedback haptic discret, icon de telefon centrat optic și adrese de depozit
  afișate direct cu butoane de copiere. Bara de jos rămâne disponibilă pe pagina
  adreselor. Verificarea proiectului a trecut cu **30/30 teste**, Expo Doctor cu
  **20/20 verificări**, iar exportul final pentru toate platformele a reușit.
  Pornirea, adresele afișate direct și bara de jos au trecut verificarea în
  browser la lățimi de 320 și 390, fără erori noi în consolă. iPhone build **5**
  este FINISHED: arhiva, semnătura, profilul și modulele native au fost verificate.
  Android versionCode **4** este de asemenea FINISHED, cu APK-ul verificat.
  Testarea fizică rămâne în așteptare; haptica și clipboardul nativ nu au fost
  încă validate pe dispozitive.

Instalarea și linkurile versiunilor disponibile sunt în
[ghidul pentru telefoane](instalare-telefoane.md). Previzualizarea web locală
`http://192.168.1.210:8767` funcționează numai cât serverul de pe Mac este pornit,
adresa rămâne aceeași și telefonul este în aceeași rețea. Ea nu verifică efectele
sau gesturile native.

## Autentificare

În 0.4.1 apasă **Explorează aplicația** (în versiunile anterioare **Explorează demo**) sau folosește:

- Email: `demo@bayshop.test`
- Parolă demonstrativă: `BayShopDemo!`

Parola greșită trebuie să afișeze eroare. Crearea profilului validează câmpurile,
dar nu salvează parola; accesul ulterior rămâne demonstrativ. Recuperarea nu
trimite email. După deconectare, Înapoi nu trebuie să redeschidă cabinetul.

## Verificări 0.4.1

Confirmate de utilizator pe iPhone: animația la pornire, haptica, copierea
adreselor și meniul de jos. Scenariile detaliate de mai jos includ și condiții
care nu au fost încă raportate ca testate, precum Reduce Motion, revenirea din
fundal, VoiceOver și toate variantele copierii.

1. Închide complet aplicația și pornește-o din icon. Verifică transformarea
   vectorială colet → logo oficial și continuarea până la ecranul de logare,
   fără blocare sau afișarea prematură a cabinetului.
2. Activează **Reduce Motion** și repetă pornirea. Varianta redusă trebuie să
   permită intrarea rapidă, fără transformare amplă; verifică și Reduce Transparency.
3. Verifică feedbackul haptic discret pe telefon. Trimite aplicația în fundal în
   timpul pornirii și revino: nu trebuie să apară impulsuri întârziate în fundal,
   repetări nedorite sau blocarea ecranului. Lipsa hapticii când sistemul nu o
   permite nu trebuie să împiedice logarea.
4. În logarea compactă, afișează și ascunde parola. Valoarea introdusă trebuie
   păstrată, butonul trebuie etichetat corect pentru cititorul de ecran, iar
   tastatura să nu ascundă acțiunile.
5. Încearcă o parolă greșită și apoi accesul corect. Verifică eroarea clară,
   posibilitatea de corectare și accesul în cabinet. Repetă cu **Explorează aplicația**.
6. Verifică antetul glass și formularul pe ecran îngust, cu text mărit și cu
   VoiceOver/TalkBack. Testele din browser nu confirmă haptica sau materialul nativ.
7. Verifică iconul de pe ecranul principal al telefonului: corpul circular trebuie
   să fie centrat optic, iar liniile din stânga să rămână vizibile. Pe Android,
   verifică și decuparea adaptivă și varianta tematică, dacă sunt disponibile.
8. Din meniul din stânga deschide **Adresele depozitelor**. Câmpurile pentru țara
   selectată trebuie să apară direct, fără un pas „Vezi adresa” și fără fereastră
   suprapusă. Derulează până la ultimul câmp: cele patru destinații de jos rămân
   vizibile și funcționale.
9. Verifică numele și codul clientului direct în câmpurile țării selectate, fără
   formular de personalizare. Copiază separat numele, linia 1, linia care include
   codul clientului și codul poștal. Lipește într-o notiță locală: trebuie să se
   copieze numai valoarea aleasă, păstrând zerourile inițiale. **Copiat** și
   impulsul discret apar după succes; lipsa hapticii nu blochează copierea.
10. Apasă **Copiază tot**, apoi lipește într-o notiță. Câmpurile disponibile
    trebuie să apară pe linii distincte, fără linii inventate sau goale. Schimbă
    fiecare dintre cele șase țări și verifică formatul din cabinet. În SUA schimbă
    Depozit/Privată: adresa și suplimentul de 20 USD/colet se actualizează. În
    celelalte țări, alegerea Privată nu trebuie să apară. Confirmarea copierii
    precedente dispare la schimbarea selecției.
11. În previzualizarea web fără acces la clipboard, copierea trebuie să ofere
    selectare manuală și să nu pretindă **Copiat**. Valorile rămân selectabile.
    Un site local HTTP poate folosi această alternativă chiar când aplicația
    nativă copiază normal.
12. Copiază un câmp, apoi schimbă rapid depozitul sau pagina. Confirmarea unei
    cereri vechi nu trebuie să apară pe noua adresă. Din pagina adreselor accesează
    **Așteptare**, apoi revino prin meniu și verifică păstrarea navigării.

13. Verifică numele **BayShop** sub icon și secțiunea Setări → **Despre aplicație**,
    versiunea 0.4.1. Titlurile, filtrele și butoanele nu trebuie să repete „demo/test”.
    Confirmările plăților, documentele și mesajele de suport explică în continuare
    că operațiunea este locală și nu produce o plată, un document fiscal sau un
    mesaj trimis extern.
14. Actualizează peste versiunea deja instalată, apoi verifică păstrarea datelor
    salvate. Identificatorul și cheile stocării locale nu se schimbă. Adresele
    oficiale ale depozitelor trebuie să apară fără resetarea datelor utilizatorului.

Lista este un plan de verificare pentru 0.4.1. Confirmarea utilizatorului
acoperă numai cele patru funcții iPhone menționate mai sus; nu certifică
fiecare scenariu sau condiție din listă.
Catalogul și regulile formatării sunt în [documentația adreselor](adrese-depozite.md).

## Navigare introdusă în 0.3.0

1. Verifică cele patru destinații de jos: **Așteptare**, **În stoc**, **Trimise**,
   **Primite**. Bara rămâne disponibilă în detalii și formulare; în 0.4.0,
   consultarea adreselor de depozit nu o mai acoperă cu o fereastră separată.
2. Deschide meniul din stânga. Cumpărături, coș, sold, destinatari, adrese de
   depozit, calculator, cont, notificări, setări și suport trebuie să fie accesibile.
3. Deschide un colet și revino. Destinația selectată jos trebuie să corespundă
   etapei lui. O expediere în pregătire sau în vamă aparține secțiunii Trimise;
   după primire, detaliul trebuie să selecteze Primite.
4. Caută după denumire, ID sau tracking; deschide filtrele, schimbă depozitul și
   starea. Verifică numărul rezultatelor, starea goală și resetarea filtrelor.
5. Verifică logo-ul oficial în antet. După instalarea noului build, verifică și
   iconul Android/iOS și ecranul de pornire.

## Parcursul 1: cumpără prin link

1. Din meniul din stânga → **Cumpărături**, adaugă un produs fictiv, de exemplu
   `https://shop.example/test`, cu preț, cantitate și variante.
2. În coș, schimbă cantitatea și verifică sumarul. Transportul local și verificarea
   se calculează o dată pe rând; toate valorile sunt USD fictivi.
3. Confirmă comanda. Coșul se golește, comanda apare în listă, iar soldul scade.
4. În **Sold și facturi**, verifică tranzacția. Anularea unei comenzi în procesare
   trebuie să restituie suma o singură dată.

## Parcursul 2: de la recepție la livrare

1. Din **Așteptare**, adaugă un colet cu tracking, produse și document simulat.
   Deschide rândul lui pentru detalii și simulează recepția.
2. Verifică apariția în **În stoc**, cu greutate fictivă și depozitul corect.
3. Deschide **WH-1003**, completează declarația și salvează. Verifică trecerea din
   filtrul **De declarat** în **Gata de expediere**.
4. Pentru consolidare, selectează **WH-1001** și **WH-1002**, ambele din SUA.
   Parcurge colete → destinatar → transport → servicii → verificare.
5. La pasul destinatar, adaugă o adresă fictivă. După salvare trebuie să revii la
   același pas, cu coletele selectate păstrate; selectează noua adresă și continuă.
6. Apasă Înapoi din antet sau **Pasul anterior**. Trebuie să revii un pas,
   păstrând selecțiile. Schimbă o opțiune și verifică actualizarea sumarului.
7. Confirmă expedierea. Coletele dispar din stocul disponibil, iar în **Sold și
   facturi** apare factura neachitată. Soldul nu este încă debitat.
8. Achită factura demo; verifică soldul, istoricul și blocarea plății repetate.
9. În detaliul expedierii, avansează simulatorul de tracking până la **Primit**.
   Expedierea trebuie să dispară din Trimise și să apară în Primite. Detaliile,
   cronologia și documentele trebuie să rămână accesibile.

## Parcursul 3: protecția formularelor

1. În pregătirea expedierii, selectează colete și încearcă să schimbi secțiunea
   din bara de jos sau din meniu. Confirmarea de renunțare trebuie să apară.
2. Alege **Continuă editarea**: ruta și valorile trebuie păstrate. Repetă și alege
   **Renunță**: trebuie să ajungi la destinația cerută fără repetarea confirmării
   pentru același draft. Dacă abandonezi simultan un destinatar nou și expedierea
   nesalvată din spatele lui, fiecare draft distinct poate cere confirmare.
3. Repetă cu un destinatar nesalvat și cu o declarație modificată. Închiderea
   formularului nu trebuie să piardă datele fără confirmare.
4. Salvează normal: succesul trebuie să continue fluxul fără avertizare de abandon.
5. Pe Android verifică butonul fizic/sistem Înapoi. Pe iPhone verifică gestul
   Înapoi: în pașii expedierii revine întâi un pas, iar ieșirea protejează draftul.

## Parcursul 4: administrarea contului

1. Din meniu → **Destinatarii mei**, încearcă arhivarea unei adrese folosite de
   un colet activ; trebuie blocată.
2. Alimentează soldul cu o sumă de test; încearcă o retragere peste sold.
3. Marchează notificări ca citite și urmărește legătura către funcția asociată.
4. Salvează un mesaj în suport: el apare numai în conversațiile locale.
5. Repornește aplicația, reintră în demo și verifică păstrarea datelor salvate.
   Drafturile nesalvate nu sunt date persistente.
6. Din **Profil și cont**, resetează demonstrația prin confirmare pentru a
   readuce scenariile inițiale. Resetarea afectează numai acest demo local.

## Verificări native de regresie pentru 0.4.1

- iPhone compatibil iOS 26+: materialul Liquid Glass, textul și apăsările peste
  material. Pe iOS 18: alternativa compatibilă trebuie să rămână clară și utilizabilă.
- Reduce Transparency: material opac, fără pierderea focalizării sau a poziției
  meniului. Reduce Motion: tranziții reduse, fără blocarea navigării.
- VoiceOver/TalkBack: etichete și stare selectată pentru secțiuni; focalizare în
  meniu la deschidere și revenire la butonul meniu la închidere.
- Text mărit, ecran îngust, orientare și zone sigure: barele nu acoperă conținutul,
  câmpurile sau acțiunile; apăsările rămân accesibile.
- Tastatură, gestul/butonul Înapoi, confirmarea abandonului, adăugarea unui
  destinatar din wizard, revenire din fundal și repornire cu date salvate.

Înregistrează versiunea aplicației, telefonul, versiunea sistemului și rezultatul
fiecărui scenariu. Confirmarea iPhone 0.4.1 pentru pornire, haptică, copiere și
meniul de jos nu validează automat accesibilitatea, toate scenariile de logare
sau comportamentul Android. Exportul JavaScript nu înlocuiește testarea
pe dispozitiv.
