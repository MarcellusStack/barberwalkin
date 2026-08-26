"use client";

import { Alert, Button, Container, Stack, Text, Title } from "@mantine/core";

export function ErrorFallback({ retry }: { retry: () => void }) {
  return (
    <Container component="main" size="sm" py={{ base: 80, sm: 120 }}>
      <Alert color="red" role="alert">
        <Stack align="flex-start">
          <Title order={1}>Etwas ist schiefgelaufen</Title>
          <Text>Die Anwendung konnte nicht geladen werden.</Text>
          <Button color="red.9" onClick={retry}>
            Erneut versuchen
          </Button>
        </Stack>
      </Alert>
    </Container>
  );
}
