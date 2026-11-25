import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";
window.__log = [];
window.startHost = async (html, caps, info) => {
  const f = document.createElement("iframe");
  f.sandbox = "allow-scripts allow-same-origin"; f.style.cssText = "width:900px;height:600px";
  document.body.appendChild(f);
  const bridge = new AppBridge(null, info || { name: "TestHost", version: "1" },
    caps || { updateModelContext: { text: {}, image: {} }, downloadFile: {}, serverTools: {} });
  bridge.onupdatemodelcontext = async (p) => { window.__log.push({ ev: "ctx", types: p.content.map(c => c.type), text: p.content.find(c => c.type === "text")?.text, bytes: (p.content.find(c=>c.type==="image")?.data||"").length }); return {}; };
  bridge.ondownloadfile = async (p) => { const r = p.contents[0].resource; window.__log.push({ ev: "download", uri: r.uri, mime: r.mimeType, bytes: r.blob.length }); window.__lastBlob = r.blob; return {}; };
  bridge.onmessage = async (p) => { window.__log.push({ ev: "message", types: p.content.map(c => c.type), mime: p.content.map(c => c.resource?.mimeType || c.mimeType || "") }); window.__lastMsg = p; return window.__msgResult || {}; };
  bridge.oninitialized = () => window.__log.push({ ev: "initialized" });
  window.bridge = bridge;
  const ready = new Promise(r => f.onload = r);
  f.srcdoc = html; await ready;
  await bridge.connect(new PostMessageTransport(f.contentWindow, f.contentWindow));
};
