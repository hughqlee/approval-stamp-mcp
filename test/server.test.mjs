import { handler } from "../lib/server.js";
const H = { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" };
const call = async (body) => { const r = await handler.fetch(new Request("http://localhost/mcp", { method: "POST", headers: H, body: JSON.stringify(body) })); return [r.status, await r.text()]; };
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const init = await call({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: { extensions: { "io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] } } }, clientInfo: { name: "t", version: "1" } } });
ok(init[0] === 200 && /approval-stamp/.test(init[1]), "initialize");
const list = await call({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
const names = [...list[1].matchAll(/"name":"([a-z_]+)"/g)].map(m => m[1]).filter(n => n !== "approval-stamp");
ok(names.join() === "open_stamp", "only open_stamp is exposed (no agent placement tool): " + names.join());
const res = await call({ jsonrpc: "2.0", id: 3, method: "resources/read", params: { uri: "ui://stamp/app.html" } });
ok(res[0] === 200 && /text\/html;profile=mcp-app/.test(res[1]), "UI resource served, bytes " + res[1].length);
ok(res[1].length < 4.5e6, "resource response under Vercel's 4.5 MB limit");
const t = await call({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "open_stamp", arguments: {} } });
ok(/Stamp app opened/.test(t[1]), "open_stamp returns text");
const big = await handler.fetch(new Request("http://localhost/mcp", { method: "POST", headers: H, body: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/list", params: { pad: "x".repeat(100 * 1024) } }) }));
ok(big.status === 413, "rejects body over 64 KiB (status " + big.status + ")");
// Directory listing requirements: every tool has a title and explicit readOnly/destructive/openWorld hints;
// the server reports its name, title and icons; the public pages exist.
{
  const raw = async (body) => (await handler.fetch(new Request("http://localhost/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" }, body: JSON.stringify(body) }))).text();
  const json = s => JSON.parse(s.split("\n").find(l => l.startsWith("data: ")).slice(6));
  const init = json(await raw({ jsonrpc: "2.0", id: 90, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } })).result.serverInfo;
  const tools = json(await raw({ jsonrpc: "2.0", id: 91, method: "tools/list", params: {} })).result.tools;
  const fs = await import("node:fs");
  const checks = [
    [init.title && init.version && init.icons?.length && init.websiteUrl, "serverInfo has title, version, websiteUrl, icons: " + init.name],
    [tools.every(t => t.title && t.annotations && ["readOnlyHint", "destructiveHint", "openWorldHint"].every(k => typeof t.annotations[k] === "boolean")), "every tool has a title and explicit hints"],
    [["index.html", "privacy.html", "terms.html", "icon.png", "icon.svg", "screenshot.png"].every(f => fs.existsSync("public/" + f)), "public guide, privacy, terms, icon, screenshot built"],
    [JSON.parse(fs.readFileSync("server.json", "utf8")).version === init.version, "server.json version matches the server"],
  ];
  for (const [c, m] of checks) console.log(c ? "PASS" : "FAIL", m);
  if (!checks.every(([c]) => c)) process.exit(1);
}
process.exit(fail ? 1 : 0);
