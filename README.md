# safari-web-inspector-bridge

An MCP server that gives AI agents the same capabilities a developer gets from Safari Web Inspector -- inspect, observe, and automate WKWebViews running on connected iOS devices.

## Architecture

```
+--------------+     MCP (stdio)     +-------------------------+
|  AI Agent    |<------------------->|  safari-web-inspector-  |
|  (Claude,    |                     |  bridge (MCP server)    |
|   Gemini)    |                     +-----------+-------------+
+--------------+                                 |
                                                 | WebSocket
                                                 v
                                          +------------------+
                                          | ios-webkit-debug- |
                                          | proxy (managed    |
                                          | child process)    |
                                          +---------+--------+
                                                    |
                                                    | usbmuxd
                                                    v
                                             +--------------+
                                             |  iOS Device  |
                                             |  WKWebView   |
                                             +--------------+
```

The server spawns `ios-webkit-debug-proxy` as a child process, connects to the WebKit Inspector Protocol over WebSocket, and exposes everything as MCP tools. The proxy is managed for its full lifecycle -- started on init, health-checked, auto-restarted on crash, and killed on shutdown.

## Prerequisites

- **macOS** -- required for `usbmuxd` and iOS device connectivity
- **ios-webkit-debug-proxy** -- `brew install ios-webkit-debug-proxy`
- **iOS device** with **Settings > Safari > Advanced > Web Inspector** enabled
- The target app's WKWebView must have `isInspectable = true` (iOS 16.4+)

## Installation

```bash
git clone <repo-url>
cd safari-web-inspector-bridge
npm install
npm run build
```

### Add to Claude Code

```bash
claude mcp add safari-web-inspector-bridge node /path/to/safari-web-inspector-bridge/dist/index.js
```

### Add to any MCP client (Claude Desktop, etc.)

Add to your MCP configuration file:

```json
{
  "mcpServers": {
    "safari-web-inspector-bridge": {
      "command": "node",
      "args": ["/path/to/safari-web-inspector-bridge/dist/index.js"],
      "env": {
        "SWIB_NETWORK_CAPTURE": "true",
        "SWIB_CONSOLE_CAPTURE": "true"
      }
    }
  }
}
```

## Tools

### Device & Connection

| Tool | Parameters | Returns |
|------|-----------|---------|
| `list_devices` | _(none)_ | `[{ udid, name, os_version }]` |
| `list_inspectable_pages` | `device_udid?` string -- filter to one device | `[{ page_id, title, url, app_bundle_id, device_udid }]` |
| `connect` | `page_id` string -- from `list_inspectable_pages` | `{ connected, page_id, url, title, warnings? }` |

### Observation

| Tool | Parameters | Returns |
|------|-----------|---------|
| `get_url` | _(none)_ | `{ url }` |
| `get_dom` | `selector?` string -- CSS selector (default: `document.documentElement`); `outer_html?` boolean (default: `true`) -- outerHTML vs textContent | `{ html }` or `{ text }` |
| `get_network_log` | `clear?` boolean (default: `false`); `filter_url?` string -- regex; `filter_status?` string -- e.g. `"302"`, `"4xx"` | `[{ request_id, method, url, status, mime_type, response_headers, request_headers, redirected_from, redirected_to, timing, error }]` |
| `get_console_log` | `clear?` boolean (default: `false`); `level?` `"log" \| "warn" \| "error" \| "info"` | `[{ level, text, timestamp, source_url, line_number }]` |
| `screenshot` | _(none)_ | MCP image content (base64 PNG) |

### Automation

| Tool | Parameters | Returns |
|------|-----------|---------|
| `navigate` | `url` string | `{ url, title, status }` |
| `execute_javascript` | `expression` string; `await_promise?` boolean (default: `true`) | `{ result }` -- JSON-serialized return value |
| `click_element` | `selector` string -- CSS selector; `index?` number (default: `0`) -- which match to click | `{ clicked, selector, tag_name }` |
| `type_text` | `text` string; `selector?` string -- focus this element first | `{ typed: true }` |
| `wait_for` | One of: `selector?` string, `url_contains?` string, `network_idle?` number (ms); plus `timeout_ms?` number (default: `10000`) | `{ matched: true, elapsed_ms }` |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `SWIB_AUTO_CONNECT` | `false` | Auto-connect to the first inspectable page on startup |
| `SWIB_NETWORK_CAPTURE` | `true` | Capture network requests on connect |
| `SWIB_CONSOLE_CAPTURE` | `true` | Capture console messages on connect |
| `SWIB_PROXY_PORT` | `9222` | Starting port for `ios-webkit-debug-proxy` device ports |

Note: `SWIB_NETWORK_CAPTURE` and `SWIB_CONSOLE_CAPTURE` default to `true` -- set to `"false"` to disable. `SWIB_AUTO_CONNECT` defaults to `false` -- set to `"true"` to enable.

## Example Workflow

```
Agent: list_inspectable_pages
  -> [{ page_id: "1", title: "Banks", url: "https://beingood.company/banks",
        app_bundle_id: "company.beingood.verified.Clip", device_udid: "00008..." }]

Agent: connect({ page_id: "1" })
  -> { connected: true, page_id: "1", url: "https://beingood.company/banks", title: "Banks" }

Agent: get_network_log({ filter_url: "scotiabank" })
  -> [{ method: "GET", url: "https://www.scotiabank.com/...", status: 302,
        redirected_to: "scotiabank://..." }]

Agent: execute_javascript({ expression: "document.title" })
  -> { result: "Banks" }

Agent: click_element({ selector: "button.next" })
  -> { clicked: true, selector: "button.next", tag_name: "button" }

Agent: wait_for({ url_contains: "/dashboard", timeout_ms: 5000 })
  -> { matched: true, elapsed_ms: 1230 }

Agent: screenshot()
  -> [image: PNG screenshot of the webview]
```

## Development

```bash
npm run build        # Compile TypeScript to dist/
npm run dev          # Watch mode (tsc --watch)
npm test             # Run tests (vitest)
npm run test:watch   # Watch mode tests
npm start            # Run the MCP server (node dist/index.js)
```

### Project structure

```
src/
  index.ts              # Entry point, server setup, lifecycle
  types.ts              # Interfaces and config loader
  proxy-manager.ts      # Spawns and manages ios-webkit-debug-proxy
  device-discovery.ts   # Queries proxy for devices and pages
  webkit-connection.ts  # WebSocket connection to WebKit Inspector Protocol
  network-buffer.ts     # Ring buffer for network request entries (1000 max)
  tools/
    device-tools.ts     # list_devices, list_inspectable_pages, connect
    observation-tools.ts # get_url, get_dom, get_network_log, get_console_log, screenshot
    automation-tools.ts  # navigate, execute_javascript, click_element, type_text, wait_for
```

## License

MIT
