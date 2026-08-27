"use client";

import { Badge, Card, Group, Stack, Text } from "@mantine/core";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export function AuthProbe({ hasServerSession }: { hasServerSession: boolean }) {
  const currentUser = useQuery(api.auth.getCurrentUser);
  const serverStatus = useQuery(api.probe.getServerStatus);

  return (
    <Card withBorder padding="md" radius="sm">
      <Stack gap="xs">
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

        <Group justify="space-between">
          <Text c="dimmed" size="xs">
            Sitzungsstatus
          </Text>
          <Text size="xs" fw={500}>
            {currentUser === undefined
              ? "Wird geladen..."
              : currentUser
                ? `Angemeldet als ${currentUser.name || currentUser.email || "Benutzer"}`
                : hasServerSession
                  ? "Sitzung aktiv"
                  : "Nicht angemeldet"}
          </Text>
        </Group>
      </Stack>
    </Card>
  );
}
