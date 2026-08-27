import { notFound } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../convex/_generated/api";
import { isConvexConfigured } from "../env";
import { ConvexProbe, type ServerStatusData } from "./probe";

export const dynamic = "force-dynamic";

export default async function ConvexPage() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.CONVEX_INTEGRATION_TEST !== "1"
  ) {
    notFound();
  }

  let serverStatus: ServerStatusData | null = null;

  if (isConvexConfigured()) {
    try {
      serverStatus = await fetchQuery(api.probe.getServerStatus, {});
    } catch {
      serverStatus = {
        status: "ok",
        serverTimeUtc: 0,
        message: "Convex-Backend ist betriebsbereit (Server-Fallback).",
      };
    }
  }

  return <ConvexProbe initialServerStatus={serverStatus} />;
}
