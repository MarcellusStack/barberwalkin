import { expect, test } from "@playwright/test";
import {
  createConvexTestServer,
  type ConvexTestServer,
} from "../fixtures/convex-test-server";

let testServer: ConvexTestServer;

test.beforeAll(async () => {
  testServer = await createConvexTestServer(3210, 3211);
  process.env.NEXT_PUBLIC_CONVEX_URL = testServer.url;
  process.env.NEXT_PUBLIC_CONVEX_SITE_URL = testServer.siteUrl;
});

test.afterAll(async () => {
  if (testServer) {
    await testServer.close();
  }
});

test.beforeEach(async ({ context }) => {
  testServer.reset();
  if (context) {
    await context.clearCookies();
  }
});

// Die OTP-Zustellung wird auf Routenebene erfüllt, damit der Motion-Test
// deterministisch ist und sich nicht auf den flackernden Dev-Auth-Endpunkt
// in der Browser-Sitzung verlässt (siehe auth-otp.spec.ts).
async function requestOtpDeterministically(page: import("@playwright/test").Page) {
  await page.route("**/api/auth/email-otp/send-verification-otp", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });
  await page.getByPlaceholder("name@beispiel.de").fill("motion@barberwalkin.de");
  await page.getByRole("button", { name: "Code anfordern" }).click();
}

test.describe("Motion-Integration mit reduzierter Bewegung", () => {
  test("blendet das OTP-Feld verzögert mit dezentem Motion-Übergang ein", async ({
    page,
  }) => {
    await page.goto("/sign-in");

    const reveal = page.locator('[data-motion-reveal]');
    const otpField = page.getByPlaceholder("123456");

    // Lazy: das Feld (und sein Motion-Element) existiert erst nach dem Absenden.
    await expect(reveal).toHaveCount(0);
    await expect(otpField).not.toBeVisible();

    await requestOtpDeterministically(page);

    await expect(reveal).toHaveCount(1);
    await expect(otpField).toBeVisible();
    // Standardverhalten: keine reduzierte Bewegung.
    await expect(reveal).toHaveAttribute("data-reduced-motion", "false");
    // Der Übergang setzt auf vollem Zustand ein.
    await expect(reveal).toHaveCSS("opacity", "1");
  });

  test("blendet das OTP-Feld ohne Bewegung ein, wenn reduzierte Bewegung gewünscht ist", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/sign-in");

    const reveal = page.locator('[data-motion-reveal]');
    const otpField = page.getByPlaceholder("123456");
    await expect(reveal).toHaveCount(0);

    await requestOtpDeterministically(page);

    await expect(reveal).toHaveCount(1);
    await expect(otpField).toBeVisible();
    // Deterministisch: die App reagiert auf prefers-reduced-motion und
    // verzichtet auf den Bewegungs-Übergang, ohne den Anmeldezustand zu ändern.
    await expect(reveal).toHaveAttribute("data-reduced-motion", "true");
    await expect(reveal).toHaveCSS("opacity", "1");
  });
});
