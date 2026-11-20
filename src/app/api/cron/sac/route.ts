import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/* ============================================================================
   Limpeza do SAC, de hora em hora pelo mesmo workflow dos stories
   (.github/workflows/stories.yml): o log do webhook guarda só 30 dias.
   ========================================================================== */

export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const limite = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const { count } = await db.sacWebhookLog.deleteMany({ where: { receivedAt: { lt: limite } } });
  return NextResponse.json({ agora: new Date().toISOString(), logsApagados: count });
}
