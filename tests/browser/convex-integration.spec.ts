import { expect, test } from "@playwright/test";
import { fetchQuery } from "convex/nextjs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
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

test.beforeAll(async () => {
  convexServer = await createConvexTestServer(3210);
  process.env.NEXT_PUBLIC_CONVEX_URL = convexServer.url;
});

test.afterAll(async () => {
  process.env.NEXT_PUBLIC_CONVEX_URL = originalEnvUrl;
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

  test("führt Serverabfrage über fetchQuery gegen das Convex-Backend aus", async () => {
    const serverStatus = await fetchQuery(
      api.probe.getServerStatus,
      {},
      { url: "http://127.0.0.1:3210" },
    );

    expect(serverStatus).toBeDefined();
    expect(serverStatus.status).toBe("ok");
    expect(serverStatus.message).toBe("Convex-Backend ist betriebsbereit.");
    expect(typeof serverStatus.serverTimeUtc).toBe("number");
  });

  test("führt Abfragen und Mutationen über den Convex-Client aus", async () => {
    const client = new ConvexHttpClient("http://127.0.0.1:3210");

    // 1. Initialer leerer Zustand
    const initialProbe = await client.query(api.probe.getProbeStatus, {
      name: "integration-probe",
    });
    expect(initialProbe).toBeNull();

    // 2. Mutation ausführen
    const created = await client.mutation(api.probe.setProbeStatus, {
      name: "integration-probe",
      status: "Shop-Betrieb aktiv",
      message: "2 von 2 Stühlen besetzt",
    });
    expect(created.status).toBe("Shop-Betrieb aktiv");
    expect(created.message).toBe("2 von 2 Stühlen besetzt");

    // 3. Aktualisierten Zustand abfragen
    const updatedProbe = await client.query(api.probe.getProbeStatus, {
      name: "integration-probe",
    });
    expect(updatedProbe).not.toBeNull();
    expect(updatedProbe?.status).toBe("Shop-Betrieb aktiv");
    expect(updatedProbe?.message).toBe("2 von 2 Stühlen besetzt");

    // 4. Zustand leeren
    await client.mutation(api.probe.clearProbe, { name: "integration-probe" });
    const clearedProbe = await client.query(api.probe.getProbeStatus, {
      name: "integration-probe",
    });
    expect(clearedProbe).toBeNull();
  });
});
