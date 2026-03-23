import { WebSocketServer, type WebSocket } from "ws";

export class MockWebKitServer {
  private wss: WebSocketServer;
  private connections: WebSocket[] = [];
  public port: number;
  public receivedMessages: any[] = [];

  constructor() {
    this.wss = new WebSocketServer({ port: 0 });
    this.port = (this.wss.address() as any).port;

    this.wss.on("connection", (ws) => {
      this.connections.push(ws);
      ws.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        this.receivedMessages.push(msg);
        this.handleMessage(ws, msg);
      });
    });
  }

  private handleMessage(ws: WebSocket, msg: any): void {
    if (msg.id !== undefined) {
      ws.send(JSON.stringify({ id: msg.id, result: {} }));
    }
  }

  sendEvent(method: string, params: any): void {
    const msg = JSON.stringify({ method, params });
    for (const ws of this.connections) {
      ws.send(msg);
    }
  }

  async close(): Promise<void> {
    for (const ws of this.connections) {
      ws.close();
    }
    return new Promise((resolve) => this.wss.close(() => resolve()));
  }
}
