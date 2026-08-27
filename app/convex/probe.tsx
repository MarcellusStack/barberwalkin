"use client";

import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Container,
  EmptyState,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
  VisuallyHidden,
} from "@mantine/core";
import { isNotEmpty, useForm } from "@mantine/form";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useConvexStatus } from "../convex-client-provider";
import classes from "./probe.module.css";

export interface ServerStatusData {
  status: string;
  serverTimeUtc: number;
  message: string;
}

interface ConvexProbeProps {
  initialServerStatus?: ServerStatusData | null;
}

export function ConvexProbe({ initialServerStatus }: ConvexProbeProps) {
  const convexStatus = useConvexStatus();

  return (
    <main className={classes.page}>
      <Container size="sm" py={{ base: 48, sm: 80 }}>
        <Stack gap="xl">
          <Stack gap={6}>
            <Text c="dimmed" fw={600} size="sm">
              BarberWalkin
            </Text>
            <Title order={1} size="h2">
              Convex-Integrationstest
            </Title>
          </Stack>

          {/* Server-Abfrageanzeige */}
          <Paper className={classes.surface} data-testid="server-query-section" radius={0}>
            <Stack gap="sm">
              <Group justify="space-between" align="center">
                <Text fw={600} size="sm">
                  Server-Statusabfrage
                </Text>
                {initialServerStatus ? (
                  <Badge color="green" variant="light">
                    Serverabfrage erfolgreich
                  </Badge>
                ) : (
                  <Badge color="yellow" variant="light">
                    Keine Serverdaten
                  </Badge>
                )}
              </Group>
              {initialServerStatus ? (
                <Stack gap={4}>
                  <Text size="sm" data-testid="server-status-message">
                    {initialServerStatus.message}
                  </Text>
                  <Text size="xs" c="dimmed" data-testid="server-time">
                    Serverzeit (UTC): {new Date(initialServerStatus.serverTimeUtc).toISOString()}
                  </Text>
                </Stack>
              ) : (
                <Text size="sm" c="dimmed">
                  Keine direkte Serverabfrage verfügbar.
                </Text>
              )}
            </Stack>
          </Paper>

          {/* Reaktive Client-Sonde */}
          <Paper className={classes.surface} data-testid="reactive-client-section" radius={0}>
            {!convexStatus.isConfigured ? (
              <Alert role="alert" color="red" title="Umgebungsfehler" variant="light">
                {convexStatus.error ?? "NEXT_PUBLIC_CONVEX_URL ist nicht konfiguriert oder ungültig."}
              </Alert>
            ) : (
              <ConvexReactiveContent />
            )}
          </Paper>
        </Stack>
      </Container>
    </main>
  );
}

function ConvexReactiveContent() {
  const probeData = useQuery(api.probe.getProbeStatus, {
    name: "integration-probe",
  });
  const setProbeMutation = useMutation(api.probe.setProbeStatus);
  const clearProbeMutation = useMutation(api.probe.clearProbe);

  const [submitting, setSubmitting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const form = useForm({
    mode: "uncontrolled",
    initialValues: {
      status: "",
      message: "",
    },
    validate: {
      status: isNotEmpty("Status ist erforderlich"),
    },
  });

  const handleUpdate = async (values: { status: string; message: string }) => {
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await setProbeMutation({
        name: "integration-probe",
        status: values.status.trim(),
        message: values.message.trim() || undefined,
      });
      form.reset();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Fehler beim Aktualisieren des Zustands.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleClear = async () => {
    setClearing(true);
    setErrorMessage(null);
    try {
      await clearProbeMutation({ name: "integration-probe" });
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Fehler beim Zurücksetzen des Zustands.",
      );
    } finally {
      setClearing(false);
    }
  };

  const handleTriggerValidationError = () => {
    setErrorMessage("Validierungsfehler: Der eingegebene Status entspricht nicht den Anforderungen.");
  };

  // 1. Ladezustand
  if (probeData === undefined) {
    return (
      <Stack align="center" justify="center" py="xl" gap="md" data-testid="loading-state">
        <Loader size="md" color="dark" />
        <Text size="sm" c="dimmed">
          Convex-Zustand wird geladen...
        </Text>
        <VisuallyHidden role="status" aria-label="Convex-Zustand wird geladen">
          Convex-Zustand wird geladen
        </VisuallyHidden>
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Title order={2} size="h3">
          Reaktive Sonde
        </Title>
        <Badge color="blue" variant="light">
          Verbunden mit Convex
        </Badge>
      </Group>

      {/* Fehlerzustand */}
      {errorMessage && (
        <Alert
          role="alert"
          color="red"
          title="Fehler aufgetreten"
          variant="light"
          withCloseButton
          onClose={() => setErrorMessage(null)}
          data-testid="error-alert"
        >
          {errorMessage}
        </Alert>
      )}

      {/* 2. Leerer Zustand */}
      {probeData === null && (
        <EmptyState align="left" data-testid="empty-state">
          <EmptyState.Title order={3}>Kein Probe-Zustand vorhanden</EmptyState.Title>
          <EmptyState.Description>
            Aktualisiere den Status unten, um eine reaktive Datenbankänderung in Echtzeit zu beobachten.
          </EmptyState.Description>
        </EmptyState>
      )}

      {/* 3. Positiver / Reaktiv aktualisierter Zustand */}
      {probeData !== null && (
        <Card withBorder padding="md" radius="sm" data-testid="positive-state">
          <Stack gap="xs">
            <Group justify="space-between">
              <Text fw={600} size="sm">
                Aktueller Zustand:
              </Text>
              <Badge color="green" data-testid="probe-status-badge">
                {probeData.status}
              </Badge>
            </Group>
            {probeData.message && (
              <Text size="sm" data-testid="probe-message">
                Hinweis: {probeData.message}
              </Text>
            )}
            <Text size="xs" c="dimmed" data-testid="probe-updated-at">
              Zuletzt aktualisiert: {new Date(probeData.updatedAt).toLocaleTimeString("de-DE")}
            </Text>
          </Stack>
        </Card>
      )}

      {/* Formular für Zustandsmutationen */}
      <form
        onSubmit={form.onSubmit(handleUpdate, (errors) => {
          const firstError = Object.keys(errors)[0];
          form.getInputNode(firstError)?.focus();
        })}
      >
        <Stack gap="md">
          <TextInput
            key={form.key("status")}
            label="Status"
            placeholder="z. B. Shop-Betrieb aktiv"
            withAsterisk
            aria-required="true"
            {...form.getInputProps("status")}
          />

          <TextInput
            key={form.key("message")}
            label="Optionale Nachricht"
            placeholder="z. B. Warteschlange geöffnet"
            {...form.getInputProps("message")}
          />

          <Group justify="space-between" mt="sm">
            <Button
              type="button"
              variant="subtle"
              color="red"
              onClick={handleTriggerValidationError}
              data-testid="trigger-error-button"
            >
              Fehler simulieren
            </Button>

            <Group gap="xs">
              {probeData !== null && (
                <Button
                  type="button"
                  variant="outline"
                  color="gray"
                  onClick={handleClear}
                  loading={clearing}
                  data-testid="clear-probe-button"
                >
                  {clearing ? "Wird zurückgesetzt..." : "Zustand leeren"}
                </Button>
              )}

              <Button type="submit" loading={submitting} data-testid="submit-probe-button">
                {submitting ? "Wird aktualisiert..." : "Zustand aktualisieren"}
              </Button>
            </Group>
          </Group>
        </Stack>
      </form>
    </Stack>
  );
}
