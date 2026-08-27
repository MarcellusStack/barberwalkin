import http from "node:http";
import { WebSocketServer, type WebSocket } from "ws";

export interface ProbeRecord {
  _id: string;
  name: string;
  status: string;
  message?: string;
  updatedAt: number;
}

export interface ConvexTestServer {
  port: number;
  url: string;
  close: () => Promise<void>;
  setProbe: (record: Partial<ProbeRecord> & { name: string; status: string }) => ProbeRecord;
  getProbe: (name: string) => ProbeRecord | null;
  clearProbe: (name: string) => void;
  reset: () => void;
}

function encodeTs(num: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(num));
  return buf.toString("base64");
}

export async function createConvexTestServer(preferredPort = 3210): Promise<ConvexTestServer> {
  const store = new Map<string, ProbeRecord>();
  let currentTs = 1;

  interface ClientSubscription {
    queryId: number;
    udfPath: string;
    args: unknown[];
  }

  interface ClientVersion {
    querySet: number;
    ts: number;
    identity: number;
  }

  interface ConnectedClient {
    ws: WebSocket;
    lastVersion: ClientVersion;
    subscriptions: Map<number, ClientSubscription>;
  }

  const clients = new Set<ConnectedClient>();

  const getQueryValue = (udfPath: string, args: Record<string, unknown> = {}) => {
    if (udfPath === "probe:getServerStatus") {
      return {
        status: "ok",
        serverTimeUtc: Date.now(),
        message: "Convex-Backend ist betriebsbereit.",
      };
    }
    if (udfPath === "probe:getProbeStatus") {
      const name = (args.name as string) || "integration-probe";
      return store.get(name) || null;
    }
    return null;
  };

  const notifyClients = () => {
    currentTs += 1;

    for (const client of clients) {
      if (client.ws.readyState !== 1) continue;

      const modifications = [];
      for (const [queryId, sub] of client.subscriptions.entries()) {
        const argObj = (sub.args?.[0] as Record<string, unknown>) || {};
        const val = getQueryValue(sub.udfPath, argObj);
        modifications.push({
          type: "QueryUpdated",
          queryId,
          value: val,
          logLines: [],
        });
      }

      if (modifications.length > 0) {
        const startVersion = { ...client.lastVersion };
        const endVersion: ClientVersion = {
          querySet: client.lastVersion.querySet,
          ts: currentTs,
          identity: client.lastVersion.identity,
        };
        client.lastVersion = endVersion;

        client.ws.send(
          JSON.stringify({
            type: "Transition",
            startVersion: {
              querySet: startVersion.querySet,
              ts: encodeTs(startVersion.ts),
              identity: startVersion.identity,
            },
            endVersion: {
              querySet: endVersion.querySet,
              ts: encodeTs(endVersion.ts),
              identity: endVersion.identity,
            },
            modifications,
          }),
        );
      }
    }
  };

  const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Convex-Client");

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.method === "POST" && (req.url === "/api/query" || req.url === "/api/query_at_ts")) {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          const path = parsed.path;
          const args = parsed.args?.[0] || {};
          const value = getQueryValue(path, args);

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              status: "success",
              value,
              logLines: [],
            }),
          );
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              status: "error",
              errorMessage: String(err),
            }),
          );
        }
      });
      return;
    }

    if (req.method === "POST" && req.url === "/api/mutation") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          const path = parsed.path;
          const args = parsed.args?.[0] || {};

          let result: unknown = null;
          if (path === "probe:setProbeStatus") {
            const name = (args.name as string) || "integration-probe";
            const record: ProbeRecord = {
              _id: `probe_${Date.now()}`,
              name,
              status: args.status as string,
              message: args.message as string | undefined,
              updatedAt: Date.now(),
            };
            store.set(name, record);
            result = record;
            notifyClients();
          } else if (path === "probe:clearProbe") {
            const name = (args.name as string) || "integration-probe";
            store.delete(name);
            result = { success: true };
            notifyClients();
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              status: "success",
              value: result,
              logLines: [],
            }),
          );
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              status: "error",
              errorMessage: String(err),
            }),
          );
        }
      });
      return;
    }

    res.writeHead(404);
    res.end("Not Found");
  });

  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws) => {
    const client: ConnectedClient = {
      ws,
      lastVersion: { querySet: 0, ts: 0, identity: 0 },
      subscriptions: new Map(),
    };
    clients.add(client);

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === "Connect") {
          const startVersion = { ...client.lastVersion };
          const endVersion: ClientVersion = {
            querySet: 0,
            ts: currentTs,
            identity: 0,
          };
          client.lastVersion = endVersion;

          ws.send(
            JSON.stringify({
              type: "Transition",
              startVersion: {
                querySet: startVersion.querySet,
                ts: encodeTs(startVersion.ts),
                identity: startVersion.identity,
              },
              endVersion: {
                querySet: endVersion.querySet,
                ts: encodeTs(endVersion.ts),
                identity: endVersion.identity,
              },
              modifications: [],
            }),
          );
        } else if (msg.type === "ModifyQuerySet") {
          const modifications = [];
          for (const mod of msg.modifications || []) {
            if (mod.type === "Add") {
              client.subscriptions.set(mod.queryId, {
                queryId: mod.queryId,
                udfPath: mod.udfPath,
                args: mod.args || [],
              });

              const argObj = (mod.args?.[0] as Record<string, unknown>) || {};
              const val = getQueryValue(mod.udfPath, argObj);
              modifications.push({
                type: "QueryUpdated",
                queryId: mod.queryId,
                value: val,
                logLines: [],
              });
            } else if (mod.type === "Remove") {
              client.subscriptions.delete(mod.queryId);
            }
          }

          currentTs += 1;
          const startVersion = { ...client.lastVersion };
          const endVersion: ClientVersion = {
            querySet: msg.newVersion,
            ts: currentTs,
            identity: client.lastVersion.identity,
          };
          client.lastVersion = endVersion;

          ws.send(
            JSON.stringify({
              type: "Transition",
              startVersion: {
                querySet: startVersion.querySet,
                ts: encodeTs(startVersion.ts),
                identity: startVersion.identity,
              },
              endVersion: {
                querySet: endVersion.querySet,
                ts: encodeTs(endVersion.ts),
                identity: endVersion.identity,
              },
              modifications,
            }),
          );
        } else if (msg.type === "Mutation") {
          let result: unknown = null;
          const udfPath = msg.udfPath;
          const args = (msg.args?.[0] as Record<string, unknown>) || {};

          if (udfPath === "probe:setProbeStatus") {
            const name = (args.name as string) || "integration-probe";
            const record: ProbeRecord = {
              _id: `probe_${Date.now()}`,
              name,
              status: args.status as string,
              message: args.message as string | undefined,
              updatedAt: Date.now(),
            };
            store.set(name, record);
            result = record;
          } else if (udfPath === "probe:clearProbe") {
            const name = (args.name as string) || "integration-probe";
            store.delete(name);
            result = { success: true };
          }

          currentTs += 1;
          ws.send(
            JSON.stringify({
              type: "MutationResponse",
              requestId: msg.requestId,
              success: true,
              result,
              ts: encodeTs(currentTs),
              logLines: [],
            }),
          );

          notifyClients();
        } else if (msg.type === "Ping") {
          ws.send(JSON.stringify({ type: "Ping" }));
        }
      } catch (err) {
        console.error("Error processing websocket message:", err);
      }
    });

    ws.on("close", () => {
      clients.delete(client);
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(preferredPort, "127.0.0.1", () => {
      resolve();
    });
    server.once("error", reject);
  });

  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : preferredPort;
  const url = `http://127.0.0.1:${actualPort}`;

  return {
    port: actualPort,
    url,
    close: async () => {
      for (const client of clients) {
        client.ws.close();
      }
      clients.clear();
      await new Promise<void>((resolve) => {
        wss.close(() => {
          server.close(() => resolve());
        });
      });
    },
    setProbe: (record) => {
      const full: ProbeRecord = {
        _id: record._id || `probe_${Date.now()}`,
        name: record.name,
        status: record.status,
        message: record.message,
        updatedAt: record.updatedAt || Date.now(),
      };
      store.set(record.name, full);
      notifyClients();
      return full;
    },
    getProbe: (name: string) => {
      return store.get(name) || null;
    },
    clearProbe: (name: string) => {
      store.delete(name);
      notifyClients();
    },
    reset: () => {
      store.clear();
      notifyClients();
    },
  };
}
