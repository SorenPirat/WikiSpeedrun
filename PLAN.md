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
3a. **Deployment på Netlify + Render** — Færdig
   - Netlify deployer frontendens `dist`-mappe og håndterer SPA-rewrite til `index.html`.
   - Render kører Node/WebSocket-serveren med `PORT` og `ALLOWED_ORIGIN`.
   - Produktionsklienten bruger `VITE_MULTIPLAYER_WS_URL` med `wss://`.
   - Healthcheck, WebSocket-forbindelse og et test-rum skal fungere online.

3b. **Visuel modernisering af brugerfladen** — Færdig
   - Godkendt retning: blødere hjørner, mere luft, diskrete overgange og tydelig fokus i både dark- og lightmode.
   - Elevens spil- og deltagelsesflow skal være responsivt på mobil; lærerens dashboard prioriterer desktop-visning.
   - Fælles stil for knapper, formularfelter, paneler, kort og mobil-elevflow er implementeret.

4. **Serverstyret spilstart, tidtagning og klikoptælling** — Færdig
5. **Rum, deltagere og lærerfunktioner** — Færdig
   - Lobby med åbne rum, aliasvalg efter rumvalg og oversigt over deltagere.
   - Lærerfunktioner til artikelvalg, nyt spil samt pause/fortsæt.
6. **Realtidsrangliste og statusvisning** — Færdig
   - Live deltagerstatus, ruter i lærerens venstre History-panel og grå pause-overlay hos elever.
   - Statuskolonne viser bl.a. I gang, Venter, Forladt spil og Færdig.
7. **Sikkerhed, dataminimering og driftssikkerhed** — Påbegyndt
   - Serveren validerer spilstatus og spillerens aktuelle artikel, mens selve Wikipedia-linket ikke slås op eksternt under et træk.
   - Deltager-tokens er bundet til deres oprindelige rum, afvises ved forsøg på genforbindelse til et andet rum eller med ugyldig værdi, og udløber praktisk når det inaktive rum slettes.
   - Serveren genkontrollerer rumstatus og spillerens aktuelle artikel, så pause-races og forældede klik ikke ændrer spillet.
   - Server-tests dækker også pause-resume og samtidige artikelklik/færdigmeldinger fra flere deltagere.
8. **Test, dokumentation og klargøring til drift** — Færdig (baseline-rettelse)
   - Typecheck, lint og build består.
   - 19/19 server-tests består, og typecheck samt lint består.
   - Browserregressionen er grøn: 14 testfiler med i alt 33 tests.
   - Rigtig multiplayer-E2E-test består separat med frontend-preview, Playwright-browser og WebSocket-server: lærer opretter rum, to deltagere deltager, artikelklik accepteres uden eksternt Wikipedia-opslag, en deltager overlever længerevarende WebSocket-udfald uden lokale artikelklik, reconnecter mens spillet er pauset og efter færdigmelding, den anden deltager forbliver forbundet, begge afslutter samtidigt, en færdig deltager overlever et nyt netværksudfald, ranglisten kan skjules og vises for deltagere, en deltager kan være offline under genstart og reconnecte til den nye runde, lærerens session genoptages efter reload og netværksudfald under pause, en spiller genoptager sidste artikel og route efter browserlukning med frosset tid, to samtidige rum holder deltagere, en ny deltager kan joine et igangværende spil på den autoritative startartikel, History og resultater isoleret, og serveren afviser tokens fra andre rum.
   - Timing-racen i `WikiArticleSurface` er rettet, så klar-status og `onReady` er synkroniseret.
   - Baseline-rettelserne omfattede countdown-testhelper, server-lint, fake WebSocket-lint og en Lingui-message-konflikt.
9. **Senere: InfoRace-spiltilstand** — Ikke påbegyndt

## Næste opgave

- Multiplayer: test join-regler under pause/countdown samt maksimal rumkapacitet.
- Multiplayer: bevar den akkumulerede klienttimer ved navigation mellem artikler; reconnect må fortsat initialisere tiden fra serveren.
- Multiplayer: tilføj lærerfunktion til at fjerne deltagere med lukning af forbindelsen og ugyldiggørelse af deltager-token.
