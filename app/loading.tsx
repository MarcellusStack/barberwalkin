import { Center, Loader, Stack, Text } from "@mantine/core";

export default function Loading() {
  return (
    <Center
      component="main"
      mih="100vh"
      role="status"
      aria-label="Inhalt wird geladen"
      aria-live="polite"
    >
      <Stack align="center" gap="sm">
        <Loader aria-hidden="true" />
        <Text>Inhalt wird geladen …</Text>
      </Stack>
    </Center>
  );
}
