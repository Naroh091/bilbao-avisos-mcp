#!/usr/bin/env node
/**
 * Entrada STDIO del servidor MCP (para Claude Desktop / Claude Code en local).
 * Para exponerlo por red (Tailscale), usa http.ts.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { BilbaoClient } from "./client.js";
import { buildServer } from "./mcp.js";

async function main() {
  const client = new BilbaoClient();
  const server = buildServer(client);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  if (!client.hasServiceCredentials()) {
    console.error("[bilbao-avisos] Aviso: sin BILBAO_AVISOS_USERNAME/PASSWORD; solo funcionarán llamadas sin auth (categorías, callejero).");
  }
  console.error("[bilbao-avisos] MCP servidor listo (stdio).");
}

main().catch((e) => {
  console.error("[bilbao-avisos] Error fatal:", e);
  process.exit(1);
});
