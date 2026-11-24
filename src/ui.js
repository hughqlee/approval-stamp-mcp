import { App } from "@modelcontextprotocol/ext-apps";
import * as pdfjs from "pdfjs-dist/build/pdf.mjs";
import * as pdfWorker from "pdfjs-dist/build/pdf.worker.mjs";
import { PDFDocument, degrees } from "pdf-lib";
import CMAPS from "./cmaps.gen.js";

// The default MCP Apps CSP allows no workers from URLs and no fetch, so pdf.js runs its
// worker code on the main thread ("fake worker") and gets CMaps from the bundle.
globalThis.pdfjsWorker = pdfWorker;
const b64ToBytes = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
class BundledData {
  async fetch({ kind, filename }) {
    const d = kind === "cMapUrl" && CMAPS[filename.replace(/\.bcmap$/, "")];
    if (!d) throw new Error(`${kind} ${filename} not bundled`);
    return b64ToBytes(d);
  }
}
const PDF_OPTS = { isEvalSupported: false, useWorkerFetch: false, BinaryDataFactory: BundledData, cMapUrl: "bundled/", cMapPacked: true, useWasm: false };

const app = new App({ name: "approval-stamp", version: "0.1.0" });
const $ = id => document.getElementById(id);

// ---------- i18n + theme (same behaviour as image-annotate-mcp) ----------
const T = {
  en: { open: "Open document", addStamp: "+ Add stamp", removeBg: "Clear white bg", size: "Size", undo: "Undo", export: "Export",
        hint: "Open, paste (Ctrl+V) or drop a PDF or image.<br>Add your stamp image once; it is kept in this browser only.",
        connected: "Ready", loading: "Opening…", loaded: (n, p) => `Opened ${n} (${p} page${p > 1 ? "s" : ""}). Read it, then click where the stamp goes.`,
        needStamp: "Add a stamp image first (+ Add stamp)", stampAdded: "Stamp added and saved in this browser", stampSession: "Stamp added (this browser cannot save it; it lasts until the window closes)",
        stampRemoved: "Stamp removed from this browser", placed: p => `Stamped page ${p}. Drag to move, corner to resize, Delete to remove.`,
        exported: f => `Exported ${f}`, exporting: "Exporting…", failed: m => `Failed: ${m}`,
        useBelow: "Save it from the panel below", outTitle: "Stamped result", outWhy: r => `Direct download is unavailable (${r}).`, noDownload: "not supported in this app", denied: "cancelled or blocked",
        outHint: "Right-click (or long-press) the image to save or copy it.", outHintPdf: "Send the PDF to the chat and download it there, or right-click a page image to save it (images are not selectable text).",
        sendPdf: "Send PDF to chat", sendPages: "Send pages as images", send: "Send to chat", copy: "Copy", close: "Close", pageN: n => `Page ${n}`,
        sentText: n => `Stamped document: ${n}`, sent: "Sent to the chat", rejected: "the chat did not accept it", sendPdfFailed: m => `Could not send the PDF (${m}). Use the page images instead.`,
        copied: "Copied to the clipboard", copyFailed: "Copy was blocked: right-click the image instead",
        encrypted: "This PDF is password-protected or encrypted, so it cannot be stamped.", password: "This PDF needs a password to open.",
        signed: "This PDF has a digital signature. Adding a stamp will invalidate that signature.", badFile: "Not a PDF or image (PNG, JPEG, WebP)",
        tooBig: "File is larger than 100 MB", info: (s, n, seen) => `Stamps ${s} · pages reviewed ${seen}/${n}`, unseen: n => `${n} page(s) not viewed yet`,
        light: "☀ Light", dark: "☾ Dark", langBtn: "한국어", delStamp: "Delete stamp from this browser", del: "Remove" },
  ko: { open: "문서 열기", addStamp: "+ 도장 추가", removeBg: "흰 배경 제거", size: "크기", undo: "되돌리기", export: "내보내기",
        hint: "PDF나 이미지를 열거나, 붙여넣기(Ctrl+V)하거나, 끌어다 놓아 주세요.<br>도장 이미지는 한 번만 추가하면 이 브라우저에만 보관됩니다.",
        connected: "준비됨", loading: "여는 중…", loaded: (n, p) => `${n} 열림 (${p}쪽). 내용을 확인하고 도장 찍을 곳을 클릭하세요.`,
        needStamp: "먼저 도장 이미지를 추가하세요 (+ 도장 추가)", stampAdded: "도장을 추가해 이 브라우저에 보관했습니다", stampSession: "도장 추가됨 (이 브라우저에는 보관할 수 없어 창을 닫으면 사라집니다)",
        stampRemoved: "도장을 이 브라우저에서 지웠습니다", placed: p => `${p}쪽에 찍음. 끌어서 이동, 모서리로 크기 조절, Delete로 삭제.`,
        exported: f => `${f} 내보냄`, exporting: "내보내는 중…", failed: m => `실패: ${m}`,
        useBelow: "아래 창에서 저장하세요", outTitle: "도장 찍은 결과", outWhy: r => `바로 다운로드할 수 없습니다 (${r}).`, noDownload: "이 앱에서 지원 안 함", denied: "취소되었거나 차단됨",
        outHint: "이미지를 우클릭(모바일은 길게 누르기)해서 저장하거나 복사하세요.", outHintPdf: "PDF를 채팅으로 보내 거기서 내려받거나, 페이지 이미지를 우클릭해서 저장하세요 (이미지는 글자 선택이 안 됩니다).",
        sendPdf: "PDF를 채팅으로 보내기", sendPages: "페이지 이미지를 채팅으로 보내기", send: "채팅으로 보내기", copy: "복사", close: "닫기", pageN: n => `${n}쪽`,
        sentText: n => `도장 찍은 문서: ${n}`, sent: "채팅으로 보냈습니다", rejected: "채팅에서 받아주지 않음", sendPdfFailed: m => `PDF를 보내지 못했습니다 (${m}). 페이지 이미지를 쓰세요.`,
        copied: "클립보드에 복사됨", copyFailed: "복사가 막혔습니다. 이미지를 우클릭하세요",
        encrypted: "암호가 걸렸거나 보호된 PDF라 도장을 찍을 수 없습니다.", password: "열려면 비밀번호가 필요한 PDF입니다.",
        signed: "전자서명된 PDF입니다. 도장을 찍으면 기존 전자서명은 무효가 됩니다.", badFile: "PDF나 이미지(PNG, JPEG, WebP)가 아닙니다",
        tooBig: "100MB보다 큰 파일입니다", info: (s, n, seen) => `도장 ${s}개 · 확인한 쪽 ${seen}/${n}`, unseen: n => `아직 안 본 쪽 ${n}개`,
        light: "☀ 라이트", dark: "☾ 다크", langBtn: "English", delStamp: "이 브라우저에서 도장 지우기", del: "삭제" },
};
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } },
};
const sysDark = () => matchMedia("(prefers-color-scheme: dark)").matches;
let lang = store.get("stamp:lang") || ((navigator.language || "en").startsWith("ko") ? "ko" : "en");
let theme = store.get("stamp:theme") || (sysDark() ? "dark" : "light");
let lastStatus = [""], lastLevel = "";
const t = (k, ...a) => { const v = T[lang][k]; return typeof v === "function" ? v(...a) : v; };
const log = (k, ...a) => { lastStatus = [k, ...a]; lastLevel = ""; $("st").className = ""; $("st").textContent = k ? (k in T[lang] ? t(k, ...a) : k) : ""; };
const warn = (k, ...a) => { log(k, ...a); lastLevel = "warn"; $("st").className = "warn"; };
const err = (k, ...a) => { log(k, ...a); lastLevel = "err"; $("st").className = "err"; };
function render() {
  document.documentElement.lang = lang;
  document.documentElement.dataset.theme = theme;
  document.querySelectorAll("[data-i18n]").forEach(el => { if (el.id === "hint") el.innerHTML = t("hint"); else el.textContent = t(el.dataset.i18n); });
  $("lang").textContent = t("langBtn");
  $("theme").textContent = theme === "dark" ? t("light") : t("dark");
  $("theme").title = theme === "dark" ? "Switch to light" : "Switch to dark";
  const lvl = lastLevel; log(...lastStatus); if (lvl) { lastLevel = lvl; $("st").className = lvl; }
  renderTray(); updateInfo();
}
$("lang").onclick = () => { lang = lang === "ko" ? "en" : "ko"; store.set("stamp:lang", lang); render(); };
$("theme").onclick = () => { theme = theme === "dark" ? "light" : "dark"; store.set("stamp:theme", theme); render(); };
function applyHost(hc) {
  if (!hc) return;
  if (hc.theme && !store.get("stamp:theme")) theme = hc.theme === "dark" ? "dark" : "light";
  if (hc.locale && !store.get("stamp:lang")) lang = hc.locale.toLowerCase().startsWith("ko") ? "ko" : "en";
  render();
}
app.onhostcontextchanged = applyHost;

// ---------- stamp library (this browser only: never sent to the server or the agent) ----------
const MAX_STAMPS = 8, STAMP_PX = 800;
let library = [];
try { library = JSON.parse(store.get("stamp:library") || "[]").filter(s => s && /^data:image\/png;base64,/.test(s.data)); } catch { library = []; }
let current = library[0]?.id || null;
const stampById = id => library.find(s => s.id === id);
const persist = () => store.set("stamp:library", JSON.stringify(library));
const imgCache = new Map(); // id -> {w,h}
function stampSize(s) { if (!imgCache.has(s.id)) { const i = new Image(); i.src = s.data; imgCache.set(s.id, { img: i, ready: i.decode().then(() => ({ w: i.naturalWidth, h: i.naturalHeight })) }); } return imgCache.get(s.id).ready; }
function renderTray() {
  const tray = $("tray"); tray.textContent = "";
  for (const s of library) {
    const b = document.createElement("button"); b.className = "chip"; b.dataset.id = s.id; b.setAttribute("aria-pressed", String(s.id === current)); b.title = t("size") + " " + s.mm + "mm";
    const im = document.createElement("img"); im.src = s.data; im.alt = "stamp"; b.appendChild(im);
    const x = document.createElement("button"); x.className = "x"; x.textContent = "×"; x.title = t("delStamp"); x.setAttribute("aria-label", t("delStamp"));
    x.onclick = e => { e.stopPropagation(); library = library.filter(v => v.id !== s.id); if (stamps.some(v => v.sid === s.id)) { snapshot(); stamps = stamps.filter(v => v.sid !== s.id); redrawStamps(); } if (current === s.id) current = library[0]?.id || null; persist(); renderTray(); log("stampRemoved"); };
    b.appendChild(x);
    b.onclick = () => { current = s.id; $("size").value = s.mm; renderTray(); };
    tray.appendChild(b);
  }
  $("addLbl").hidden = library.length >= MAX_STAMPS;
  document.querySelectorAll(".layer").forEach(l => l.classList.toggle("nostamp", !current));
}
// Turn a photo/scan of a stamp into a cropped PNG with a transparent background.
export async function makeStamp(blob, removeBg) {
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const W = Math.max(1, Math.round(bmp.width * k)), H = Math.max(1, Math.round(bmp.height * k));
  const c = new OffscreenCanvas(W, H), g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(bmp, 0, 0, W, H);
  const im = g.getImageData(0, 0, W, H), d = im.data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    if (removeBg) { // paper is bright in every channel; ink (red, blue, black) is dark in at least one
      const m = Math.min(d[i], d[i + 1], d[i + 2]); const a = Math.max(0, Math.min(1, (225 - m) / 60));
      d[i + 3] = Math.round(d[i + 3] * a);
    }
    if (d[i + 3] > 24) { const x = p % W, y = (p / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) throw new Error("empty image");
  g.putImageData(im, 0, 0);
  const pad = 2; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, f = Math.min(1, STAMP_PX / Math.max(cw, ch));
  const out = document.createElement("canvas"); out.width = Math.max(1, Math.round(cw * f)); out.height = Math.max(1, Math.round(ch * f));
  out.getContext("2d").drawImage(c, x0, y0, cw, ch, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}
$("stampFile").onchange = async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  try {
    const data = await makeStamp(f, $("bg").checked);
    const s = { id: Math.random().toString(36).slice(2, 10), data, mm: 15 };
    library.push(s); current = s.id; $("size").value = s.mm;
    persist() ? log("stampAdded") : warn("stampSession"); renderTray();
  } catch (ex) { err("failed", ex.message); }
};

// ---------- document ----------
// Each page: { w, h } in view units (PDF points at scale 1, rotation applied; image pixels), mmW = physical width.
let doc = null; // { kind: "pdf"|"image", name, bytes, pdf?, bitmap?, mime?, pages: [...] }
let stamps = [], undoStack = [], selected = null, seen = new Set();
const MAX_BYTES = 100 * 1024 * 1024;
const baseName = n => (n || "document").replace(/\.[^.]+$/, "");
async function openFile(file) {
  if (!file) return;
  if (file.size > MAX_BYTES) return err("tooBig");
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
  if (!isPdf && !/^image\/(png|jpeg|webp)$/.test(file.type)) return err("badFile");
  log("loading");
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    let next;
    if (isPdf) {
      // pdf-lib must be able to write it later; check now so nobody stamps a file we cannot save
      try { await PDFDocument.load(bytes, { updateMetadata: false }); }
      catch (ex) { if (/encrypt/i.test(ex.message)) return err("encrypted"); throw ex; }
      let pdf; const task = pdfjs.getDocument({ ...PDF_OPTS, data: bytes.slice() });
      try { pdf = await task.promise; }
      catch (ex) { if (ex.name === "PasswordException") return err("password"); throw ex; }
      const pages = [];
      for (let i = 1; i <= pdf.numPages; i++) { const vp = (await pdf.getPage(i)).getViewport({ scale: 1 }); pages.push({ w: vp.width, h: vp.height, mmW: vp.width * 25.4 / 72 }); }
      next = { kind: "pdf", name: file.name || "document.pdf", bytes, pdf, task, pages };
    } else {
      const bitmap = await createImageBitmap(file);
      // an image has no physical size; treat its width as A4 (210 mm) so stamp sizes stay sensible for scans
      next = { kind: "image", name: file.name || "image.png", mime: file.type, bitmap, pages: [{ w: bitmap.width, h: bitmap.height, mmW: 210 }] };
    }
    doc?.task?.destroy();
    doc = next; stamps = []; undoStack = []; selected = null; seen = new Set(); $("out").hidden = true; last = null;
    buildPages();
    const signed = isPdf && hasSignature(bytes);
    signed ? warn("signed") : log("loaded", doc.name, doc.pages.length);
  } catch (ex) { err("failed", ex.message); }
}
function hasSignature(bytes) { // cheap scan: signed PDFs carry a /ByteRange in their signature dictionary
  const s = new TextDecoder("latin1").decode(bytes.length > 40e6 ? bytes.subarray(bytes.length - 20e6) : bytes);
  return /\/ByteRange\s*\[/.test(s) && /\/Type\s*\/Sig\b/.test(s);
}
$("file").onchange = e => { const f = e.target.files[0]; e.target.value = ""; openFile(f); };
document.addEventListener("paste", e => { const f = [...(e.clipboardData?.files || [])][0]; if (f) openFile(f); });
document.addEventListener("dragover", e => e.preventDefault());
document.addEventListener("drop", e => { e.preventDefault(); const f = e.dataTransfer?.files[0]; if (f) openFile(f); });

let observer = null;
function buildPages() {
  const box = $("pages"); box.textContent = ""; observer?.disconnect(); drawn.clear();
  $("hint").hidden = true;
  observer = new IntersectionObserver(entries => {
    for (const en of entries) {
      const i = +en.target.dataset.i;
      if (en.isIntersecting) { drawPage(i); if (en.intersectionRatio >= 0.5 || en.intersectionRect.height > box.clientHeight * 0.5) { seen.add(i); updateInfo(); } }
    }
  }, { root: box, threshold: [0, 0.5, 1] });
  doc.pages.forEach((p, i) => {
    const el = document.createElement("div"); el.className = "page"; el.dataset.i = i; el.style.aspectRatio = `${p.w} / ${p.h}`;
    const cv = document.createElement("canvas"); el.appendChild(cv);
    const layer = document.createElement("div"); layer.className = "layer" + (current ? "" : " nostamp"); layer.dataset.i = i; el.appendChild(layer);
    const no = document.createElement("span"); no.className = "pno"; no.textContent = `${i + 1} / ${doc.pages.length}`; el.appendChild(no);
    box.appendChild(el); observer.observe(el); wireLayer(layer, i);
  });
  box.scrollTop = 0; redrawStamps(); updateButtons(); updateInfo();
}
const drawn = new Set();
async function drawPage(i) {
  if (drawn.has(i)) return; drawn.add(i);
  const el = $("pages").children[i], cv = el.querySelector("canvas");
  const d = doc, dpr = Math.min(2, window.devicePixelRatio || 1), cssW = el.clientWidth || 800, p = doc.pages[i];
  const scale = Math.min(4, cssW * dpr / p.w);
  try {
    if (doc.kind === "pdf") {
      const page = await doc.pdf.getPage(i + 1); const vp = page.getViewport({ scale });
      cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
      await page.render({ canvas: cv, canvasContext: cv.getContext("2d"), viewport: vp }).promise;
    } else { cv.width = p.w; cv.height = p.h; cv.getContext("2d").drawImage(doc.bitmap, 0, 0); }
  } catch (ex) {
    if (d !== doc || ex.name === "RenderingCancelledException") return; // a newer document replaced this one
    drawn.delete(i); err("failed", ex.message);
  }
}
const docOf = () => doc; // for tests
window.__stampApp = { get doc() { return docOf(); }, get stamps() { return stamps; }, get seen() { return [...seen]; } };

// ---------- placing, moving, resizing ----------
// Stamp geometry is stored as fractions of the page as displayed (rotation applied), origin top-left.
const snapshot = () => { undoStack.push(JSON.stringify(stamps)); if (undoStack.length > 200) undoStack.shift(); };
let uid = 0;
async function frameFor(sid, pageIdx, mm) {
  const s = stampById(sid), { w, h } = await stampSize(s), p = doc.pages[pageIdx];
  const fw = Math.min(0.9, mm / p.mmW); return { fw, fh: fw * (h / w) * (p.w / p.h) };
}
function wireLayer(layer, i) {
  let ghost = null;
  const rel = e => { const r = layer.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
  layer.addEventListener("pointermove", async e => {
    if (e.target !== layer || !current || e.pointerType === "touch" || drag) { ghost?.remove(); ghost = null; return; }
    const s = stampById(current); const { fw, fh } = await frameFor(current, i, +$("size").value || s.mm);
    if (!ghost) { ghost = document.createElement("img"); ghost.className = "ghost"; ghost.alt = ""; layer.appendChild(ghost); }
    if (ghost.src !== s.data) ghost.src = s.data;
    const [x, y] = rel(e); Object.assign(ghost.style, { left: (x - fw / 2) * 100 + "%", top: (y - fh / 2) * 100 + "%", width: fw * 100 + "%", height: fh * 100 + "%" });
  });
  layer.addEventListener("pointerleave", () => { ghost?.remove(); ghost = null; });
  layer.addEventListener("pointerdown", async e => {
    if (e.target !== layer || e.button !== 0) return;
    if (!current) { select(null); return warn("needStamp"); }
    const [x, y] = rel(e); const s = stampById(current); const mm = Math.max(5, Math.min(80, +$("size").value || s.mm));
    const { fw, fh } = await frameFor(current, i, mm);
    snapshot();
    const st = { id: ++uid, page: i, sid: current, x: clamp01(x - fw / 2, fw), y: clamp01(y - fh / 2, fh), w: fw, h: fh };
    stamps.push(st); s.mm = mm; persist(); ghost?.remove(); ghost = null;
    select(st.id); redrawStamps(); log("placed", i + 1);
  });
}
const clamp01 = (v, size) => Math.max(0, Math.min(1 - size, v));
let drag = null;
function redrawStamps() {
  document.querySelectorAll(".stamp").forEach(n => n.remove());
  const layers = document.querySelectorAll(".layer");
  for (const st of stamps) {
    const s = stampById(st.sid); if (!s) continue;
    const el = document.createElement("div"); el.className = "stamp" + (st.id === selected ? " sel" : ""); el.dataset.id = st.id;
    Object.assign(el.style, { left: st.x * 100 + "%", top: st.y * 100 + "%", width: st.w * 100 + "%", height: st.h * 100 + "%" });
    const im = document.createElement("img"); im.src = s.data; im.alt = "stamp"; el.appendChild(im);
    const h = document.createElement("div"); h.className = "h"; el.appendChild(h);
    const del = document.createElement("button"); del.className = "del"; del.textContent = "×"; del.title = t("del"); del.setAttribute("aria-label", t("del")); el.appendChild(del);
    del.onpointerdown = e => e.stopPropagation();
    del.onclick = e => { e.stopPropagation(); remove(st.id); };
    el.onpointerdown = e => {
      if (e.button !== 0) return; e.stopPropagation(); select(st.id);
      const layer = el.parentElement, r = layer.getBoundingClientRect();
      drag = { st, mode: e.target === h ? "resize" : "move", sx: e.clientX, sy: e.clientY, r, orig: { ...st }, moved: false };
      el.setPointerCapture(e.pointerId);
    };
    el.onpointermove = e => {
      if (!drag || drag.st !== st) return;
      const dx = (e.clientX - drag.sx) / drag.r.width, dy = (e.clientY - drag.sy) / drag.r.height, o = drag.orig;
      if (!drag.moved) { if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) < 2) return; snapshot(); drag.moved = true; }
      if (drag.mode === "move") { st.x = clamp01(o.x + dx, st.w); st.y = clamp01(o.y + dy, st.h); }
      else { const ratio = o.h / o.w; let w = Math.max(0.01, Math.min(1 - o.x, o.w + dx)); let hh = w * ratio; if (o.y + hh > 1) { hh = 1 - o.y; w = hh / ratio; } st.w = w; st.h = hh; }
      Object.assign(el.style, { left: st.x * 100 + "%", top: st.y * 100 + "%", width: st.w * 100 + "%", height: st.h * 100 + "%" });
    };
    el.onpointerup = el.onpointercancel = () => {
      if (drag?.st === st && drag.mode === "resize" && drag.moved) { const mm = Math.round(st.w * doc.pages[st.page].mmW); $("size").value = mm; const s2 = stampById(st.sid); if (s2) { s2.mm = Math.max(5, Math.min(80, mm)); persist(); } }
      drag = null; updateButtons();
    };
    layers[st.page]?.appendChild(el);
  }
  updateButtons(); updateInfo();
}
function select(id) { selected = id; document.querySelectorAll(".stamp").forEach(n => n.classList.toggle("sel", +n.dataset.id === id)); }
function remove(id) { snapshot(); stamps = stamps.filter(s => s.id !== id); if (selected === id) selected = null; redrawStamps(); }
$("size").onchange = () => {
  const mm = Math.max(5, Math.min(80, +$("size").value || 15)); $("size").value = mm;
  const st = stamps.find(s => s.id === selected);
  if (st) { snapshot(); const p = doc.pages[st.page], ratio = st.h / st.w; const cx = st.x + st.w / 2, cy = st.y + st.h / 2;
    st.w = Math.min(0.9, mm / p.mmW); st.h = st.w * ratio; st.x = clamp01(cx - st.w / 2, st.w); st.y = clamp01(cy - st.h / 2, st.h); redrawStamps(); }
  const s = stampById(st?.sid || current); if (s) { s.mm = mm; persist(); }
};
$("undo").onclick = () => { const prev = undoStack.pop(); if (prev == null) return; stamps = JSON.parse(prev).filter(s => stampById(s.sid)); if (!stamps.some(s => s.id === selected)) selected = null; redrawStamps(); };
document.addEventListener("keydown", e => {
  if (e.target.closest?.("input")) return;
  if ((e.key === "Delete" || e.key === "Backspace") && selected) { e.preventDefault(); remove(selected); }
  else if (e.key === "Escape") select(null);
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); $("undo").click(); }
});
document.addEventListener("pointerdown", e => { if (!e.target.closest?.(".stamp, .layer, #bar")) select(null); });
function updateButtons() { $("undo").disabled = !undoStack.length; $("export").disabled = !doc || !stamps.length; }
function updateInfo() {
  if (!doc) { $("info").textContent = ""; return; }
  const n = doc.pages.length, s = t("info", stamps.length, n, seen.size);
  $("info").textContent = seen.size < n ? `${s} · ${t("unseen", n - seen.size)}` : s;
}

// ---------- export ----------
export async function buildOutput() {
  const used = [...new Set(stamps.map(s => s.sid))];
  if (doc.kind === "pdf") {
    const out = await PDFDocument.load(doc.bytes, { updateMetadata: false });
    const emb = {}; for (const sid of used) emb[sid] = await out.embedPng(b64ToBytes(stampById(sid).data.split(",")[1]));
    const vps = {};
    for (const st of stamps) {
      // view rect -> PDF user space: take the stamp's bottom-left as displayed, rotate with the page so it reads upright
      vps[st.page] ??= (await doc.pdf.getPage(st.page + 1)).getViewport({ scale: 1 });
      const vp = vps[st.page], w = st.w * vp.width, h = st.h * vp.height;
      const [ox, oy] = vp.convertToPdfPoint(st.x * vp.width, st.y * vp.height + h);
      out.getPage(st.page).drawImage(emb[st.sid], { x: ox, y: oy, width: w, height: h, rotate: degrees(vp.rotation) });
    }
    return { bytes: await out.save(), mime: "application/pdf", name: baseName(doc.name) + "-stamped.pdf" };
  }
  const p = doc.pages[0], c = document.createElement("canvas"); c.width = p.w; c.height = p.h;
  const g = c.getContext("2d"); g.drawImage(doc.bitmap, 0, 0);
  for (const st of stamps) { await stampSize(stampById(st.sid)); g.drawImage(imgCache.get(st.sid).img, st.x * p.w, st.y * p.h, st.w * p.w, st.h * p.h); }
  const jpeg = doc.mime === "image/jpeg", mime = jpeg ? "image/jpeg" : "image/png";
  const data = c.toDataURL(mime, 0.95).split(",")[1];
  return { b64: data, mime, name: baseName(doc.name) + "-stamped." + (jpeg ? "jpg" : "png") };
}
const toB64 = u8 => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const caps = () => app.getHostCapabilities() || {};
const summary = how => { // only a summary goes to the agent: no document content, no stamp image
  const pages = [...new Set(stamps.map(s => s.page + 1))].sort((a, b) => a - b);
  app.updateModelContext({ content: [{ type: "text", text: `User placed ${stamps.length} stamp(s) by hand on page(s) ${pages.join(", ")} of a ${doc.pages.length}-page document and ${how}.` }] }).catch(() => {});
};
// Result panel for hosts without ui/download-file (Claude today). A browser can show and copy an image
// but cannot save or copy a PDF from a sandboxed iframe, so a PDF goes to the chat as a file when the host
// accepts files in ui/message, and the stamped pages are always shown as images to save or copy.
let last = null; // { o, shots: [{ page, url }] }
const MAX_SHOTS = 10;
async function pageShots(o) {
  if (o.mime !== "application/pdf") return [{ page: 1, url: `data:${o.mime};base64,${o.b64}` }];
  const pages = [...new Set(stamps.map(s => s.page))].sort((a, b) => a - b).slice(0, MAX_SHOTS);
  const task = pdfjs.getDocument({ ...PDF_OPTS, data: o.bytes.slice() }), pdf = await task.promise, out = [];
  try {
    for (const i of pages) {
      const page = await pdf.getPage(i + 1), v1 = page.getViewport({ scale: 1 });
      const scale = Math.min(200 / 72, Math.sqrt(16e6 / (v1.width * v1.height))); // ~200 dpi, at most 16 MP
      const vp = page.getViewport({ scale }), c = document.createElement("canvas"); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
      await page.render({ canvas: c, canvasContext: g, viewport: vp }).promise;
      out.push({ page: i + 1, url: c.toDataURL("image/png") });
    }
  } finally { task.destroy(); }
  return out;
}
function showOut(o, shots, reason) {
  last = { o, shots };
  const isPdf = o.mime === "application/pdf", m = caps().message || {};
  $("outWhy").textContent = t("outWhy", reason) + " " + (isPdf ? t("outHintPdf") : t("outHint"));
  $("sendPdf").hidden = !(isPdf && m.resource);
  $("sendImg").hidden = !m.image;
  $("sendImg").dataset.i18n = isPdf ? "sendPages" : "send"; $("sendImg").textContent = t($("sendImg").dataset.i18n);
  const box = $("outShots"); box.textContent = "";
  for (const sh of shots) {
    const f = document.createElement("figure"), im = document.createElement("img"), cap = document.createElement("figcaption"), cp = document.createElement("button");
    im.src = sh.url; im.alt = `page ${sh.page}`; cap.textContent = isPdf ? t("pageN", sh.page) + " " : "";
    cp.textContent = t("copy"); cp.onclick = () => copyImage(sh.url); cap.appendChild(cp);
    f.append(im, cap); box.appendChild(f);
  }
  $("out").hidden = false; $("out").scrollIntoView({ block: "nearest" });
}
async function copyImage(url) {
  try {
    const blob = await (await createImageBitmap(new Blob([b64ToBytes(url.split(",")[1])], { type: url.slice(5, url.indexOf(";")) })).then(bmp => {
      const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height; c.getContext("2d").drawImage(bmp, 0, 0);
      return new Promise(res => c.toBlob(res, "image/png")); }));
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    log("copied"); summary("copied it");
  } catch { warn("copyFailed"); }
}
$("sendPdf").onclick = async () => {
  if (!last) return; const { o } = last;
  try {
    const r = await app.sendMessage({ role: "user", content: [
      { type: "resource", resource: { uri: "file:///" + encodeURIComponent(o.name), mimeType: o.mime, blob: toB64(o.bytes) } },
      { type: "text", text: t("sentText", o.name) }] });
    if (r?.isError) throw new Error(t("rejected"));
    log("sent"); summary("sent the stamped PDF to the chat");
  } catch (ex) { err("sendPdfFailed", ex.message); }
};
$("sendImg").onclick = async () => {
  if (!last) return; const { o, shots } = last;
  try {
    const r = await app.sendMessage({ role: "user", content: [
      ...shots.map(sh => ({ type: "image", data: sh.url.split(",")[1], mimeType: sh.url.slice(5, sh.url.indexOf(";")) })),
      { type: "text", text: t("sentText", o.name) }] });
    if (r?.isError) throw new Error(t("rejected"));
    log("sent"); summary("sent images of the stamped pages to the chat");
  } catch (ex) { err("failed", ex.message); }
};
$("closeOut").onclick = () => { $("out").hidden = true; };
$("export").onclick = async () => {
  if (!doc || !stamps.length) return;
  $("export").disabled = true; log("exporting");
  try {
    const o = await buildOutput();
    let reason = t("noDownload");
    if (caps().downloadFile) {
      try {
        const r = await app.downloadFile({ contents: [{ type: "resource", resource: { uri: "file:///" + encodeURIComponent(o.name), mimeType: o.mime, blob: o.b64 || toB64(o.bytes) } }] });
        if (!r?.isError) { log("exported", o.name); summary("exported it"); return; }
        reason = t("denied");
      } catch (ex) { reason = ex.message; }
    }
    showOut(o, await pageShots(o), reason); log("useBelow");
  } catch (ex) { err("failed", ex.message); }
  finally { updateButtons(); }
};

render();
$("size").value = stampById(current)?.mm || 15;
await app.connect();
applyHost(app.getHostContext());
log("connected");
