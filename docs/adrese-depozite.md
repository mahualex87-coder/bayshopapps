# Adresele depozitelor BayShop

Verificate la 1 noiembrie 2026 în dialogul **Adrese depozit** din [cabinetul BayShop](https://bayshop.com/storage/), cu sesiunea autorizată de utilizator. Nu au fost modificate date în cont.

Catalogul din `src/domain/warehouse-addresses.ts` păstrează exact valorile comune: stradă, oraș, regiune, cod poștal, țară, telefon și denumirea companiei unde există. Adresa privată este disponibilă doar pentru SUA; cabinetul indică un supliment de 20 USD pentru fiecare colet.

| Țară | Oraș | Unde se completează codul clientului |
| --- | --- | --- |
| SUA, depozit | Newark | Linia 2, după UNIT 200 |
| SUA, privată | Wilmington | Linia 2, după ST |
| România | Tomesti | La sfârșitul liniei 1 |
| Regatul Unit | Ingatestone | După numele și prenumele destinatarului |
| Italia | Roma | Linia 2 |
| Germania | Gorlitz | La sfârșitul liniei 1 |
| Polonia | Jelenia Gora | La sfârșitul liniei 1 |

La cererea explicită a proprietarului, versiunea internă personală include numele, prenumele și codul clientului din cabinetul inspectat. Nu există formular de personalizare: fiecare câmp și adresa completă pot fi copiate imediat. Această configurare este pentru pachetul intern al proprietarului; înainte de distribuirea către alți utilizatori, identitatea trebuie furnizată din sesiunea autentificată, nu din această configurație personală.

Codurile poștale rămân șiruri de caractere, păstrând zerourile inițiale. Formatarea păstrează prefixele/sufixele numelui afișate de BayShop, de exemplu AIRPOSTSRL pentru România și SUPERGLOBAL pentru Germania. Nu se inventează o a doua linie pentru țările unde site-ul nu o afișează.

Acesta este un catalog verificat la data menționată, nu o sincronizare automată. Pagina include un link către sursă și recomandă verificarea adresei în cabinet înaintea unei comenzi. Integrarea viitoare cu API-ul trebuie să livreze adresa actuală și datele personalizate din sesiunea autentificată.
