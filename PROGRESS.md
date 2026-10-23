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
- WebSocket-serveren afviser beskeder over 64 KB.
- Netlify- og Render-konfigurationer er tilføjet som `netlify.toml`, `render.yaml` og `.env.example`.
- Serveren validerer nu artikelrækkefølge og tæller hvert multiplayer-klik selv.
- Serveren kræver nu, at slutartiklen er nået, før en elev kan afslutte spillet.
- Netlify-frontend og Render-WebSocket-server er deployet og testet med lærer- og elevforbindelse.
- Artikelvælgerne genbruger eksisterende Wikipedia-autocomplete på dansk.

## Fungerer

- Singleplayer-spil med start- og slutartikel.
- Direkte Wikipedia-opslag og artikelnavigation.
- Lokal tidtagning, pause under indlæsning, historik og klikoptælling.
- Flersproget interface via Lingui og lokal persistens via Zustand.
- Browser- og end-to-end-tests samt Wikipedia-mocks.
- Server-tests og MultiplayerClient-browser-testen er kørt uden fejl hos udvikleren.

## Kendte problemer

- Serveren validerer artikelrækkefølge og slutartikel, men kontrollerer endnu ikke, om hvert rapporteret link faktisk findes på Wikipedia-artiklen.
- Netlify- og Render-deployment fungerer; produktionsmiljøet bruger `VITE_MULTIPLAYER_WS_URL` og `ALLOWED_ORIGIN`.
- Multiplayer-gennemførelsestid og resultater er serverstyrede; den eksisterende singleplayer-tid er fortsat lokal.
- Interface og Wikipedia-standard er nu dansk; fuld oversættelse af ældre sekundære tekster fortsætter løbende.

## Næste opgave

- Gennemgå sikkerhed, dataminimering og driftssikkerhed for Netlify/Render.
