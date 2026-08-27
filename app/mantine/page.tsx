import { notFound } from "next/navigation";
import { MantineIntegration } from "./probe";

export const dynamic = "force-dynamic";

export default function MantinePage() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.MANTINE_INTEGRATION_TEST !== "1"
  ) {
    notFound();
  }

  return <MantineIntegration />;
}
