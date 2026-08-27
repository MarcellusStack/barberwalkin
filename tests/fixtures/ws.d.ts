declare module "ws" {
  import type { Server as HttpServer } from "node:http";
  import { EventEmitter } from "node:events";

  export interface WebSocket extends EventEmitter {
    readyState: number;
    send(data: string | Buffer): void;
    close(): void;
    on(event: "message", listener: (data: Buffer | string) => void): this;
    on(event: "close", listener: () => void): this;
    on(event: "error", listener: (err: Error) => void): this;
  }

  export class WebSocketServer extends EventEmitter {
    constructor(options: { server: HttpServer });
    on(event: "connection", listener: (ws: WebSocket) => void): this;
    close(callback?: (err?: Error) => void): void;
  }
}
