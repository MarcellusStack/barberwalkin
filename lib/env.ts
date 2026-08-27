/**
 * Umgebungsvariablen-Validierung für BarberWalkin
 */

export interface EnvValidation {
  isValid: boolean;
  value: string | null;
  error: string | null;
}

export type ConvexEnvValidation = {
  isValid: boolean;
  url: string | null;
  error: string | null;
};

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
 * Validiert eine übergebene Convex-Site-URL (für Better Auth HTTP Endpoints).
 */
export function validateConvexSiteUrl(url: unknown): ConvexEnvValidation {
  if (typeof url !== "string" || !url.trim()) {
    return {
      isValid: false,
      url: null,
      error: "NEXT_PUBLIC_CONVEX_SITE_URL ist nicht konfiguriert.",
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
        "NEXT_PUBLIC_CONVEX_SITE_URL muss mit 'http://' oder 'https://' beginnen.",
    };
  }

  if (trimmedUrl.endsWith(".convex.cloud")) {
    return {
      isValid: false,
      url: null,
      error:
        "NEXT_PUBLIC_CONVEX_SITE_URL darf nicht auf '.convex.cloud' enden (muss die .convex.site-URL sein).",
    };
  }

  try {
    const parsed = new URL(trimmedUrl);
    if (!parsed.hostname) {
      return {
        isValid: false,
        url: null,
        error:
          "NEXT_PUBLIC_CONVEX_SITE_URL enthält keinen gültigen Hostnamen.",
      };
    }
  } catch {
    return {
      isValid: false,
      url: null,
      error: "NEXT_PUBLIC_CONVEX_SITE_URL ist keine gültige URL.",
    };
  }

  return {
    isValid: true,
    url: trimmedUrl,
    error: null,
  };
}

/**
 * Validiert eine übergebene Site-URL.
 */
export function validateSiteUrl(url: unknown): ConvexEnvValidation {
  if (typeof url !== "string" || !url.trim()) {
    return {
      isValid: false,
      url: null,
      error: "NEXT_PUBLIC_SITE_URL ist nicht konfiguriert.",
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
        "NEXT_PUBLIC_SITE_URL muss mit 'http://' oder 'https://' beginnen.",
    };
  }

  try {
    const parsed = new URL(trimmedUrl);
    if (!parsed.hostname) {
      return {
        isValid: false,
        url: null,
        error: "NEXT_PUBLIC_SITE_URL enthält keinen gültigen Hostnamen.",
      };
    }
  } catch {
    return {
      isValid: false,
      url: null,
      error: "NEXT_PUBLIC_SITE_URL ist keine gültige URL.",
    };
  }

  return {
    isValid: true,
    url: trimmedUrl,
    error: null,
  };
}

/**
 * Validiert das Better-Auth-Secret.
 */
export function validateBetterAuthSecret(secret: unknown): EnvValidation {
  if (typeof secret !== "string" || !secret.trim()) {
    return {
      isValid: false,
      value: null,
      error: "BETTER_AUTH_SECRET ist nicht konfiguriert.",
    };
  }

  const trimmed = secret.trim();
  if (trimmed.length < 16) {
    return {
      isValid: false,
      value: null,
      error: "BETTER_AUTH_SECRET muss mindestens 16 Zeichen lang sein.",
    };
  }

  return {
    isValid: true,
    value: trimmed,
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
 * Liefert die konfigurierte Convex-Site-URL oder null.
 */
export function getPublicConvexSiteUrl(): string | null {
  return (
    process.env.NEXT_PUBLIC_CONVEX_SITE_URL?.trim() ||
    process.env.CONVEX_SITE_URL?.trim() ||
    null
  );
}

/**
 * Liefert die validierte Convex-Site-URL oder wirft einen Fehler mit deutscher Fehlermeldung.
 */
export function requirePublicConvexSiteUrl(): string {
  const rawUrl = getPublicConvexSiteUrl();
  const validation = validateConvexSiteUrl(rawUrl);

  if (!validation.isValid || !validation.url) {
    throw new Error(
      validation.error ?? "NEXT_PUBLIC_CONVEX_SITE_URL ist ungültig.",
    );
  }

  return validation.url;
}

/**
 * Liefert das Better Auth Secret oder null.
 */
export function getBetterAuthSecret(): string | null {
  return process.env.BETTER_AUTH_SECRET?.trim() || null;
}

/**
 * Liefert das validierte Better Auth Secret oder wirft einen Fehler mit deutscher Fehlermeldung.
 */
export function requireBetterAuthSecret(): string {
  const rawSecret = getBetterAuthSecret();
  const validation = validateBetterAuthSecret(rawSecret);

  if (!validation.isValid || !validation.value) {
    throw new Error(
      validation.error ?? "BETTER_AUTH_SECRET ist ungültig.",
    );
  }

  return validation.value;
}

/**
 * Prüft, ob Convex im aktuellen Kontext korrekt konfiguriert ist.
 */
export function isConvexConfigured(): boolean {
  const rawUrl = getPublicConvexUrl();
  return validateConvexUrl(rawUrl).isValid;
}

/**
 * Prüft, ob Better Auth im aktuellen Kontext konfiguriert ist.
 */
export function isBetterAuthConfigured(): boolean {
  const siteUrl = getPublicConvexSiteUrl();
  return validateConvexSiteUrl(siteUrl).isValid;
}
