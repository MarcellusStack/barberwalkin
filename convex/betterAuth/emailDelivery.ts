/**
 * E-Mail-Zustellung und Vorlagen für Better Auth Email OTP
 * Unterstützt Resend REST API sowie deterministische Testzustellung.
 */

export type EmailOtpType =
  | "sign-in"
  | "email-verification"
  | "forget-password"
  | "change-email";

export interface SendEmailOtpOptions {
  email: string;
  otp: string;
  type: EmailOtpType;
  sender?: string;
}

export interface EmailDeliveryResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

/**
 * Liefert deutsche E-Mail-Betreffzeilen und Vorlagen für den jeweiligen OTP-Typ.
 */
export function getEmailOtpContent(
  type: EmailOtpType,
  otp: string,
): EmailContent {
  switch (type) {
    case "sign-in":
      return {
        subject: "Ihr Anmeldecode für BarberWalkin",
        text: `Ihr Bestätigungscode für BarberWalkin lautet: ${otp}\n\nDieser Code ist 5 Minuten lang gültig. Geben Sie diesen Code niemals an Dritte weiter.`,
        html: `<p>Ihr Bestätigungscode für <strong>BarberWalkin</strong> lautet:</p><p style="font-size: 24px; font-weight: bold; letter-spacing: 4px; font-family: monospace;">${otp}</p><p>Dieser Code ist 5 Minuten lang gültig. Geben Sie diesen Code niemals an Dritte weiter.</p>`,
      };
    case "email-verification":
      return {
        subject: "Bestätigen Sie Ihre E-Mail-Adresse – BarberWalkin",
        text: `Ihr Verifizierungscode für BarberWalkin lautet: ${otp}\n\nDieser Code ist 5 Minuten lang gültig.`,
        html: `<p>Ihr Verifizierungscode für <strong>BarberWalkin</strong> lautet:</p><p style="font-size: 24px; font-weight: bold; letter-spacing: 4px; font-family: monospace;">${otp}</p><p>Dieser Code ist 5 Minuten lang gültig.</p>`,
      };
    case "change-email":
      return {
        subject: "E-Mail-Adresse ändern – BarberWalkin",
        text: `Ihr Bestätigungscode zur Änderung Ihrer E-Mail-Adresse bei BarberWalkin lautet: ${otp}\n\nDieser Code ist 5 Minuten lang gültig.`,
        html: `<p>Ihr Bestätigungscode zur Änderung Ihrer E-Mail-Adresse bei <strong>BarberWalkin</strong> lautet:</p><p style="font-size: 24px; font-weight: bold; letter-spacing: 4px; font-family: monospace;">${otp}</p><p>Dieser Code ist 5 Minuten lang gültig.</p>`,
      };
    case "forget-password":
      return {
        subject: "Passwort zurücksetzen – BarberWalkin",
        text: `Ihr Bestätigungscode zum Zurücksetzen Ihres Passworts bei BarberWalkin lautet: ${otp}\n\nDieser Code ist 5 Minuten lang gültig.`,
        html: `<p>Ihr Bestätigungscode zum Zurücksetzen Ihres Passworts lautet:</p><p style="font-size: 24px; font-weight: bold; letter-spacing: 4px; font-family: monospace;">${otp}</p><p>Dieser Code ist 5 Minuten lang gültig.</p>`,
      };
    default:
      return {
        subject: "Ihr Bestätigungscode für BarberWalkin",
        text: `Ihr Bestätigungscode für BarberWalkin lautet: ${otp}`,
        html: `<p>Ihr Bestätigungscode lautet: <strong>${otp}</strong></p>`,
      };
  }
}

export interface DeliveredOtpRecord {
  email: string;
  otp: string;
  type: EmailOtpType;
  timestamp: number;
}

// In-Memory-Speicher für deterministische Testzustellung
const testDeliveryStore: DeliveredOtpRecord[] = [];

/**
 * Registriert eine zugestellte OTP für Testprüfungen.
 */
export function recordTestDelivery(record: DeliveredOtpRecord): void {
  testDeliveryStore.push(record);
}

/**
 * Ruft die zuletzt zugestellte OTP für eine E-Mail-Adresse ab.
 */
export function getLatestTestOtp(
  email?: string,
  type?: EmailOtpType,
): DeliveredOtpRecord | null {
  const filtered = testDeliveryStore.filter((r) => {
    if (email && r.email.toLowerCase() !== email.toLowerCase()) return false;
    if (type && r.type !== type) return false;
    return true;
  });
  return filtered.length > 0 ? filtered[filtered.length - 1] : null;
}

/**
 * Leert den Speicher zugestellter Test-OTPs.
 */
export function clearTestDeliveries(): void {
  testDeliveryStore.length = 0;
}

/**
 * Führt die E-Mail-Zustellung über Resend oder deterministische Testzustellung aus.
 */
export async function deliverEmailOtp(
  options: SendEmailOtpOptions,
): Promise<EmailDeliveryResult> {
  const { email, otp, type } = options;

  // 1. Simulierte Zustellungsfehler in Tests
  if (process.env.EMAIL_DELIVERY_FAIL === "true") {
    throw new Error(
      "E-Mail-Zustellung fehlgeschlagen. Bitte versuchen Sie es später erneut.",
    );
  }

  const content = getEmailOtpContent(type, otp);
  const now = Date.now();

  // 2. Immer im Test-Speicher aufzeichnen
  recordTestDelivery({
    email,
    otp,
    type,
    timestamp: now,
  });

  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail =
    options.sender?.trim() ||
    process.env.EMAIL_FROM?.trim() ||
    "BarberWalkin <onboarding@resend.dev>";

  // 3. Wenn kein API-Key konfiguriert ist oder im Test-Modus: lokale Simulation
  if (!resendApiKey || process.env.NODE_ENV === "test") {
    if (
      process.env.NODE_ENV === "development" &&
      process.env.DEBUG_AUTH_EMAIL === "true"
    ) {
      console.info(
        `[EmailOTP:Local] (${type}) ${content.subject} -> ${email} [Code: ${otp}]`,
      );
    }

    return {
      success: true,
      messageId: `local_${now}_${Math.random().toString(36).substring(2, 9)}`,
    };
  }

  // 4. Echte Resend REST API Zustellung
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [email],
        subject: content.subject,
        html: content.html,
        text: content.text,
      }),
    });

    if (!res.ok) {
      const errorJson = (await res.json().catch(() => ({}))) as {
        message?: string;
      };
      const message =
        errorJson.message || `HTTP ${res.status} ${res.statusText}`;
      console.error(
        `[EmailOTP:ResendError] Zustellung an ${email} fehlgeschlagen:`,
        message,
      );
      throw new Error(`E-Mail-Zustellung fehlgeschlagen: ${message}`);
    }

    const data = (await res.json()) as { id: string };
    return {
      success: true,
      messageId: data.id,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("E-Mail-Zustellung")
    ) {
      throw error;
    }
    console.error("[EmailOTP:NetworkError] Resend API nicht erreichbar:", error);
    throw new Error(
      "E-Mail-Zustellung fehlgeschlagen. Bitte versuchen Sie es später erneut.",
    );
  }
}
