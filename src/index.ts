#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ProxyManager } from "./proxy-manager.js";
import { DeviceDiscovery } from "./device-discovery.js";
import { WebKitConnection } from "./webkit-connection.js";
import { registerDeviceTools, type BridgeState } from "./tools/device-tools.js";
import { registerObservationTools } from "./tools/observation-tools.js";
import { registerAutomationTools } from "./tools/automation-tools.js";
import { loadConfig } from "./types.js";

async function main() {
  const config = loadConfig();

  const server = new McpServer({
    name: "safari-web-inspector-bridge",
    version: "0.1.0",
  });

  const proxyManager = new ProxyManager(config.proxyPort);
  const discovery = new DeviceDiscovery(proxyManager.deviceListPort);

  const state: BridgeState = {
    discovery,
    connection: null,
    proxyManager,
    config,
    connectedPageId: null,
  };

  // Register all tools
  registerDeviceTools(server, state);
  registerObservationTools(server, state);
  registerAutomationTools(server, state);

  // Start the proxy
  proxyManager.on("log", (msg: string) => {
    console.error(`[proxy] ${msg}`);
  });

  proxyManager.on("error", (err: Error) => {
    console.error(`[proxy] ERROR: ${err.message}`);
  });

  try {
    await proxyManager.start();
    console.error("ios-webkit-debug-proxy started successfully");
  } catch (err: any) {
    console.error(`Failed to start proxy: ${err.message}`);
    console.error("Continuing without proxy — device tools will return empty results");
  }

  // Auto-connect if configured
  if (config.autoConnect) {
    try {
      const pages = await discovery.listInspectablePages();
      if (pages.length > 0) {
        const conn = new WebKitConnection();
        await conn.connect(pages[0].websocket_url);
        if (config.networkCapture) await conn.enableNetworkCapture();
        if (config.consoleCapture) await conn.enableConsoleCapture();
        state.connection = conn;
        state.connectedPageId = pages[0].page_id;
        console.error(`Auto-connected to: ${pages[0].title} (${pages[0].url})`);
      }
    } catch (err: any) {
      console.error(`Auto-connect failed: ${err.message}`);
    }
  }

  // Graceful shutdown
  const cleanup = async () => {
    if (state.connection) {
      await state.connection.disconnect();
    }
    await proxyManager.stop();
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  // Connect MCP transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("safari-web-inspector-bridge MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
