import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WebKitConnection } from "../src/webkit-connection.js";
import { MockWebKitServer } from "./helpers/mock-ws-server.js";

describe("WebKitConnection", () => {
  let server: MockWebKitServer;
  let conn: WebKitConnection;

  beforeEach(async () => {
    server = new MockWebKitServer();
    conn = new WebKitConnection();
    await conn.connect(`ws://localhost:${server.port}`);
  });

  afterEach(async () => {
    await conn.disconnect();
    await server.close();
  });

  it("connects and sends commands", async () => {
    const result = await conn.send("Runtime.evaluate", {
      expression: "1+1",
    });
    expect(result).toBeDefined();
    expect(server.receivedMessages).toHaveLength(1);
    expect(server.receivedMessages[0].method).toBe("Runtime.evaluate");
  });

  it("receives events via onEvent", async () => {
    const events: any[] = [];
    conn.onEvent("Console.messageAdded", (params) => events.push(params));

    server.sendEvent("Console.messageAdded", {
      message: { level: "log", text: "hello" },
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(events).toHaveLength(1);
    expect(events[0].message.text).toBe("hello");
  });

  it("reports connected state", () => {
    expect(conn.isConnected).toBe(true);
  });

  it("handles disconnect", async () => {
    await conn.disconnect();
    expect(conn.isConnected).toBe(false);
  });
});
