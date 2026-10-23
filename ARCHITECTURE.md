# Multiplayer-arkitektur

## Valgt løsning

WikiSpeedrun deployes som to services: Netlify hoster React/Vite-frontend-en som et statisk site, mens Render hoster den centrale Node.js-server med WebSocket-forbindelse. Docker på Synology er derfor ikke nødvendig for den planlagte drift.

Valget holder første version enkel:

- Frontend genbruger React, Zustand og den eksisterende Wikipedia-integration.
- Browserne henter fortsat artikelindhold direkte fra dansk Wikipedia.
- Serveren håndterer kun rum, deltagere, spilstart, status, resultater og tid.
- WebSocket bruges til realtidsopdateringer.
- Serverens hukommelse bruges som lager i første version; rum forsvinder ved genstart eller genstart af Render-servicen.
- Netlify Functions bruges ikke som multiplayer-server, fordi de er midlertidige request/response-funktioner.
- Persistens eller Redis kan tilføjes senere uden at ændre spilprotokollen.

## Roller og adgang

- Lærer opretter et rum og får en tilfældig rumkode samt en hemmelig lærer-token.
- Elever deltager med rumkode og et valgfrit kaldenavn.
- Elever får en separat deltager-token, så de kan genoprette forbindelsen uden konto.
- Lærerhandlinger kræver lærer-token; rumkoden alene giver ikke læreradgang.
- Kaldenavne valideres, begrænses i længde og vises kun i det aktuelle rum.
- Serveren gemmer ikke IP-adresser eller andre unødvendige personoplysninger.

## Serveransvar

Serveren er autoritativ for startartikel, slutartikel, spilstart, deltagere,
gennemførelsestid, antal artikelklik, færdig-status og ranglisteorden.

Klienten sender `join`, `start`, `article-loaded`, `article-click` og `finished`.
Serveren validerer rum, token og rækkefølge og sender derefter snapshots eller
små hændelser til alle i rummet.

## Spilforløb

1. Læreren opretter et rum og vælger start- og slutartikel.
2. Elever tilslutter sig med rumkode og kaldenavn.
3. Læreren starter spillet; serveren fastsætter `startedAt` én gang.
4. Klienterne viser tiden ud fra serverens starttid og egen monotone klokke.
5. Ved hvert gyldigt internt Wikipedia-link sendes en klik-hændelse.
6. Når slutartiklen er indlæst og valideret, sendes `finished`.
7. Serveren fastsætter sluttidspunktet og broadcaster status.
8. Færdige deltagere vises i ranglisten; øvrige kan fortsætte.

## Første versions afgrænsning

- Ét aktivt spil pr. rum.
- Ingen login, database, chat eller filupload.
- Ingen server-side proxy for Wikipedia i første version.
- Genforbindelse sker med deltager-token og seneste rum-snapshot.
- Rumstørrelse begrænses til højst 50 deltagere.
- Lærerens ranglisteindstilling (`visible`/`hidden`) styres af serveren.

## Drift og sikkerhed

- Netlify leverer HTTPS til frontend, og Render leverer HTTPS/WSS til multiplayer-serveren.
- Frontendens tilladte Netlify-origin konfigureres på WebSocket-serveren.
- Rumkoder og tokens genereres kryptografisk tilfældigt.
- Input, payload-størrelser og hændelsesfrekvens begrænses.
- Inaktive rum udløber automatisk.
- Netlify build-kommando er `npm run build`, og publish-mappen er `dist`. SPA-routes skal omskrives til `index.html`.
- Klienterne bruger `wss://` til Render-serveren i produktion. WebSocket-klienten skal kunne genforbinde med eksponentiel backoff, og serveren skal have et simpelt HTTP health-endpoint.

## Senere: InfoRace

InfoRace kan genbruge rum, roller, serverstart, tokens og rangliste. Den får en
ny spiltype med spørgsmål og servervaliderede svar.
