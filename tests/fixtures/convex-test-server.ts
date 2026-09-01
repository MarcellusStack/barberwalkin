import http from "node:http";
import { WebSocketServer, type WebSocket } from "ws";

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

export interface StoredOtpRecord {
  email: string;
  type: string;
  otp: string;
  expiresAt: number;
  attempts: number;
}

export interface DeliveredEmailRecord {
  email: string;
  type: string;
  otp: string;
  timestamp: number;
}

export interface ConvexTestServer {
  port: number;
  sitePort: number;
  url: string;
  siteUrl: string;
  close: () => Promise<void>;
  setAuthSession: (session: AuthSessionRecord, user: AuthUserRecord) => void;
  getAuthSession: (token: string) => { session: AuthSessionRecord; user: AuthUserRecord } | null;
  clearAuthSessions: () => void;
  setSimulateAuthError: (simulate: boolean) => void;
  // Email OTP test helpers
  getLatestOtp: (email?: string, type?: string) => DeliveredEmailRecord | null;
  getDeliveredOtps: (email?: string) => DeliveredEmailRecord[];
  setSimulateEmailDeliveryError: (simulate: boolean) => void;
  expireOtp: (email: string, type?: string) => void;
  setOtpAttempts: (email: string, type: string, attempts: number) => void;
  clearOtps: () => void;
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

function parseJsonBody<T = Record<string, unknown>>(req: http.IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? (JSON.parse(body) as T) : ({} as T));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

export async function createConvexTestServer(
  preferredPort = 3210,
  preferredSitePort = 3211,
): Promise<ConvexTestServer> {
  const sessions = new Map<string, { session: AuthSessionRecord; user: AuthUserRecord }>();
  const otpStore = new Map<string, StoredOtpRecord>();
  const deliveredEmails: DeliveredEmailRecord[] = [];
  let simulateAuthError = false;
  let simulateEmailDeliveryError = false;
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
    token?: string,
  ) => {
    if (udfPath === "auth:getCurrentUser") {
      if (!token) return null;
      let found = sessions.get(token);
      if (!found) {
        for (const record of sessions.values()) {
          if (
            record.session.token === token ||
            record.session.id === token ||
            token.includes(record.session.token)
          ) {
            found = record;
            break;
          }
        }
      }
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
      let found = sessions.get(token);
      if (!found) {
        for (const record of sessions.values()) {
          if (
            record.session.token === token ||
            record.session.id === token ||
            token.includes(record.session.token)
          ) {
            found = record;
            break;
          }
        }
      }
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

      const token =
        client.token ||
        (sessions.size === 1 ? Array.from(sessions.keys())[0] : undefined);
      const modifications = [];
      for (const [queryId, sub] of client.subscriptions.entries()) {
        const val = getQueryValue(sub.udfPath, token);
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
          const token =
            extractBearerToken(req.headers.authorization) ||
            parsed.token ||
            undefined;
          const value = getQueryValue(path, token);

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
          JSON.parse(body);

          const result: unknown = null;

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
  const siteServer = http.createServer(async (req, res) => {
    const origin =
      req.headers.origin ||
      (req.headers.referer ? new URL(req.headers.referer).origin : "http://127.0.0.1:3100");
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Convex-Client, Cookie, x-better-auth-forwarded-host, x-better-auth-forwarded-proto",
    );
    res.setHeader("Access-Control-Allow-Credentials", "true");

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url || "/", "http://127.0.0.1");
    const path = parsedUrl.pathname;

    // Better Auth Send Verification OTP
    if (
      (path === "/api/auth/email-otp/send-verification-otp" ||
        path === "/email-otp/send-verification-otp") &&
      req.method === "POST"
    ) {
      if (simulateEmailDeliveryError) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            message: "E-Mail-Zustellung fehlgeschlagen. Bitte versuchen Sie es später erneut.",
            code: "EMAIL_DELIVERY_FAILED",
          }),
        );
        return;
      }

      try {
        const body = await parseJsonBody<{ email?: string; type?: string }>(req);
        const email = (body.email || "").toLowerCase().trim();
        const type = body.type || "sign-in";

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              message: "Bitte geben Sie eine gültige E-Mail-Adresse ein.",
              code: "INVALID_EMAIL",
            }),
          );
          return;
        }

        // 6-stelligen Bestätigungscode deterministisch / zufällig erzeugen
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const now = Date.now();
        const expiresAt = now + 5 * 60 * 1000; // 5 Minuten Gültigkeit
        const key = `${type}:${email}`;

        otpStore.set(key, {
          email,
          type,
          otp,
          expiresAt,
          attempts: 0,
        });

        deliveredEmails.push({
          email,
          type,
          otp,
          timestamp: now,
        });

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: String(err), code: "BAD_REQUEST" }));
      }
      return;
    }

    // Better Auth Sign In with Email OTP
    if (
      (path === "/api/auth/sign-in/email-otp" ||
        path === "/sign-in/email-otp") &&
      req.method === "POST"
    ) {
      if (simulateAuthError) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            message: "Anmeldung mit Bestätigungscode fehlgeschlagen.",
            code: "FAILED_TO_SIGN_IN",
          }),
        );
        return;
      }

      try {
        const body = await parseJsonBody<{
          email?: string;
          otp?: string;
          name?: string;
        }>(req);
        const email = (body.email || "").toLowerCase().trim();
        const submittedOtp = (body.otp || "").trim();
        const key = `sign-in:${email}`;
        const record = otpStore.get(key);

        if (!record) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              message: "Ungültiger Bestätigungscode.",
              code: "INVALID_OTP",
            }),
          );
          return;
        }

        const now = Date.now();
        if (now > record.expiresAt) {
          otpStore.delete(key);
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              message: "Der Bestätigungscode ist abgelaufen.",
              code: "OTP_EXPIRED",
            }),
          );
          return;
        }

        if (record.attempts >= 3) {
          otpStore.delete(key);
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              message: "Zu viele Fehlversuche.",
              code: "TOO_MANY_ATTEMPTS",
            }),
          );
          return;
        }

        if (record.otp !== submittedOtp) {
          record.attempts += 1;
          if (record.attempts >= 3) {
            otpStore.delete(key);
            res.writeHead(403, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                message: "Zu viele Fehlversuche.",
                code: "TOO_MANY_ATTEMPTS",
              }),
            );
          } else {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                message: "Ungültiger Bestätigungscode.",
                code: "INVALID_OTP",
              }),
            );
          }
          return;
        }

        // Erfolgreiche Anmeldung: OTP verbrauchen
        otpStore.delete(key);

        const userId = `user_${Buffer.from(email).toString("hex").substring(0, 12)}`;
        const token = `session_${now}_${Math.random().toString(36).substring(2, 9)}`;
        const expiresAt = now + 30 * 24 * 60 * 60 * 1000;

        const user: AuthUserRecord = {
          id: userId,
          name: body.name || email.split("@")[0],
          email,
          emailVerified: true,
          isAnonymous: false,
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
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: String(err), code: "BAD_REQUEST" }));
      }
      return;
    }

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

      try {
        await parseJsonBody(req).catch(() => ({}));
      } catch {
        // ignore
      }

      const sessionCookie =
        extractCookie(req.headers.cookie, "better-auth.session_token") ||
        extractCookie(req.headers.cookie, "__Secure-better-auth.session_token") ||
        extractCookie(req.headers.cookie, "convex_jwt") ||
        extractBearerToken(req.headers.authorization);

      if (sessionCookie) {
        sessions.delete(sessionCookie);
        for (const [key, record] of Array.from(sessions.entries())) {
          if (
            record.session.token === sessionCookie ||
            record.session.id === sessionCookie ||
            sessionCookie.includes(record.session.token)
          ) {
            sessions.delete(key);
          }
        }
      } else {
        sessions.clear();
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

      let found = sessionCookie ? sessions.get(sessionCookie) : undefined;
      if (!found && sessionCookie) {
        for (const record of sessions.values()) {
          if (
            record.session.token === sessionCookie ||
            record.session.id === sessionCookie ||
            sessionCookie.includes(record.session.token)
          ) {
            found = record;
            break;
          }
        }
      }

      if (found) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ token: found.session.token }));
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

      let found = sessionCookie ? sessions.get(sessionCookie) : undefined;
      if (!found && sessionCookie) {
        for (const record of sessions.values()) {
          if (
            record.session.token === sessionCookie ||
            record.session.id === sessionCookie ||
            sessionCookie.includes(record.session.token)
          ) {
            found = record;
            break;
          }
        }
      }

      if (found) {
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

    // Default 200 for health checks
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
          const token =
            msg.tokenType === "None"
              ? undefined
              : msg.value || msg.token || undefined;
          if (token) {
            client.token = token;
          }

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
          const token =
            client.token ||
            (sessions.size === 1 ? Array.from(sessions.keys())[0] : undefined);
          const modifications = [];
          for (const mod of msg.modifications || []) {
            if (mod.type === "Add") {
              client.subscriptions.set(mod.queryId, {
                queryId: mod.queryId,
                udfPath: mod.udfPath,
                args: mod.args || [],
              });

              const val = getQueryValue(mod.udfPath, token);
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
          const result: unknown = null;

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
            const val = getQueryValue(sub.udfPath, client.token);
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
    getLatestOtp: (email?: string, type?: string) => {
      const filtered = deliveredEmails.filter((r) => {
        if (email && r.email.toLowerCase() !== email.toLowerCase()) return false;
        if (type && r.type !== type) return false;
        return true;
      });
      return filtered.length > 0 ? filtered[filtered.length - 1] : null;
    },
    getDeliveredOtps: (email?: string) => {
      if (!email) return [...deliveredEmails];
      return deliveredEmails.filter((r) => r.email.toLowerCase() === email.toLowerCase());
    },
    setSimulateEmailDeliveryError: (simulate: boolean) => {
      simulateEmailDeliveryError = simulate;
    },
    expireOtp: (email: string, type = "sign-in") => {
      const key = `${type}:${email.toLowerCase()}`;
      const found = otpStore.get(key);
      if (found) {
        found.expiresAt = Date.now() - 1000;
      }
    },
    setOtpAttempts: (email: string, type: string, attempts: number) => {
      const key = `${type}:${email.toLowerCase()}`;
      const found = otpStore.get(key);
      if (found) {
        found.attempts = attempts;
      }
    },
    clearOtps: () => {
      otpStore.clear();
      deliveredEmails.length = 0;
    },
    reset: () => {
      sessions.clear();
      otpStore.clear();
      deliveredEmails.length = 0;
      simulateAuthError = false;
      simulateEmailDeliveryError = false;
      for (const client of clients) {
        client.token = undefined;
      }
      notifyClients();
    },
  };
}
