import http from "node:http";
import { WebSocketServer, type WebSocket } from "ws";

export interface ProbeRecord {
  _id: string;
  name: string;
  status: string;
  message?: string;
  updatedAt: number;
}

export interface AuthUserRecord {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  isAnonymous?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AuthSessionRecord {
  id: string;
  token: string;
  userId: string;
  expiresAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface ConvexTestServer {
  port: number;
  sitePort: number;
  url: string;
  siteUrl: string;
  close: () => Promise<void>;
  setProbe: (
    record: Partial<ProbeRecord> & { name: string; status: string },
  ) => ProbeRecord;
  getProbe: (name: string) => ProbeRecord | null;
  clearProbe: (name: string) => void;
  setAuthSession: (session: AuthSessionRecord, user: AuthUserRecord) => void;
  getAuthSession: (token: string) => { session: AuthSessionRecord; user: AuthUserRecord } | null;
  clearAuthSessions: () => void;
  setSimulateAuthError: (simulate: boolean) => void;
  reset: () => void;
}

function encodeTs(num: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(num));
  return buf.toString("base64");
}

function extractBearerToken(authHeader?: string): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function extractCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((p) => p.trim());
  for (const part of parts) {
    if (part.startsWith(`${name}=`)) {
      let raw = decodeURIComponent(part.substring(name.length + 1));
      if (raw.startsWith("s:")) {
        raw = raw.substring(2);
      }
      const token = raw.split(".")[0];
      return token || raw;
    }
  }
  return null;
}

export async function createConvexTestServer(
  preferredPort = 3210,
  preferredSitePort = 3211,
): Promise<ConvexTestServer> {
  const probeStore = new Map<string, ProbeRecord>();
  const sessions = new Map<string, { session: AuthSessionRecord; user: AuthUserRecord }>();
  let simulateAuthError = false;
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
    token?: string;
  }

  const clients = new Set<ConnectedClient>();

  const getQueryValue = (
    udfPath: string,
    args: Record<string, unknown> = {},
    token?: string,
  ) => {
    if (udfPath === "probe:getServerStatus") {
      return {
        status: "ok",
        serverTimeUtc: Date.now(),
        message: "Convex-Backend ist betriebsbereit.",
      };
    }
    if (udfPath === "probe:getProbeStatus") {
      const name = (args.name as string) || "integration-probe";
      return probeStore.get(name) || null;
    }
    if (udfPath === "auth:getCurrentUser") {
      if (!token) return null;
      const found = sessions.get(token);
      if (!found) return null;
      return {
        subject: found.user.id,
        issuer: "http://127.0.0.1:3211",
        name: found.user.name,
        email: found.user.email,
        emailVerified: found.user.emailVerified,
        isAnonymous: found.user.isAnonymous ?? false,
        tokenIdentifier: `http://127.0.0.1:3211|${found.user.id}`,
      };
    }
    if (udfPath === "auth:getAuthUser") {
      if (!token) return undefined;
      const found = sessions.get(token);
      if (!found) return undefined;
      return {
        _id: `user_${found.user.id}`,
        _creationTime: found.user.createdAt,
        name: found.user.name,
        email: found.user.email,
        emailVerified: found.user.emailVerified,
        isAnonymous: found.user.isAnonymous,
        createdAt: found.user.createdAt,
        updatedAt: found.user.updatedAt,
      };
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
        const val = getQueryValue(sub.udfPath, argObj, client.token);
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

  // Main Convex Backend Server
  const mainServer = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Convex-Client",
    );

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    if (
      req.method === "POST" &&
      (req.url === "/api/query" || req.url === "/api/query_at_ts")
    ) {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          const path = parsed.path;
          const args = parsed.args?.[0] || {};
          const token =
            extractBearerToken(req.headers.authorization) ||
            parsed.token ||
            undefined;
          const value = getQueryValue(path, args, token);

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
            probeStore.set(name, record);
            result = record;
            notifyClients();
          } else if (path === "probe:clearProbe") {
            const name = (args.name as string) || "integration-probe";
            probeStore.delete(name);
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

  // Site / Better Auth HTTP Server
  const siteServer = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Convex-Client, Cookie",
    );
    res.setHeader("Access-Control-Allow-Credentials", "true");

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url || "/", "http://127.0.0.1");
    const path = parsedUrl.pathname;

    // Better Auth Anonymous Sign-In
    if (
      (path === "/api/auth/sign-in/anonymous" ||
        path === "/sign-in/anonymous") &&
      req.method === "POST"
    ) {
      if (simulateAuthError) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            message: "Anonyme Anmeldung fehlgeschlagen.",
            code: "FAILED_TO_CREATE_USER",
          }),
        );
        return;
      }

      const now = Date.now();
      const userId = `anon_${now}_${Math.random().toString(36).substring(2, 7)}`;
      const token = `session_${now}_${Math.random().toString(36).substring(2, 9)}`;
      const expiresAt = now + 30 * 24 * 60 * 60 * 1000;

      const user: AuthUserRecord = {
        id: userId,
        name: "Anonymer Benutzer",
        email: `${userId}@anonymous.placeholder.invalid`,
        emailVerified: false,
        isAnonymous: true,
        createdAt: now,
        updatedAt: now,
      };

      const session: AuthSessionRecord = {
        id: `sess_${now}`,
        token,
        userId,
        expiresAt,
        createdAt: now,
        updatedAt: now,
      };

      sessions.set(token, { session, user });
      notifyClients();

      res.setHeader(
        "Set-Cookie",
        `better-auth.session_token=${token}; Path=/; HttpOnly; SameSite=Lax`,
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          token,
          user,
          session,
        }),
      );
      return;
    }

    // Better Auth Sign Out
    if (
      (path === "/api/auth/sign-out" || path === "/sign-out") &&
      req.method === "POST"
    ) {
      if (simulateAuthError) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            message: "Abmeldung fehlgeschlagen.",
            code: "SIGN_OUT_FAILED",
          }),
        );
        return;
      }

      const sessionCookie =
        extractCookie(req.headers.cookie, "better-auth.session_token") ||
        extractCookie(req.headers.cookie, "__Secure-better-auth.session_token") ||
        extractBearerToken(req.headers.authorization);

      if (sessionCookie) {
        sessions.delete(sessionCookie);
      }
      notifyClients();

      res.setHeader(
        "Set-Cookie",
        `better-auth.session_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax`,
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    // Better Auth JWT Token endpoint for Convex
    if (path === "/api/auth/convex/token" || path === "/convex/token") {
      const sessionCookie =
        extractCookie(req.headers.cookie, "better-auth.session_token") ||
        extractCookie(req.headers.cookie, "__Secure-better-auth.session_token") ||
        extractCookie(req.headers.cookie, "convex_jwt") ||
        extractBearerToken(req.headers.authorization);

      if (sessionCookie && sessions.has(sessionCookie)) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ token: sessionCookie }));
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ token: null }));
      }
      return;
    }

    // Better Auth Session lookup
    if (path === "/api/auth/get-session" || path === "/get-session") {
      const sessionCookie =
        extractCookie(req.headers.cookie, "better-auth.session_token") ||
        extractCookie(req.headers.cookie, "__Secure-better-auth.session_token") ||
        extractBearerToken(req.headers.authorization);

      if (sessionCookie && sessions.has(sessionCookie)) {
        const found = sessions.get(sessionCookie)!;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            session: found.session,
            user: found.user,
          }),
        );
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(null));
      }
      return;
    }

    // Better Auth JWKS endpoint
    if (path === "/api/auth/convex/jwks" || path === "/convex/jwks") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          keys: [
            {
              kid: "test-key-id",
              kty: "OKP",
              alg: "EdDSA",
              crv: "Ed25519",
              x: "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo",
              use: "sig",
            },
          ],
        }),
      );
      return;
    }

    // OIDC Configuration endpoint
    if (
      path === "/api/auth/convex/.well-known/openid-configuration" ||
      path === "/convex/.well-known/openid-configuration"
    ) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          issuer: "http://127.0.0.1:3211",
          jwks_uri: "http://127.0.0.1:3211/api/auth/convex/jwks",
        }),
      );
      return;
    }

    // Default 200 for health/probes
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
  });

  const wss = new WebSocketServer({ server: mainServer });

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
              const val = getQueryValue(mod.udfPath, argObj, client.token);
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
            probeStore.set(name, record);
            result = record;
          } else if (udfPath === "probe:clearProbe") {
            const name = (args.name as string) || "integration-probe";
            probeStore.delete(name);
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
        } else if (msg.type === "Authenticate") {
          const token =
            msg.tokenType === "None"
              ? undefined
              : msg.value || msg.token || undefined;
          client.token = token;

          const baseVersion =
            typeof msg.baseVersion === "number"
              ? msg.baseVersion
              : client.lastVersion.identity;
          const endIdentity = baseVersion + 1;
          currentTs += 1;

          const startVersion = { ...client.lastVersion };
          const endVersion: ClientVersion = {
            querySet: client.lastVersion.querySet,
            ts: currentTs,
            identity: endIdentity,
          };
          client.lastVersion = endVersion;

          const modifications = [];
          for (const [queryId, sub] of client.subscriptions.entries()) {
            const argObj = (sub.args?.[0] as Record<string, unknown>) || {};
            const val = getQueryValue(sub.udfPath, argObj, client.token);
            modifications.push({
              type: "QueryUpdated",
              queryId,
              value: val,
              logLines: [],
            });
          }

          ws.send(
            JSON.stringify({
              type: "Transition",
              startVersion: {
                querySet: startVersion.querySet,
                ts: encodeTs(startVersion.ts),
                identity: baseVersion,
              },
              endVersion: {
                querySet: endVersion.querySet,
                ts: encodeTs(endVersion.ts),
                identity: endIdentity,
              },
              modifications,
            }),
          );
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
    mainServer.listen(preferredPort, "127.0.0.1", () => {
      resolve();
    });
    mainServer.once("error", reject);
  });

  await new Promise<void>((resolve, reject) => {
    siteServer.listen(preferredSitePort, "127.0.0.1", () => {
      resolve();
    });
    siteServer.once("error", reject);
  });

  const mainAddress = mainServer.address();
  const actualPort =
    typeof mainAddress === "object" && mainAddress
      ? mainAddress.port
      : preferredPort;
  const url = `http://127.0.0.1:${actualPort}`;

  const siteAddress = siteServer.address();
  const actualSitePort =
    typeof siteAddress === "object" && siteAddress
      ? siteAddress.port
      : preferredSitePort;
  const siteUrl = `http://127.0.0.1:${actualSitePort}`;

  return {
    port: actualPort,
    sitePort: actualSitePort,
    url,
    siteUrl,
    close: async () => {
      for (const client of clients) {
        client.ws.close();
      }
      clients.clear();
      await Promise.all([
        new Promise<void>((resolve) => {
          wss.close(() => {
            mainServer.close(() => resolve());
          });
        }),
        new Promise<void>((resolve) => {
          siteServer.close(() => resolve());
        }),
      ]);
    },
    setProbe: (record) => {
      const full: ProbeRecord = {
        _id: record._id || `probe_${Date.now()}`,
        name: record.name,
        status: record.status,
        message: record.message,
        updatedAt: record.updatedAt || Date.now(),
      };
      probeStore.set(record.name, full);
      notifyClients();
      return full;
    },
    getProbe: (name: string) => {
      return probeStore.get(name) || null;
    },
    clearProbe: (name: string) => {
      probeStore.delete(name);
      notifyClients();
    },
    setAuthSession: (session, user) => {
      sessions.set(session.token, { session, user });
      notifyClients();
    },
    getAuthSession: (token) => {
      return sessions.get(token) || null;
    },
    clearAuthSessions: () => {
      sessions.clear();
      notifyClients();
    },
    setSimulateAuthError: (simulate: boolean) => {
      simulateAuthError = simulate;
    },
    reset: () => {
      probeStore.clear();
      sessions.clear();
      simulateAuthError = false;
      notifyClients();
    },
  };
}
