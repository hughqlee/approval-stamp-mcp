// Renders the directory listing screenshots (docs/listing/*.png, PNG, 2000px wide, app area only).
// Usage: npm run build && node test/listing-shots.cjs
const { chromium } = require("playwright"); const http = require("http"); const fs = require("fs"); const path = require("path");
const { buildSync } = require("esbuild");
const out = path.join(__dirname, ".build"); fs.mkdirSync(out, { recursive: true });
const dest = path.join(__dirname, "../docs/listing"); fs.mkdirSync(dest, { recursive: true });
buildSync({ entryPoints: [path.join(__dirname, "host.js")], bundle: true, format: "iife", outfile: path.join(out, "host.js"), logLevel: "warning" });
fs.writeFileSync(path.join(out, "host.html"), '<!doctype html><html><body><script src="host.js"></script></body></html>');
(async () => {
  // A made-up purchase approval form (fictional data) with three approval boxes.
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.Helvetica), fb = await d.embedFont(StandardFonts.HelveticaBold);
  for (let n = 0; n < 2; n++) {
    const p = d.addPage([595, 842]);
    p.drawText(n ? "Attachment: Quotation" : "Purchase Approval", { x: 50, y: 770, size: 24, font: fb });
    if (!n) ["Drafted", "Reviewed", "Approved"].forEach((c, i) => { const x = 365 + i * 60; p.drawRectangle({ x, y: 720, width: 60, height: 70, borderWidth: 1, borderColor: rgb(0, 0, 0) }); p.drawLine({ start: { x, y: 772 }, end: { x: x + 60, y: 772 }, thickness: 1 }); p.drawText(c, { x: x + 6, y: 777, size: 9, font: f }); });
    [["Item", "Laptop (2 units)"], ["Amount", "USD 3,200"], ["Vendor", "Example Supplies Ltd."], ["Reason", "Replacement of devices older than five years"]].forEach(([k, v], i) => {
      p.drawText(k, { x: 50, y: 660 - i * 34, size: 12, font: fb }); p.drawText(v, { x: 150, y: 660 - i * 34, size: 12, font: f }); });
    for (let i = 0; i < 12; i++) p.drawLine({ start: { x: 50, y: 500 - i * 22 }, end: { x: 545 - (i % 3) * 60, y: 500 - i * 22 }, thickness: 6, color: rgb(0.88, 0.88, 0.88) });
  }
  fs.writeFileSync(path.join(out, "approval.pdf"), await d.save());
  const ui = (await import(path.join(__dirname, "../lib/ui-html.js"))).default;
  const srv = http.createServer((q, r) => { const p = path.join(out, q.url.split("?")[0]); fs.existsSync(p) ? r.end(fs.readFileSync(p)) : (r.statusCode = 404, r.end()); }).listen(0);
  const b = await chromium.launch();
  const W = 1000, H = 600;
  const open = async (scheme, locale) => {
    const pg = await b.newPage({ viewport: { width: W + 20, height: H + 160 }, colorScheme: scheme, locale, deviceScaleFactor: 2 });
    await pg.goto(`http://localhost:${srv.address().port}/host.html`); await pg.evaluate(h => startHost(h), ui);
    await pg.evaluate(([w, h]) => { const f = document.querySelector("iframe"); f.style.cssText = `width:${w}px;height:${h}px;border:0`; document.body.style.margin = "10px"; }, [W, H + 140]);
    const fr = pg.frames()[1]; await fr.waitForFunction(() => /^(Ready|준비됨)$/.test(document.getElementById("st").textContent));
    const seal = (color, a, b2) => pg.evaluate(([color, a, b2]) => { const c = document.createElement("canvas"); c.width = 240; c.height = 240; const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, 240, 240);
      x.strokeStyle = color; x.lineWidth = 14; x.beginPath(); x.arc(120, 120, 100, 0, 7); x.stroke(); x.fillStyle = color; x.textAlign = "center"; x.font = "bold 64px serif"; x.fillText(a, 120, 110); x.font = "bold 40px serif"; x.fillText(b2, 120, 165); return c.toDataURL().split(",")[1]; }, [color, a, b2]);
    fs.writeFileSync(path.join(out, "seal1.png"), Buffer.from(await seal("#c8102e", "JR", "OK"), "base64"));
    fs.writeFileSync(path.join(out, "seal2.png"), Buffer.from(await seal("#1d4ed8", "QA", "✓"), "base64"));
    await fr.setInputFiles("#stampFile", path.join(out, "seal2.png")); await fr.setInputFiles("#stampFile", path.join(out, "seal1.png"));
    await fr.setInputFiles("#file", path.join(out, "approval.pdf"));
    await fr.waitForFunction(() => document.querySelector(".page canvas")?.width > 0); await pg.waitForTimeout(300);
    await fr.evaluate(() => { document.getElementById("size").value = 14; document.getElementById("size").dispatchEvent(new Event("change")); });
    const box = await fr.evaluate(() => { const r = document.querySelector(".layer").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
    const fo = await (await pg.$("iframe")).boundingBox();
    const at = (px, py) => [fo.x + box.x + px / 595 * box.w, fo.y + box.y + (1 - py / 842) * box.h];
    return [pg, fr, at];
  };
  const fo = () => W - 5; // a point outside the page, so no hover preview shows
  const shot = (pg, name) => pg.screenshot({ path: path.join(dest, name), clip: { x: 10, y: 10, width: W, height: H } });
  // 1. two stamps placed, hover preview on the third box
  let [pg, fr, at] = await open("light", "en-US");
  await pg.mouse.click(...at(395, 746)); await pg.mouse.click(...at(455, 746)); await pg.mouse.move(...at(515, 746)); await pg.waitForTimeout(200);
  await shot(pg, "1.png"); await pg.close();
  [pg, fr, at] = await open("light", "en-US");
  // 2. two different stamps from the tray; the last one stays selected with its move / resize / delete handles
  await pg.mouse.click(...at(395, 746)); await fr.click("#tray .chip[aria-pressed=false]"); await pg.mouse.click(...at(455, 746));
  await pg.mouse.move(fo(pg), 5); await pg.waitForTimeout(200);
  await shot(pg, "2.png"); await pg.close();
  // 3. Korean + dark theme
  [pg, fr, at] = await open("dark", "ko-KR");
  await pg.mouse.click(...at(395, 746)); await pg.mouse.click(...at(455, 746)); await pg.mouse.click(...at(515, 746)); await pg.mouse.move(fo(pg), 5); await pg.waitForTimeout(200);
  await shot(pg, "3.png"); await pg.close();
  await b.close(); srv.close();
  console.log("wrote", fs.readdirSync(dest).join(", "));
})().catch(e => { console.error(e); process.exit(1); });
