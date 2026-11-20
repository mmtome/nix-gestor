import { after, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { lerConfig } from "@/lib/sac/config";
import { processarWebhook } from "@/lib/sac/tratar";

/* ============================================================================
   Webhook da Evolution API (seção 6 da spec do SAC). Fica fora do login (o
   proxy não passa por /api); quem prova a origem é o token da URL, sorteado
   pelo gestor e cadastrado na Evolution pelo botão "Conectar WhatsApp".

   Responde 200 na hora e processa depois (`after`): a Evolution não espera o
   upload do print. Erro de regra vai para o log do webhook, nunca para ela.
   ========================================================================== */

export const maxDuration = 60;

function mesmoToken(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function POST(req: Request) {
  const config = await lerConfig();
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!mesmoToken(token, config.webhookToken)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "json inválido" }, { status: 400 });
  }

  after(async () => {
    try {
      await processarWebhook(payload, config);
    } catch (e) {
      console.error("[sac] webhook", e);
    }
  });
  return NextResponse.json({ ok: true });
}
