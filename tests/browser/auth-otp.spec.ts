import { expect, test } from "@playwright/test";
import {
  createConvexTestServer,
  type ConvexTestServer,
} from "../fixtures/convex-test-server";
import {
  getEmailOtpContent,
  type EmailOtpType,
} from "../../lib/email-delivery";

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

test.describe("Better Auth E-Mail OTP Vorlagen und Zustellung", () => {
  test("generiert konsistente deutsche E-Mail-Inhalte für alle OTP-Typen", () => {
    const types: EmailOtpType[] = [
      "sign-in",
      "email-verification",
      "change-email",
      "forget-password",
    ];

    for (const otpType of types) {
      const content = getEmailOtpContent(otpType, "849201");
      expect(content.subject).toContain("BarberWalkin");
      expect(content.text).toContain("849201");
      expect(content.html).toContain("849201");
      expect(content.text).toContain("5 Minuten");
    }

    const signInContent = getEmailOtpContent("sign-in", "123456");
    expect(signInContent.subject).toBe("Ihr Anmeldecode für BarberWalkin");
    expect(signInContent.text).toContain("Ihr Bestätigungscode für BarberWalkin lautet: 123456");

    const verifyContent = getEmailOtpContent("email-verification", "654321");
    expect(verifyContent.subject).toBe("Bestätigen Sie Ihre E-Mail-Adresse – BarberWalkin");
    expect(verifyContent.text).toContain("Ihr Verifizierungscode für BarberWalkin lautet: 654321");
  });
});

test.describe("E-Mail OTP Browser End-to-End Akzeptanzpfade", () => {
  test("durchläuft den vollständigen positiven Pfad: Code anfordern, deterministisch zustellen, anmelden und persistieren", async ({
    page,
  }) => {
    const testEmail = "barber@berlin-cut.de";
    await page.goto("/sign-in");

    // 1. Initialer Zustand: Anmeldung mit leerem Formular, keine Meldungen
    const emailInput = page.getByPlaceholder("name@beispiel.de");
    const sendButton = page.getByRole("button", { name: "Code anfordern" });
    await expect(emailInput).toBeVisible();
    await expect(sendButton).toBeVisible();
    await expect(page.getByText("Authentifizierungsfehler")).toHaveCount(0);
    await expect(page.getByText("Erfolgreich angemeldet!")).toHaveCount(0);

    // 2. E-Mail eingeben und Code anfordern
    await emailInput.fill(testEmail);
    await sendButton.click();

    // 3. Erfolgsmeldung und OTP-Eingabefeld werden angezeigt
    await expect(
      page.getByText(
        "Anfrage verarbeitet. Falls die Zustellung möglich war, erhalten Sie gleich einen Bestätigungscode.",
      ),
    ).toBeVisible();
    const otpInput = page.getByPlaceholder("123456");
    await expect(otpInput).toBeVisible();
    const verifyButton = page.getByRole("button", { name: "Mit Code anmelden" });
    const resendButton = page.getByRole("button", { name: "Code erneut senden" });
    await expect(verifyButton).toBeVisible();
    await expect(resendButton).toBeVisible();

    // 4. Deterministische Testzustellung prüfen und OTP abrufen
    const delivered = testServer.getLatestOtp(testEmail, "sign-in");
    expect(delivered).not.toBeNull();
    expect(delivered?.email).toBe(testEmail);
    expect(delivered?.otp).toMatch(/^\d{6}$/);
    const otp = delivered!.otp;

    // 5. Bestätigungscode eingeben und anmelden
    await otpInput.fill(otp);
    await verifyButton.click();

    // 6. Anmeldung zeigt "Angemeldet als" mit E-Mail-Adresse
    await expect(page.getByText(`Angemeldet als ${testEmail}`)).toBeVisible();
    await expect(page.getByText("Erfolgreich angemeldet!")).toBeVisible();
    const logoutButton = page.getByRole("button", { name: "Abmelden" });
    await expect(logoutButton).toBeVisible();

    // 7. Persistenz nach Neuladen der Seite prüfen
    await page.reload();
    await expect(page.getByText(`Angemeldet als ${testEmail}`)).toBeVisible();
    await expect(logoutButton).toBeVisible();

    // 8. Abmelden und Rückkehr zum leeren Zustand
    await page.getByRole("button", { name: "Abmelden" }).click();
    await expect(page.getByText("Angemeldet als")).not.toBeVisible();
    await expect(page.getByPlaceholder("name@beispiel.de")).toBeVisible();
  });

  test("begrenzt Fehlversuche auf maximal 3 Versuche (Attempt Limits) mit deutscher Fehlermeldung", async ({
    page,
  }) => {
    const testEmail = "security@barberwalkin.de";
    await page.goto("/sign-in");

    // 1. Code anfordern
    await page.getByPlaceholder("name@beispiel.de").fill(testEmail);
    await page.getByRole("button", { name: "Code anfordern" }).click();
    await expect(page.getByPlaceholder("123456")).toBeVisible();

    const delivered = testServer.getLatestOtp(testEmail, "sign-in");
    expect(delivered).not.toBeNull();
    const correctOtp = delivered!.otp;

    const otpInput = page.getByPlaceholder("123456");
    const verifyButton = page.getByRole("button", { name: "Mit Code anmelden" });

    // Fehlversuch 1
    await otpInput.fill("000000");
    await verifyButton.click();
    await expect(page.getByText("Authentifizierungsfehler")).toBeVisible();
    await expect(
      page.getByText("Ungültiger Bestätigungscode. Bitte überprüfen Sie die Eingabe."),
    ).toBeVisible();

    // Fehlversuch 2
    await otpInput.fill("111111");
    await verifyButton.click();
    await expect(
      page.getByText("Ungültiger Bestätigungscode. Bitte überprüfen Sie die Eingabe."),
    ).toBeVisible();

    // Fehlversuch 3 -> Limit erreicht
    await otpInput.fill("222222");
    await verifyButton.click();
    await expect(
      page.getByText("Zu viele Fehlversuche. Bitte fordern Sie einen neuen Code an."),
    ).toBeVisible();

    // Versuch mit dem ursprünglich korrekten Code wird nun abgewiesen, da OTP gesperrt/gelöscht wurde
    await otpInput.fill(correctOtp);
    await verifyButton.click();
    await expect(
      page.getByText("Ungültiger Bestätigungscode. Bitte überprüfen Sie die Eingabe."),
    ).toBeVisible();
    await expect(page.getByText("Angemeldet als")).not.toBeVisible();
  });

  test("weist abgelaufene Bestätigungscodes (Expiry) mit deutscher Fehlermeldung ab", async ({
    page,
  }) => {
    const testEmail = "expired@barberwalkin.de";
    await page.goto("/sign-in");

    // 1. Code anfordern
    await page.getByPlaceholder("name@beispiel.de").fill(testEmail);
    await page.getByRole("button", { name: "Code anfordern" }).click();
    await expect(page.getByPlaceholder("123456")).toBeVisible();

    const delivered = testServer.getLatestOtp(testEmail, "sign-in");
    expect(delivered).not.toBeNull();
    const otp = delivered!.otp;

    // 2. Ablauf simulieren (Serveruhr / OTP-Gültigkeit abgelaufen)
    testServer.expireOtp(testEmail, "sign-in");

    // 3. Abgelaufenen Code absenden
    await page.getByPlaceholder("123456").fill(otp);
    await page.getByRole("button", { name: "Mit Code anmelden" }).click();

    // 4. Deutsche Fehlermeldung für abgelaufenen OTP
    await expect(page.getByText("Authentifizierungsfehler")).toBeVisible();
    await expect(
      page.getByText("Der Bestätigungscode ist abgelaufen. Bitte fordern Sie einen neuen an."),
    ).toBeVisible();
    await expect(page.getByText("Angemeldet als")).not.toBeVisible();
  });

  test("rotiert den Bestätigungscode bei erneutem Anfordern (Resend Behavior)", async ({
    page,
  }) => {
    const testEmail = "resend@barberwalkin.de";
    await page.goto("/sign-in");

    // 1. Ersten Code anfordern
    await page.getByPlaceholder("name@beispiel.de").fill(testEmail);
    await page.getByRole("button", { name: "Code anfordern" }).click();
    await expect(page.getByPlaceholder("123456")).toBeVisible();

    const firstOtp = testServer.getLatestOtp(testEmail, "sign-in")!.otp;
    expect(firstOtp).toMatch(/^\d{6}$/);

    // 2. Code erneut anfordern (Resend)
    await page.getByRole("button", { name: "Code erneut senden" }).click();
    await expect(
      page.getByText(
        "Anfrage verarbeitet. Falls die Zustellung möglich war, erhalten Sie gleich einen Bestätigungscode.",
      ),
    ).toBeVisible();

    const deliveries = testServer.getDeliveredOtps(testEmail);
    expect(deliveries.length).toBe(2);
    const secondOtp = deliveries[1].otp;

    // 3. Der alte Code (firstOtp) ist nicht mehr gültig, falls er rotiert wurde
    if (firstOtp !== secondOtp) {
      await page.getByPlaceholder("123456").fill(firstOtp);
      await page.getByRole("button", { name: "Mit Code anmelden" }).click();
      await expect(
        page.getByText("Ungültiger Bestätigungscode. Bitte überprüfen Sie die Eingabe."),
      ).toBeVisible();
    }

    // 4. Der neue Code (secondOtp) schließt die Anmeldung erfolgreich ab
    await page.getByPlaceholder("123456").fill(secondOtp);
    await page.getByRole("button", { name: "Mit Code anmelden" }).click();
    await expect(page.getByText(`Angemeldet als ${testEmail}`)).toBeVisible();
  });

  test("behandelt Fehler bei der E-Mail-Zustellung (Delivery Failures) mit deutscher Meldung", async ({
    page,
  }) => {
    testServer.setSimulateEmailDeliveryError(true);
    await page.goto("/sign-in");

    await page.getByPlaceholder("name@beispiel.de").fill("failure@barberwalkin.de");
    await page.getByRole("button", { name: "Code anfordern" }).click();

    // Fehlermeldung in deutscher Sprache
    await expect(page.getByText("Authentifizierungsfehler")).toBeVisible();
    await expect(
      page.getByText("E-Mail-Zustellung fehlgeschlagen. Bitte versuchen Sie es später erneut."),
    ).toBeVisible();

    // OTP-Eingabefeld wird bei Zustellungsfehler nicht angezeigt
    await expect(page.getByPlaceholder("123456")).not.toBeVisible();
    await expect(page.getByText("Angemeldet als")).not.toBeVisible();
  });

  test("validiert leere und ungültige E-Mail-Eingaben (Empty & Validation States)", async ({
    page,
  }) => {
    await page.goto("/sign-in");

    // 1. Leere E-Mail-Adresse: Feld-Fehler wird direkt angezeigt
    await page.getByRole("button", { name: "Code anfordern" }).click();
    await expect(
      page.getByText("Bitte geben Sie eine E-Mail-Adresse ein."),
    ).toBeVisible();

    // 2. Ungültiges E-Mail-Format
    await page.getByPlaceholder("name@beispiel.de").fill("ungueltige-email");
    await page.getByRole("button", { name: "Code anfordern" }).click();
    await expect(
      page.getByText("Bitte geben Sie eine gültige E-Mail-Adresse ein."),
    ).toBeVisible();
  });
});

test.describe("Next.js HTTP API Routen für E-Mail OTP", () => {
  test("sendet Verification OTP und authentifiziert Sitzung über HTTP-Routen", async ({
    request,
  }) => {
    const email = "api-test@barberwalkin.de";

    // 1. OTP anfordern
    const sendRes = await request.post("/api/auth/email-otp/send-verification-otp", {
      data: {
        email,
        type: "sign-in",
      },
    });
    expect(sendRes.ok()).toBe(true);
    const sendBody = await sendRes.json();
    expect(sendBody.success).toBe(true);

    // 2. Deterministischen OTP aus Test-Server abrufen
    const otp = testServer.getLatestOtp(email, "sign-in")?.otp;
    expect(otp).toBeDefined();

    // 3. Mit OTP anmelden
    const signInRes = await request.post("/api/auth/sign-in/email-otp", {
      data: {
        email,
        otp,
      },
    });
    expect(signInRes.ok()).toBe(true);
    const signInBody = await signInRes.json();
    expect(signInBody.user).toBeDefined();
    expect(signInBody.user.email).toBe(email);
    expect(signInBody.user.emailVerified).toBe(true);
    expect(signInBody.user.isAnonymous).toBe(false);
    expect(signInBody.token).toBeDefined();

    // 4. Session-Cookie validieren
    const setCookie = signInRes.headers()["set-cookie"] || "";
    expect(setCookie).toContain("better-auth.session_token");
  });

  test("liefert HTTP 400/403 Fehler bei ungültigem oder abgelaufenem Code über API", async ({
    request,
  }) => {
    const email = "api-err@barberwalkin.de";

    await request.post("/api/auth/email-otp/send-verification-otp", {
      data: {
        email,
        type: "sign-in",
      },
    });

    // Falscher OTP
    const wrongRes = await request.post("/api/auth/sign-in/email-otp", {
      data: {
        email,
        otp: "999999",
      },
    });
    expect(wrongRes.status()).toBe(400);
    const wrongBody = await wrongRes.json();
    expect(wrongBody.code).toBe("INVALID_OTP");

    // Abgelaufener OTP
    testServer.expireOtp(email, "sign-in");
    const expRes = await request.post("/api/auth/sign-in/email-otp", {
      data: {
        email,
        otp: testServer.getLatestOtp(email, "sign-in")?.otp || "000000",
      },
    });
    expect(expRes.status()).toBe(400);
    const expBody = await expRes.json();
    expect(expBody.code).toBe("OTP_EXPIRED");
  });
});
