// Filhjelpere uten eksterne biblioteker: ZIP lese/skrive, Excel (.xlsx) og CSV/TXT.

// ---------------------------------------------------------------- ZIP lese
async function inflateRaw(bytes) {
  const ds = new DecompressionStream("deflate-raw");
  const out = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function unzip(buf) {
  const b = new Uint8Array(buf);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Ugyldig ZIP-fil");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const entries = [];
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (name.endsWith("/")) continue;
    entries.push({
      name,
      async read() {
        const lnl = dv.getUint16(off + 26, true), lxl = dv.getUint16(off + 28, true);
        const start = off + 30 + lnl + lxl;
        const data = b.subarray(start, start + csize);
        if (method === 0) return data.slice();
        if (method === 8) return inflateRaw(data);
        throw new Error("Ukjent komprimering i ZIP");
      },
    });
  }
  return entries;
}

// ---------------------------------------------------------------- ZIP skrive (lagret, ukomprimert)
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(d) { let c = 0xffffffff; for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

export function zip(files) { // files: [{name, data: Uint8Array}]
  const enc = new TextEncoder();
  const parts = [], central = [];
  let off = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);
    h.setUint16(10, dosTime, true); h.setUint16(12, dosDate, true);
    h.setUint32(14, crc, true); h.setUint32(18, size, true); h.setUint32(22, size, true); h.setUint16(26, name.length, true);
    parts.push(new Uint8Array(h.buffer), name, f.data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint16(12, dosTime, true); c.setUint16(14, dosDate, true);
    c.setUint32(16, crc, true); c.setUint32(20, size, true); c.setUint32(24, size, true); c.setUint16(28, name.length, true);
    c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), name);
    off += 30 + name.length + size;
  }
  const csize = central.reduce((a, x) => a + x.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, csize, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: "application/zip" });
}

// ---------------------------------------------------------------- Tag-liste
const HINTS = ["tag no", "tag", "tagno", "tag number", "main tag", "kabel", "cable"];

function clean(v) {
  let s = (v ?? "").toString().replace(/ /g, " ").trim();
  if (/^\d+\.0$/.test(s)) s = s.slice(0, -2);
  return s;
}

function colIndex(ref) {
  const m = /^([A-Z]+)/.exec(ref || "");
  if (!m) return -1;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

async function readXlsx(buf, sheetName) {
  const entries = await unzip(buf);
  const get = async (name) => {
    const e = entries.find((x) => x.name.toLowerCase() === name.toLowerCase());
    return e ? new TextDecoder().decode(await e.read()) : null;
  };
  const xml = (s) => new DOMParser().parseFromString(s, "application/xml");
  const wb = xml(await get("xl/workbook.xml"));
  const rels = xml((await get("xl/_rels/workbook.xml.rels")) || "<r/>");
  const relMap = {};
  for (const r of rels.getElementsByTagNameNS("*", "Relationship")) relMap[r.getAttribute("Id")] = r.getAttribute("Target");
  const sheets = [...wb.getElementsByTagNameNS("*", "sheet")].map((s) => ({
    name: s.getAttribute("name"),
    target: relMap[s.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") || s.getAttribute("r:id")],
  }));
  if (!sheets.length) throw new Error("Fant ingen ark i Excel-filen");
  const chosen = sheets.find((s) => s.name === sheetName) || sheets[0];
  let path = (chosen.target || "").replace(/^\/?xl\//, "").replace(/^\//, "");
  path = "xl/" + path;
  const ssXml = await get("xl/sharedStrings.xml");
  const shared = ssXml
    ? [...xml(ssXml).getElementsByTagNameNS("*", "si")].map((si) => [...si.getElementsByTagNameNS("*", "t")].map((t) => t.textContent).join(""))
    : [];
  const sheet = xml(await get(path));
  const rows = [];
  for (const row of sheet.getElementsByTagNameNS("*", "row")) {
    const r = [];
    let auto = 0;
    for (const c of row.getElementsByTagNameNS("*", "c")) {
      const idx = c.hasAttribute("r") ? colIndex(c.getAttribute("r")) : auto;
      auto = idx + 1;
      const t = c.getAttribute("t");
      const v = c.getElementsByTagNameNS("*", "v")[0]?.textContent ?? "";
      let val;
      if (t === "s") val = shared[+v] ?? "";
      else if (t === "inlineStr") val = [...c.getElementsByTagNameNS("*", "t")].map((x) => x.textContent).join("");
      else val = v;
      r[idx] = clean(val);
    }
    rows.push(Array.from(r, (x) => x ?? ""));
  }
  return { sheets: sheets.map((s) => s.name), sheet: chosen.name, rows };
}

function readDelimited(buf) {
  const b = new Uint8Array(buf);
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(b); }
  catch { text = new TextDecoder("windows-1252").decode(b); }
  text = text.replace(/^﻿/, "");
  const lines = text.split(/\r\n|\n|\r/);
  const sample = lines.slice(0, 20).join("\n");
  const delim = [";", "\t", ",", "|"].map((d) => [d, sample.split(d).length]).sort((a, b) => b[1] - a[1])[0];
  const d = delim[1] > 1 ? delim[0] : null;
  const rows = lines.map((l) => (d ? parseLine(l, d) : [l]).map(clean));
  return { sheets: [], sheet: null, rows };
}

function parseLine(line, d) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"' && cur === "") q = true;
    else if (ch === d) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Les tabell fra fil. Returnerer { sheets, sheet, headers, data, defaultCols }. */
export async function readTable(file, sheetName) {
  const buf = await file.arrayBuffer();
  const ext = file.name.split(".").pop().toLowerCase();
  let t;
  if (ext === "xlsx" || ext === "xlsm") t = await readXlsx(buf, sheetName);
  else if (ext === "csv" || ext === "txt") t = readDelimited(buf);
  else throw new Error("Ukjent filtype ." + ext + " – bruk .xlsx, .csv eller .txt");
  const rows = t.rows.filter((r) => r.some(Boolean));
  if (!rows.length) return { ...t, headers: [], data: [], defaultCols: [] };
  const width = Math.max(...rows.map((r) => r.length));
  let hdr = -1;
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    if (rows[i].some((c) => HINTS.includes(c.toLowerCase()))) { hdr = i; break; }
  }
  const pad = (r) => Array.from({ length: width }, (_, i) => r[i] ?? "");
  let headers, data;
  if (hdr < 0) {
    headers = Array.from({ length: width }, (_, i) => "Kolonne " + (i < 26 ? String.fromCharCode(65 + i) : i + 1));
    data = rows.map(pad);
  } else {
    headers = pad(rows[hdr]).map((h, i) => h || "Kolonne " + (i + 1));
    data = rows.slice(hdr + 1).map(pad);
  }
  const low = headers.map((h) => h.toLowerCase());
  // Uten overskrift er det ren tag-tekst: bruk alle kolonner (f.eks. «tag, tag» på én linje)
  let def = hdr < 0 ? headers.map((_, i) => i) : [0];
  for (const h of HINTS) { const i = low.indexOf(h); if (i >= 0) { def = [i]; break; } }
  return { sheets: t.sheets, sheet: t.sheet, headers, data, defaultCols: def };
}

export function collectTags(data, cols) {
  const seen = new Set(), out = [];
  // Én celle kan ha flere tags («A2001-L017,A2001-L300»): del på komma, semikolon og linjeskift.
  for (const r of data) for (const c of cols) for (const raw of (r[c] || "").split(/[,;\n]/)) {
    const t = raw.trim();
    if (t && !seen.has(t.toLocaleLowerCase("nb"))) { seen.add(t.toLocaleLowerCase("nb")); out.push(t); }
  }
  return out;
}
