import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { decifrar } from "@/lib/meta";
import type { SacTag } from "./core";

/**
 * Configuração do SAC: uma linha só (id "sac"), criada no primeiro acesso com
 * o token do webhook já sorteado. As variáveis EVOLUTION_API_URL,
 * EVOLUTION_API_KEY e EVOLUTION_INSTANCE, se existirem na Vercel, valem mais
 * que o que foi salvo na tela.
 */
export async function lerConfig() {
  const atual = await db.sacConfig.findUnique({ where: { id: "sac" } });
  if (atual) return atual;
  try {
    return await db.sacConfig.create({
      data: { id: "sac", webhookToken: randomBytes(24).toString("base64url") },
    });
  } catch {
    // Duas requisições criaram ao mesmo tempo: vale a que chegou primeiro.
    return db.sacConfig.findUniqueOrThrow({ where: { id: "sac" } });
  }
}

export type ConfigSac = Awaited<ReturnType<typeof lerConfig>>;

export type CredenciaisEvolution = { url: string; chave: string; instancia: string };

export function credenciais(config: ConfigSac): CredenciaisEvolution | null {
  const url = (process.env.EVOLUTION_API_URL ?? config.evolutionUrl ?? "").trim().replace(/\/+$/, "");
  let chave = process.env.EVOLUTION_API_KEY ?? "";
  if (!chave && config.evolutionKey) {
    try {
      chave = decifrar(config.evolutionKey);
    } catch {
      chave = ""; // AUTH_SECRET mudou: a chave precisa ser salva de novo
    }
  }
  const instancia = process.env.EVOLUTION_INSTANCE ?? config.evolutionInstancia;
  return url && chave && instancia ? { url, chave, instancia } : null;
}

/** Dicionário da legenda no formato do parseCaption. */
export async function tagsAtivas(): Promise<SacTag[]> {
  const tags = await db.sacTag.findMany({ where: { active: true } });
  return tags.map((t) => ({
    slug: t.slug,
    type: t.type as SacTag["type"],
    label: t.label,
    aliases: t.aliases,
  }));
}
