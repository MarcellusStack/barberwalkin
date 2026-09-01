"use client";

import Link from "next/link";
import {
  Alert,
  Button,
  Card,
  Divider,
  Group,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { schemaResolver, useForm } from "@mantine/form";
import { z } from "zod/v4";
import { authClient } from "@/lib/auth-client";
import { translateAuthError } from "@/lib/auth-error-message";
import { MotionReveal } from "@/components/motion-reveal";

const signInSchema = z
  .object({
    email: z
      .string()
      .trim()
      .min(1, { error: "Bitte geben Sie eine E-Mail-Adresse ein." })
      .pipe(z.email({ error: "Bitte geben Sie eine gültige E-Mail-Adresse ein." })),
    otp: z.string(),
    otpSent: z.boolean(),
    errorMessage: z.string().nullable(),
    successMessage: z.string().nullable(),
    signedInAs: z.string().nullable(),
  })
  .superRefine(({ otp, otpSent }, context) => {
    if (otpSent && !otp.trim()) {
      context.addIssue({
        code: "custom",
        path: ["otp"],
        message: "Bitte geben Sie den Bestätigungscode ein.",
      });
    }
  });

type SignInValues = z.infer<typeof signInSchema>;

const initialValues: SignInValues = {
  email: "",
  otp: "",
  otpSent: false,
  errorMessage: null,
  successMessage: null,
  signedInAs: null,
};

export function SignInForm() {
  const session = authClient.useSession();

  const form = useForm<SignInValues>({
    initialValues,
    validate: schemaResolver(signInSchema, { sync: true }),
  });

  const { errorMessage, otpSent, signedInAs, successMessage } = form.values;

  const setFeedback = (error: string | null, success: string | null = null) =>
    form.setValues({ errorMessage: error, successMessage: success });

  const finishSignIn = (user: { email?: string; name?: string } | null) => {
    form.setValues({
      ...initialValues,
      signedInAs: user?.email || user?.name || null,
      successMessage: "Erfolgreich angemeldet!",
    });
  };

  const handleSendOtp = async (values: SignInValues) => {
    setFeedback(null);
    try {
      const res = await authClient.emailOtp.sendVerificationOtp({
        email: values.email,
        type: "sign-in",
      });
      if (res.error) {
        setFeedback(
          translateAuthError(res.error, "Bestätigungscode konnte nicht gesendet werden."),
        );
        return;
      }
      form.setValues({
        otpSent: true,
        successMessage:
          "Anfrage verarbeitet. Falls die Zustellung möglich war, erhalten Sie gleich einen Bestätigungscode.",
      });
    } catch (error) {
      setFeedback(translateAuthError(error, "Fehler beim Senden des Bestätigungscodes."));
    }
  };

  const handleVerifyOtp = async (values: SignInValues) => {
    setFeedback(null);
    try {
      const res = await authClient.signIn.emailOtp({ email: values.email, otp: values.otp.trim() });
      if (res.error) {
        setFeedback(
          translateAuthError(res.error, "Anmeldung mit Bestätigungscode fehlgeschlagen."),
        );
        return;
      }
      finishSignIn((res.data as { user?: { email?: string; name?: string } })?.user ?? null);
    } catch (error) {
      setFeedback(
        translateAuthError(error, "Fehler bei der Überprüfung des Bestätigungscodes."),
      );
    }
  };

  const handleSubmit = form.onSubmit((values) =>
    otpSent ? handleVerifyOtp(values) : handleSendOtp(values),
  );

  const handleResend = async () => {
    if (form.validateField("email").hasError) return;
    form.setSubmitting(true);
    try {
      await handleSendOtp(form.getValues());
    } finally {
      form.setSubmitting(false);
    }
  };

  const handleAnonymousSignIn = async () => {
    form.setSubmitting(true);
    setFeedback(null);
    try {
      const res = await authClient.signIn.anonymous();
      if (res.error) {
        setFeedback(translateAuthError(res.error, "Anonyme Anmeldung fehlgeschlagen."));
        return;
      }
      finishSignIn((res.data as { user?: { email?: string; name?: string } })?.user ?? null);
    } catch (error) {
      setFeedback(translateAuthError(error, "Unerwarteter Fehler bei der anonymen Anmeldung."));
    } finally {
      form.setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    form.setSubmitting(true);
    try {
      const res = await authClient.signOut();
      if (res.error) {
        setFeedback(translateAuthError(res.error, "Abmeldung fehlgeschlagen."));
        return;
      }
      form.reset();
    } catch (error) {
      setFeedback(translateAuthError(error, "Abmeldung fehlgeschlagen."));
    } finally {
      form.setSubmitting(false);
    }
  };

  const activeUser = signedInAs || session.data?.user?.email || session.data?.user?.name || null;

  if (activeUser) {
    return (
      <Card withBorder padding="md" radius="sm">
        <Stack gap="sm">
          <Text size="sm" fw={600}>
            Angemeldet als {activeUser}
          </Text>
          {successMessage && (
            <Alert color="green" title="Erfolg" variant="light" withCloseButton onClose={() => form.setFieldValue("successMessage", null)}>
              {successMessage}
            </Alert>
          )}
          <Button variant="default" size="sm" loading={form.submitting} onClick={handleSignOut}>
            Abmelden
          </Button>
        </Stack>
      </Card>
    );
  }

  return (
    <Card withBorder padding="md" radius="sm" aria-busy={form.submitting}>
      <Stack gap="sm">
        <Group justify="space-between" align="center">
          <Text fw={600} size="sm">
            Anmeldung
          </Text>
          <Text component={Link} href="/" size="xs" c="dimmed">
            Zur Startseite
          </Text>
        </Group>

        {errorMessage && (
          <Alert color="red" title="Authentifizierungsfehler" variant="light" withCloseButton onClose={() => form.setFieldValue("errorMessage", null)}>
            {errorMessage}
          </Alert>
        )}

        {successMessage && (
          <Alert color="green" title="Erfolg" variant="light" withCloseButton onClose={() => form.setFieldValue("successMessage", null)}>
            {successMessage}
          </Alert>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <Stack gap="sm">
            <TextInput
              {...form.getInputProps("email")}
              label="E-Mail-Adresse"
              placeholder="name@beispiel.de"
              type="email"
              disabled={form.submitting}
            />

            {otpSent && (
              <MotionReveal>
                <TextInput
                  {...form.getInputProps("otp")}
                  label="Bestätigungscode"
                  placeholder="123456"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  disabled={form.submitting}
                />
              </MotionReveal>
            )}

            <Button
              type="submit"
              variant="filled"
              fullWidth
              loading={form.submitting}
            >
              {otpSent ? "Mit Code anmelden" : "Code anfordern"}
            </Button>
          </Stack>
        </form>

        {otpSent && (
          <Button
            type="button"
            variant="subtle"
            fullWidth
            loading={form.submitting}
            onClick={handleResend}
          >
            Code erneut senden
          </Button>
        )}

        <Divider label="oder" labelPosition="center" />

        <Button
          type="button"
          variant="default"
          fullWidth
          loading={form.submitting}
          onClick={handleAnonymousSignIn}
        >
          Anonym anmelden
        </Button>
      </Stack>
    </Card>
  );
}
