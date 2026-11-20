"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronRight, Loader2, Plus, QrCode, RefreshCw, Trash2, Users } from "lucide-react";
import { fmtTZ } from "@/lib/dates";
import { NOME_TIPO, type TagSac, type TipoTag } from "@/lib/sac/tipos";
import {
  cadastrarTagSac,
  conectarWhatsappSac,
  desconectarWhatsappSac,
  estadoWhatsappSac,
  excluirTagSac,
  gruposWhatsappSac,
  limparLogsSac,
  reprocessarLogSac,
  salvarConexaoSac,
  salvarRegrasSac,
  salvarTagSac,
  type EstadoWhatsapp,
} from "@/actions/sac";

/* ============================================================================
   Configurações do SAC (seção 7 da spec), na ordem em que se monta tudo:
   1. conectar o número do SAC (QR code), 2. escolher o grupo, 3. quem pode
   mandar print, 4. regras, 5. tags da legenda, 6. o que chegou no webhook.
   ========================================================================== */

type Regras = {
  groupJid: string | null;
  groupNome: string | null;
  senderMode: "fromMe" | "allowlist" | "any";
  allowedSenders: string[];
  albumWindowSeconds: number;
  slaAmareloHoras: number;
  slaVermelhoHoras: number;
  emojisResolvido: string[];
  emojisArquivado: string[];
  reagirAoResolver: boolean;
  logPayloads: boolean;
};

type Conexao = { url: string; temChave: boolean; instancia: string; pelaVercel: boolean; pronta: boolean };
type Log = { id: number; em: string; evento: string | null; resultado: string | null; payload: string };

const quando = (iso: string) => fmtTZ(new Date(iso), "dd/MM HH:mm:ss");

export function ConfigSac({
  conexao,
  regras: inicial,
  tags,
  grupos,
  remetentes,
  logs,
}: {
  conexao: Conexao;
  regras: Regras;
  tags: TagSac[];
  grupos: { jid: string; vistoEm: string; total: number }[];
  remetentes: { jid: string; nome: string | null; vistoEm: string; total: number }[];
  logs: Log[];
}) {
  const router = useRouter();
  const [regras, setRegras] = useState(inicial);
  const [salvo, setSalvo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, start] = useTransition();

  function salvar(proximas: Regras, onde: string) {
    setRegras(proximas);
    setErro(null);
    start(async () => {
      const r = await salvarRegrasSac(proximas);
      if (!r.ok) return setErro(r.erro);
      setSalvo(onde);
      setTimeout(() => setSalvo((s) => (s === onde ? null : s)), 2000);
      router.refresh();
    });
  }

  const ok = (onde: string) =>
    salvo === onde ? (
      <span className="flex items-center gap-1 text-[12px] text-ok">
        <Check className="h-3.5 w-3.5" /> Salvo
      </span>
    ) : null;

  return (
    <div className="mt-6 space-y-5 pb-10">
      {erro && <p className="rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-[12.5px] text-warn">{erro}</p>}

      <ConexaoWhatsapp inicial={conexao} />

      {/* 2. Grupo */}
      <Secao numero={2} titulo="Grupo do SAC" texto="O grupo com os donos onde os prints são mandados. Mensagens de outros grupos e conversas com clientes são ignoradas e não ficam guardadas.">
        <EscolherGrupo
          atual={regras.groupJid ? { jid: regras.groupJid, nome: regras.groupNome } : null}
          vistos={grupos}
          pronta={conexao.pronta}
          onEscolher={(jid, nome) => salvar({ ...regras, groupJid: jid, groupNome: nome }, "grupo")}
        />
        {ok("grupo")}
      </Secao>

      {/* 3. Remetentes */}
      <Secao numero={3} titulo="Quem pode criar card" texto="Imagem de quem não está liberado não vira card (aparece no log como “remetente não permitido”). Reações e respostas valem de qualquer pessoa do grupo.">
        <div className="space-y-2 text-[12.5px]">
          {(
            [
              ["fromMe", "Só o número do SAC", "Os prints são mandados pelo próprio número conectado."],
              ["allowlist", "Só os números da lista", "Os prints saem de outros celulares (o seu, por exemplo)."],
              ["any", "Qualquer pessoa do grupo", "Toda imagem mandada no grupo vira card."],
            ] as const
          ).map(([valor, nome, ajuda]) => (
            <label key={valor} className="flex cursor-pointer items-start gap-2">
              <input
                type="radio"
                name="modo"
                checked={regras.senderMode === valor}
                onChange={() => setRegras({ ...regras, senderMode: valor })}
                className="mt-1 accent-[#8013a8]"
              />
              <span>
                <span className="font-medium text-text">{nome}</span>
                <span className="block text-[11.5px] text-faint">{ajuda}</span>
              </span>
            </label>
          ))}
        </div>

        {regras.senderMode === "allowlist" && (
          <div className="mt-3">
            <span className="mb-1 block text-[11px] text-faint">Números liberados (um por linha, com DDD)</span>
            <textarea
              rows={3}
              value={regras.allowedSenders.join("\n")}
              onChange={(e) => setRegras({ ...regras, allowedSenders: e.target.value.split("\n") })}
              placeholder={"34 99999-0000"}
              className="field text-[12.5px]"
            />
            {remetentes.length > 0 && (
              <div className="mt-2">
                <p className="mb-1 text-[11px] text-faint">Vistos no grupo — clique para liberar:</p>
                <div className="flex flex-wrap gap-1.5">
                  {remetentes.map((r) => {
                    const ja = regras.allowedSenders.some((a) => a.trim() === r.jid);
                    return (
                      <button
                        key={r.jid}
                        disabled={ja}
                        onClick={() =>
                          setRegras({ ...regras, allowedSenders: [...regras.allowedSenders.filter((a) => a.trim()), r.jid] })
                        }
                        className="rounded border border-line px-2 py-1 text-left text-[11px] transition enabled:hover:border-accent disabled:opacity-50"
                      >
                        <span className="text-dim">{r.nome ?? "Sem nome"}</span>{" "}
                        <span className="text-faint">{r.jid === "conta" ? "(número do SAC)" : r.jid}</span>
                        {ja && " ✓"}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
        <div className="mt-3 flex items-center gap-3">
          <button onClick={() => salvar(regras, "remetentes")} disabled={pendente} className="btn-primary py-1.5 text-[12.5px]">
            Salvar
          </button>
          {ok("remetentes")}
        </div>
      </Secao>

      {/* 4. Regras */}
      <Secao numero={4} titulo="Regras do quadro">
        <div className="grid gap-3 text-[12.5px] sm:grid-cols-3">
          <Numero
            rotulo="Álbum: fotos sem legenda até (segundos)"
            valor={regras.albumWindowSeconds}
            onChange={(v) => setRegras({ ...regras, albumWindowSeconds: v })}
          />
          <Numero
            rotulo="Prazo amarelo (horas sem resposta)"
            valor={regras.slaAmareloHoras}
            onChange={(v) => setRegras({ ...regras, slaAmareloHoras: v })}
          />
          <Numero
            rotulo="Prazo vermelho (horas)"
            valor={regras.slaVermelhoHoras}
            onChange={(v) => setRegras({ ...regras, slaVermelhoHoras: v })}
          />
          <Emojis
            rotulo="Reação que resolve"
            valor={regras.emojisResolvido}
            onChange={(v) => setRegras({ ...regras, emojisResolvido: v })}
          />
          <Emojis
            rotulo="Reação que arquiva"
            valor={regras.emojisArquivado}
            onChange={(v) => setRegras({ ...regras, emojisArquivado: v })}
          />
        </div>
        <div className="mt-3 space-y-1.5 text-[12.5px]">
          <Opcao
            marcado={regras.reagirAoResolver}
            onChange={(v) => setRegras({ ...regras, reagirAoResolver: v })}
            texto="Ao mover para Resolvido aqui no gestor, reagir ✅ no print do grupo"
          />
          <Opcao
            marcado={regras.logPayloads}
            onChange={(v) => setRegras({ ...regras, logPayloads: v })}
            texto="Guardar o que chega do grupo no log abaixo (sem as imagens; apagado depois de 30 dias)"
          />
        </div>
        <p className="mt-2 text-[11.5px] text-faint">
          Responder citando o print com “ok”, “feito”, “pronto”, “resolvido” ou “respondido” (até 3 palavras)
          também resolve. Resposta mais longa vira comentário no card.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <button onClick={() => salvar(regras, "regras")} disabled={pendente} className="btn-primary py-1.5 text-[12.5px]">
            Salvar regras
          </button>
          {ok("regras")}
        </div>
      </Secao>

      <Tags tags={tags} />

      <Registro logs={logs} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 1. Conexão                                                                  */
/* -------------------------------------------------------------------------- */

const NOME_ESTADO: Record<EstadoWhatsapp["estado"], string> = {
  open: "Conectado",
  connecting: "Aguardando o QR code",
  close: "Desconectado",
  inexistente: "Ainda não conectado",
  "sem-config": "Evolution não configurada",
};

function ConexaoWhatsapp({ inicial }: { inicial: Conexao }) {
  const router = useRouter();
  const [url, setUrl] = useState(inicial.url);
  const [chave, setChave] = useState("");
  const [instancia, setInstancia] = useState(inicial.instancia);
  const [estado, setEstado] = useState<EstadoWhatsapp["estado"] | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const [pendente, start] = useTransition();
  const tentativas = useRef(0);

  const aplicar = useCallback((r: Awaited<ReturnType<typeof estadoWhatsappSac>>) => {
    if (!r.ok) {
      setMsg({ tom: "erro", texto: r.erro });
      return null;
    }
    setEstado(r.estado);
    if (r.estado === "open") setQr(null);
    return r.estado;
  }, []);
  const consultar = useCallback(() => estadoWhatsappSac().then(aplicar), [aplicar]);

  useEffect(() => {
    estadoWhatsappSac().then(aplicar);
  }, [aplicar]);

  // Com o QR na tela: confere a cada 3 s se conectou; o QR vence, então renova a cada 30 s.
  useEffect(() => {
    if (!qr) return;
    const olhar = setInterval(async () => {
      if ((await consultar()) === "open") {
        setMsg({ tom: "ok", texto: "WhatsApp conectado. Agora escolha o grupo do SAC abaixo." });
        router.refresh();
      }
    }, 3_000);
    const renovar = setInterval(async () => {
      if (++tentativas.current > 6) {
        setQr(null);
        setMsg({ tom: "erro", texto: "O QR code expirou. Clique em Conectar WhatsApp de novo." });
        return;
      }
      const r = await conectarWhatsappSac();
      if (r.ok && r.qr) setQr(r.qr);
    }, 30_000);
    return () => {
      clearInterval(olhar);
      clearInterval(renovar);
    };
  }, [qr, consultar, router]);

  function salvarEConectar() {
    setMsg(null);
    start(async () => {
      if (!inicial.pelaVercel) {
        const s = await salvarConexaoSac({ url, chave, instancia });
        if (!s.ok) return setMsg({ tom: "erro", texto: s.erro });
        setChave("");
      }
      const r = await conectarWhatsappSac();
      if (!r.ok) return setMsg({ tom: "erro", texto: r.erro });
      setEstado(r.estado);
      tentativas.current = 0;
      setQr(r.qr);
      if (r.estado === "open") setMsg({ tom: "ok", texto: "Já está conectado. Webhook e ajustes reaplicados." });
      else if (r.aviso) setMsg({ tom: "erro", texto: r.aviso });
      router.refresh();
    });
  }

  function desconectarAgora() {
    if (!confirm("Desconectar o número do SAC? Os prints param de chegar até conectar de novo.")) return;
    start(async () => {
      const r = await desconectarWhatsappSac();
      setMsg(r.ok ? { tom: "ok", texto: "Desconectado." } : { tom: "erro", texto: r.erro });
      await consultar();
    });
  }

  return (
    <Secao
      numero={1}
      titulo="Conexão com o WhatsApp"
      texto="O número do SAC fica conectado na Evolution como um “aparelho conectado”, igual ao WhatsApp Web: o celular continua funcionando normalmente."
      direita={
        estado && (
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              estado === "open" ? "bg-ok/15 text-ok" : "bg-warn/15 text-warn"
            }`}
          >
            {NOME_ESTADO[estado]}
          </span>
        )
      }
    >
      {inicial.pelaVercel ? (
        <p className="text-[12px] text-muted">
          Endereço e chave da Evolution vêm das variáveis da Vercel (EVOLUTION_API_URL / EVOLUTION_API_KEY).
        </p>
      ) : (
        <div className="grid gap-3 text-[12.5px] sm:grid-cols-[2fr_1.4fr_0.8fr]">
          <label className="block">
            <span className="mb-1 block text-[11px] text-faint">Endereço da Evolution</span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://evolution-xxxx.up.railway.app"
              className="field text-[12.5px]"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] text-faint">Chave (AUTHENTICATION_API_KEY)</span>
            <input
              type="password"
              value={chave}
              onChange={(e) => setChave(e.target.value)}
              placeholder={inicial.temChave ? "salva — deixe vazio para manter" : "cole a chave"}
              autoComplete="off"
              className="field text-[12.5px]"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] text-faint">Instância</span>
            <input value={instancia} onChange={(e) => setInstancia(e.target.value)} className="field text-[12.5px]" />
          </label>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={salvarEConectar}
          disabled={pendente || (!inicial.pelaVercel && (!url || (!chave && !inicial.temChave)))}
          className="btn-primary py-1.5 text-[12.5px]"
        >
          {pendente ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <QrCode className="h-3.5 w-3.5" />}
          {estado === "open" ? "Reaplicar ajustes" : "Conectar WhatsApp"}
        </button>
        {estado === "open" && (
          <button onClick={desconectarAgora} disabled={pendente} className="btn-ghost py-1.5 text-[12.5px]">
            Desconectar
          </button>
        )}
        <button onClick={() => consultar()} className="btn-ghost py-1.5 text-[12.5px]" title="Atualizar o estado">
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {msg && <p className={`mt-2 text-[12px] ${msg.tom === "ok" ? "text-ok" : "text-warn"}`}>{msg.texto}</p>}

      {qr && (
        <div className="mt-4 flex flex-wrap items-center gap-5 rounded-lg border border-line bg-surface/50 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR code para conectar o WhatsApp" className="h-56 w-56 rounded bg-white p-2" />
          <ol className="list-decimal space-y-1 pl-4 text-[12.5px] text-dim">
            <li>Abra o WhatsApp no celular do <b className="text-text">número do SAC</b>.</li>
            <li>Toque em ⋮ (ou Configurações) → <b className="text-text">Aparelhos conectados</b>.</li>
            <li>Toque em <b className="text-text">Conectar aparelho</b> e aponte para este QR code.</li>
            <li className="text-faint">Esta tela percebe sozinha quando conectar.</li>
          </ol>
        </div>
      )}
    </Secao>
  );
}

/* -------------------------------------------------------------------------- */
/* 2. Grupo                                                                    */
/* -------------------------------------------------------------------------- */

function EscolherGrupo({
  atual,
  vistos,
  pronta,
  onEscolher,
}: {
  atual: { jid: string; nome: string | null } | null;
  vistos: { jid: string; vistoEm: string; total: number }[];
  pronta: boolean;
  onEscolher: (jid: string | null, nome: string | null) => void;
}) {
  const [grupos, setGrupos] = useState<{ jid: string; nome: string; pessoas: number | null }[] | null>(null);
  const [manual, setManual] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [buscando, start] = useTransition();

  function buscar() {
    setErro(null);
    start(async () => {
      const r = await gruposWhatsappSac();
      if (!r.ok) return setErro(r.erro);
      setGrupos(r.grupos);
    });
  }

  return (
    <div className="text-[12.5px]">
      <p className="text-dim">
        {atual ? (
          <>
            Monitorando: <b className="text-text">{atual.nome ?? atual.jid}</b>{" "}
            <span className="text-faint">({atual.jid})</span>
          </>
        ) : (
          <span className="text-warn">Nenhum grupo escolhido — nenhum print vira card ainda.</span>
        )}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button onClick={buscar} disabled={buscando || !pronta} className="btn-ghost py-1.5 text-[12.5px]">
          {buscando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5" />}
          Buscar os grupos do número
        </button>
        {atual && (
          <button onClick={() => onEscolher(null, null)} className="text-[12px] text-faint underline hover:text-text">
            Parar de monitorar
          </button>
        )}
      </div>
      {!pronta && <p className="mt-1 text-[11.5px] text-faint">Conecte o WhatsApp primeiro.</p>}
      {erro && <p className="mt-2 text-warn">{erro}</p>}

      {grupos && (
        <ul className="mt-3 max-h-72 divide-y divide-line overflow-y-auto rounded-md border border-line">
          {grupos.length === 0 && <li className="px-3 py-2 text-faint">O número não está em nenhum grupo.</li>}
          {grupos.map((g) => (
            <li key={g.jid} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1 truncate">
                {g.nome}
                {g.pessoas !== null && <span className="text-faint"> · {g.pessoas} pessoas</span>}
              </span>
              {atual?.jid === g.jid ? (
                <span className="text-[11.5px] text-ok">monitorando</span>
              ) : (
                <button onClick={() => onEscolher(g.jid, g.nome)} className="btn-ghost py-1 text-[12px]">
                  Usar este
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <details className="mt-3 text-[12px] text-faint">
        <summary className="cursor-pointer hover:text-text">Informar o ID do grupo à mão</summary>
        <div className="mt-2 flex gap-2">
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="120363000000000000@g.us"
            className="field max-w-sm py-1.5 text-[12.5px]"
          />
          <button onClick={() => manual.trim() && onEscolher(manual.trim(), null)} className="btn-ghost py-1 text-[12px]">
            Usar
          </button>
        </div>
        {vistos.length > 0 && (
          <div className="mt-2">
            Grupos que já mandaram mensagem:
            <ul className="mt-1 space-y-0.5">
              {vistos.map((v) => (
                <li key={v.jid}>
                  <button onClick={() => setManual(v.jid)} className="text-dim underline-offset-2 hover:underline">
                    {v.jid}
                  </button>{" "}
                  · {v.total} mensagens · última {quando(v.vistoEm)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </details>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 5. Tags                                                                     */
/* -------------------------------------------------------------------------- */

const TIPOS: TipoTag[] = ["canal", "categoria", "evento", "prioridade"];

function Tags({ tags }: { tags: TagSac[] }) {
  return (
    <Secao
      numero={5}
      titulo="Tags da legenda"
      texto="Na legenda do print: #canal #categoria #evento e o título. Ex.: “#ig #ingresso #lapa cliente perguntando do 2º lote”. Maiúsculas e acentos não importam."
    >
      <div className="space-y-5">
        {TIPOS.map((tipo) => (
          <div key={tipo}>
            <h3 className="mb-1.5 text-[12px] font-semibold uppercase tracking-wider text-faint">{NOME_TIPO[tipo]}</h3>
            <div className="divide-y divide-line rounded-md border border-line">
              {tags
                .filter((t) => t.type === tipo)
                .map((t) => (
                  <LinhaTag key={t.slug} tag={t} />
                ))}
              <NovaTag tipo={tipo} />
            </div>
          </div>
        ))}
      </div>
    </Secao>
  );
}

function LinhaTag({ tag }: { tag: TagSac }) {
  const router = useRouter();
  const [label, setLabel] = useState(tag.label);
  const [aliases, setAliases] = useState(tag.aliases.join(", "));
  const [color, setColor] = useState(tag.color ?? "#9BB4FF");
  const [active, setActive] = useState(tag.active);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, start] = useTransition();
  const mudou =
    label !== tag.label || aliases !== tag.aliases.join(", ") || color !== (tag.color ?? "#9BB4FF") || active !== tag.active;

  function salvar() {
    start(async () => {
      const r = await salvarTagSac({ slug: tag.slug, type: tag.type, label, aliases: aliases.split(","), color, active });
      setErro(r.ok ? null : r.erro);
      router.refresh();
    });
  }

  function excluir() {
    if (!confirm(`Excluir a tag #${tag.slug}? Os cards que usam ficam com o campo vazio.`)) return;
    start(async () => {
      const r = await excluirTagSac(tag.slug);
      setErro(r.ok ? null : r.erro);
      router.refresh();
    });
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 px-3 py-2 text-[12.5px] ${active ? "" : "opacity-60"}`}>
      <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-6 w-7 shrink-0 rounded bg-transparent" />
      <code className="w-[92px] shrink-0 truncate text-[12px] text-accent">#{tag.slug}</code>
      <input value={label} onChange={(e) => setLabel(e.target.value)} className="field w-[150px] py-1 text-[12.5px]" />
      <input
        value={aliases}
        onChange={(e) => setAliases(e.target.value)}
        placeholder="outras formas, separadas por vírgula"
        className="field min-w-[160px] flex-1 py-1 text-[12.5px]"
      />
      <label className="flex items-center gap-1 text-[11.5px] text-faint">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-[#8013a8]" />
        ativa
      </label>
      {mudou && (
        <button onClick={salvar} disabled={pendente} className="btn-primary px-2.5 py-1 text-[12px]">
          Salvar
        </button>
      )}
      <button onClick={excluir} disabled={pendente} className="rounded p-1 text-faint transition hover:bg-surface hover:text-text" title="Excluir">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      {erro && <p className="w-full text-[11.5px] text-warn">{erro}</p>}
    </div>
  );
}

function NovaTag({ tipo }: { tipo: TipoTag }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [slug, setSlug] = useState("");
  const [label, setLabel] = useState("");
  const [aliases, setAliases] = useState("");
  const [color, setColor] = useState(tipo === "evento" ? "#9BB4FF" : "#C77BE8");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, start] = useTransition();

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-[12px] text-faint transition hover:bg-surface hover:text-dim"
      >
        <Plus className="h-3.5 w-3.5" /> {tipo === "evento" ? "Novo evento" : `Nova tag de ${NOME_TIPO[tipo].toLowerCase()}`}
      </button>
    );
  }

  function criar() {
    start(async () => {
      const r = await cadastrarTagSac({ slug, type: tipo, label, aliases: aliases.split(","), color });
      if (!r.ok) return setErro(r.erro);
      setAberto(false);
      setSlug("");
      setLabel("");
      setAliases("");
      setErro(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 bg-surface/40 px-3 py-2 text-[12.5px]">
      <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-6 w-7 shrink-0 rounded bg-transparent" />
      <input
        autoFocus
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        placeholder={tipo === "evento" ? "#lapa" : "#palavra"}
        className="field w-[110px] py-1 text-[12.5px]"
      />
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nome no card" className="field w-[150px] py-1 text-[12.5px]" />
      <input
        value={aliases}
        onChange={(e) => setAliases(e.target.value)}
        placeholder="outras formas, separadas por vírgula"
        className="field min-w-[160px] flex-1 py-1 text-[12.5px]"
      />
      <button onClick={criar} disabled={pendente || !slug || !label} className="btn-primary px-2.5 py-1 text-[12px]">
        Criar
      </button>
      <button onClick={() => setAberto(false)} className="text-[12px] text-faint hover:text-text">
        Cancelar
      </button>
      {erro && <p className="w-full text-[11.5px] text-warn">{erro}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 6. Log                                                                      */
/* -------------------------------------------------------------------------- */

function Registro({ logs }: { logs: Log[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState<number | null>(null);
  const [resultado, setResultado] = useState<Record<number, string>>({});
  const [pendente, start] = useTransition();

  return (
    <Secao
      numero={6}
      titulo="O que chegou do grupo"
      texto="As últimas mensagens do grupo do SAC e o que o gestor fez com cada uma. Serve para conferir quando um print não virou card."
      direita={
        logs.length > 0 && (
          <button
            onClick={() =>
              confirm("Apagar todo o log?") &&
              start(async () => {
                await limparLogsSac();
                router.refresh();
              })
            }
            disabled={pendente}
            className="text-[12px] text-faint underline hover:text-text"
          >
            Limpar
          </button>
        )
      }
    >
      {!logs.length && <p className="text-[12.5px] text-faint">Nada ainda.</p>}
      <ul className="divide-y divide-line rounded-md border border-line text-[12px]">
        {logs.map((l) => (
          <li key={l.id}>
            <div className="flex items-center gap-2 px-3 py-1.5">
              <button onClick={() => setAberto(aberto === l.id ? null : l.id)} className="text-faint hover:text-text">
                {aberto === l.id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
              <span className="w-[110px] shrink-0 text-faint">{quando(l.em)}</span>
              <span className="w-[120px] shrink-0 truncate text-muted">{l.evento ?? "—"}</span>
              <span
                className={`min-w-0 flex-1 truncate ${
                  (resultado[l.id] ?? l.resultado ?? "").startsWith("erro") ? "text-warn" : "text-dim"
                }`}
              >
                {resultado[l.id] ?? l.resultado ?? "processando…"}
              </span>
              {(l.resultado ?? "").startsWith("erro") && !resultado[l.id] && (
                <button
                  onClick={() =>
                    start(async () => {
                      const r = await reprocessarLogSac(l.id);
                      setResultado((m) => ({ ...m, [l.id]: r.ok ? r.resultado : `erro: ${r.erro}` }));
                      router.refresh();
                    })
                  }
                  disabled={pendente}
                  className="btn-ghost px-2 py-0.5 text-[11.5px]"
                >
                  Reprocessar
                </button>
              )}
            </div>
            {aberto === l.id && (
              <pre className="max-h-80 overflow-auto border-t border-line bg-ink px-3 py-2 text-[11px] leading-relaxed text-muted">
                {l.payload}
              </pre>
            )}
          </li>
        ))}
      </ul>
    </Secao>
  );
}

/* -------------------------------------------------------------------------- */

function Secao({
  numero,
  titulo,
  texto,
  direita,
  children,
}: {
  numero: number;
  titulo: string;
  texto?: string;
  direita?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5">
      <div className="mb-3 flex items-start gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[11px] font-semibold text-accent">
          {numero}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-semibold tracking-tight">{titulo}</h2>
          {texto && <p className="mt-0.5 text-[12px] text-muted">{texto}</p>}
        </div>
        {direita}
      </div>
      {children}
    </section>
  );
}

function Numero({ rotulo, valor, onChange }: { rotulo: string; valor: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-faint">{rotulo}</span>
      <input
        type="number"
        min={0}
        value={valor}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="field py-1.5 text-[12.5px]"
      />
    </label>
  );
}

function Emojis({ rotulo, valor, onChange }: { rotulo: string; valor: string[]; onChange: (v: string[]) => void }) {
  const [texto, setTexto] = useState(valor.join(" "));
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-faint">{rotulo} (separe por espaço)</span>
      <input
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          onChange(e.target.value.split(/\s+/).filter(Boolean));
        }}
        className="field py-1.5 text-[15px]"
      />
    </label>
  );
}

function Opcao({ marcado, onChange, texto }: { marcado: boolean; onChange: (v: boolean) => void; texto: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-dim">
      <input type="checkbox" checked={marcado} onChange={(e) => onChange(e.target.checked)} className="accent-[#8013a8]" />
      {texto}
    </label>
  );
}
