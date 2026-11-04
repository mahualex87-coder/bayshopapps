# Logo oficial BayShop

Sursa vectorială este [logo-mob.svg de pe bayshop.com](https://bayshop.com/img/svg/logo-mob.svg),
descărcată la 1 noiembrie 2026 și păstrată nemodificată în `official-logo.source.svg`.
Pagina oficială `https://bayshop.com/us/` declară aceeași adresă drept logo în
datele sale structurate și folosește aceeași geometrie în antetul mobil.
Aceasta corespunde logo-ului din captura furnizată de utilizator și include
complet liniile din stânga, tăiate în captură.

Sursa are `viewBox="0 0 441 392.06"`, culoarea oficială `#DF4546` și un contur
compus `evenodd`: coșul și liniile albe sunt spații transparente. Geometria nu
a fost redesenată. Exporturile folosesc doar scalare uniformă și translație;
masca monocromă schimbă culoarea conform cerințelor Android.

## Centrarea iconurilor de pe ecranul telefonului

Iconurile folosesc centrul optic al corpului circular, nu centrul dreptunghiului
care include liniile de viteză din stânga. Ancora sursei `(244.2, 196.06)` este
aliniată exact cu `(512, 512)` în fiecare icon. Ea este determinată din arcul
exterior drept al vectorului oficial; liniile din stânga rămân integral vizibile.
Geometria SVG și culoarea roșie oficială `#DF4546` sunt păstrate.

- `icon.png`: 1024 × 1024, RGB opac; logo roșu pe fundal alb, fără colțuri
  rotunjite desenate. Lățimea completă a logo-ului este 820 px, cu corpul circular
  centrat. Limitele rasterului colorat sunt x=57…877, y=147…876.
- `adaptive-foreground.png`: 1024 × 1024 RGBA; logo roșu transparent, lățime
  540 px. Limite raster: x=213…752, y=272…751. Raza maximă a oricărui pixel
  vizibil este 306,04 px, sub raza sigură Android de 312,89 px (66/108 din latură).
  **Se combină cu `adaptiveIcon.backgroundColor: "#FFFFFF"`.**
- `adaptive-monochrome.png`: 1024 × 1024 RGBA; aceeași geometrie și amplasare,
  alb pe transparent. Sistemul aplică propria culoare pentru iconițele tematice.
- `splash.png`: 1024 × 1024 RGBA; logo roșu transparent, lățime 860 px.
- `brand-mark.png`: 512 × 455 RGBA; logo oficial în proporțiile sale, pentru
  antet și alte suprafețe deschise. Folosește `resizeMode="contain"`.
- `brand-mark.svg`: copie nemodificată a sursei oficiale, pentru consumatori SVG.

`generate-assets.mjs` regenerează numai cele trei iconuri pentru ecranul telefonului
(`icon`, `adaptive-foreground`, `adaptive-monochrome`) din sursa oficială. Verifică
zona sigură Android, dimensiunile, lipsa transparenței în iconul iOS și suprapunerea
exactă a măștilor color/monocrom. Nu modifică `brand-mark`, `splash` sau resursele
animației de pornire, care au amplasări separate.

Folosește o instalare existentă `sharp`, fără dependențe adăugate aplicației;
calea poate fi furnizată prin `SHARP_MODULE`.

## Pornirea 0.4.0 și 0.4.1

`launch-parcel.png` și `launch-parcel.svg` reprezintă coletul inițial. Configurația
Expo folosește PNG-ul la lățimea de 240, pe fundalul `#F8F9FC`, pentru continuitate
cu scena animată. `splash.png` rămâne resursa anterioară, nu imaginea selectată
în configurația 0.4.0/0.4.1.

`src/features/launch/logoPaths.ts` conține contururi compatibile pentru
transformarea coletului. Animația din `LaunchExperience.tsx` transformă conturul
exterior spre un cerc, apoi face trecerea către vectorul și imaginea logo-ului
oficial. Vectorul rămâne sub `brand-mark.png`, astfel încât decodarea imaginii
să nu lase un gol. Reduce Motion folosește varianta statică;
haptica apare numai în prim-plan, dacă sistemul o permite.

Pachetul iPhone 0.4.0 (5) este finalizat, cu arhiva și semnătura verificate.
Versiunea 0.4.1 păstrează aceste resurse și schimbă numele afișat sub icon în
**BayShop**, cu identificatorii aplicației neschimbați. iPhone 0.4.1 (6) este
finalizat, cu arhiva, semnătura și numele afișat verificate. Utilizatorul a
confirmat animația la pornire și haptica pe iPhone 0.4.1: „Da, funcționează”.
Confirmarea nu acoperă separat iconurile, Reduce Motion/Transparency sau
auditul complet de accesibilitate. Android 0.4.1 (5) este finalizat; manifestul
și toate variantele numelui afișat confirmă **BayShop**. Testarea iconurilor și
pornirii pe telefonul Android rămâne deschisă.
Previzualizarea din browser nu confirmă ecranul nativ de pornire sau haptica.
