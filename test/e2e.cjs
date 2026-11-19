// Browser test: loads the built UI into a spec-style test host (sandboxed iframe + AppBridge)
// under the default MCP Apps CSP, then checks stamp setup, PDF/image loading, placing by hand,
// move/resize/undo/delete, export (rotated pages too), persistence, warnings, i18n and theme.
// Usage: npm run build && npm run test:e2e
const { chromium } = require("playwright"); const http = require("http"); const fs = require("fs"); const path = require("path");
const { buildSync } = require("esbuild");
const out = path.join(__dirname, ".build"); fs.mkdirSync(out, { recursive: true });
buildSync({ entryPoints: [path.join(__dirname, "host.js")], bundle: true, format: "iife", outfile: path.join(out, "host.js"), logLevel: "warning" });
fs.writeFileSync(path.join(out, "host.html"), '<!doctype html><html><body><script src="host.js"></script></body></html>');
const CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'">`;
let failures = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) failures++; };

async function makePdfs() {
  const { PDFDocument, StandardFonts, degrees, rgb } = await import("pdf-lib");
  const fontkit = (await import("@pdf-lib/fontkit")).default;
  const d = await PDFDocument.create(); d.registerFontkit(fontkit);
  const ttf = await d.embedFont(fs.readFileSync(path.join(__dirname, "../node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf")));
  const helv = await d.embedFont(StandardFonts.Helvetica);
  [0, 90, 180, 270].forEach(r => { const p = d.addPage([612, 792]); p.drawText("Approval doc rotation " + r, { x: 50, y: 700, size: 28, font: ttf, color: rgb(0, 0, 0) }); p.drawText("standard font", { x: 50, y: 650, size: 20, font: helv }); p.setRotation(degrees(r)); });
  const plain = await d.save({ useObjectStreams: false });
  fs.writeFileSync(path.join(out, "doc.pdf"), plain);
  // "encrypted": a trailer that declares /Encrypt is enough for pdf-lib to refuse it
  const s = Buffer.from(plain).toString("latin1").replace(/trailer\s*<</, "trailer\n<<\n/Encrypt << /Filter /Standard /V 1 /R 2 /O <00> /U <00> /P -4 >>");
  fs.writeFileSync(path.join(out, "enc.pdf"), Buffer.from(s, "latin1"));
  const sd = await PDFDocument.create(); sd.addPage([300, 300]);
  sd.context.register(sd.context.obj({ Type: "Sig", Filter: "Adobe.PPKLite", ByteRange: [0, 10, 20, 30] }));
  fs.writeFileSync(path.join(out, "signed.pdf"), await sd.save({ useObjectStreams: false }));
}

(async () => {
  await makePdfs();
  const ui = (await import(path.join(__dirname, "../lib/ui-html.js"))).default.replace("<head>", "<head>" + CSP);
  const srv = http.createServer((q, r) => { const p = path.join(out, q.url.split("?")[0]); fs.existsSync(p) ? r.end(fs.readFileSync(p)) : (r.statusCode = 404, r.end()); }).listen(0);
  const base = `http://localhost:${srv.address().port}/host.html`;
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1000, height: 900 }, locale: "en-US", colorScheme: "light" });
  const csp = [];
  const open = async (c = ctx) => {
    const pg = await c.newPage();
    pg.on("pageerror", e => ok(false, "page error: " + e.message));
    pg.on("console", m => { if (/Content.Security|Refused to/i.test(m.text())) csp.push(m.text().slice(0, 160)); });
    await pg.goto(base); await pg.evaluate(h => startHost(h), ui);
    const fr = pg.frames()[1]; await fr.waitForFunction(() => /^(Ready|준비됨)$/.test(document.getElementById("st").textContent), null, { timeout: 20000 });
    return [pg, fr];
  };
  const st = fr => fr.textContent("#st");
  const waitSt = (fr, re) => fr.waitForFunction(r => new RegExp(r).test(document.getElementById("st").textContent), re.source, { timeout: 20000 }).catch(async e => { throw new Error(`status "${await fr.textContent("#st")}" never matched ${re}`); });
  // stamp: left half red, right half blue, on a white background with a grey margin (like a scan)
  const stampPng = async pg => Buffer.from(await pg.evaluate(() => { const c = document.createElement("canvas"); c.width = 300; c.height = 200; const x = c.getContext("2d");
    x.fillStyle = "#f4f4f4"; x.fillRect(0, 0, 300, 200); x.fillStyle = "#ffffff"; x.fillRect(20, 20, 260, 160);
    x.fillStyle = "#d00000"; x.fillRect(50, 50, 100, 100); x.fillStyle = "#0000d0"; x.fillRect(150, 50, 100, 100); return c.toDataURL().split(",")[1]; }), "base64");
  const color = s => { const [r, g, b] = s.split(",").map(Number); return r > 150 && g < 90 && b < 90 ? "red" : b > 150 && r < 90 && g < 90 ? "blue" : r > 235 && g > 235 && b > 235 ? "white" : s; };
  // pixel on page i's canvas at fraction (fx, fy)
  const px = (fr, i, fx, fy) => fr.evaluate(([i, fx, fy]) => { const c = document.querySelectorAll(".page canvas")[i]; const g = c.getContext("2d");
    return [...g.getImageData(Math.floor(fx * c.width), Math.floor(fy * c.height), 1, 1).data].slice(0, 3).join(); }, [i, fx, fy]);
  const pageBox = (fr, i) => fr.evaluate(i => { const r = document.querySelectorAll(".layer")[i].getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, i);
  const frameOffset = async pg => { const r = await (await pg.$("iframe")).boundingBox(); return [r.x, r.y]; };
  const clickPage = async (pg, fr, i, fx, fy) => {
    await fr.evaluate(i => document.querySelectorAll(".page")[i].scrollIntoView({ block: "center" }), i); await pg.waitForTimeout(150);
    const b = await pageBox(fr, i), [ox, oy] = await frameOffset(pg);
    await pg.mouse.move(ox + b.x + fx * b.w, oy + b.y + fy * b.h); await pg.mouse.down(); await pg.mouse.up(); await pg.waitForTimeout(150);
  };

  // 1. empty state
  let [pg, fr] = await open();
  ok(await fr.isVisible("#hint") && await fr.isDisabled("#export"), "starts with a hint and export disabled");
  ok((await fr.evaluate(() => [...document.querySelectorAll("#tray .chip")].length)) === 0, "no stamps yet");

  // 2. add a stamp: background removed, cropped, kept in this browser
  const sp = path.join(out, "stamp.png"); fs.writeFileSync(sp, await stampPng(pg));
  await fr.setInputFiles("#stampFile", sp); await waitSt(fr, /saved in this browser/);
  const lib = await fr.evaluate(() => JSON.parse(localStorage.getItem("stamp:library")));
  ok(lib.length === 1 && lib[0].mm === 15, "stamp saved to localStorage with default 15 mm");
  const stampInfo = await fr.evaluate(async d => { const i = new Image(); i.src = d; await i.decode(); const c = document.createElement("canvas"); c.width = i.width; c.height = i.height; const g = c.getContext("2d"); g.drawImage(i, 0, 0);
    return { w: i.width, h: i.height, corner: g.getImageData(0, 0, 1, 1).data[3], mid: [...g.getImageData(i.width / 4, i.height / 2, 1, 1).data].join() }; }, lib[0].data);
  ok(stampInfo.corner === 0, "white background removed (corner transparent)");
  ok(Math.abs(stampInfo.w - 204) <= 2 && Math.abs(stampInfo.h - 104) <= 2, `cropped to the ink (${stampInfo.w}x${stampInfo.h})`);
  ok(/^20[0-9],0,0,255$/.test(stampInfo.mid), "ink kept opaque: " + stampInfo.mid);

  // 3. open a 4-page PDF with rotated pages
  await fr.setInputFiles("#file", path.join(out, "doc.pdf")); await waitSt(fr, /Opened doc\.pdf \(4 pages\)/);
  ok((await fr.evaluate(() => document.querySelectorAll(".page").length)) === 4, "4 pages laid out");
  await fr.waitForFunction(() => document.querySelector(".page canvas").width > 0);
  await pg.waitForTimeout(300);
  ok(await fr.evaluate(() => { const c = document.querySelector(".page canvas"), g = c.getContext("2d"); const d = g.getImageData(0, Math.floor(c.height * 0.09), Math.floor(c.width * 0.6), Math.floor(c.height * 0.04)).data;
    let dark = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 100) dark++; return dark > 200; }), "embedded-font text rendered on page 1");
  ok(/Stamps 0 · pages reviewed \d\/4 · \d page\(s\) not viewed yet/.test(await fr.textContent("#info")), "review counter shown: " + await fr.textContent("#info"));

  // 4. place by hand on every page, check the ghost preview first
  await fr.evaluate(() => document.querySelectorAll(".page")[0].scrollIntoView({ block: "center" })); await pg.waitForTimeout(150);
  { const b0 = await pageBox(fr, 0), [ox, oy] = await frameOffset(pg); await pg.mouse.move(ox + b0.x + b0.w * 0.5, oy + b0.y + b0.h * 0.5); await pg.waitForTimeout(150); }
  ok(await fr.isVisible(".ghost"), "hover shows a stamp preview before clicking");
  const spots = [[0.3, 0.4], [0.6, 0.3], [0.5, 0.7], [0.25, 0.6]];
  for (let i = 0; i < 4; i++) await clickPage(pg, fr, i, ...spots[i]);
  const placed = await fr.evaluate(() => __stampApp.stamps.map(s => ({ ...s })));
  ok(placed.length === 4 && placed.every((s, i) => s.page === i), "one stamp per page placed by click");
  ok(Math.abs(placed[0].x + placed[0].w / 2 - 0.3) < 0.01 && Math.abs(placed[0].y + placed[0].h / 2 - 0.4) < 0.01, "stamp centred on the click");
  ok(Math.abs(placed[0].w * 215.9 - 15) < 0.5, `default width is 15 mm on a Letter page (${(placed[0].w * 215.9).toFixed(1)} mm)`);
  ok(!(await fr.isDisabled("#export")), "export enabled after stamping");
  ok(/Stamps 4 · pages reviewed 4\/4$/.test(await fr.textContent("#info")), "all pages counted as reviewed after scrolling: " + await fr.textContent("#info"));

  // 5. move, resize, undo, delete
  await fr.evaluate(() => document.querySelectorAll(".page")[0].scrollIntoView({ block: "center" })); await pg.waitForTimeout(150);
  { const b0 = await pageBox(fr, 0), [ox, oy] = await frameOffset(pg), s = placed[0];
    const cx = ox + b0.x + (s.x + s.w / 2) * b0.w, cy = oy + b0.y + (s.y + s.h / 2) * b0.h;
    await pg.mouse.move(cx, cy); await pg.mouse.down(); await pg.mouse.move(cx + 0.1 * b0.w, cy + 0.05 * b0.h, { steps: 5 }); await pg.mouse.up(); }
  let s0 = await fr.evaluate(() => ({ ...__stampApp.stamps[0] }));
  ok(Math.abs(s0.x - placed[0].x - 0.1) < 0.01 && Math.abs(s0.y - placed[0].y - 0.05) < 0.01, "drag moves the stamp");
  { const hb = await (await fr.$(".stamp.sel .h")).boundingBox(); const b0 = await pageBox(fr, 0);
    await pg.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await pg.mouse.down(); await pg.mouse.move(hb.x + hb.width / 2 + 0.05 * b0.w, hb.y + 40, { steps: 5 }); await pg.mouse.up(); }
  const s1 = await fr.evaluate(() => ({ ...__stampApp.stamps[0] }));
  ok(s1.w > s0.w * 1.3 && Math.abs(s1.h / s1.w - s0.h / s0.w) < 1e-6, "corner handle resizes and keeps the aspect ratio");
  ok(+(await fr.inputValue("#size")) === Math.round(s1.w * 215.9), "size box follows the resize (mm)");
  await fr.click("#undo"); await fr.click("#undo");
  s0 = await fr.evaluate(() => ({ ...__stampApp.stamps[0] }));
  ok(Math.abs(s0.x - placed[0].x) < 1e-9 && Math.abs(s0.w - placed[0].w) < 1e-9, "undo reverts resize and move");
  await clickPage(pg, fr, 0, 0.8, 0.7);
  ok((await fr.evaluate(() => __stampApp.stamps.length)) === 5, "second stamp on page 1");
  await pg.keyboard.press("Delete");
  ok((await fr.evaluate(() => __stampApp.stamps.length)) === 4, "Delete key removes the selected stamp");

  // 6. export and check every page of the output, rotated ones included
  await fr.click("#export"); await waitSt(fr, /Exported doc-stamped\.pdf/);
  const dl = await pg.evaluate(() => __log.filter(e => e.ev === "download"));
  ok(dl.length === 1 && dl[0].mime === "application/pdf" && /doc-stamped\.pdf$/.test(dl[0].uri), "export sends a PDF via ui/download-file");
  const ctxEv = await pg.evaluate(() => __log.filter(e => e.ev === "ctx"));
  ok(ctxEv.length === 1 && ctxEv[0].types.join() === "text" && /4 stamp\(s\) by hand on page\(s\) 1, 2, 3, 4/.test(ctxEv[0].text), "agent gets a text summary only (no document, no stamp)");
  const outPdf = path.join(out, "out.pdf"); fs.writeFileSync(outPdf, Buffer.from(await pg.evaluate(() => __lastBlob), "base64"));
  { const { PDFDocument } = await import("pdf-lib"); const o = await PDFDocument.load(fs.readFileSync(outPdf)); ok(o.getPageCount() === 4 && o.getPage(1).getRotation().angle === 90, "output keeps pages and rotation"); }
  await fr.setInputFiles("#file", path.join(out, "out.pdf")); await waitSt(fr, /Opened out\.pdf/);
  for (let i = 0; i < 4; i++) {
    await fr.evaluate(i => document.querySelectorAll(".page")[i].scrollIntoView({ block: "center" }), i);
    await fr.waitForFunction(i => document.querySelectorAll(".page canvas")[i].width > 0, i); await pg.waitForTimeout(250);
    const s = placed[i], cy = s.y + s.h / 2;
    const L = color(await px(fr, i, s.x + s.w * 0.3, cy)), R = color(await px(fr, i, s.x + s.w * 0.7, cy)), out1 = color(await px(fr, i, s.x - 0.02, cy));
    ok(L === "red" && R === "blue" && out1 === "white", `page ${i + 1} (rot ${[0, 90, 180, 270][i]}): stamp upright where it was placed (${L}/${R}/${out1})`);
  }
  await pg.close();

  // 7. stamp library survives a new window; image documents export as images
  [pg, fr] = await open();
  ok((await fr.evaluate(() => document.querySelectorAll("#tray .chip").length)) === 1, "saved stamp is back in a new window");
  const img = path.join(out, "scan.png");
  fs.writeFileSync(img, Buffer.from(await pg.evaluate(() => { const c = document.createElement("canvas"); c.width = 1240; c.height = 1754; const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.fillStyle = "#000"; x.fillRect(100, 100, 600, 30); return c.toDataURL().split(",")[1]; }), "base64"));
  await fr.setInputFiles("#file", img); await waitSt(fr, /Opened scan\.png \(1 page\)/);
  await clickPage(pg, fr, 0, 0.7, 0.6);
  await fr.click("#export"); await waitSt(fr, /Exported scan-stamped\.png/);
  { const blob = await pg.evaluate(() => __lastBlob); const s = (await fr.evaluate(() => ({ ...__stampApp.stamps[0] })));
    const res = await fr.evaluate(async ([b64, s]) => { const i = new Image(); i.src = "data:image/png;base64," + b64; await i.decode(); const c = document.createElement("canvas"); c.width = i.width; c.height = i.height; const g = c.getContext("2d"); g.drawImage(i, 0, 0);
      const p = (fx, fy) => [...g.getImageData(fx * i.width, fy * i.height, 1, 1).data].slice(0, 3).join(); return { w: i.width, h: i.height, L: p(s.x + s.w * 0.3, s.y + s.h / 2), R: p(s.x + s.w * 0.7, s.y + s.h / 2) }; }, [blob, s]);
    ok(res.w === 1240 && res.h === 1754 && color(res.L) === "red" && color(res.R) === "blue", `image export keeps full size and has the stamp (${res.w}x${res.h})`); }
  // remove the stamp from the library
  await fr.hover("#tray .chip"); await fr.click("#tray .chip .x");
  ok((await fr.evaluate(() => [JSON.parse(localStorage.getItem("stamp:library")).length, __stampApp.stamps.length].join())) === "0,0", "deleting a stamp removes it from storage and from the page");

  // 8. warnings: encrypted and signed PDFs
  await fr.setInputFiles("#file", path.join(out, "enc.pdf")); await waitSt(fr, /password-protected or encrypted/);
  ok((await fr.getAttribute("#st", "class")) === "err", "encrypted PDF refused with an error");
  await fr.setInputFiles("#file", path.join(out, "signed.pdf")); await waitSt(fr, /digital signature/);
  ok((await fr.getAttribute("#st", "class")) === "warn" && (await fr.evaluate(() => document.querySelectorAll(".page").length)) === 1, "signed PDF opens with a warning");
  await pg.close();

  // 9. i18n + theme
  const ko = await b.newContext({ viewport: { width: 1000, height: 800 }, locale: "ko-KR", colorScheme: "dark" });
  [pg, fr] = await open(ko);
  const s = () => fr.evaluate(() => [document.documentElement.lang, document.documentElement.dataset.theme, document.getElementById("export").textContent].join(" "));
  ok((await s()) === "ko dark 내보내기", "follows system language and dark mode");
  await fr.click("#lang"); await fr.click("#theme");
  ok((await s()) === "en light Export", "toggles switch language and theme");
  await pg.evaluate(() => bridge.sendHostContextChange({ theme: "dark", locale: "ko-KR" })); await pg.waitForTimeout(150);
  ok((await s()) === "en light Export", "manual choice is kept when the host changes");
  await pg.close();
  const ko2 = await b.newContext({ locale: "en-US", colorScheme: "light" });
  [pg, fr] = await open(ko2);
  await pg.evaluate(() => bridge.sendHostContextChange({ theme: "dark", locale: "ko-KR" })); await pg.waitForTimeout(150);
  ok((await s()) === "ko dark 내보내기", "follows host theme and locale without a manual choice");
  await fr.setInputFiles("#file", path.join(out, "doc.pdf")); await waitSt(fr, /doc\.pdf 열림 \(4쪽\)/);
  await clickPage(pg, fr, 0, 0.5, 0.5);
  ok(/먼저 도장 이미지를 추가하세요/.test(await st(fr)), "clicking without a stamp asks to add one");
  await pg.close();

  ok(csp.length === 0, "no CSP violations " + csp.slice(0, 3).join(" / "));
  await b.close(); srv.close();
  console.log(failures ? `${failures} FAILED` : "ALL PASS"); process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
