import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import html from "./ui-html.js";
const URI = "ui://stamp/app.html";
const SITE = "https://approval-stamp-mcp.vercel.app";
export const INFO = {
  name: "approval-stamp", title: "Approval Stamp", version: "1.0.0", websiteUrl: SITE,
  icons: [{ src: `${SITE}/icon.png`, mimeType: "image/png", sizes: ["512x512"] }, { src: `${SITE}/icon.svg`, mimeType: "image/svg+xml", sizes: ["any"] }],
};
// There is deliberately no tool that places a stamp: the point of the app is that a person
// reads the document and puts the stamp down by hand.
function factory() {
  const s = new McpServer(INFO);
  registerAppResource(s, "Approval stamp", URI, { mimeType: RESOURCE_MIME_TYPE }, async () => ({
    contents: [{ uri: URI, mimeType: RESOURCE_MIME_TYPE, text: html }],
  }));
  registerAppTool(s, "open_stamp", {
    title: "Open approval stamp",
    description: "Open an app where the user loads a PDF or image and places their own stamp or signature image on it by hand, then exports the stamped file. " +
      "Use when the user wants to stamp, sign or approve a document. You cannot place stamps: the user reviews the document and stamps it themselves. " +
      "The document and the stamp stay in the user's browser and are not shared with you.",
    inputSchema: z.object({}),
    // Only opens the app; stamping happens by the user's hand inside it.
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { ui: { resourceUri: URI } },
  }, async () => ({ content: [{ type: "text", text: "Stamp app opened. Ask the user to open the document (PDF or image) in it, review it, and place their stamp." }] }));
  return s;
}
// Requests are tiny (no tool takes data); 64 KiB is far above any legitimate one.
export const handler = createMcpHandler(factory, { maxRequestBodySize: 64 * 1024 });
