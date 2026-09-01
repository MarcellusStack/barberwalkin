import { Container, Stack, Text, Title } from "@mantine/core";

export default function Home() {
  return (
    <Container component="main" size="sm" py={{ base: 80, sm: 120 }}>
      <Stack gap="lg">
        <Stack gap="xs">
          <Text c="dimmed" fw={600} size="sm">
            Walk-in-Betrieb in Echtzeit
          </Text>
          <Title order={1}>BarberWalkin</Title>
          <Text c="dimmed" size="xl">
            Walk-ins einfach organisieren.
          </Text>
        </Stack>
      </Stack>
    </Container>
  );
}
