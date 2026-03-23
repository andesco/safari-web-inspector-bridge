import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ProxyManager } from "../src/proxy-manager.js";
import * as child_process from "node:child_process";
import { EventEmitter } from "node:events";

vi.mock("node:child_process");

describe("ProxyManager", () => {
  let manager: ProxyManager;

  beforeEach(() => {
    manager = new ProxyManager(9222);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects start if proxy binary is not found", async () => {
    vi.spyOn(child_process, "execFileSync").mockImplementation(() => {
      throw new Error("not found");
    });

    await expect(manager.start()).rejects.toThrow(
      /ios-webkit-debug-proxy is not installed/
    );
  });

  it("spawns the proxy with correct arguments", async () => {
    vi.spyOn(child_process, "execFileSync").mockReturnValue(
      Buffer.from("/usr/local/bin/ios_webkit_debug_proxy")
    );

    const fakeProcess = new EventEmitter() as any;
    fakeProcess.pid = 1234;
    fakeProcess.exitCode = null;
    fakeProcess.kill = vi.fn();
    fakeProcess.stderr = new EventEmitter();
    fakeProcess.stdout = new EventEmitter();

    vi.spyOn(child_process, "spawn").mockReturnValue(fakeProcess);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    await manager.start();

    expect(child_process.spawn).toHaveBeenCalledWith(
      "ios_webkit_debug_proxy",
      ["-c", "null:9221,:9222-9322"],
      expect.objectContaining({ stdio: ["ignore", "pipe", "pipe"] })
    );
  });

  it("reports running state", () => {
    expect(manager.isRunning).toBe(false);
  });

  it("returns correct deviceListPort", () => {
    expect(manager.deviceListPort).toBe(9221);
  });
});
