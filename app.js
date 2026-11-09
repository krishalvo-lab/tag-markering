import { unzip, zip, readTable, collectTags } from "./files.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const OUT = "Markert";
const DEFAULT_AUTHOR = "Kristian Nordtve Halvorsen";

const st = {
  sources: [],        // [{ path, read: async () => Uint8Array }]
  dir: null,          // FileSystemDirectoryHandle (Edge/Chrome)
  dirFiles: [],       // [{ path, handle }]
  tagFile: null, sheet: null, table: null, cols: [], tags: [],
  engineReady: false, running: false, stop: false,
  outputs: [], report: null,
};

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* privat modus */ } },
};
$("author").value = store.get("author") || DEFAULT_AUTHOR;

function err(m) { $("err").textContent = m || ""; }

// ---------------------------------------------------------------- worker
const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
const pending = new Map();
let seq = 0;
worker.onmessage = (ev) => {
  const m = ev.data;
  if (m.type === "ready") { st.engineReady = true; $("engine").textContent = "PDF-motor klar"; ready(); return; }
  const p = pending.get(m.id ?? m.type);
  if (p) { pending.delete(m.id ?? m.type); p(m); }
};
worker.onerror = (e) => { $("engine").textContent = "PDF-motoren kunne ikke lastes"; err("PDF-motoren kunne ikke lastes: " + (e.message || "ukjent feil") + ". Prøv Edge eller Chrome."); };
worker.postMessage({ type: "init" });
const call = (msg, transfer = []) => new Promise((res) => {
  const id = msg.type === "setTags" ? "tagsSet" : (msg.id = ++seq);
  pending.set(id, res);
  worker.postMessage(msg, transfer);
});

// ---------------------------------------------------------------- PDF-kilder
async function expand(path, read) {
  if (/\.zip$/i.test(path)) {
    const entries = await unzip(await read());
    return entries.filter((e) => /\.pdf$/i.test(e.name) && !e.name.split("/").pop().startsWith("._") && !e.name.startsWith("__MACOSX"))
      .map((e) => ({ path: e.name, read: () => e.read() }));
  }
  if (/\.pdf$/i.test(path)) return [{ path, read }];
  return [];
}

async function setFiles(fileList) {
  err();
  st.dir = null;
  const out = [];
  for (const f of fileList) {
    try { out.push(...(await expand(f.name, async () => new Uint8Array(await f.arrayBuffer())))); }
    catch (e) { err(f.name + ": " + e.message); }
  }
  st.sources = out;
  $("recWrap").classList.add("hidden");
  showSources();
}

async function scanDir() {
  const rec = $("recursive").checked;
  const out = [];
  async function walk(h, prefix) {
    for await (const [name, child] of h.entries()) {
      if (child.kind === "directory") {
        if (rec && name !== OUT) await walk(child, prefix + name + "/");
      } else if (/\.(pdf|zip)$/i.test(name) && !name.startsWith("._")) {
        out.push(...(await expand(prefix + name, async () => new Uint8Array(await (await child.getFile()).arrayBuffer()))));
      }
    }
  }
  await walk(st.dir, "");
  out.sort((a, b) => a.path.localeCompare(b.path, "nb"));
  st.sources = out;
  showSources();
}

function showSources() {
  const n = st.sources.length;
  const where = st.dir ? `Mappe «${st.dir.name}»: ` : "";
  $("pdfInfo").innerHTML = n
    ? `${esc(where)}<b>${n}</b> PDF-${n === 1 ? "fil" : "filer"} klar`
    : (st.dir ? esc(where) + "fant ingen PDF-er" + ($("recursive").checked ? "" : " – prøv «Ta med undermapper»") : "");
  ready();
}

if ("showDirectoryPicker" in window) {
  $("pickDir").classList.remove("hidden");
  $("pickDir").onclick = async () => {
    err();
    try { st.dir = await window.showDirectoryPicker({ mode: "readwrite", id: "pdfs" }); }
    catch (e) { if (e.name !== "AbortError") err("Kunne ikke åpne mappen: " + e.message); return; }
    $("recWrap").classList.remove("hidden");
    await scanDir();
  };
  $("recursive").onchange = () => st.dir && scanDir();
}
$("pdfInput").onchange = (e) => setFiles([...e.target.files]);

function dropZone(el, onFiles) {
  el.addEventListener("dragover", (e) => { e.preventDefault(); el.classList.add("over"); });
  el.addEventListener("dragleave", () => el.classList.remove("over"));
  el.addEventListener("drop", (e) => { e.preventDefault(); el.classList.remove("over"); onFiles([...e.dataTransfer.files]); });
}
dropZone($("pdfDrop"), setFiles);
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => e.preventDefault());

// ---------------------------------------------------------------- tag-liste
async function loadTags(cols) {
  err();
  try {
    st.table = await readTable(st.tagFile, st.sheet);
  } catch (e) { err(e.message); st.tags = []; ready(); return; }
  const t = st.table;
  st.sheet = t.sheet;
  st.cols = cols ?? t.defaultCols;
  st.tags = collectTags(t.data, st.cols);
  $("tagOpts").classList.remove("hidden");
  $("sheetRow").classList.toggle("hidden", !t.sheets.length);
  $("sheet").innerHTML = t.sheets.map((s) => `<option ${s === t.sheet ? "selected" : ""}>${esc(s)}</option>`).join("");
  $("cols").innerHTML = t.headers.map((h, i) => `<label><input type="checkbox" value="${i}" ${st.cols.includes(i) ? "checked" : ""}>${esc(h)}</label>`).join("");
  $("cols").querySelectorAll("input").forEach((c) => (c.onchange = () => loadTags([...$("cols").querySelectorAll("input:checked")].map((x) => +x.value))));
  const prev = st.tags.slice(0, 12);
  $("tagCount").textContent = st.tags.length + " unike tags" + (st.tags.length > prev.length ? ` – viser de første ${prev.length}` : "");
  $("preview").innerHTML = prev.map((x) => `<span class="chip">${esc(x)}</span>`).join("");
  ready();
}
function setTagFile(f) {
  if (!f) return;
  st.tagFile = f; st.sheet = null;
  $("tagName").textContent = f.name;
  loadTags(null);
}
// Lim inn fra Excel: tabulatorskilt tekst behandles som en virtuell .txt-fil
let pasteTimer;
$("tagPaste").addEventListener("input", () => {
  clearTimeout(pasteTimer);
  pasteTimer = setTimeout(() => {
    const text = $("tagPaste").value;
    if (!text.trim()) return;
    setTagFile(new File([text], "Innlimt fra Excel.txt", { type: "text/plain" }));
  }, 150);
});
$("tagInput").onchange = (e) => setTagFile(e.target.files[0]);
dropZone($("tagDrop"), (fs) => setTagFile(fs[0]));
$("sheet").onchange = () => { st.sheet = $("sheet").value; loadTags(null); };

// ---------------------------------------------------------------- kjør
function ready() {
  const why = !st.engineReady ? "Venter på at PDF-motoren lastes…"
    : !st.sources.length ? "Velg PDF-er."
    : !st.tagFile ? "Velg en tag-liste."
    : !st.tags.length ? "Fant ingen tags i valgte kolonne(r). Kryss av en annen kolonne."
    : "";
  $("run").disabled = !!why || st.running;
  $("why").textContent = st.running ? "" : why;
}

$("run").onclick = async () => {
  err();
  const author = $("author").value.trim() || DEFAULT_AUTHOR;
  store.set("author", author);
  st.running = true; st.stop = false; st.outputs = []; st.report = null;
  ready();
  $("result").classList.add("hidden"); $("progress").classList.remove("hidden"); $("barFill").style.width = "0";
  $("stop").classList.remove("hidden");
  await call({ type: "setTags", tags: st.tags, author });
  const results = [];
  const n = st.sources.length;
  for (let i = 0; i < n; i++) {
    if (st.stop) break;
    const s = st.sources[i];
    $("progText").textContent = `${i + 1} av ${n}: ${s.path}`;
    let r;
    try {
      const data = await s.read();
      r = await call({ type: "mark", data: data.buffer }, [data.buffer]);
    } catch (e) { r = { hits: {}, error: e.message }; }
    const total = Object.values(r.hits || {}).reduce((a, b) => a + b, 0);
    results.push({ path: s.path, hits: r.hits || {}, total, error: r.error });
    if (r.bytes && total) st.outputs.push({ name: s.path, data: r.bytes });
    $("barFill").style.width = (100 * (i + 1) / n) + "%";
  }
  st.report = buildReport(results);
  let saveMsg = "";
  if (st.dir && st.outputs.length) saveMsg = await saveToDir();
  st.running = false;
  $("stop").classList.add("hidden");
  ready();
  show(results, saveMsg);
};
$("stop").onclick = () => { st.stop = true; };

function buildReport(results) {
  const q = (s) => /[;"\n]/.test(s) ? '"' + String(s).replace(/"/g, '""') + '"' : s;
  const lines = ["Fil;Tag;Antall markeringer"];
  for (const r of results) {
    if (r.error) lines.push([q(r.path), q("FEIL: " + r.error), ""].join(";"));
    for (const [t, c] of Object.entries(r.hits)) lines.push([q(r.path), q(t), c].join(";"));
  }
  const found = new Set(results.flatMap((r) => Object.keys(r.hits)));
  lines.push("", "Ikke funnet i noen PDF;;");
  for (const t of st.tags) if (!found.has(t)) lines.push(";" + q(t) + ";0");
  return new TextEncoder().encode("﻿" + lines.join("\r\n") + "\r\n");
}

async function saveToDir() {
  try {
    if ((await st.dir.queryPermission({ mode: "readwrite" })) !== "granted" &&
        (await st.dir.requestPermission({ mode: "readwrite" })) !== "granted") throw new Error("ingen skrivetilgang");
    const out = await st.dir.getDirectoryHandle(OUT, { create: true });
    const write = async (path, data) => {
      const parts = path.split("/");
      let d = out;
      for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
      const fh = await d.getFileHandle(parts.at(-1), { create: true });
      const w = await fh.createWritable();
      await w.write(data); await w.close();
    };
    for (const o of st.outputs) await write(o.name, o.data);
    await write("Rapport.csv", st.report);
    return `Lagret i mappen «${st.dir.name}/${OUT}».`;
  } catch (e) {
    return `Kunne ikke lagre direkte i mappen (${e.message}). Bruk «Last ned» i stedet.`;
  }
}

function show(results, saveMsg) {
  $("progress").classList.add("hidden"); $("result").classList.remove("hidden");
  const total = results.reduce((a, r) => a + r.total, 0);
  const errs = results.filter((r) => r.error).length;
  const found = new Set(results.flatMap((r) => Object.keys(r.hits)));
  const missing = st.tags.filter((t) => !found.has(t));
  $("summary").innerHTML = `<b>${total}</b> markeringer i <b>${st.outputs.length}</b> av ${results.length} PDF-er. ` +
    `<b>${st.tags.length - missing.length}</b> av ${st.tags.length} tags funnet.` +
    (st.stop ? ' <span class="bad">Stoppet før alle filer var gjennomgått.</span>' : "") +
    (errs ? ` <span class="bad">${errs} fil(er) kunne ikke leses.</span>` : "");
  $("saveInfo").textContent = saveMsg;
  $("dlZip").disabled = !st.outputs.length;
  const rows = [...results].sort((a, b) => b.total - a.total);
  $("fileTable").innerHTML = "<tr><th>Fil</th><th>Tags</th><th>Markeringer</th></tr>" + rows.map((r) =>
    `<tr><td>${esc(r.path)}${r.error ? ` <span class="bad">– ${esc(r.error)}</span>` : ""}</td><td class="n">${Object.keys(r.hits).length}</td><td class="n ${r.total ? "ok" : ""}">${r.total}</td></tr>`).join("");
  $("missingBox").innerHTML = missing.length
    ? `<div class="hint" style="margin-top:12px">Ikke funnet i noen PDF (${missing.length}):</div><div class="chips">${missing.slice(0, 300).map((t) => `<span class="chip">${esc(t)}</span>`).join("")}</div>`
    : `<div class="hint ok" style="margin-top:12px">Alle tags ble funnet.</div>`;
}

function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
const stamp = () => new Date().toISOString().slice(0, 16).replace("T", " ").replace(":", "");
$("dlZip").onclick = () => download(zip([...st.outputs, { name: "Rapport.csv", data: st.report }]), `Markert ${stamp()}.zip`);
$("dlReport").onclick = () => download(new Blob([st.report], { type: "text/csv" }), "Rapport.csv");
ready();
