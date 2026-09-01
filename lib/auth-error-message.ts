const FALLBACK = "Anmeldung fehlgeschlagen. Bitte versuchen Sie es erneut.";

export function translateAuthError(err: unknown, fallback = FALLBACK): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const code = "code" in err ? String(err.code) : "";
    const msg = "message" in err ? String(err.message) : "";

    if (code === "OTP_EXPIRED" || msg.includes("OTP_EXPIRED") || msg.includes("abgelaufen")) {
      return "Der Bestätigungscode ist abgelaufen. Bitte fordern Sie einen neuen an.";
    }
    if (code === "INVALID_OTP" || msg.includes("INVALID_OTP") || msg.includes("Ungültiger")) {
      return "Ungültiger Bestätigungscode. Bitte überprüfen Sie die Eingabe.";
    }
    if (
      code === "TOO_MANY_ATTEMPTS" ||
      msg.includes("TOO_MANY_ATTEMPTS") ||
      msg.includes("Fehlversuche")
    ) {
      return "Zu viele Fehlversuche. Bitte fordern Sie einen neuen Code an.";
    }
    if (
      code === "EMAIL_DELIVERY_FAILED" ||
      msg.includes("EMAIL_DELIVERY_FAILED") ||
      msg.includes("Zustellung fehlgeschlagen")
    ) {
      return "E-Mail-Zustellung fehlgeschlagen. Bitte versuchen Sie es später erneut.";
    }
    if (code === "INVALID_EMAIL" || msg.includes("INVALID_EMAIL") || msg.includes("gültige E-Mail")) {
      return "Bitte geben Sie eine gültige E-Mail-Adresse ein.";
    }
  }
  return fallback;
}
