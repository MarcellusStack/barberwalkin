import type { Metadata } from "next";
import { Container, Stack, Text, Title } from "@mantine/core";
import { SignInForm } from "@/components/sign-in-form";

export const metadata: Metadata = {
  title: "Anmelden – BarberWalkin",
  description:
    "Melden Sie sich mit E-Mail-OTP an oder starten Sie eine anonyme Testnutzung.",
};

export default function SignInPage() {
  return (
    <Container component="main" size="sm" py={{ base: 80, sm: 120 }}>
      <Stack gap="lg">
        <Stack gap="xs">
          <Text c="dimmed" fw={600} size="sm">
            BarberWalkin
          </Text>
          <Title order={1}>Anmelden</Title>
          <Text c="dimmed">
            Mit E-Mail oder anonym als Shop Admin testen.
          </Text>
        </Stack>

        <SignInForm />
      </Stack>
    </Container>
  );
}
