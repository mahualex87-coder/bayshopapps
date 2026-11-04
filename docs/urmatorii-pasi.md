# Următorii pași BayShop

## În lucru: QA complet al integrării existente

Comparație cu site-ul și sursa backend pentru câmpuri, sume, stări, documente,
limbi și permisiuni; regresii în browser și pe telefoanele fizice. Compilarea
singură nu închide QA-ul. Urmărirea detaliată este în api-operations-map.md și
instalare-telefoane.md. Limita specială de 39 a contului proprietarului rămâne
neschimbată, conform confirmării sale.

## După închiderea QA: Google și Apple

Cerere explicită a utilizatorului din 2 noiembrie 2026: adăugarea autentificării
și înregistrării cu Google și Apple, după terminarea QA-ului existent.

Implementarea trebuie să folosească fluxurile native și contractele BayShop
pentru identitatea furnizorului, să distingă un cont nou de unul existent,
să trateze anularea și erorile și să verifice asocierea conturilor fără duplicate.
Configurările furnizorilor și identificatorii se verifică înainte de integrare.
Aceste funcții nu sunt incluse în 0.6.2 și nu sunt declarate testate.
