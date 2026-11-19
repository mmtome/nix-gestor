import { NextResponse } from "next/server";
import { coletarTodos } from "@/lib/stories";

/* ============================================================================
   Coleta de stories, de hora em hora.

   Quem chama é o GitHub Actions (.github/workflows/stories.yml): o plano Hobby
   da Vercel só permite cron diário, e um story que entra e sai entre duas
   passagens diárias seria perdido.

   Diferente do cron de publicação, aqui sem CRON_SECRET ninguém entra: a rota
   é chamada de fora da Vercel e gasta cota da API da Meta a cada chamada.
   ========================================================================== */

export const maxDuration = 120;

export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const contas = await coletarTodos();
  return NextResponse.json({ agora: new Date().toISOString(), contas });
}
