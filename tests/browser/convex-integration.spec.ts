import { expect, test } from "@playwright/test";
import {
  isConvexConfigured,
  requirePublicConvexUrl,
  validateConvexUrl,
} from "../../lib/env";
import {
  createConvexTestServer,
  type ConvexTestServer,
} from "../fixtures/convex-test-server";

let convexServer: ConvexTestServer;

const originalEnvUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const originalSiteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;

test.beforeAll(async () => {
  convexServer = await createConvexTestServer(3210, 3211);
  process.env.NEXT_PUBLIC_CONVEX_URL = convexServer.url;
  process.env.NEXT_PUBLIC_CONVEX_SITE_URL = convexServer.siteUrl;
});

test.afterAll(async () => {
  process.env.NEXT_PUBLIC_CONVEX_URL = originalEnvUrl;
  process.env.NEXT_PUBLIC_CONVEX_SITE_URL = originalSiteUrl;
  if (convexServer) {
    await convexServer.close();
  }
});

test.beforeEach(async () => {
  convexServer.reset();
});

test.describe("Umgebungsvalidierung für Convex", () => {
  test("erkennt gültige und ungültige Convex-URLs mit deutscher Fehlermeldung", () => {
    const validHttp = validateConvexUrl("http://127.0.0.1:3210");
    expect(validHttp.isValid).toBe(true);
    expect(validHttp.url).toBe("http://127.0.0.1:3210");
    expect(validHttp.error).toBeNull();

    const validHttps = validateConvexUrl(
      "https://happy-animal-123.convex.cloud",
    );
    expect(validHttps.isValid).toBe(true);
    expect(validHttps.url).toBe("https://happy-animal-123.convex.cloud");
    expect(validHttps.error).toBeNull();

    const empty = validateConvexUrl("");
    expect(empty.isValid).toBe(false);
    expect(empty.error).toBe("NEXT_PUBLIC_CONVEX_URL ist nicht konfiguriert.");

    const invalidProtocol = validateConvexUrl("ftp://localhost:3210");
    expect(invalidProtocol.isValid).toBe(false);
    expect(invalidProtocol.error).toBe(
      "NEXT_PUBLIC_CONVEX_URL muss mit 'http://' oder 'https://' beginnen.",
    );

    const malformed = validateConvexUrl("http://");
    expect(malformed.isValid).toBe(false);
    expect(malformed.error).toBe("NEXT_PUBLIC_CONVEX_URL ist keine gültige URL.");

    expect(isConvexConfigured()).toBe(true);
    expect(requirePublicConvexUrl()).toBe("http://127.0.0.1:3210");
  });
});

test.describe("Convex End-to-End Integration", () => {
  test("rendert die Anwendungshülle mit aktivem ConvexClientProvider fehlerfrei", async ({
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
  });
});
