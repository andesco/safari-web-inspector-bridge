import WebSocket from "ws";
import { EventEmitter } from "node:events";
import type { ConsoleEntry } from "./types.js";
import { NetworkBuffer } from "./network-buffer.js";

type EventHandler = (params: any) => void;

export class WebKitConnection extends EventEmitter {
  private ws: WebSocket | null = null;
  private commandId = 0;
  private pendingCommands = new Map<
    number,
    { resolve: (v: any) => void; reject: (e: Error) => void }
  >();
  private eventHandlers = new Map<string, EventHandler[]>();

  public networkBuffer = new NetworkBuffer(1000);
  public consoleLog: ConsoleEntry[] = [];
  private maxConsoleEntries = 1000;

  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  async connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);

      this.ws.on("open", () => {
        this.enableCoreDomains().then(() => resolve(), () => resolve());
      });
      this.ws.on("error", (err) => reject(err));

      this.ws.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.id !== undefined) {
          const pending = this.pendingCommands.get(msg.id);
          if (pending) {
            this.pendingCommands.delete(msg.id);
            if (msg.error) {
              pending.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
            } else {
              pending.resolve(msg.result);
            }
          }
        } else if (msg.method) {
          this.dispatchEvent(msg.method, msg.params);
        }
      });

      this.ws.on("close", () => {
        this.emit("disconnected");
        for (const [, pending] of this.pendingCommands) {
          pending.reject(new Error("WebSocket connection closed"));
        }
        this.pendingCommands.clear();
      });
    });
  }

  async send(method: string, params: Record<string, any> = {}): Promise<any> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected");
    }

    const id = ++this.commandId;
    const msg = JSON.stringify({ id, method, params });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(id);
        reject(new Error(`Command ${method} timed out`));
      }, 30000);

      this.pendingCommands.set(id, {
        resolve: (v) => {
          clearTimeout(timeout);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timeout);
          reject(e);
        },
      });

      this.ws!.send(msg);
    });
  }

  onEvent(method: string, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(method) || [];
    handlers.push(handler);
    this.eventHandlers.set(method, handlers);
  }

  private dispatchEvent(method: string, params: any): void {
    const handlers = this.eventHandlers.get(method) || [];
    for (const handler of handlers) {
      handler(params);
    }
  }

  private async enableCoreDomains(): Promise<void> {
    // WebKit Inspector requires domains to be enabled before use
    const domains = ["Runtime", "Page", "DOM"];
    for (const domain of domains) {
      try {
        await this.send(`${domain}.enable`);
      } catch {
        // Domain may not be available in this protocol version
      }
    }
  }

  async enableNetworkCapture(): Promise<void> {
    try {
      await this.send("Network.enable");
    } catch {
      // Domain may not be available — register handlers anyway
      // in case events arrive without explicit enable
    }

    this.onEvent("Network.requestWillBeSent", (params) => {
      this.networkBuffer.add({
        request_id: params.requestId,
        method: params.request?.method || "GET",
        url: params.request?.url || "",
        status: null,
        mime_type: null,
        response_headers: null,
        request_headers: params.request?.headers || null,
        redirected_from: params.redirectResponse ? params.requestId : null,
        redirected_to: null,
        timing: { start: params.timestamp || Date.now(), end: null },
        error: null,
      });
    });

    this.onEvent("Network.responseReceived", (params) => {
      this.networkBuffer.update(params.requestId, {
        status: params.response?.status || null,
        mime_type: params.response?.mimeType || null,
        response_headers: params.response?.headers || null,
        timing: {
          start: 0,
          end: params.timestamp || Date.now(),
        },
      });
    });

    this.onEvent("Network.loadingFailed", (params) => {
      this.networkBuffer.update(params.requestId, {
        error: params.errorText || "Loading failed",
      });
    });
  }

  async enableConsoleCapture(): Promise<void> {
    try {
      await this.send("Console.enable");
    } catch {
      // Domain may not be available — register handlers anyway
    }

    this.onEvent("Console.messageAdded", (params) => {
      const msg = params.message || params;
      if (this.consoleLog.length >= this.maxConsoleEntries) {
        this.consoleLog.shift();
      }
      this.consoleLog.push({
        level: msg.level || "log",
        text: msg.text || "",
        timestamp: msg.timestamp || Date.now(),
        source_url: msg.url || null,
        line_number: msg.line || null,
      });
    });
  }

  clearConsoleLog(): void {
    this.consoleLog = [];
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.pendingCommands.clear();
    this.eventHandlers.clear();
  }
}
