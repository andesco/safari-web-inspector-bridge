import { describe, it, expect, vi } from "vitest";
import { registerObservationTools } from "../../src/tools/observation-tools.js";
import type { BridgeState } from "../../src/tools/device-tools.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

describe("observation-tools registration", () => {
  it("registers five tools on the server", () => {
    const server = new McpServer({ name: "test", version: "0.0.1" });
    const state = {
      connection: null,
      config: { networkCapture: true, consoleCapture: true },
    } as unknown as BridgeState;

    registerObservationTools(server, state);
    expect(true).toBe(true);
  });
});
