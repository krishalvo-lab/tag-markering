# Tag-markering

Gulmerker alle tags fra en Excel-, CSV- eller TXT-liste i mange PDF-er samtidig – for eksempel kabeltagger på tegninger lastet ned fra PIMS.

**Alt skjer lokalt i nettleseren.** PDF-ene og lista lastes ikke opp noe sted; siden bruker MuPDF (WebAssembly) til å lese og merke filene på din egen maskin.

## Bruk

1. Åpne siden i Edge eller Chrome.
2. **PDF-er:** velg en mappe, velg filer, eller dra inn PDF-er eller en ZIP fra PIMS.
3. **Tag-liste:** velg en `.xlsx`, `.csv` eller `.txt`. Har lista en overskrift som «Tag No», brukes den kolonnen automatisk; du kan krysse av flere kolonner (f.eks. From Tag og To Tag). En `.txt` med én tag per linje fungerer også. Du kan også kopiere celler i Excel og lime dem rett inn i tekstfeltet under lista (tillegg – filopplasting fungerer som før).
4. Trykk **Start markering**.
5. Last ned merkede PDF-er som ZIP, sammen med `Rapport.csv` (antall treff per tag og fil, og tags som ikke ble funnet). Valgte du en mappe i Edge/Chrome, lagres resultatet også rett i undermappen `Markert`.

## Dokumentnr-liste til PIMS

Når PDF-ene er valgt, gir **List dokumentnr** alle dokumentnumrene kommaseparert på én linje (`UPP-AIL-E-XT-00005-01, UPP-AIL-E-XT-00005-02`), klar til å lime inn i multi-søk i PIMS. Tag-liste trengs ikke.

- Nummeret leses fra tegningen, side for side (samle-PDF-er gir ett nr per side). Stemmer et nummer på siden med filnavnet, brukes det; ellers velges nummeret nærmest nedre høyre hjørne (tittelfeltet).
- Andre dokumentnr på siden (nabotegninger på match-linjer o.l.) holdes utenfor lista og vises som referanser.
- Skannede PDF-er uten tekstlag: nummeret tas fra filnavnet og merkes som det.
- Gjenkjenner `UPP-…` og `FUI-…`-nummer (Munin/Yggdrasil).

## Hvordan treffene finnes

- Bare hele ord: `AU350-3-021-01` markeres ikke inni `JAU350-3-021-01`.
- Store/små bokstaver spiller ingen rolle; parenteser, komma o.l. rundt taggen ignoreres.
- Virker på roterte sider.
- Gul highlight (55 % opasitet) med forfatternavn, som en vanlig markering i Adobe. Originalfilene endres ikke.
- Skannede tegninger uten tekstlag kan ikke søkes i.

## Lisens

AGPL-3.0, fordi siden bruker [MuPDF](https://mupdf.com) (AGPL-3.0). Se `LICENSE` og `vendor/mupdf/LICENSE`.
