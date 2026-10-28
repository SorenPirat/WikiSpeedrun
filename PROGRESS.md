# Fremdrift

## Implementeret

- Repositoryets struktur og centrale funktioner er analyseret.
- `AGENTS.md`, `PLAN.md` og `PROGRESS.md` er oprettet i det korrekte repository.
- Den minimale multiplayer-arkitektur er fastlagt i `ARCHITECTURE.md`.
- Hostingmodellen er valgt: Netlify til frontend og Render til multiplayer-serveren.
- Punkt 3 er implementeret: dansk standardinterface, dansk Wikipedia og enklere navigation.
- Multiplayer-serverens grundskelet er oprettet med `/health`, `/ws`, heartbeat og graceful shutdown.
- Rumoprettelse, rumkode, lærer-token og deltager-token er implementeret.
- Frontend-klient til WebSocket-forbindelse, opret rum og deltag i rum er tilføjet.
- Dansk multiplayer-side med lærer-/elevvalg, rumkode og deltagerliste er tilføjet.
- Serveren accepterer nu lærerens start- og slutartikel og sender indstillingerne til rummet.
- Læreren kan nu gemme start- og slutartikel fra multiplayer-siden.
- Læreren kan starte spillet; serveren sender statusen "running" og et centralt starttidspunkt.
- Elever kan melde sig færdige med klikantal; serveren beregner gennemførelsestiden.
- Deltagere sendes automatisk til Wikipedia-spilfladen, når læreren starter spillet.
- Når eleven vinder, sendes klikantal til serveren, og læreren kan se tid og klik.
- Multiplayer-rummet viser nu top 3 med gennemførelsestid og klik i realtid.
- Læreren kan slå ranglistens synlighed til og fra for eleverne.
- Elever kan nu genforbinde efter spilstart med deres deltager-token.
- Multiplayer-klienten genforbinder automatisk elever med eksponentiel ventetid efter forbindelsesbrud.
- WebSocket-serveren afviser beskeder over 64 KB.
- Render-serveren kræver nu `ALLOWED_ORIGIN`, når `REQUIRE_ALLOWED_ORIGIN=true`.
- Inaktive rum uden åbne forbindelser fjernes automatisk efter 30 minutter.
- WebSocket-klienter begrænses til 60 beskeder pr. 10 sekunder.
- Netlify- og Render-konfigurationer er tilføjet som `netlify.toml`, `render.yaml` og `.env.example`.
- Serveren validerer nu artikelrækkefølge og tæller hvert multiplayer-klik selv.
- Serveren kræver nu, at slutartiklen er nået, før en elev kan afslutte spillet.
- Læreren kan sætte et igangværende spil på pause og fortsætte det igen; elevernes klik blokeres under pause.
- Læreren kan nulstille et afsluttet spil og starte et nyt spil i samme rum.
- Deltagerlisten viser live-status for ventende, aktive, færdige og afbrudte elever.
- Serveren gemmer gennemførelsestidspunktet, som vises sammen med tid og klik.
- Netlify-frontend og Render-WebSocket-server er deployet og testet med lærer- og elevforbindelse.
- Artikelvælgerne genbruger eksisterende Wikipedia-autocomplete på dansk.
- Elever ser nu en lobby med åbne rum, deltagerantal og spillernavne.
- Alias vælges først efter eleven har valgt et konkret rum.
- Lærerens venstre History-panel viser deltagere, seneste artikel, rute, status og klik.
- Læreren kan pause og fortsætte spillet; elever får en grå overlay under pause.
- Nyt spil sender elever tilbage til multiplayer-lobbyen og nulstiller rute, timer og artikler.
- Terningvalg af start- og slutartikel gemmes samlet, når begge artikler er valgt.
- Lærerum kræver nu en serverkontrolleret adgangskode via `TEACHER_ACCESS_CODE` på Render.
- Første UI-modernisering er implementeret: knapper og formularfelter har blødere hjørner, overgange og tydelig tastaturfokus i dark- og lightmode.
- UI-paneler på multiplayer- og Wiki-sider har nu blødere kortform, diskret skygge og mere moderne visuel vægt.
- Indstillinger, statistik og navigation følger nu samme blødere panel- og afstandsstil.
- Elevens multiplayer-lobby, aliasvalg, rutevisning og artikelhoved kan nu ombrydes bedre på mobil.
- Elevens Wiki-spilside har nu mobilvenligere rutehoved, fast timer, rangliste og pause-overlay.
- Lobbyens og ranglistens tomme tilstande har nu et tydeligere, roligere kortudtryk.
- Elevens lobby viser nu kun de enkelte lobbykort uden et ekstra indlejret “Vælg et rum”-panel.
- Lobbykort på mobil får tydelig knapdybde med skygge og trykfeedback uden ekstra tekst, også i darkmode.
- Lobbykort viser nu kun deltagerantallet, som pulserer kort ved ændringer.
- Pause-overlayet er fastgjort til viewporten, så det centreres korrekt uanset artiklens scroll-længde.
- Serveren verificerer nu hvert multiplayer-træk mod den danske Wikipedia-API efter normalisering af artikeltitler.
- Wikipedia-opslag håndterer pagination, bruger 30 sekunders cache og har 5 sekunders timeout; ugyldige eller fejlslagne opslag afvises uden rute- eller klikændring.
- Serveren genkontrollerer rumstatus, spillerens aktuelle artikel og færdig-status efter langsom Wikipedia-validering, så pause-races ikke ændrer spillerens position.
- Baseline-rettelsen er afsluttet: typecheck, lint og build består, og 18/18 server-tests består.
- Baseline-rettelserne omfattede countdown-testhelper, server-lint, fake WebSocket-lint og en Lingui-message-konflikt.
- Verifikationen er dækket af server-tests: 19/19 består; typecheck og lint består.
- Browserregressionen er grøn med 13 testfiler og 31 tests.
- En rigtig multiplayer-E2E-test er tilføjet med Playwright, frontend-preview og en rigtig WebSocket-server; den gennemfører lærer/elev-flowet og verificerer serverens History-rute.
- Ved afviste multiplayer-artikelklik sender serveren nu den autoritative aktuelle artikel; klienten trimmer lokal historik og navigerer tilbage til den.
- Resynkronisering ved afvist link er dækket af multiplayer-E2E-testen; både afvist og accepteret navigation testes.
- Reconnect efter side-reload genopretter nu den aktive multiplayer-session, genbruger deltager-tokenet og sender efterfølgende gyldige klik til serveren.
- Multiplayer-E2E-testen dækker nu hele scenariet med afvist klik, reload, token-genbrug, reconnect og opdateret lærerhistorik.
- Multiplayer-E2E-testen simulerer nu et WebSocket-netværksbrud uden side-reload og verificerer automatisk reconnect, hvorefter eleven kan fortsætte spillet.
- Klienten eksponerer nu forbindelsesstatusserne for UI’en; multiplayer- og Wiki-sider viser, når forbindelsen forbinder eller forsøger at genoprette forbindelsen.
- Direkte klienttest dækker overgangen `connecting → connected → disconnected`.
- Ved længerevarende offline-status blokeres artikelklik lokalt, så rute og historik ikke kommer foran serverens autoritative position.
- Playwright-testen afviser flere reconnect-forsøg, viser offline-status, genåbner forbindelsen og verificerer fortsat spil uden side-reload.
- Pause-overlay og spilstatus bevares under reconnect; læreren kan fortsætte spillet efter deltagerens genforbindelse.
- Multiplayer-E2E-testen dækker nu to samtidige deltagere: Anna reconnecter under pause, Bo forbliver forbundet, og begge gennemfører efterfølgende gyldige træk, som vises i lærerens History.
- Multiplayer-E2E-testen verificerer samtidig afslutning: begge deltagere navigerer til slutartiklen parallelt, bliver registreret som færdige, og vises med ét klik hver i lærerens rangliste.
- Serveren markerer nu rummet som `finished`, når alle deltagere har afsluttet, så læreren kan starte et nyt spil. E2E-testen verificerer, at reset returnerer rummet til ventestatus og nulstiller ruter, status, klik og rangliste.
- E2E-testen verificerer ranglistens synlighed: begge deltagere ser ranglisten som standard, læreren kan skjule den for deltagere, læreren ser den fortsat, og den kan vises igen.
- En færdig deltager kan nu genindlæse sin side og genforbinde med samme token; E2E-testen bekræfter, at slutartikel og rangliste bevares før læreren nulstiller spillet.
- E2E-testen dækker nu også et netværksudfald hos en færdig deltager: reconnect-forsøg registreres, forbindelsen genåbnes, og deltagerens session kan derefter reloades og nulstilles sammen med resten af rummet.
- E2E-testen verificerer genstart med offline deltager: Bo er afbrudt, da læreren starter den nye runde, reconnecter bagefter med samme token og kan gennemføre et gyldigt træk i den nye runde.
- En separat E2E-test opretter to samtidige multiplayer-rum og bekræfter, at Anna og Bo kun vises i deres eget rum, og at History/resultater ikke krydser rumgrænsen.
- Server-testen bekræfter, at et token fra rum A afvises i rum B med `invalid_participant_token`, mens samme token stadig kan genforbinde korrekt til rum A.
- Token-livscyklussen er dækket: ugyldigt token afvises i korrekt rum, token fra et andet rum afvises, token genbruges ved reconnect, og token bliver ubrugeligt efter rum-sletning.
- E2E-testen verificerer lærer-reconnect: samme lærertoken og rum genvindes efter reload, `running`-status bevares, og History viser fortsat begge deltageres positioner.
- Lærerens automatiske reconnect er rettet: den aktive klient gemmer teacher-state efter rumoprettelse og planlægger reconnect for både lærer- og deltager-sessioner. E2E-testen bekræfter pause-status og pause-overlay under lærerens netværksudfald.
- Server-testen dækker pause-resume og samtidige artikelklik/færdigmeldinger; rummet ender konsistent som `finished`, og begge deltagere registreres med ét klik.
- Aktive rum vises nu i deltagerlobbyen, og nye deltagere kan joine et `running`-rum med serverens startartikel, tom rute og 0 klik; countdown, pause og afsluttede rum afvises fortsat.
- Servertesten verificerer lobbylisten og join-mid-game, og multiplayer-E2E-suiten består nu med 4/4 scenarier.
- Ved deltager-disconnect fryser serveren spillerens individuelle tid; ved reconnect genoprettes sidste artikel og hele route, også efter en fuld browserlukning.
- Klientens stopwatch nulstiller ikke længere den akkumulerede tid, når spilleren navigerer til næste artikel; kun reconnect med serverens elapsed-tid initialiserer uret.
- Læreren kan nu fjerne en deltager fra History; deltagerens socket lukkes, sessionen fjernes fra rummet, og det gamle token kan ikke bruges til reconnect. En ny browserforbindelse til samme deltager erstatter samtidig den gamle socket.
- Multiplayer-fejlbeskeder forsvinder automatisk efter fem sekunder og ryddes straks, når eleven forsøger at deltage i et nyt rum.
- Deltagerlobbyens live-tæller vises nu også inde i rummet som en pulserende `x/50 deltagere`-status.
- Ranglisten er nu skjult for elever som standard i nye rum; læreren kan aktivere den med den eksisterende checkbox.
- Timing-racen i `WikiArticleSurface` er rettet, så `onReady` først signalerer klar, når artikeloverfladens status er opdateret.

## Fungerer

- Singleplayer-spil med start- og slutartikel.
- Direkte Wikipedia-opslag og artikelnavigation.
- Lokal tidtagning, pause under indlæsning, historik og klikoptælling.
- Flersproget interface via Lingui og lokal persistens via Zustand.
- Browser- og end-to-end-tests samt Wikipedia-mocks.
- Server-tests er kørt uden fejl: 19/19 består; typecheck og lint består. Multiplayer-browserregressionen er grøn med 4/4 tests.

## Kendte problemer

- Multiplayer-træk foretager ikke længere et eksternt Wikipedia-opslag på serveren; det reducerer latency og falske afvisninger, mens serveren fortsat håndhæver spilstatus og autoritativ artikelrækkefølge.
- Den samlede sikkerheds- og driftsgennemgang er endnu ikke afsluttet; den resterende multiplayer-test dækker primært pause/countdown-join og maksimal rumkapacitet.
- Dataminimering og restart-adfærd er dokumenteret; serveren bruger kun midlertidig hukommelse til multiplayer-data.
- Netlify- og Render-deployment fungerer; produktionsmiljøet bruger `VITE_MULTIPLAYER_WS_URL` og `ALLOWED_ORIGIN`.
- Multiplayer-gennemførelsestid og resultater er serverstyrede; den eksisterende singleplayer-tid er fortsat lokal.
- Interface og Wikipedia-standard er nu dansk; fuld oversættelse af ældre sekundære tekster fortsætter løbende.
- Den nye multiplayer-E2E-test består separat. Øvrige E2E-fejl uden for multiplayer er bevidst sat uden for den aktuelle arbejdsafgrænsning.

## Næste opgave

- Multiplayer: test join-regler under pause/countdown samt maksimal rumkapacitet.
