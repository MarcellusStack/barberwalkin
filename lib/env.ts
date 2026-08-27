/**
 * Umgebungsvariablen-Validierung für BarberWalkin
 */

export interface ConvexEnvValidation {
  isValid: boolean;
  url: string | null;
  error: string | null;
}

/**
 * Validiert eine übergebene Convex-URL.
 */
export function validateConvexUrl(url: unknown): ConvexEnvValidation {
  if (typeof url !== "string" || !url.trim()) {
    return {
      isValid: false,
      url: null,
      error: "NEXT_PUBLIC_CONVEX_URL ist nicht konfiguriert.",
    };
  }

  const trimmedUrl = url.trim();

  if (
    !trimmedUrl.startsWith("http://") &&
    !trimmedUrl.startsWith("https://")
  ) {
    return {
      isValid: false,
      url: null,
      error:
        "NEXT_PUBLIC_CONVEX_URL muss mit 'http://' oder 'https://' beginnen.",
    };
  }

  try {
    const parsed = new URL(trimmedUrl);
    if (!parsed.hostname) {
      return {
        isValid: false,
        url: null,
        error: "NEXT_PUBLIC_CONVEX_URL enthält keinen gültigen Hostnamen.",
      };
    }
  } catch {
    return {
      isValid: false,
      url: null,
      error: "NEXT_PUBLIC_CONVEX_URL ist keine gültige URL.",
    };
  }

  return {
    isValid: true,
    url: trimmedUrl,
    error: null,
  };
}

/**
 * Liefert die konfigurierte Convex-URL oder null, wenn nicht konfiguriert.
 */
export function getPublicConvexUrl(): string | null {
  return process.env.NEXT_PUBLIC_CONVEX_URL?.trim() || null;
}

/**
 * Liefert die validierte Convex-URL oder wirft einen Fehler mit deutscher Fehlermeldung.
 */
export function requirePublicConvexUrl(): string {
  const rawUrl = getPublicConvexUrl();
  const validation = validateConvexUrl(rawUrl);

  if (!validation.isValid || !validation.url) {
    throw new Error(
      validation.error ?? "NEXT_PUBLIC_CONVEX_URL ist ungültig.",
    );
  }

  return validation.url;
}

/**
 * Prüft, ob Convex im aktuellen Kontext korrekt konfiguriert ist.
 */
export function isConvexConfigured(): boolean {
  const rawUrl = getPublicConvexUrl();
  return validateConvexUrl(rawUrl).isValid;
}
