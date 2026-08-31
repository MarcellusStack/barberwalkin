"use client";

import { useState, useSyncExternalStore } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";

const emptySubscribe = () => () => {};

export function AuthProbe() {
  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const currentUser = useQuery(api.auth.getCurrentUser);
  const serverStatus = useQuery(api.probe.getServerStatus);
  const session = authClient.useSession();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [localUser, setLocalUser] = useState<{
    name?: string | null;
    email?: string | null;
    isAnonymous?: boolean | null;
  } | null>(null);
  const [loggedOut, setLoggedOut] = useState(false);

  // Email OTP state
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);

  const translateAuthError = (err: unknown, fallback: string): string => {
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
      if (code === "TOO_MANY_ATTEMPTS" || msg.includes("TOO_MANY_ATTEMPTS") || msg.includes("Fehlversuche")) {
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
      if (msg) return msg;
    }
    return fallback;
  };

  const handleAnonymousSignIn = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setLoggedOut(false);
    try {
      const res = await authClient.signIn.anonymous();
      if (res.error) {
        setErrorMessage(res.error.message || "Anonyme Anmeldung fehlgeschlagen.");
      } else {
        const raw = res?.data as { user?: { name?: string | null; email?: string | null; isAnonymous?: boolean | null }; data?: { user?: { name?: string | null; email?: string | null; isAnonymous?: boolean | null } }; name?: string; email?: string; isAnonymous?: boolean } | null;
        const user = raw?.user || raw?.data?.user || (raw?.email || raw?.name || raw?.isAnonymous !== undefined ? raw : null);
        if (user) {
          setLocalUser(user);
          try {
            localStorage.setItem("bw_auth_user", JSON.stringify(user));
          } catch {}
        }
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Unerwarteter Fehler bei der anonymen Anmeldung.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendOtp = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage("Bitte geben Sie eine E-Mail-Adresse ein.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setErrorMessage("Bitte geben Sie eine gültige E-Mail-Adresse ein.");
      return;
    }

    setIsSendingOtp(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await authClient.emailOtp.sendVerificationOtp({
        email: trimmedEmail,
        type: "sign-in",
      });

      if (res.error) {
        setErrorMessage(
          translateAuthError(res.error, "Bestätigungscode konnte nicht gesendet werden."),
        );
      } else {
        setIsOtpSent(true);
        setSuccessMessage("Bestätigungscode wurde an Ihre E-Mail-Adresse gesendet.");
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? translateAuthError(err, err.message)
          : "Fehler beim Senden des Bestätigungscodes.",
      );
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtpAndSignIn = async () => {
    const trimmedEmail = email.trim();
    const trimmedOtp = otp.trim();

    if (!trimmedEmail) {
      setErrorMessage("Bitte geben Sie eine E-Mail-Adresse ein.");
      return;
    }
    if (!trimmedOtp) {
      setErrorMessage("Bitte geben Sie den Bestätigungscode ein.");
      return;
    }

    setIsVerifyingOtp(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setLoggedOut(false);

    try {
      const res = await authClient.signIn.emailOtp({
        email: trimmedEmail,
        otp: trimmedOtp,
      });

      if (res.error) {
        setErrorMessage(
          translateAuthError(res.error, "Anmeldung mit Bestätigungscode fehlgeschlagen."),
        );
      } else {
        const raw = res?.data as { user?: { name?: string | null; email?: string | null; isAnonymous?: boolean | null }; data?: { user?: { name?: string | null; email?: string | null; isAnonymous?: boolean | null } }; name?: string; email?: string; isAnonymous?: boolean } | null;
        const user = raw?.user || raw?.data?.user || (raw?.email || raw?.name || raw?.isAnonymous !== undefined ? raw : null);
        if (user) {
          setLocalUser(user);
          try {
            localStorage.setItem("bw_auth_user", JSON.stringify(user));
          } catch {}
        }
        setSuccessMessage("Erfolgreich angemeldet!");
        setOtp("");
        setIsOtpSent(false);
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? translateAuthError(err, err.message)
          : "Fehler bei der Überprüfung des Bestätigungscodes.",
      );
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleSignOut = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const res = await authClient.signOut();
      if (
        res?.error &&
        (res.error.code === "SIGN_OUT_FAILED" ||
          res.error.message?.includes("Abmeldung fehlgeschlagen"))
      ) {
        setErrorMessage(res.error.message || "Abmeldung fehlgeschlagen.");
      } else {
        setLoggedOut(true);
        setLocalUser(null);
        try {
          localStorage.removeItem("bw_auth_user");
        } catch {}
        setEmail("");
        setOtp("");
        setIsOtpSent(false);
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Unerwarteter Fehler bei der Abmeldung.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const storedUser = isClient
    ? (() => {
        try {
          const stored = localStorage.getItem("bw_auth_user");
          return stored ? JSON.parse(stored) : null;
        } catch {
          return null;
        }
      })()
    : null;

  const sessionUser = session.data?.user;
  const activeUser = loggedOut
    ? null
    : currentUser ||
      localUser ||
      storedUser ||
      (sessionUser
        ? {
            name: sessionUser.name,
            email: sessionUser.email,
            isAnonymous: Boolean(sessionUser.isAnonymous),
          }
        : null);

  const isAnonymous = Boolean(
    activeUser?.isAnonymous ||
      activeUser?.email?.includes("@anonymous.placeholder.invalid") ||
      activeUser?.name === "Anonymer Benutzer",
  );
  const isAuthed = Boolean(activeUser);

  return (
    <Card withBorder padding="md" radius="sm">
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={600} size="sm">
            Authentifizierung & Backend-Status
          </Text>
          <Badge
            color={serverStatus ? "green" : "gray"}
            variant="light"
            size="sm"
          >
            {serverStatus ? "Verbunden" : "Verbinde..."}
          </Badge>
        </Group>

        {errorMessage && (
          <Alert
            color="red"
            title="Authentifizierungsfehler"
            variant="light"
            withCloseButton
            onClose={() => setErrorMessage(null)}
          >
            {errorMessage}
          </Alert>
        )}

        {successMessage && (
          <Alert
            color="green"
            title="Erfolg"
            variant="light"
            withCloseButton
            onClose={() => setSuccessMessage(null)}
          >
            {successMessage}
          </Alert>
        )}

        <Group justify="space-between" align="center">
          <Stack gap={2}>
            <Text c="dimmed" size="xs">
              Sitzungsstatus
            </Text>
            <Group gap="xs" align="center">
              <Text size="xs" fw={500}>
                {currentUser === undefined && !sessionUser && !localUser && !storedUser
                  ? "Wird geladen..."
                  : activeUser
                    ? isAnonymous
                      ? "Anonym angemeldet"
                      : `Angemeldet als ${activeUser.email || activeUser.name || "Kunde"}`
                    : "Nicht angemeldet"}
              </Text>
              {activeUser && isAnonymous && (
                <Badge color="blue" variant="light" size="xs">
                  Anonym
                </Badge>
              )}
              {activeUser && !isAnonymous && (
                <Badge color="teal" variant="light" size="xs">
                  Verifiziert
                </Badge>
              )}
            </Group>
          </Stack>

          {isAuthed && (
            <Button
              size="xs"
              variant="default"
              onClick={handleSignOut}
              loading={isSubmitting}
            >
              Abmelden
            </Button>
          )}
        </Group>

        {!isAuthed && (
          <>
            <Divider my="xs" label="Anmeldung mit E-Mail OTP" labelPosition="center" />

            <Stack gap="xs">
              <TextInput
                label="E-Mail-Adresse"
                placeholder="name@beispiel.de"
                size="xs"
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
                disabled={isSendingOtp || isVerifyingOtp}
              />

              {isOtpSent && (
                <TextInput
                  label="Bestätigungscode"
                  placeholder="123456"
                  size="xs"
                  value={otp}
                  onChange={(e) => setOtp(e.currentTarget.value)}
                  disabled={isVerifyingOtp}
                />
              )}

              <Group gap="xs" justify="flex-end">
                {isOtpSent ? (
                  <>
                    <Button
                      size="xs"
                      variant="subtle"
                      onClick={handleSendOtp}
                      loading={isSendingOtp}
                      disabled={isVerifyingOtp}
                    >
                      Code erneut senden
                    </Button>
                    <Button
                      size="xs"
                      variant="filled"
                      onClick={handleVerifyOtpAndSignIn}
                      loading={isVerifyingOtp}
                    >
                      Mit Code anmelden
                    </Button>
                  </>
                ) : (
                  <Button
                    size="xs"
                    variant="filled"
                    onClick={handleSendOtp}
                    loading={isSendingOtp}
                  >
                    Code anfordern
                  </Button>
                )}
              </Group>
            </Stack>

            <Divider my="xs" label="oder" labelPosition="center" />

            <Button
              size="xs"
              variant="default"
              fullWidth
              onClick={handleAnonymousSignIn}
              loading={isSubmitting}
            >
              Anonym anmelden
            </Button>
          </>
        )}
      </Stack>
    </Card>
  );
}
