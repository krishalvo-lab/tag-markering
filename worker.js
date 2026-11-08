// Web Worker: kjører MuPDF (WASM) utenfor hovedtråden, så vinduet ikke fryser.
let mupdf = null, engine = null, tagList = [], author = "";

const ready = (async () => {
  mupdf = await import("./vendor/mupdf/mupdf.js");
  engine = await import("./engine.js");
})();

self.onmessage = async (ev) => {
  const m = ev.data;
  try {
    await ready;
    if (m.type === "init") {
      self.postMessage({ type: "ready" });
    } else if (m.type === "setTags") {
      tagList = engine.prepareTags(m.tags);
      author = m.author;
      self.postMessage({ type: "tagsSet" });
    } else if (m.type === "mark") {
      const r = engine.markPdf(mupdf, new Uint8Array(m.data), tagList, author);
      const msg = { type: "marked", id: m.id, hits: r.hits, error: r.error, bytes: r.bytes };
      self.postMessage(msg, r.bytes ? [r.bytes.buffer] : []);
    }
  } catch (e) {
    self.postMessage({ type: "error", id: m.id, error: String((e && e.message) || e) });
  }
};
