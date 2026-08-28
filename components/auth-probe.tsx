"use client";

import { useState } from "react";
import { Alert, Badge, Button, Card, Group, Stack, Text } from "@mantine/core";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";

export function AuthProbe() {
  const currentUser = useQuery(api.auth.getCurrentUser);
  const serverStatus = useQuery(api.probe.getServerStatus);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleAnonymousSignIn = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await authClient.signIn.anonymous();
      if (res.error) {
        setErrorMessage(res.error.message || "Anmeldung fehlgeschlagen.");
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

  const handleSignOut = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await authClient.signOut();
      if (res.error) {
        setErrorMessage(res.error.message || "Abmeldung fehlgeschlagen.");
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

  const isAnonymous = Boolean(currentUser?.isAnonymous);

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

        <Group justify="space-between" align="center">
          <Stack gap={2}>
            <Text c="dimmed" size="xs">
              Sitzungsstatus
            </Text>
            <Group gap="xs" align="center">
              <Text size="xs" fw={500}>
                {currentUser === undefined
                  ? "Wird geladen..."
                  : currentUser
                    ? isAnonymous
                      ? "Anonym angemeldet"
                      : `Angemeldet als ${currentUser.name || currentUser.email || "Kunde"}`
                    : "Nicht angemeldet"}
              </Text>
              {currentUser && isAnonymous && (
                <Badge color="blue" variant="light" size="xs">
                  Anonym
                </Badge>
              )}
            </Group>
          </Stack>

          {currentUser ? (
            <Button
              size="xs"
              variant="default"
              onClick={handleSignOut}
              loading={isSubmitting}
            >
              Abmelden
            </Button>
          ) : (
            <Button
              size="xs"
              variant="filled"
              onClick={handleAnonymousSignIn}
              loading={isSubmitting}
            >
              Anonym anmelden
            </Button>
          )}
        </Group>
      </Stack>
    </Card>
  );
}

