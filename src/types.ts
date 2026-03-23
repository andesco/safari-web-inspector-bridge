export interface DeviceInfo {
  udid: string;
  name: string;
  os_version: string;
  port: number;
}

export interface InspectablePage {
  page_id: string;
  title: string;
  url: string;
  app_bundle_id: string;
  device_udid: string;
  websocket_url: string;
}

export interface NetworkEntry {
  request_id: string;
  method: string;
  url: string;
  status: number | null;
  mime_type: string | null;
  response_headers: Record<string, string> | null;
  request_headers: Record<string, string> | null;
  redirected_from: string | null;
  redirected_to: string | null;
  timing: { start: number; end: number | null } | null;
  error: string | null;
}

export interface ConsoleEntry {
  level: string;
  text: string;
  timestamp: number;
  source_url: string | null;
  line_number: number | null;
}

export interface ProxyConfig {
  proxyPort: number;
  autoConnect: boolean;
  networkCapture: boolean;
  consoleCapture: boolean;
}

export function loadConfig(): ProxyConfig {
  return {
    proxyPort: parseInt(process.env.SWIB_PROXY_PORT || "9222", 10),
    autoConnect: process.env.SWIB_AUTO_CONNECT === "true",
    networkCapture: process.env.SWIB_NETWORK_CAPTURE !== "false",
    consoleCapture: process.env.SWIB_CONSOLE_CAPTURE !== "false",
  };
}
