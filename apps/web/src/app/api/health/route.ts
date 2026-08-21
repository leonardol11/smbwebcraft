import { NextResponse } from "next/server";
import { getDb } from "@outreach/db";
import { computeHealth } from "@/lib/health";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getDb();
    const health = await computeHealth(db);
    return NextResponse.json(health, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      {
        status: "red",
        reasons: [`Health check crashed: ${err instanceof Error ? err.message : String(err)}`],
        checks: [],
        bounceRed: false,
        computedAt: new Date().toISOString(),
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }
}
