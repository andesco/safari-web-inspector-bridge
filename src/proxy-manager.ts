import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";

export class ProxyManager extends EventEmitter {
  private process: ChildProcess | null = null;
  private port: number;
  private restartAttempted = false;

  constructor(port: number = 9222) {
    super();
    this.port = port;
  }

  get isRunning(): boolean {
    return this.process !== null && this.process.exitCode === null;
  }

  get deviceListPort(): number {
    return this.port - 1;
  }

  async start(): Promise<void> {
    try {
      execFileSync("which", ["ios_webkit_debug_proxy"]);
    } catch {
      throw new Error(
        "ios-webkit-debug-proxy is not installed. Install with: brew install ios-webkit-debug-proxy"
      );
    }

    const listPort = this.deviceListPort;
    const maxPort = this.port + 100;

    this.process = spawn(
      "ios_webkit_debug_proxy",
      ["-c", `null:${listPort},:${this.port}-${maxPort}`],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    this.process.stderr?.on("data", (data: Buffer) => {
      this.emit("log", data.toString());
    });

    this.process.on("exit", (code, signal) => {
      this.emit("exit", code, signal);
      this.handleCrash();
    });

    await this.waitForReady();
  }

  private async waitForReady(timeoutMs: number = 10000): Promise<void> {
    const start = Date.now();
    const url = `http://localhost:${this.deviceListPort}/json`;

    while (Date.now() - start < timeoutMs) {
      try {
        const res = await fetch(url);
        if (res.ok) return;
      } catch {
        // Not ready yet
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(
      `ios-webkit-debug-proxy did not become ready within ${timeoutMs}ms`
    );
  }

  private async handleCrash(): Promise<void> {
    if (this.restartAttempted) {
      this.emit("error", new Error("ios-webkit-debug-proxy crashed and restart failed"));
      return;
    }

    this.restartAttempted = true;
    this.emit("log", "ios-webkit-debug-proxy crashed, attempting restart...");

    try {
      await this.start();
      this.restartAttempted = false;
      this.emit("log", "ios-webkit-debug-proxy restarted successfully");
    } catch (err) {
      this.emit("error", err);
    }
  }

  async stop(): Promise<void> {
    if (!this.process) return;

    const proc = this.process;
    this.process = null;

    proc.removeAllListeners("exit");

    proc.kill("SIGTERM");

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        proc.kill("SIGKILL");
        resolve();
      }, 3000);

      proc.on("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }
}
