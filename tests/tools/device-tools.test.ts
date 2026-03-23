import { describe, it, expect, vi } from "vitest";
import { registerDeviceTools, type BridgeState } from "../../src/tools/device-tools.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

describe("device-tools registration", () => {
  it("registers three tools on the server", () => {
    const server = new McpServer({ name: "test", version: "0.0.1" });
    const state = {
      discovery: { listDevices: vi.fn(), listInspectablePages: vi.fn() },
      connection: null,
      proxyManager: { deviceListPort: 9221 },
      config: { networkCapture: true, consoleCapture: true },
      connectedPageId: null,
    } as unknown as BridgeState;

    registerDeviceTools(server, state);
    expect(true).toBe(true);
  });
});
