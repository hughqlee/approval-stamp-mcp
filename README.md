# approval-stamp-mcp

Put your own stamp (seal, signature image) on a PDF or image, by hand, inside AI chat apps (Claude, ChatGPT) as an [MCP App](https://github.com/modelcontextprotocol/ext-apps).

The agent only opens the app. **It cannot place a stamp**: you read the document and put each stamp down yourself, which is the point — stamping becomes one more review of the content.

![stamping a PDF](docs/stamp.png)

## Install

No account or sign-in. Endpoint: `https://approval-stamp-mcp.vercel.app/mcp`

- **Claude** (web, desktop, mobile): Settings → Connectors → **Add custom connector** → name `Approval Stamp`, URL `https://approval-stamp-mcp.vercel.app/mcp`. Then turn it on in a chat under **+** → Connectors.
- **ChatGPT**: Settings → Apps → Advanced settings → turn on **Developer mode**, then create an app with the MCP server URL above and authentication **None**.
- **Claude Code**: `claude mcp add --transport http approval-stamp https://approval-stamp-mcp.vercel.app/mcp`
- **Codex and other MCP clients**: add it as a remote (Streamable HTTP) MCP server. The interactive UI shows only in hosts that support MCP Apps.

Guide: [https://approval-stamp-mcp.vercel.app](https://approval-stamp-mcp.vercel.app) · [Privacy policy](https://approval-stamp-mcp.vercel.app/privacy) · [Terms](https://approval-stamp-mcp.vercel.app/terms) · [한국어 README](README.ko.md)

## How it works

- Open, paste or drop a PDF or image (PNG, JPEG, WebP) in the app. Pages render with pdf.js in the browser.
- Add your stamp image once (photo or scan is fine: the white background is made transparent and the image is cropped).
  It is kept in this browser's storage (`localStorage`) and is **never sent to the server or the agent**.
- Hover shows a preview; click to stamp. Drag to move, corner handle to resize, `Delete` to remove, `Ctrl+Z` to undo. Size is set in mm.
- A counter shows how many pages you have actually scrolled through.
- Export (via `ui/download-file`):
  - PDF: the original PDF with the stamp images added (pdf-lib). Text stays text; rotated pages are handled.
  - Image: same size and format (JPEG stays JPEG, otherwise PNG).
- The agent only gets a one-line summary after export ("3 stamps on pages 1, 2"), never the document or the stamp.
- English / Korean and light / dark follow the host until the user toggles them.

Not supported: encrypted / password-protected PDFs (refused), PDF form filling. Digitally signed PDFs open with a warning,
because adding a stamp invalidates the existing signature. Some scanned PDFs with JPEG 2000 / JBIG2 images may show blank
in the preview (those decoders need WebAssembly, which the default MCP Apps CSP does not allow); the export still keeps them.

## Tools

| Tool | Purpose |
| --- | --- |
| `open_stamp` | Opens the stamp app. There is deliberately no tool to place stamps. |

## Privacy

The document and the stamp images never leave the browser: not to this server, not to the AI model. After export the model gets one line
(how many stamps on which pages). The server has no database and keeps nothing. Full policy: [approval-stamp-mcp.vercel.app/privacy](https://approval-stamp-mcp.vercel.app/privacy).

## Develop

```sh
npm install
npm test          # builds the UI, checks the MCP server, runs the browser test (needs Playwright + Chromium)
node test/screenshot.cjs   # regenerates docs/*.png
```

`npm run build` bundles `src/ui.js` (with pdf.js, pdf-lib and the Korean CMaps) into one HTML string at `lib/ui-html.js`,
which `lib/server.js` serves as `ui://stamp/app.html`. pdf.js runs its worker on the main thread because the default
MCP Apps CSP blocks worker scripts and fetch.

## Directory listing

- Public pages (guide, privacy, terms, icon) live in `site/` and are copied to `public/` by `npm run build`.
- Listing screenshots: `node test/listing-shots.cjs` writes `docs/listing/*.png` (PNG, 2000px wide, app area only).
- MCP Registry: `server.json` (`io.github.hughqlee/…`). `.github/workflows/publish-mcp.yml` publishes it (Actions → Run workflow, or push a `v*` tag).
  Keep the version in `server.json`, `package.json` and `lib/server.js` in step; the server test checks it.
- ChatGPT domain check: set the `OPENAI_APPS_CHALLENGE` environment variable in Vercel to the token from the OpenAI portal and redeploy;
  the build serves it at `/.well-known/openai-apps-challenge`.

## Deploy

Vercel: `api/mcp.js` exposes the server; `vercel.json` rewrites `/mcp` to it. Add `https://<your-deployment>/mcp` as a custom connector in Claude.
