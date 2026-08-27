import { expect, test } from "@playwright/test";
import { validateConvexUrl } from "../../app/env";
import { createConvexTestServer, type ConvexTestServer } from "../fixtures/convex-test-server";

let convexServer: ConvexTestServer;

test.beforeAll(async () => {
  convexServer = await createConvexTestServer(3210);
});

test.afterAll(async () => {
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

    const validHttps = validateConvexUrl("https://happy-animal-123.convex.cloud");
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
  });
});

test.describe("Convex End-to-End Integration", () => {
  test("zeigt Ladezustand, Serverabfrage, leeren Zustand und führt reaktive Mutation aus", async ({
    page,
  }) => {
    await page.goto("/convex");

    // Server-Abfrageanzeige prüfen
    await expect(page.getByTestId("server-query-section")).toBeVisible();
    await expect(page.getByText("Server-Statusabfrage")).toBeVisible();
    await expect(page.getByText("Serverabfrage erfolgreich")).toBeVisible();
    await expect(page.getByTestId("server-status-message")).toHaveText(
      "Convex-Backend ist betriebsbereit.",
    );

    // Initialer leerer Zustand der reaktiven Sonde
    await expect(page.getByTestId("empty-state")).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 3, name: "Kein Probe-Zustand vorhanden" }),
    ).toBeVisible();
    await expect(
      page.getByText("Aktualisiere den Status unten, um eine reaktive Datenbankänderung"),
    ).toBeVisible();

    // Formularvalidierung: Leere Eingabe absenden
    await page.getByTestId("submit-probe-button").click();
    await expect(page.getByText("Status ist erforderlich")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Status" })).toBeFocused();

    // Positiver Pfad: Zustand eingeben und absenden
    await page.getByRole("textbox", { name: "Status" }).fill("Shop-Betrieb aktiv");
    await page
      .getByRole("textbox", { name: "Optionale Nachricht" })
      .fill("2 von 2 Stühlen besetzt");
    await page.getByTestId("submit-probe-button").click();

    // Reaktive Aktualisierung beobachten
    await expect(page.getByTestId("positive-state")).toBeVisible();
    await expect(page.getByTestId("probe-status-badge")).toHaveText("Shop-Betrieb aktiv");
    await expect(page.getByTestId("probe-message")).toContainText("2 von 2 Stühlen besetzt");
    await expect(page.getByText("Verbunden mit Convex")).toBeVisible();

    // Leeren des Zustands über Aktionsbutton
    await page.getByTestId("clear-probe-button").click();
    await expect(page.getByTestId("empty-state")).toBeVisible();
  });

  test("behandelt simulierte Validierungs- und Fehlerpfade auf Deutsch", async ({
    page,
  }) => {
    await page.goto("/convex");

    await expect(page.getByTestId("empty-state")).toBeVisible();
    await page.getByTestId("trigger-error-button").click();
    await expect(page.getByTestId("error-alert")).toBeVisible();
    await expect(
      page.getByText("Validierungsfehler: Der eingegebene Status entspricht nicht den Anforderungen."),
    ).toBeVisible();
  });

  test("reagiert in Echtzeit auf serverseitige Datenänderungen ohne Seiten-Reload", async ({
    page,
  }) => {
    await page.goto("/convex");

    await expect(page.getByTestId("empty-state")).toBeVisible();

    // Serverseitige Mutation ohne Browserinteraktion auslösen
    convexServer.setProbe({
      name: "integration-probe",
      status: "Echtzeit-Aktualisierung empfangen",
      message: "Push vom Test-Server",
    });

    // Client-Sonde muss reaktiv ohne Seiten-Reload aktualisieren
    await expect(page.getByTestId("positive-state")).toBeVisible();
    await expect(page.getByTestId("probe-status-badge")).toHaveText(
      "Echtzeit-Aktualisierung empfangen",
    );
    await expect(page.getByTestId("probe-message")).toContainText("Push vom Test-Server");
  });
});
