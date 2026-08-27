"use client";

import { useState } from "react";
import {
  Alert,
  Button,
  Container,
  EmptyState,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
  VisuallyHidden,
} from "@mantine/core";
import { isNotEmpty, useForm } from "@mantine/form";
import classes from "./probe.module.css";

export function MantineIntegration() {
  const [submittedShop, setSubmittedShop] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const form = useForm({
    mode: "uncontrolled",
    initialValues: { shopName: "" },
    validate: {
      shopName: isNotEmpty("Shopname ist erforderlich"),
    },
  });

  return (
    <main className={classes.page}>
      <Container size="sm" py={{ base: 48, sm: 80 }}>
        <Stack gap="xl">
          <Stack gap={6}>
            <Text c="dimmed" fw={600} size="sm">
              BarberWalkin
            </Text>
            <Title order={1} size="h2">
              Shop einrichten
            </Title>
          </Stack>

          <Paper
            className={classes.surface}
            data-testid="theme-surface"
            radius={0}
          >
            <Stack gap="lg">
              {!submittedShop && (
                <EmptyState align="left">
                  <EmptyState.Title order={2}>
                    Noch kein Shop eingerichtet
                  </EmptyState.Title>
                  <EmptyState.Description>
                    Lege den ersten Shop an, um loszulegen.
                  </EmptyState.Description>
                </EmptyState>
              )}

              {submittedShop && (
                <Alert role="alert" color="green" variant="light">
                  {submittedShop} ist bereit.
                </Alert>
              )}

              <form
                onSubmit={form.onSubmit(
                  async ({ shopName }) => {
                    setSubmitting(true);
                    await new Promise((resolve) => setTimeout(resolve, 250));
                    setSubmittedShop(shopName.trim());
                    setSubmitting(false);
                  },
                  (errors) => {
                    const firstError = Object.keys(errors)[0];
                    form.getInputNode(firstError)?.focus();
                  },
                )}
              >
                <Stack gap="md">
                  <TextInput
                    key={form.key("shopName")}
                    label="Shopname"
                    placeholder="Kamm & Klinge"
                    withAsterisk
                    aria-required="true"
                    {...form.getInputProps("shopName")}
                  />
                  <Group justify="flex-end">
                    <Button type="submit" loading={submitting}>
                      {submitting ? "Shop wird angelegt" : "Shop anlegen"}
                    </Button>
                    {submitting && (
                      <VisuallyHidden
                        role="status"
                        aria-label="Shop wird angelegt"
                      >
                        Shop wird angelegt
                      </VisuallyHidden>
                    )}
                  </Group>
                </Stack>
              </form>
            </Stack>
          </Paper>
        </Stack>
      </Container>
    </main>
  );
}
