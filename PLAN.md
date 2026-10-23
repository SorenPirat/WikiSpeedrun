# Implementeringsplan

Status: **Ikke påbegyndt** eller **Færdig**.

1. **Undersøg eksisterende repository og teknologi** — Færdig
   - React 19, TypeScript, Vite, Zustand, TanStack Query og Lingui.
   - Wikipedia indlæses direkte via `w/api.php`; artikler vises som renset/tilpasset HTML.
   - Lokal tidtager bruger `performance.now()` og pauser under artikelindlæsning.
   - Eksisterende klikoptælling, historik, resultater, URL-deling, mocks og tests kan genbruges.
2. **Fastlæg minimal multiplayer-arkitektur** — Færdig
   - Se `ARCHITECTURE.md`; central Node.js/WebSocket-server, genbrug af frontend og Wikipedia-kald, og serveren er autoritativ for rum, spilstart, tid, klik, status og rangliste.
3. **Dansk og forenklet brugerflade** — Færdig
   - Dansk interface og `da.wikipedia.org` som fast standard; sprogvalg er skjult i hovedflowet.
3a. **Deployment på Netlify + Render** — Ikke påbegyndt
   - Netlify deployer frontendens `dist`-mappe og håndterer SPA-rewrite til `index.html`.
   - Render kører Node/WebSocket-serveren med `PORT` og `ALLOWED_ORIGIN`.
   - Produktionsklienten bruger `VITE_MULTIPLAYER_WS_URL` med `wss://`.
   - Healthcheck, WebSocket-forbindelse og et test-rum skal fungere online.

4. **Serverstyret spilstart, tidtagning og klikoptælling** — Ikke påbegyndt
5. **Rum, deltagere og lærerfunktioner** — Færdig
6. **Realtidsrangliste og statusvisning** — Færdig
7. **Sikkerhed, dataminimering og driftssikkerhed** — Ikke påbegyndt
8. **Test, dokumentation og klargøring til drift** — Ikke påbegyndt
9. **Senere: InfoRace-spiltilstand** — Ikke påbegyndt
