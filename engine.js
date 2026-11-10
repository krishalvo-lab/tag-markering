// Markeringsmotor: finner tags som hele ord og legger på gule highlight-markeringer.
// Ren logikk uten DOM, slik at den kan kjøres både i Web Worker og i Node (tester).

export const YELLOW = [1, 0.92, 0.23];
export const OPACITY = 0.55;
const STRIP = new Set([..."\",;:()[]{}<>'"]);

const norm = (s) => s.replace(/ /g, " ").toLocaleLowerCase("nb");

// Del en linje (liste av tegn med quad) i ord, og fjern tegnsetting i kantene.
function lineWords(chars) {
  const words = [];
  let cur = [];
  const flush = () => {
    let a = 0, b = cur.length;
    while (a < b && STRIP.has(cur[a].c)) a++;
    while (b > a && (STRIP.has(cur[b - 1].c) || cur[b - 1].c === ".")) b--;
    if (b > a) {
      const cs = cur.slice(a, b);
      words.push({ text: norm(cs.map((x) => x.c).join("")), chars: cs });
    }
    cur = [];
  };
  for (const ch of chars) {
    if (/\s/.test(ch.c) || ch.c === " ") flush();
    else cur.push(ch);
  }
  flush();
  return words;
}

// Én quad fra første til siste tegn (virker også for rotert/vertikal tekst).
function spanQuad(first, last) {
  const f = first.q, l = last.q;
  return [f[0], f[1], l[2], l[3], f[4], f[5], l[6], l[7]];
}

/**
 * Marker tags på én PDF-side. Returnerer { tag: antall }.
 * tagList: [{ tag, tokens: [normaliserte ord] }]
 */
export function markPage(page, tagList, author, now) {
  const st = page.toStructuredText("preserve-whitespace");
  const lines = [];
  let chars = null;
  st.walk({
    beginLine() { chars = []; },
    onChar(c, origin, font, size, quad) { chars.push({ c, q: quad }); },
    endLine() { if (chars && chars.length) lines.push(lineWords(chars)); chars = null; },
  });

  // Indeks: første ord -> tags som starter med det ordet
  const byFirst = new Map();
  for (const t of tagList) {
    const k = t.tokens[0];
    if (!byFirst.has(k)) byFirst.set(k, []);
    byFirst.get(k).push(t);
  }

  const hits = {};
  const done = new Set();
  for (const words of lines) {
    for (let i = 0; i < words.length; i++) {
      const cands = byFirst.get(words[i].text);
      if (!cands) continue;
      for (const t of cands) {
        const n = t.tokens.length;
        if (i + n > words.length) continue;
        let ok = true;
        for (let j = 1; j < n; j++) if (words[i + j].text !== t.tokens[j]) { ok = false; break; }
        if (!ok) continue;
        const first = words[i].chars[0];
        const last = words[i + n - 1].chars.at(-1);
        const key = first.q.slice(0, 2).map(Math.round).join(",") + "|" + n;
        if (done.has(key)) continue;
        done.add(key);
        const a = page.createAnnotation("Highlight");
        a.setColor(YELLOW);
        a.setOpacity(OPACITY);
        a.setQuadPoints([spanQuad(first, last)]);
        a.setAuthor(author);
        a.setContents("");
        a.setCreationDate(now);
        a.setModificationDate(now);
        try { a.getObject().put("NM", "(" + crypto.randomUUID() + ")"); } catch (e) { /* valgfritt */ }
        a.update();
        hits[t.tag] = (hits[t.tag] || 0) + 1;
      }
    }
  }
  return hits;
}

export function prepareTags(tags) {
  return tags
    .map((tag) => ({ tag, tokens: norm(tag).split(/\s+/).filter(Boolean) }))
    .filter((t) => t.tokens.length);
}

/** Marker én PDF. Returnerer { hits, bytes|null, error|null }. */
export function markPdf(mupdf, data, tagList, author) {
  let doc;
  try {
    doc = mupdf.Document.openDocument(data, "application/pdf");
  } catch (e) {
    return { hits: {}, bytes: null, error: "kunne ikke åpnes (skadet eller ikke en PDF)" };
  }
  try {
    if (doc.needsPassword()) return { hits: {}, bytes: null, error: "passordbeskyttet" };
    const pdf = doc.asPDF();
    if (!pdf) return { hits: {}, bytes: null, error: "ikke en PDF" };
    const now = new Date();
    const hits = {};
    const n = pdf.countPages();
    for (let i = 0; i < n; i++) {
      const page = pdf.loadPage(i);
      for (const [t, c] of Object.entries(markPage(page, tagList, author, now))) hits[t] = (hits[t] || 0) + c;
      page.destroy?.();
    }
    let bytes = null;
    if (Object.keys(hits).length) {
      const buf = pdf.saveToBuffer("garbage=compact,compress");
      bytes = scrubProducer(buf.asUint8Array().slice());
      buf.destroy?.();
    }
    return { hits, bytes, error: null };
  } catch (e) {
    return { hits: {}, bytes: null, error: String(e && e.message || e) };
  } finally {
    doc.destroy?.();
  }
}

// Erstatt "% Written by MuPDF x.y.z"-kommentaren med mellomrom (samme lengde, xref holder).
function scrubProducer(b) {
  const pat = [...new TextEncoder().encode("% Written by MuPDF")];
  const lim = Math.min(b.length, 4096);
  outer: for (let i = 0; i < lim; i++) {
    for (let j = 0; j < pat.length; j++) if (b[i + j] !== pat[j]) continue outer;
    let k = i + 1;
    while (k < b.length && b[k] !== 10 && b[k] !== 13) b[k++] = 32;
    break;
  }
  return b;
}

// ---------------------------------------------------------------- dokumentnr
// Munin/Yggdrasil: UPP-AIL-I-XE-50102-01, UPP-EE510-XT-00012-01, FUI-AKSO-Z-SP-00011
const DOC_SRC = "(?<![A-Z0-9-])(?:UPP|FUI)-[A-Z0-9]{2,6}(?:-[A-Z0-9])?-[A-Z]{2}-\\d{5}(?:-\\d{2})?(?![A-Z0-9])";

export function findDocNos(text) {
  return [...String(text).toUpperCase().matchAll(new RegExp(DOC_SRC, "g"))].map((m) => ({ no: m[0], end: m.index + m[0].length - 1 }));
}

const related = (a, b) => a === b || a.startsWith(b + "-") || b.startsWith(a + "-");

/**
 * Velg sidens eget dokumentnr blant kandidatene.
 * cands: [{ no, d }] der d = avstand til nedre høyre hjørne (tittelfeltet), 0..1,4
 * fileNos: dokumentnr funnet i filnavnet
 * Returnerer { no, source, refs } – refs er andre nummer på siden (nabotegninger o.l.).
 */
export function pickDocNo(cands, fileNos, firstPage) {
  const best = new Map();
  for (const c of cands) if (!best.has(c.no) || c.d < best.get(c.no)) best.set(c.no, c.d);
  const uniq = [...best].map(([no, d]) => ({ no, d })).sort((a, b) => a.d - b.d);
  if (!uniq.length) {
    return firstPage && fileNos.length
      ? { no: fileNos[0], source: "kun filnavn", refs: [] }
      : { no: null, source: firstPage ? "ikke funnet" : "", refs: [] };
  }
  let pick = null, source = "tittelfelt";
  for (const c of uniq) {
    const f = fileNos.find((x) => related(c.no, x));
    if (f) { pick = f.length > c.no.length ? f : c.no; source = "tittelfelt + filnavn"; break; }
  }
  if (!pick) pick = uniq[0].no;
  return { no: pick, source, refs: uniq.map((c) => c.no).filter((n) => !related(n, pick)) };
}

/** Les dokumentnr per side. Returnerer { pages: [{ page, no, source, refs }], error }. */
export function docNumbers(mupdf, data, fileName) {
  let doc;
  try {
    doc = mupdf.Document.openDocument(data, "application/pdf");
  } catch (e) {
    return { pages: [], error: "kunne ikke åpnes (skadet eller ikke en PDF)" };
  }
  try {
    if (doc.needsPassword()) return { pages: [], error: "passordbeskyttet" };
    const fileNos = findDocNos(String(fileName).split("/").pop()).map((m) => m.no);
    const pages = [];
    const n = doc.countPages();
    for (let i = 0; i < n; i++) {
      const page = doc.loadPage(i);
      const [x0, y0, x1, y1] = page.getBounds();
      const w = x1 - x0 || 1, h = y1 - y0 || 1;
      const cands = [];
      let chars = null;
      const st = page.toStructuredText("preserve-whitespace");
      st.walk({
        beginLine() { chars = []; },
        onChar(c, origin, font, size, quad) { chars.push({ c: c.length === 1 ? c : " ", q: quad }); },
        endLine() {
          if (!chars) return;
          for (const m of findDocNos(chars.map((x) => x.c).join(""))) {
            const q = chars[m.end].q;
            const cx = (q[0] + q[2] + q[4] + q[6]) / 4, cy = (q[1] + q[3] + q[5] + q[7]) / 4;
            cands.push({ no: m.no, d: Math.hypot((x1 - cx) / w, (y1 - cy) / h) });
          }
          chars = null;
        },
      });
      st.destroy?.();
      page.destroy?.();
      pages.push({ page: i + 1, ...pickDocNo(cands, fileNos, i === 0) });
    }
    return { pages, error: null };
  } catch (e) {
    return { pages: [], error: String(e && e.message || e) };
  } finally {
    doc.destroy?.();
  }
}
