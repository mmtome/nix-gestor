import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { credenciais, lerConfig } from "@/lib/sac/config";
import type { TagSac, TipoTag } from "@/lib/sac/tipos";
import { ConfigSac } from "@/components/sac/ConfigSac";

/* Configurações do SAC: conexão com o WhatsApp, grupo, regras e tags (só administrador). */

export default async function ConfigSacPage() {
  const user = await requireUser();

  if (user.role !== "ADMIN") {
    return (
      <div className="mx-auto max-w-3xl px-6 py-6">
        <Voltar />
        <div className="card p-8 text-center text-[13px] text-muted">
          Só administradores mudam as configurações do SAC.
        </div>
      </div>
    );
  }

  const config = await lerConfig();
  const [tags, vistos, logs] = await Promise.all([
    db.sacTag.findMany({ orderBy: [{ type: "asc" }, { sort: "asc" }, { label: "asc" }] }),
    db.sacVisto.findMany({ orderBy: { vistoEm: "desc" }, take: 60 }),
    db.sacWebhookLog.findMany({ orderBy: { id: "desc" }, take: 40 }),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-6">
        <Voltar />
        <h1 className="text-[20px] font-semibold tracking-tight">Configurações do SAC</h1>
        <p className="mt-0.5 text-[12.5px] text-muted">
          Conexão com o WhatsApp, grupo monitorado, regras do quadro e as tags da legenda.
        </p>

        <ConfigSac
          conexao={{
            url: config.evolutionUrl ?? "",
            temChave: !!config.evolutionKey,
            instancia: config.evolutionInstancia,
            pelaVercel: !!process.env.EVOLUTION_API_URL || !!process.env.EVOLUTION_API_KEY,
            pronta: !!credenciais(config),
          }}
          regras={{
            groupJid: config.groupJid,
            groupNome: config.groupNome,
            senderMode: config.senderMode as "fromMe" | "allowlist" | "any",
            allowedSenders: config.allowedSenders,
            albumWindowSeconds: config.albumWindowSeconds,
            slaAmareloHoras: config.slaAmareloHoras,
            slaVermelhoHoras: config.slaVermelhoHoras,
            emojisResolvido: config.emojisResolvido,
            emojisArquivado: config.emojisArquivado,
            reagirAoResolver: config.reagirAoResolver,
            logPayloads: config.logPayloads,
          }}
          tags={tags.map((t) => ({ ...t, type: t.type as TipoTag }) satisfies TagSac)}
          grupos={vistos
            .filter((v) => v.tipo === "grupo")
            .map((v) => ({ jid: v.jid, vistoEm: v.vistoEm.toISOString(), total: v.total }))}
          remetentes={vistos
            .filter((v) => v.tipo === "remetente")
            .map((v) => ({ jid: v.jid, nome: v.nome, vistoEm: v.vistoEm.toISOString(), total: v.total }))}
          logs={logs.map((l) => ({
            id: l.id,
            em: l.receivedAt.toISOString(),
            evento: l.event,
            resultado: l.result,
            payload: JSON.stringify(l.payload, null, 2),
          }))}
        />
    </div>
  );
}

function Voltar() {
  return (
    <Link href="/sac" className="mb-3 inline-flex items-center gap-1 text-[12px] text-faint transition hover:text-text">
      <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao quadro
    </Link>
  );
}
