# Tag-markering

Gulmerker alle tags fra en Excel-, CSV- eller TXT-liste i mange PDF-er samtidig – for eksempel kabeltagger på tegninger.

**Alt skjer lokalt i nettleseren.** PDF-ene og lista lastes ikke opp noe sted; siden bruker MuPDF (WebAssembly) til å lese og merke filene på din egen maskin.

## Bruk

1. Åpne siden i Edge eller Chrome.
2. **PDF-er:** velg en mappe, velg filer, eller dra inn PDF-er eller en ZIP.
3. **Tag-liste:** velg en `.xlsx`, `.csv` eller `.txt`. Har lista en overskrift som «Tag No», brukes den kolonnen automatisk; du kan krysse av flere kolonner (f.eks. From Tag og To Tag). En `.txt` med én tag per linje fungerer også. Du kan også kopiere celler i Excel og lime dem rett inn i tekstfeltet under lista (tillegg – filopplasting fungerer som før).
   Under lista vises alle unike tags (duplikater fjernet, sortert). Klikk på en tag for å ta den ut, eller på en type for å slå av/på alle med samme mønster (f.eks. alle `A-HT…`). Verdier uten tall («(blank)», «ja») og områdekoder (`AP200`) er slått av fra start. Feltet under gir de valgte som `tag, tag, tag` med **Kopier** – og det er de samme som markeres.
4. Trykk **Start markering**.
5. Last ned merkede PDF-er som ZIP, sammen med `Rapport.csv` (antall treff per tag og fil, og tags som ikke ble funnet). Valgte du en mappe i Edge/Chrome, lagres resultatet også rett i undermappen `Markert`.

## Dokument nr liste

Når PDF-ene er valgt, gir **Dokument nr liste** alle dokumentnumrene kommaseparert på én linje (`UPP-AIL-E-XT-00005-01, UPP-AIL-E-XT-00005-02`), klar til å kopiere. Tag-liste trengs ikke.

- Nummeret leses fra tegningen, side for side (samle-PDF-er gir ett nr per side). Stemmer et nummer på siden med filnavnet, brukes det; ellers velges nummeret nærmest nedre høyre hjørne (tittelfeltet).
- Andre dokumentnr på siden (nabotegninger på match-linjer o.l.) holdes utenfor lista og vises som referanser.
- Skannede PDF-er uten tekstlag: nummeret tas fra filnavnet og merkes som det.
- Kan en PDF ikke leses (skadet, passordbeskyttet, låst av et annet program), tas nummeret fra filnavnet og feilen vises i rødt under lista.
- Gjenkjenner nummer som starter med `UPP-`, `FUI-`, `FPQ-`, `YGG-`, `IOC-`, `NOA-` eller `OPS-`, f.eks. `UPP-AIL-I-XE-50102-01`, `UPP-ET800-VB-00903`, `UPP-AIL-L-XN-A-92L00104A-08`, `YGG-SSN-00684`.

## Hvordan treffene finnes

- Bare hele ord: `AU350-3-021-01` markeres ikke inni `JAU350-3-021-01`.
- Store/små bokstaver spiller ingen rolle; parenteser, komma o.l. rundt taggen ignoreres.
- Virker på roterte sider.
- Gul highlight (55 % opasitet) med forfatternavn, som en vanlig markering i Adobe. Originalfilene endres ikke.
- Skannede tegninger uten tekstlag kan ikke søkes i.

## Lisens

AGPL-3.0, fordi siden bruker [MuPDF](https://mupdf.com) (AGPL-3.0). Se `LICENSE` og `vendor/mupdf/LICENSE`.
