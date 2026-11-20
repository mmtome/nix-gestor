"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Copy, MessageCircle, StickyNote, Trash2, X, ZoomIn } from "lucide-react";
import { fmtTZ } from "@/lib/dates";
import { orderTop, type SacStatus } from "@/lib/sac/core";
import { NOME_STATUS, NOME_TIPO, type TagSac, type TipoTag } from "@/lib/sac/tipos";
import {
  detalheCardSac,
  excluirNotaSac,
  moverCardSac,
  notaCardSac,
  reclassificarCardSac,
  type DetalheSac as Detalhe,
} from "@/actions/sac";
import { CadastrarTag, duracao } from "./pecas";

/* ============================================================================
   Detalhe do card (gaveta lateral): galeria, classificação editável, linha do
   tempo com as respostas do grupo e as notas internas, "Copiar resposta" e as
   respostas já dadas em dúvidas parecidas.
   ========================================================================== */

type Card = NonNullable<Detalhe>;

const TIPOS: TipoTag[] = ["canal", "categoria", "evento", "prioridade"];
const STATUS: SacStatus[] = ["novo", "respondido_grupo", "resolvido", "arquivado"];

const quando = (iso: string) => fmtTZ(new Date(iso), "dd/MM 'às' HH:mm");
const minutosEntre = (a: string, b: string | null) =>
  b ? (new Date(b).getTime() - new Date(a).getTime()) / 60_000 : null;

export function DetalheSac({
  cardId,
  tags,
  onClose,
}: {
  cardId: string;
  tags: TagSac[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [card, setCard] = useState<Card | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [foto, setFoto] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [nota, setNota] = useState("");
  const [copiado, setCopiado] = useState<string | null>(null);
  const [cadastrar, setCadastrar] = useState<string | null>(null);
  const [pendente, start] = useTransition();

  const aplicar = useCallback((r: Awaited<ReturnType<typeof detalheCardSac>>) => {
    if (r.ok) {
      setCard(r.card);
      setErro(null);
    } else {
      setErro(r.erro);
    }
  }, []);
  const carregar = useCallback(() => detalheCardSac(cardId).then(aplicar), [cardId, aplicar]);

  // Abre e acompanha: respostas novas no grupo aparecem sozinhas.
  useEffect(() => {
    let vivo = true;
    const buscar = () => detalheCardSac(cardId).then((r) => vivo && aplicar(r));
    buscar();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") buscar();
    }, 15_000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [cardId, aplicar]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || cadastrar) return;
      if (zoom) setZoom(false);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom, cadastrar, onClose]);

  /** Executa a mudança, recarrega o detalhe e o quadro de fundo. */
  function mudar(fn: () => Promise<{ ok: boolean; erro?: string }>) {
    start(async () => {
      const r = await fn();
      if (!r.ok) setErro(r.erro ?? "Não foi possível salvar.");
      await carregar();
      router.refresh();
    });
  }

  function copiar(id: string, texto: string) {
    navigator.clipboard.writeText(texto).then(() => {
      setCopiado(id);
      setTimeout(() => setCopiado((c) => (c === id ? null : c)), 1800);
    });
  }

  // A resposta dos donos: o último comentário do grupo que não é de quem mandou o print.
  const resposta = card
    ? [...card.comentarios].reverse().find((c) => c.fonte === "whatsapp" && !c.doRemetente) ??
      [...card.comentarios].reverse().find((c) => c.fonte === "whatsapp")
    : undefined;

  const linha = card
    ? [
        ...card.comentarios.map((c) => ({ chave: `c${c.id}`, em: c.em, comentario: c, evento: null })),
        ...card.eventos
          .filter((e) => e.tipo !== "comentario")
          .map((e) => ({ chave: `e${e.id}`, em: e.em, comentario: null, evento: e })),
      ].sort((a, b) => a.em.localeCompare(b.em))
    : [];

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 animate-fade" onClick={onClose} />
      <aside className="fixed right-0 top-0 z-50 flex h-screen w-full max-w-[600px] flex-col border-l border-line bg-graphite shadow-2xl animate-drawer">
        <div className="flex items-center gap-2 border-b border-line px-5 py-3">
          {card ? (
            <select
              value={card.status}
              disabled={pendente}
              onChange={(e) => {
                const para = e.target.value as SacStatus;
                mudar(() => moverCardSac({ cardId: card.id, para, ordem: orderTop(null) }));
              }}
              className="field w-auto py-1 text-[12.5px]"
            >
              {STATUS.map((s) => (
                <option key={s} value={s}>
                  {s === "arquivado" ? "Arquivado (fora do quadro)" : NOME_STATUS[s]}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-[12.5px] text-faint">Carregando…</span>
          )}
          <span className="flex-1" />
          <button
            onClick={onClose}
            className="rounded p-1.5 text-muted transition hover:bg-surface hover:text-text"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {erro && !card && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-faint">
            {erro}
            <button className="btn-ghost" onClick={onClose}>
              Fechar
            </button>
          </div>
        )}

        {card && (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8">
            {/* Galeria */}
            {card.anexos.length > 0 && (
              <div className="mt-4">
                <button
                  onClick={() => setZoom(true)}
                  className="group relative block w-full overflow-hidden rounded-lg border border-line bg-ink"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/sac/imagem/${card.anexos[Math.min(foto, card.anexos.length - 1)]}`}
                    alt="Print da dúvida"
                    className="mx-auto max-h-[46vh] object-contain"
                  />
                  <span className="absolute right-2 top-2 rounded bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100">
                    <ZoomIn className="h-4 w-4" />
                  </span>
                </button>
                {card.anexos.length > 1 && (
                  <div className="mt-2 flex gap-1.5 overflow-x-auto">
                    {card.anexos.map((id, i) => (
                      <button
                        key={id}
                        onClick={() => setFoto(i)}
                        className={`h-14 w-14 shrink-0 overflow-hidden rounded border ${
                          i === foto ? "border-accent" : "border-line opacity-70 hover:opacity-100"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/sac/imagem/${id}`} alt="" className="h-full w-full object-cover object-top" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Título e classificação */}
            <input
              key={card.titulo}
              defaultValue={card.titulo}
              placeholder="Sem título"
              maxLength={120}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v !== card.titulo) mudar(() => reclassificarCardSac({ cardId: card.id, titulo: v }));
              }}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              className="mt-4 w-full rounded bg-transparent px-1 py-1 text-[17px] font-semibold tracking-tight outline-none transition placeholder:text-faint hover:bg-surface focus:bg-surface"
            />

            <div className="mt-3 grid grid-cols-2 gap-2">
              {TIPOS.map((tipo) => (
                <label key={tipo} className="block">
                  <span className="mb-1 block text-[11px] text-faint">{NOME_TIPO[tipo]}</span>
                  <select
                    value={card[tipo] ?? ""}
                    disabled={pendente}
                    onChange={(e) =>
                      mudar(() => reclassificarCardSac({ cardId: card.id, [tipo]: e.target.value || null }))
                    }
                    className="field py-1.5 text-[12.5px]"
                  >
                    <option value="">—</option>
                    {tags
                      .filter((t) => t.type === tipo && (t.active || t.slug === card[tipo]))
                      .map((t) => (
                        <option key={t.slug} value={t.slug}>
                          {t.label}
                        </option>
                      ))}
                  </select>
                </label>
              ))}
            </div>

            {card.tagsDesconhecidas.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px] text-faint">
                Tags não cadastradas:
                {card.tagsDesconhecidas.map((t) => (
                  <button
                    key={t}
                    onClick={() => setCadastrar(t)}
                    className="rounded bg-surface px-1.5 py-[1px] text-muted transition hover:bg-surface2 hover:text-text"
                  >
                    #{t} +
                  </button>
                ))}
              </div>
            )}

            <dl className="mt-4 space-y-1 rounded-md border border-line bg-surface/50 px-3 py-2.5 text-[12px]">
              <Linha rotulo="Recebido">
                {quando(card.receivedAt)}
                {card.senderName && ` · ${card.senderName}`}
              </Linha>
              {card.legendaOriginal && <Linha rotulo="Legenda">{card.legendaOriginal}</Linha>}
              <Linha rotulo="1ª resposta">
                {card.firstResponseAt
                  ? `${duracao(minutosEntre(card.receivedAt, card.firstResponseAt))} depois`
                  : "ainda não"}
              </Linha>
              {card.resolvedAt && (
                <Linha rotulo="Resolvido">
                  {quando(card.resolvedAt)}
                  {card.resolvedBy && ` · ${card.resolvedBy}`} ·{" "}
                  {duracao(minutosEntre(card.receivedAt, card.resolvedAt))} depois do print
                </Linha>
              )}
            </dl>

            {resposta && (
              <button
                onClick={() => copiar("resposta", resposta.texto)}
                className="btn-primary mt-3 w-full"
                title="Copia a resposta dos donos para colar para o cliente"
              >
                {copiado === "resposta" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copiado === "resposta" ? "Resposta copiada" : "Copiar resposta"}
              </button>
            )}

            {/* Linha do tempo */}
            <h3 className="mb-2 mt-6 text-[12px] font-semibold uppercase tracking-wider text-faint">
              Histórico
            </h3>
            <ol className="space-y-2">
              {linha.map((item) =>
                item.comentario ? (
                  <li
                    key={item.chave}
                    className={`rounded-lg border px-3 py-2 text-[12.5px] ${
                      item.comentario.fonte === "gestor" ? "border-warn/25 bg-warn/5" : "border-line bg-surface"
                    }`}
                  >
                    <div className="mb-1 flex items-center gap-1.5 text-[11px] text-faint">
                      {item.comentario.fonte === "gestor" ? (
                        <StickyNote className="h-3 w-3 text-warn" />
                      ) : (
                        <MessageCircle className="h-3 w-3 text-ok" />
                      )}
                      <span className="font-medium text-dim">{item.comentario.autor}</span>
                      <span>
                        {item.comentario.fonte === "gestor" ? "nota interna" : "no grupo"} · {quando(item.comentario.em)}
                      </span>
                      <span className="flex-1" />
                      <button
                        onClick={() => copiar(item.chave, item.comentario!.texto)}
                        className="rounded p-0.5 transition hover:bg-surface2 hover:text-text"
                        title="Copiar"
                      >
                        {copiado === item.chave ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      </button>
                      {item.comentario.fonte === "gestor" && (
                        <button
                          onClick={() => mudar(() => excluirNotaSac(item.comentario!.id))}
                          className="rounded p-0.5 transition hover:bg-surface2 hover:text-text"
                          title="Apagar nota"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap leading-relaxed">{item.comentario.texto}</p>
                  </li>
                ) : (
                  <li key={item.chave} className="flex gap-2 px-1 text-[11.5px] text-faint">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-faint" />
                    <span>
                      {descrever(item.evento!)} · {quando(item.em)}
                    </span>
                  </li>
                ),
              )}
            </ol>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const texto = nota.trim();
                if (!texto) return;
                mudar(async () => {
                  const r = await notaCardSac(card.id, texto);
                  if (r.ok) setNota("");
                  return r;
                });
              }}
              className="mt-3"
            >
              <textarea
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Nota interna (fica só no gestor)"
                rows={2}
                className="field resize-y text-[12.5px]"
              />
              <div className="mt-1.5 flex justify-end">
                <button type="submit" disabled={pendente || !nota.trim()} className="btn-ghost py-1 text-[12px]">
                  Adicionar nota
                </button>
              </div>
            </form>

            {card.parecidas.length > 0 && (
              <>
                <h3 className="mb-2 mt-6 text-[12px] font-semibold uppercase tracking-wider text-faint">
                  Respostas já dadas em dúvidas parecidas
                </h3>
                <ul className="space-y-2">
                  {card.parecidas.map((p) => (
                    <li key={p.id} className="rounded-lg border border-line px-3 py-2 text-[12.5px]">
                      <div className="mb-1 flex items-center gap-1.5 text-[11px] text-faint">
                        <span className="truncate">{p.titulo || "Sem título"}</span>
                        <span>· {p.autor}</span>
                        <span className="flex-1" />
                        <button
                          onClick={() => copiar(p.id, p.texto)}
                          className="rounded p-0.5 transition hover:bg-surface2 hover:text-text"
                          title="Copiar"
                        >
                          {copiado === p.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        </button>
                      </div>
                      <p className="whitespace-pre-wrap leading-relaxed text-dim">{p.texto}</p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </aside>

      {zoom && card && card.anexos.length > 0 && (
        <Visualizador
          anexos={card.anexos}
          atual={Math.min(foto, card.anexos.length - 1)}
          onTrocar={setFoto}
          onClose={() => setZoom(false)}
        />
      )}
      <CadastrarTag slug={cadastrar} onClose={() => setCadastrar(null)} />
    </>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-[84px] shrink-0 text-faint">{rotulo}</dt>
      <dd className="min-w-0 flex-1 break-words text-dim">{children}</dd>
    </div>
  );
}

function descrever(e: Card["eventos"][number]): string {
  const para = e.para ? NOME_STATUS[e.para as SacStatus] ?? e.para : "";
  const quem = e.autor ?? "Alguém";
  switch (e.tipo) {
    case "criado":
      return `Print recebido${e.autor ? ` de ${e.autor}` : ""}`;
    case "anexo":
      return "Mais uma foto do álbum";
    case "anexo_removido":
      return "Uma foto foi apagada no WhatsApp";
    case "reclassificado":
      return e.via === "gestor" ? `${quem} mudou a classificação` : "Legenda do álbum aplicada";
    case "status":
      if (e.via === "reacao") return e.emoji ? `${quem} reagiu ${e.emoji} → ${para}` : `${quem} tirou a reação → ${para}`;
      if (e.via === "resposta") return `${quem} respondeu no grupo → ${para}`;
      if (e.via === "gestor") return `${quem} moveu para ${para}`;
      return e.para === "arquivado" ? "O print foi apagado no WhatsApp → Arquivado" : `→ ${para}`;
    default:
      return e.tipo;
  }
}

/** Print em tela cheia; clique amplia, setas trocam de foto. */
function Visualizador({
  anexos,
  atual,
  onTrocar,
  onClose,
}: {
  anexos: string[];
  atual: number;
  onTrocar: (i: number) => void;
  onClose: () => void;
}) {
  const [grande, setGrande] = useState(false);
  const ir = (d: number) => onTrocar((atual + d + anexos.length) % anexos.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") onTrocar((atual + 1) % anexos.length);
      if (e.key === "ArrowLeft") onTrocar((atual - 1 + anexos.length) % anexos.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [atual, anexos.length, onTrocar]);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/90 animate-fade">
      <div className="flex items-center justify-between px-4 py-3 text-[12px] text-white/70">
        <span>
          {atual + 1} de {anexos.length} · clique na imagem para {grande ? "ajustar à tela" : "ampliar"}
        </span>
        <button onClick={onClose} className="rounded p-1.5 transition hover:bg-white/10" aria-label="Fechar">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className={`relative min-h-0 flex-1 ${grande ? "overflow-auto" : "flex items-center justify-center"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/sac/imagem/${anexos[atual]}`}
          alt="Print da dúvida"
          onClick={() => setGrande((g) => !g)}
          className={grande ? "mx-auto max-w-none cursor-zoom-out" : "max-h-full max-w-full cursor-zoom-in object-contain"}
        />
        {anexos.length > 1 && !grande && (
          <>
            <button
              onClick={() => ir(-1)}
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
              aria-label="Anterior"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={() => ir(1)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
              aria-label="Próxima"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
