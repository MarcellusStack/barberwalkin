import { expect, test } from "@playwright/test";
import { fetchQuery } from "convex/nextjs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import {
  isBetterAuthConfigured,
  requireBetterAuthSecret,
  requirePublicConvexSiteUrl,
  validateBetterAuthSecret,
  validateConvexSiteUrl,
  validateSiteUrl,
} from "../../lib/env";
import {
  createConvexTestServer,
  type ConvexTestServer,
} from "../fixtures/convex-test-server";

let testServer: ConvexTestServer;
const originalConvexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const originalSiteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;

test.beforeAll(async () => {
  testServer = await createConvexTestServer(3210, 3211);
  process.env.NEXT_PUBLIC_CONVEX_URL = testServer.url;
  process.env.NEXT_PUBLIC_CONVEX_SITE_URL = testServer.siteUrl;
});

test.afterAll(async () => {
  process.env.NEXT_PUBLIC_CONVEX_URL = originalConvexUrl;
  process.env.NEXT_PUBLIC_CONVEX_SITE_URL = originalSiteUrl;
  if (testServer) {
    await testServer.close();
  }
});

test.beforeEach(async () => {
  testServer.reset();
});

test.describe("Better Auth & Convex Umgebungsvalidierung", () => {
  test("validiert NEXT_PUBLIC_CONVEX_SITE_URL mit deutscher Fehlermeldung", () => {
    const validHttp = validateConvexSiteUrl("http://127.0.0.1:3211");
    expect(validHttp.isValid).toBe(true);
    expect(validHttp.url).toBe("http://127.0.0.1:3211");
    expect(validHttp.error).toBeNull();

    const validSite = validateConvexSiteUrl("https://happy-animal-123.convex.site");
    expect(validSite.isValid).toBe(true);
    expect(validSite.url).toBe("https://happy-animal-123.convex.site");
    expect(validSite.error).toBeNull();

    const empty = validateConvexSiteUrl("");
    expect(empty.isValid).toBe(false);
    expect(empty.error).toBe("NEXT_PUBLIC_CONVEX_SITE_URL ist nicht konfiguriert.");

    const cloudUrl = validateConvexSiteUrl("https://happy-animal-123.convex.cloud");
    expect(cloudUrl.isValid).toBe(false);
    expect(cloudUrl.error).toContain("darf nicht auf '.convex.cloud' enden");

    expect(isBetterAuthConfigured()).toBe(true);
    expect(requirePublicConvexSiteUrl()).toBe("http://127.0.0.1:3211");
  });

  test("validiert NEXT_PUBLIC_SITE_URL mit deutscher Fehlermeldung", () => {
    const valid = validateSiteUrl("http://localhost:3000");
    expect(valid.isValid).toBe(true);
    expect(valid.url).toBe("http://localhost:3000");
    expect(valid.error).toBeNull();

    const empty = validateSiteUrl("");
    expect(empty.isValid).toBe(false);
    expect(empty.error).toBe("NEXT_PUBLIC_SITE_URL ist nicht konfiguriert.");

    const invalid = validateSiteUrl("invalid-url");
    expect(invalid.isValid).toBe(false);
    expect(invalid.error).toBe("NEXT_PUBLIC_SITE_URL muss mit 'http://' oder 'https://' beginnen.");
  });

  test("validiert BETTER_AUTH_SECRET mit deutscher Fehlermeldung", () => {
    const valid = validateBetterAuthSecret("super-secret-key-that-is-long-enough");
    expect(valid.isValid).toBe(true);
    expect(valid.error).toBeNull();

    const empty = validateBetterAuthSecret("");
    expect(empty.isValid).toBe(false);
    expect(empty.error).toBe("BETTER_AUTH_SECRET ist nicht konfiguriert.");

    const tooShort = validateBetterAuthSecret("short");
    expect(tooShort.isValid).toBe(false);
    expect(tooShort.error).toBe("BETTER_AUTH_SECRET muss mindestens 16 Zeichen lang sein.");

    const prevSecret = process.env.BETTER_AUTH_SECRET;
    process.env.BETTER_AUTH_SECRET = "super-secret-key-that-is-long-enough";
    expect(requireBetterAuthSecret()).toBe("super-secret-key-that-is-long-enough");
    process.env.BETTER_AUTH_SECRET = prevSecret;
  });
});

test.describe("Better Auth Serverabfragen & Sitzungsstatus", () => {
  test("liefert leeren Sitzungsstatus (null) für unauthentifizierte Anfragen", async () => {
    const client = new ConvexHttpClient("http://127.0.0.1:3210");
    const currentUser = await client.query(api.auth.getCurrentUser, {});
    expect(currentUser).toBeNull();
  });

  test("löst authentifizierte Benutzeridentität über Server-Query auf", async () => {
    const testSession = {
      id: "session_123",
      token: "test-auth-token-456",
      userId: "user_789",
      expiresAt: Date.now() + 86400000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const testUser = {
      id: "user_789",
      name: "Alex Barber",
      email: "alex@barberwalkin.de",
      emailVerified: true,
      isAnonymous: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    testServer.setAuthSession(testSession, testUser);

    const authedUser = await fetchQuery(
      api.auth.getCurrentUser,
      {},
      {
        url: "http://127.0.0.1:3210",
        token: "test-auth-token-456",
      },
    );

    expect(authedUser).not.toBeNull();
    expect(authedUser?.subject).toBe("user_789");
    expect(authedUser?.email).toBe("alex@barberwalkin.de");
    expect(authedUser?.name).toBe("Alex Barber");
    expect(authedUser?.isAnonymous).toBe(false);
  });
});

test.describe("Browser End-to-End Integration mit ConvexBetterAuthProvider", () => {
  test("rendert Startseite mit aktivem Auth-Client, Convex-Provider und deutschem Statusfeld", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    await expect(page).toHaveTitle(
      "BarberWalkin – Walk-ins einfach organisieren",
    );
    await expect(
      page.getByRole("heading", { level: 1, name: "BarberWalkin" }),
    ).toBeVisible();
    await expect(page.getByText("Walk-in-Betrieb in Echtzeit")).toBeVisible();
    await expect(
      page.getByText("Authentifizierung & Backend-Status"),
    ).toBeVisible();
    await expect(page.getByText("Sitzungsstatus")).toBeVisible();
    await expect(page.getByText("Nicht angemeldet")).toBeVisible();
  });

  test("Next.js Auth-Route leitet Anfragen korrekt an den Testserver weiter", async ({
    request,
  }) => {
    // Unauthentifizierter Session-Abruf über API Route
    const sessionRes = await request.get("/api/auth/get-session");
    expect(sessionRes.ok()).toBe(true);
    const body = await sessionRes.json();
    expect(body).toBeNull();
  });
});
