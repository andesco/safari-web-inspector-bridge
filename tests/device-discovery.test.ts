import { describe, it, expect, vi, afterEach } from "vitest";
import { DeviceDiscovery } from "../src/device-discovery.js";

describe("DeviceDiscovery", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses device list from proxy", async () => {
    const discovery = new DeviceDiscovery(9221);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              deviceId: "abc123",
              deviceName: "iPhone 15",
              deviceOSVersion: "17.4",
              url: "localhost:9222",
            },
          ]),
      })
    );

    const devices = await discovery.listDevices();
    expect(devices).toHaveLength(1);
    expect(devices[0].udid).toBe("abc123");
    expect(devices[0].name).toBe("iPhone 15");
    expect(devices[0].port).toBe(9222);
  });

  it("parses inspectable pages", async () => {
    const discovery = new DeviceDiscovery(9221);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              deviceId: "abc123",
              deviceName: "iPhone 15",
              deviceOSVersion: "17.4",
              url: "localhost:9222",
            },
          ]),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              devtoolsFrontendUrl: "",
              faviconUrl: "",
              thumbnailUrl: "",
              title: "My Page",
              url: "https://example.com",
              webSocketDebuggerUrl: "ws://localhost:9222/devtools/page/1",
              appId: "com.example.app",
            },
          ]),
      });

    vi.stubGlobal("fetch", fetchMock);

    const pages = await discovery.listInspectablePages();
    expect(pages).toHaveLength(1);
    expect(pages[0].title).toBe("My Page");
    expect(pages[0].page_id).toBe("1");
    expect(pages[0].websocket_url).toBe("ws://localhost:9222/devtools/page/1");
  });

  it("returns empty array when proxy is unreachable", async () => {
    const discovery = new DeviceDiscovery(9221);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED"))
    );

    const devices = await discovery.listDevices();
    expect(devices).toHaveLength(0);
  });
});
