// Renders docs/stamp.png and docs/dark.png for the README. Usage: npm run build && node test/screenshot.cjs
const { chromium } = require("playwright"); const http = require("http"); const fs = require("fs"); const path = require("path");
const out = path.join(__dirname, ".build");
(async () => {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.Helvetica), fb = await d.embedFont(StandardFonts.HelveticaBold);
  const p = d.addPage([595, 842]);
  p.drawText("Purchase Approval", { x: 50, y: 770, size: 24, font: fb });
  const cols = ["Drafted", "Reviewed", "Approved"]; cols.forEach((c, i) => { const x = 365 + i * 60; p.drawRectangle({ x, y: 720, width: 60, height: 70, borderWidth: 1, borderColor: rgb(0, 0, 0) }); p.drawLine({ start: { x, y: 772 }, end: { x: x + 60, y: 772 }, thickness: 1 }); p.drawText(c, { x: x + 6, y: 777, size: 9, font: f }); });
  [["Item", "Laptop (2 units)"], ["Amount", "USD 3,200"], ["Vendor", "Example Supplies Ltd."], ["Reason", "Replacement of devices older than five years"]].forEach(([k, v], i) => {
    p.drawText(k, { x: 50, y: 660 - i * 34, size: 12, font: fb }); p.drawText(v, { x: 150, y: 660 - i * 34, size: 12, font: f }); });
  for (let i = 0; i < 9; i++) p.drawLine({ start: { x: 50, y: 500 - i * 22 }, end: { x: 545 - (i % 3) * 60, y: 500 - i * 22 }, thickness: 6, color: rgb(0.88, 0.88, 0.88) });
  fs.writeFileSync(path.join(out, "approval.pdf"), await d.save());
  const ui = (await import(path.join(__dirname, "../lib/ui-html.js"))).default;
  const srv = http.createServer((q, r) => { const f = path.join(out, q.url.split("?")[0]); fs.existsSync(f) ? r.end(fs.readFileSync(f)) : (r.statusCode = 404, r.end()); }).listen(0);
  const b = await chromium.launch();
  for (const [scheme, file] of [["light", "stamp.png"], ["dark", "dark.png"]]) {
    const pg = await b.newPage({ viewport: { width: 920, height: 760 }, colorScheme: scheme, locale: scheme === "dark" ? "ko-KR" : "en-US", deviceScaleFactor: 2 });
    await pg.goto(`http://localhost:${srv.address().port}/host.html`); await pg.evaluate(h => startHost(h), ui);
    await pg.evaluate(() => { const f = document.querySelector("iframe"); f.style.cssText = "width:900px;height:740px;border:0"; document.body.style.margin = "10px"; });
    const fr = pg.frames()[1]; await fr.waitForFunction(() => /^(Ready|준비됨)$/.test(document.getElementById("st").textContent));
    const seal = Buffer.from(await pg.evaluate(() => { const c = document.createElement("canvas"); c.width = 240; c.height = 240; const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, 240, 240);
      x.strokeStyle = "#c8102e"; x.lineWidth = 14; x.beginPath(); x.arc(120, 120, 100, 0, 7); x.stroke(); x.fillStyle = "#c8102e"; x.font = "bold 64px serif"; x.textAlign = "center"; x.fillText("HQ", 120, 110); x.font = "bold 40px serif"; x.fillText("LEE", 120, 165); return c.toDataURL().split(",")[1]; }), "base64");
    fs.writeFileSync(path.join(out, "seal.png"), seal);
    await fr.setInputFiles("#stampFile", path.join(out, "seal.png")); await fr.setInputFiles("#file", path.join(out, "approval.pdf"));
    await fr.waitForFunction(() => document.querySelector(".page canvas")?.width > 0); await pg.waitForTimeout(300);
    await fr.evaluate(() => { document.getElementById("size").value = 14; document.getElementById("size").dispatchEvent(new Event("change")); });
    const box = await fr.evaluate(() => { const r = document.querySelector(".layer").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
    const fo = await (await pg.$("iframe")).boundingBox();
    const at = (fx, fy) => [fo.x + box.x + fx * box.w, fo.y + box.y + fy * box.h];
    await pg.mouse.click(...at(395 / 595, 1 - 746 / 842)); await pg.mouse.click(...at(455 / 595, 1 - 746 / 842));
    await pg.mouse.move(...at(515 / 595, 1 - 746 / 842)); await pg.waitForTimeout(200);
    await pg.screenshot({ path: path.join(__dirname, "../docs", file), clip: { x: 10, y: 10, width: 900, height: 520 } });
    await pg.close();
  }
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
