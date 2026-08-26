import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ForcedErrorPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  await new Promise((resolve) => setTimeout(resolve, 750));
  throw new Error("Erzwungener Fehler für den Anwendungstest");
}
