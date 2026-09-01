import { expect, test } from "@playwright/test";
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

test.beforeEach(async ({ context }) => {
  testServer.reset();
  if (context) {
    await context.clearCookies();
  }
});

test.afterEach(async () => {
  testServer.reset();
});

test.describe("Anmeldeseite /sign-in", () => {
  test("rendert die deutsche Anmeldeseite mit leeren Formular-Startzustand", async ({
    page,
  }) => {
    await page.goto("/sign-in");

    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    await expect(page).toHaveTitle("Anmelden – BarberWalkin");
    await expect(
      page.getByRole("heading", { level: 1, name: "Anmelden" }),
    ).toBeVisible();
    await expect(page.getByText("Mit E-Mail oder anonym als Shop Admin testen.")).toBeVisible();

    // Leerer Startzustand: beide Eingaben vorhanden, keine Meldungen
    await expect(page.getByPlaceholder("name@beispiel.de")).toBeVisible();
    await expect(page.getByPlaceholder("123456")).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Code anfordern" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Anonym anmelden" })).toBeVisible();
    await expect(page.getByText("Authentifizierungsfehler")).toHaveCount(0);
    await expect(page.getByText("Erfolgreich angemeldet!")).toHaveCount(0);
  });

  test("zeigt während des Code-Anforderns den Ladezustand an", async ({ page }) => {
    await page.route("**/api/auth/email-otp/send-verification-otp", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await route.continue();
    });
    await page.goto("/sign-in");
    await page.getByPlaceholder("name@beispiel.de").fill("lading@barberwalkin.de");

    await page.getByRole("button", { name: "Code anfordern" }).click();

    await expect(page.getByRole("button", { name: "Code anfordern" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Anonym anmelden" })).toBeDisabled();
    await expect(page.getByText("Angemeldet als")).not.toBeVisible();
  });

  test("Retry nach Zustellungsfehler: Formular und Button bleiben verfügbar", async ({
    page,
  }) => {
    testServer.setSimulateEmailDeliveryError(true);
    try {
      await page.goto("/sign-in");
      await page.getByPlaceholder("name@beispiel.de").fill("retry@barberwalkin.de");
      await page.getByRole("button", { name: "Code anfordern" }).click();

      // Fehlermeldung und Retry-Option bleiben verfügbar
      await expect(page.getByText("Authentifizierungsfehler")).toBeVisible();
      await expect(
        page.getByText("E-Mail-Zustellung fehlgeschlagen. Bitte versuchen Sie es später erneut."),
      ).toBeVisible();
      const sendButton = page.getByRole("button", { name: "Code anfordern" });
      await expect(sendButton).toBeEnabled();
      await expect(page.getByPlaceholder("name@beispiel.de")).toBeEnabled();
      await expect(page.getByRole("button", { name: "Anonym anmelden" })).toBeEnabled();
      await expect(page.getByText("Angemeldet als")).not.toBeVisible();
    } finally {
      testServer.setSimulateEmailDeliveryError(false);
    }
  });

  test("durchläuft den anonymen Testzugang und die Abmeldung", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    await page.getByRole("button", { name: "Anonym anmelden" }).click();

    // Anmeldung
    await expect(page.getByText("Angemeldet als")).toBeVisible();
    await expect(page.getByText("Erfolgreich angemeldet!")).toBeVisible();
    await expect(page.getByRole("button", { name: "Abmelden" })).toBeVisible();

    // Abmeldung zurück in den leeren Zustand
    await page.getByRole("button", { name: "Abmelden" }).click();
    await expect(page.getByText("Angemeldet als")).not.toBeVisible();
    await expect(page.getByPlaceholder("name@beispiel.de")).toBeVisible();
    await expect(page.getByRole("button", { name: "Code anfordern" })).toBeVisible();
  });

  test("behandelt den Fehlerpfad der anonymen Anmeldung mit deutscher Meldung und Retry", async ({
    page,
  }) => {
    testServer.setSimulateAuthError(true);
    try {
      await page.goto("/sign-in");
      await page.getByRole("button", { name: "Anonym anmelden" }).click();

      await expect(page.getByText("Authentifizierungsfehler")).toBeVisible();
      await expect(
        page.getByText("Anonyme Anmeldung fehlgeschlagen."),
      ).toBeVisible();
      // Retry: Button und Formular bleiben verfügbar
      await expect(page.getByRole("button", { name: "Anonym anmelden" })).toBeEnabled();
      await expect(page.getByText("Angemeldet als")).not.toBeVisible();
    } finally {
      testServer.setSimulateAuthError(false);
    }
  });
});
