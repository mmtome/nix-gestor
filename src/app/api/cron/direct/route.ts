import { NextResponse } from "next/server";
import { coletarDirectTodos } from "@/lib/directApi";

/* ============================================================================
   Coleta do Direct, de hora em hora — mesma chamada e mesmo segredo da coleta
   de stories (.github/workflows/stories.yml). A API só detalha as 20 últimas
   mensagens de cada conversa; lendo a cada hora, nenhuma fica para trás.
   ========================================================================== */

export const maxDuration = 300;

export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const contas = await coletarDirectTodos();
  return NextResponse.json({ agora: new Date().toISOString(), contas });
}
