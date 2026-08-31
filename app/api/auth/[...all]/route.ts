import { handler } from "@/lib/auth-server";
import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  console.log("[AUTH ROUTE] GET", request.url);
  try {
    const response = await handler.GET(request);
    console.log("[AUTH ROUTE] GET response status:", response.status);
    return response;
  } catch (err) {
    console.error("[AUTH ROUTE] GET error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  console.log("[AUTH ROUTE] POST", request.url);
  try {
    const response = await handler.POST(request);
    console.log("[AUTH ROUTE] POST response status:", response.status);
    return response;
  } catch (err) {
    console.error("[AUTH ROUTE] POST error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
