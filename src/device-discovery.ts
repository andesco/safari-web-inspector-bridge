import type { DeviceInfo, InspectablePage } from "./types.js";

interface ProxyDeviceEntry {
  deviceId: string;
  deviceName: string;
  deviceOSVersion: string;
  url: string;
}

interface ProxyPageEntry {
  title: string;
  url: string;
  webSocketDebuggerUrl: string;
  appId?: string;
  devtoolsFrontendUrl?: string;
  faviconUrl?: string;
  thumbnailUrl?: string;
}

export class DeviceDiscovery {
  private listPort: number;

  constructor(listPort: number = 9221) {
    this.listPort = listPort;
  }

  async listDevices(): Promise<DeviceInfo[]> {
    try {
      const res = await fetch(`http://localhost:${this.listPort}/json`);
      if (!res.ok) return [];
      const data: ProxyDeviceEntry[] = await res.json();
      return data.map((d) => {
        const portMatch = d.url.match(/:(\d+)$/);
        return {
          udid: d.deviceId,
          name: d.deviceName,
          os_version: d.deviceOSVersion,
          port: portMatch ? parseInt(portMatch[1], 10) : 0,
        };
      });
    } catch {
      return [];
    }
  }

  async listInspectablePages(deviceUdid?: string): Promise<InspectablePage[]> {
    const devices = await this.listDevices();
    const filtered = deviceUdid
      ? devices.filter((d) => d.udid === deviceUdid)
      : devices;

    const pages: InspectablePage[] = [];

    for (const device of filtered) {
      try {
        const res = await fetch(`http://localhost:${device.port}/json`);
        if (!res.ok) continue;
        const data: ProxyPageEntry[] = await res.json();

        for (const page of data) {
          const pageIdMatch = page.webSocketDebuggerUrl?.match(/\/page\/(.+)$/);
          pages.push({
            page_id: pageIdMatch ? pageIdMatch[1] : "",
            title: page.title || "",
            url: page.url || "",
            app_bundle_id: page.appId || "",
            device_udid: device.udid,
            websocket_url: page.webSocketDebuggerUrl || "",
          });
        }
      } catch {
        // Device port not responding, skip
      }
    }

    return pages;
  }
}
