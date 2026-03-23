# safari-web-inspector-bridge

An MCP server that bridges Safari's Web Inspector protocol, enabling AI agents to observe and automate WKWebViews running on connected iOS devices.

## Problem

When debugging a WKWebView inside an iOS app, the only interactive tool is Safari Web Inspector — a GUI that requires a human at the keyboard. AI agents (Claude Code, Gemini CLI, etc.) have no way to read network traffic, inspect the DOM, execute JavaScript, or automate navigation in a webview on a physical iOS device.

## Solution

A Model Context Protocol (MCP) server that:

1. Manages `ios-webkit-debug-proxy` as a child process to connect to iOS devices
2. Connects to the resulting websocket to speak the WebKit Inspector Protocol
3. Exposes observation and automation as MCP tools

## Prior Art

No MCP server exists for inspecting or automating WKWebViews on physical iOS devices. The closest tools:

| Project | What it does | Why it's not enough |
|---------|-------------|---------------------|
| **[`ios-webkit-debug-proxy`](https://github.com/google/ios-webkit-debug-proxy)** (Google, 6K+ stars) | Connects to iOS devices via `usbmuxd`, exposes WebKit Inspector Protocol over local websockets | Low-level proxy only — no high-level API, no MCP, no agent interface |
| **[Inspect CLI](https://inspect.dev/products/cli)** (commercial) | Translates WebKit protocol → Chrome DevTools Protocol for iOS devices | Paid/proprietary, no MCP layer |
| **[`remotedebug-ios-webkit-adapter`](https://github.com/nicknisi/remotedebug-ios-webkit-adapter)** | Open-source CDP adapter on top of `ios-webkit-debug-proxy` | **Archived 2021** — author went commercial with Inspect.dev |
| **[`safari-mcp-server`](https://github.com/lxman/safari-mcp-server)** (lxman) | MCP server for Safari via WebDriver | **Desktop macOS only** — no iOS devices, no WKWebViews |
| **[`canter`](https://github.com/hahnlee/canter)** | Playwright-style API for iOS WKWebViews | **Abandoned 2022**, never reached maturity |
| **Appium** | Full iOS test automation | Heavy framework, not agent-oriented, no MCP |

**`safari-web-inspector-bridge` fills the gap**: an MCP server built on top of `ios-webkit-debug-proxy` that gives AI agents the same capabilities a developer gets from Safari Web Inspector.

## Prerequisites

- **macOS** (required for `usbmuxd` and iOS device connectivity)
- **`ios-webkit-debug-proxy`** — installed via Homebrew: `brew install ios-webkit-debug-proxy`
- The target app's WKWebView must have `isInspectable = true` (iOS 16.4+)
- The iOS device must have **Settings → Safari → Advanced → Web Inspector** enabled

These are the same requirements as using Safari Web Inspector manually, plus the proxy.

## Architecture

```
┌──────────────┐     MCP (stdio/SSE)     ┌─────────────────────────┐
│  AI Agent    │◄────────────────────────►│  safari-web-inspector-  │
│  (Claude,    │                          │  bridge (MCP server)    │
│   Gemini)    │                          └───────────┬─────────────┘
└──────────────┘                                      │
                                                      │ Websocket
                                                      ▼
                                               ┌──────────────────┐
                                               │ ios-webkit-debug- │
                                               │ proxy (child      │
                                               │ process)          │
                                               └───────────┬──────┘
                                                           │
                                                           │ WebKit Inspector
                                                           │ Protocol via usbmuxd
                                                           ▼
                                                    ┌──────────────┐
                                                    │  iOS Device   │
                                                    │  WKWebView    │
                                                    │ (isInspectable)│
                                                    └──────────────┘
```

### Dependency: `ios-webkit-debug-proxy`

[`ios-webkit-debug-proxy`](https://github.com/google/ios-webkit-debug-proxy) (Google, 6K+ stars, actively maintained) is the foundational dependency. It handles:

- **Device discovery** via `usbmuxd` (the macOS daemon for iOS USB/network multiplexing)
- **Protocol translation** from Apple's proprietary WebKit Remote Inspector Protocol to websocket-accessible endpoints
- **Multi-device support** — each connected device gets its own port

The proxy exposes:
- `http://localhost:9221/json` — list connected devices
- `http://localhost:9222/json` — list inspectable pages on device 1
- `ws://localhost:9222/devtools/page/{id}` — websocket connection to a specific page

Our MCP server spawns `ios-webkit-debug-proxy` as a managed child process, connects to these endpoints, and translates the raw protocol into high-level MCP tools. The proxy is not a CDP bridge — it exposes WebKit's native inspector protocol over websockets, so our server must speak that protocol directly (not Chrome DevTools Protocol).

### Why not talk to `usbmuxd` directly?

Implementing the WebKit Remote Inspector Protocol from scratch would require reverse-engineering Apple's proprietary binary framing, TLS handshake, and device pairing — thousands of lines of C that `ios-webkit-debug-proxy` already handles. Building on top of the proxy lets us focus on the MCP layer.

## MCP Tools

### Device & Page Discovery

#### `list_devices`
List connected iOS devices with Web Inspector enabled.

**Returns:** Array of `{ udid, name, os_version }`

#### `list_inspectable_pages`
Enumerate all inspectable WKWebViews across connected devices.

**Parameters:**
- `device_udid` (optional) — filter to a specific device

**Returns:** Array of `{ page_id, title, url, app_bundle_id, device_udid }`

#### `connect`
Attach to a specific inspectable page. Required before using observation/automation tools.

**Parameters:**
- `page_id` — from `list_inspectable_pages`

**Returns:** `{ connected: true, page_id, url, title }`

### Observation

#### `get_url`
Get the current URL of the connected page.

**Returns:** `{ url }`

#### `get_dom`
Read the page's DOM as HTML.

**Parameters:**
- `selector` (optional) — CSS selector to scope the output; defaults to `document.documentElement`
- `outer_html` (optional, default `true`) — return outerHTML vs textContent

**Returns:** `{ html }` or `{ text }`

#### `get_network_log`
Retrieve captured network requests since connection or last clear.

**Parameters:**
- `clear` (optional, default `false`) — clear the log after reading
- `filter_url` (optional) — regex to filter by request URL
- `filter_status` (optional) — filter by HTTP status code (e.g., `302`, `4xx`)

**Returns:** Array of:
```json
{
  "request_id": "...",
  "method": "GET",
  "url": "https://...",
  "status": 200,
  "mime_type": "text/html",
  "response_headers": { ... },
  "request_headers": { ... },
  "redirected_from": null,
  "redirected_to": null,
  "timing": { "start": 0, "end": 142 },
  "error": null
}
```

#### `get_console_log`
Retrieve JavaScript console messages since connection or last clear.

**Parameters:**
- `clear` (optional, default `false`) — clear after reading
- `level` (optional) — filter by level: `log`, `warn`, `error`, `info`

**Returns:** Array of `{ level, text, timestamp, source_url, line_number }`

#### `screenshot`
Capture a screenshot of the webview content.

**Returns:** `{ image_base64, width, height }`

### Automation

#### `navigate`
Load a URL in the connected webview.

**Parameters:**
- `url` — the URL to navigate to

**Returns:** `{ url, title, status }`

#### `execute_javascript`
Evaluate a JavaScript expression in the page context.

**Parameters:**
- `expression` — JS code to evaluate
- `await_promise` (optional, default `true`) — if the expression returns a Promise, await it

**Returns:** `{ result }` (JSON-serialized return value)

#### `click_element`
Click a DOM element identified by CSS selector.

**Parameters:**
- `selector` — CSS selector for the target element
- `index` (optional, default `0`) — which match to click if selector matches multiple

**Returns:** `{ clicked: true, selector, tag_name }`

#### `type_text`
Type text into the currently focused element or a specified element.

**Parameters:**
- `text` — the text to type
- `selector` (optional) — focus this element first

**Returns:** `{ typed: true }`

#### `wait_for`
Wait for a condition before proceeding.

**Parameters (one of):**
- `selector` — wait for a CSS selector to appear in the DOM
- `url_contains` — wait for the page URL to contain a substring
- `network_idle` — wait for no network requests for N milliseconds

**Parameters (shared):**
- `timeout_ms` (optional, default `10000`) — max wait time

**Returns:** `{ matched: true, elapsed_ms }` or error on timeout

## Configuration

The MCP server should accept configuration via:

```json
{
  "mcpServers": {
    "safari-web-inspector-bridge": {
      "command": "npx",
      "args": ["safari-web-inspector-bridge"],
      "env": {
        "SWIB_AUTO_CONNECT": "true",
        "SWIB_NETWORK_CAPTURE": "true"
      }
    }
  }
}
```

| Env Var | Default | Description |
|---------|---------|-------------|
| `SWIB_AUTO_CONNECT` | `false` | Auto-connect to the first inspectable page on startup |
| `SWIB_NETWORK_CAPTURE` | `true` | Start capturing network requests immediately on connect |
| `SWIB_CONSOLE_CAPTURE` | `true` | Start capturing console messages immediately on connect |
| `SWIB_PROXY_PORT` | `9222` | Port for `ios-webkit-debug-proxy` (Approach A only) |

## Implementation Notes

### Language
TypeScript (Node.js). Consistent with the MCP SDK ecosystem and websocket client libraries.

### Key Dependencies

**System (Homebrew):**
- `ios-webkit-debug-proxy` — `brew install ios-webkit-debug-proxy`
- `libimobiledevice` — installed automatically as a dependency of the above

**npm:**
- `@modelcontextprotocol/sdk` — MCP server framework
- `ws` — websocket client to connect to the proxy's endpoints

### Proxy Lifecycle Management

The MCP server is responsible for the full lifecycle of `ios-webkit-debug-proxy`:

1. **Startup**: On server init, check that `ios-webkit-debug-proxy` is installed (`which ios_webkit_debug_proxy`). If missing, return a clear error with install instructions.
2. **Spawn**: Start `ios_webkit_debug_proxy -c null:9221,:9222-9322` as a child process. The port range allows up to 100 simultaneous devices.
3. **Health check**: Poll `http://localhost:9221/json` until it responds, with a timeout.
4. **Shutdown**: Kill the child process on MCP server exit (`SIGTERM` then `SIGKILL` after 3s).
5. **Crash recovery**: If the proxy dies unexpectedly, attempt one restart before surfacing an error.

### WebKit Inspector Protocol

The websocket exposed by `ios-webkit-debug-proxy` speaks WebKit's native inspector protocol (not Chrome DevTools Protocol). Key domains to implement:

- **`Runtime.evaluate`** — execute JavaScript, get return values
- **`Page.navigate`** — navigate to URLs
- **`Network.requestWillBeSent`** / **`Network.responseReceived`** — capture network traffic
- **`Console.messageAdded`** — capture console output
- **`DOM.getDocument`** / **`DOM.getOuterHTML`** — read page structure
- **`Page.captureScreenshot`** — webview screenshots (if supported by the protocol version)

Reference: WebKit's inspector protocol definitions live in the WebKit source tree at `Source/JavaScriptCore/inspector/protocol/`. These JSON files define every domain, command, and event.

### Network Log Buffering
Network events arrive continuously via the protocol. The server should maintain a ring buffer (default 1000 entries) so `get_network_log` returns recent history without unbounded memory growth.

### Connection Lifecycle
- The server should handle device disconnection gracefully (USB unplugged, WiFi drop)
- Reconnect automatically when the device reappears
- Surface connection state changes as MCP notifications if the protocol supports it

### Security Considerations
- Only connects to devices where the user has explicitly enabled Web Inspector
- Only inspects WKWebViews where the developer has set `isInspectable = true`
- No data leaves the local machine — all communication is over usbmuxd (USB) or local network
- The proxy binds to localhost only — not accessible from other machines on the network

## Example Agent Workflow

```
Agent: list_inspectable_pages
→ [{ page_id: "1", title: "Banks", url: "https://beingood.company/banks", app: "company.beingood.verified.Clip" }]

Agent: connect({ page_id: "1" })
→ { connected: true }

Agent: get_network_log({ filter_url: "scotiabank" })
→ [{ method: "GET", url: "https://www.scotiabank.com/...", status: 302, redirected_to: "scotiabank://" }]

Agent: # Now I can see the redirect causing the universal link handoff
Agent: # I'll fix the navigation delegate to handle this pattern
```

## Success Criteria

1. An AI agent can enumerate WKWebViews on a connected iOS device
2. An AI agent can read the current URL, DOM, network log, and console log
3. An AI agent can navigate to URLs and execute JavaScript
4. Network request/response data is detailed enough to debug redirect chains and failed loads
5. The server runs as a standard MCP server (stdio transport) compatible with Claude Code and Gemini CLI
