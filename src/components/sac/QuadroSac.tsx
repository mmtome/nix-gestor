"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BarChart3, Clock, Images, MessageSquare, Plus, Search, Settings, WifiOff, X } from "lucide-react";
import { compareOrder } from "@/lib/ordering";
import { orderBetween, orderTop, type SacStatus } from "@/lib/sac/core";
import {
  COLUNAS,
  type CardSac,
  type ConexaoSac,
  type Contagem,
  type FiltrosSac,
  type MetricasSac,
  type TagSac,
  type TipoTag,
} from "@/lib/sac/tipos";
import { moverCardSac } from "@/actions/sac";
import { CadastrarTag, Selo, corDoPrazo, duracao, ha } from "./pecas";
import { DetalheSac } from "./DetalheSac";

/* ============================================================================
   Quadro do SAC (seção 7 da spec): Aguardando resposta · Respondido no grupo ·
   Resolvido (+ Arquivados, se pedido). Os prints chegam sozinhos pelo webhook;
   a tela se atualiza a cada 15 s.
   ========================================================================== */

const TIPOS: TipoTag[] = ["canal", "categoria", "evento", "prioridade"];

type Movido = { status: SacStatus; ordem: string };

export function QuadroSac({
  cards,
  tags,
  filtros,
  sla,
  conexao,
  metricas,
  admin,
}: {
  cards: CardSac[];
  tags: TagSac[];
  filtros: FiltrosSac;
  sla: { amarelo: number; vermelho: number };
  conexao: ConexaoSac;
  metricas: MetricasSac;
  admin: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [, start] = useTransition();

  // Arrastes ficam aqui até o servidor devolver a lista nova.
  const [base, setBase] = useState(cards);
  const [movidos, setMovidos] = useState<Record<string, Movido>>({});
  if (base !== cards) {
    setBase(cards);
    setMovidos({});
  }

  const [arrastando, setArrastando] = useState<CardSac | null>(null);
  const arrastandoRef = useRef(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cadastrar, setCadastrar] = useState<string | null>(null);
  const [verMetricas, setVerMetricas] = useState(false);
  const [busca, setBusca] = useState(filtros.q);
  const buscaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const porSlug = useMemo(() => new Map(tags.map((t) => [t.slug, t])), [tags]);
  const lista = useMemo(() => base.map((c) => (movidos[c.id] ? { ...c, ...movidos[c.id] } : c)), [base, movidos]);
  const colunas = useMemo(
    () =>
      COLUNAS.filter((c) => c.status !== "arquivado" || filtros.arquivados).map((c) => ({
        ...c,
        cards: lista
          .filter((k) => k.status === c.status)
          .sort((a, b) => compareOrder(a.ordem, b.ordem) || compareOrder(a.id, b.id)),
      })),
    [lista, filtros.arquivados],
  );

  const cardAberto = params.get("card");

  // Os prints chegam pelo webhook: a tela busca de novo a cada 15 s.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible" && !arrastandoRef.current) router.refresh();
    }, 15_000);
    return () => clearInterval(t);
  }, [router]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function navegar(muda: (p: URLSearchParams) => void) {
    const p = new URLSearchParams(params.toString());
    muda(p);
    const qs = p.toString();
    router.replace(qs ? `/sac?${qs}` : "/sac", { scroll: false });
  }

  function filtrar(chave: string, valor: string) {
    navegar((p) => (valor ? p.set(chave, valor) : p.delete(chave)));
  }

  function digitarBusca(v: string) {
    setBusca(v);
    if (buscaTimer.current) clearTimeout(buscaTimer.current);
    buscaTimer.current = setTimeout(() => filtrar("q", v.trim()), 400);
  }

  function abrir(id: string | null) {
    navegar((p) => (id ? p.set("card", id) : p.delete("card")));
  }

  function soltar(e: DragEndEvent) {
    arrastandoRef.current = false;
    setArrastando(null);
    const { active, over } = e;
    if (!over) return;
    const id = String(active.id);
    const alvo = String(over.id);
    if (id === alvo) return;
    const card = lista.find((c) => c.id === id);
    if (!card) return;

    // over é uma coluna ("col:<status>") ou outro card: entra logo acima dele.
    let para: SacStatus;
    let sobre: CardSac | undefined;
    if (alvo.startsWith("col:")) {
      para = alvo.slice(4) as SacStatus;
    } else {
      sobre = lista.find((c) => c.id === alvo);
      if (!sobre) return;
      para = sobre.status;
    }
    const coluna = (colunas.find((c) => c.status === para)?.cards ?? []).filter((c) => c.id !== id);
    const idx = sobre ? coluna.findIndex((c) => c.id === sobre!.id) : coluna.length;
    const acima = idx > 0 ? coluna[idx - 1] : null;
    const abaixo = sobre ? coluna[idx] : null;
    const ordem = !acima
      ? orderTop(abaixo?.ordem ?? null)
      : !abaixo
        ? orderBetween(acima.ordem, null)
        : acima.ordem < abaixo.ordem
          ? orderBetween(acima.ordem, abaixo.ordem)
          : orderTop(abaixo.ordem);
    if (card.status === para && card.ordem === ordem) return;

    setMovidos((m) => ({ ...m, [id]: { status: para, ordem } }));
    start(async () => {
      const r = await moverCardSac({ cardId: id, para, ordem });
      if (!r.ok) {
        setAviso(r.erro);
        setMovidos((m) => {
          const n = { ...m };
          delete n[id];
          return n;
        });
      }
      router.refresh();
    });
  }

  const temFiltro = !!(filtros.q || filtros.canal || filtros.categoria || filtros.evento || filtros.prioridade || filtros.periodo);

  return (
    <div className="flex h-full flex-col">
      {/* Cabeçalho e filtros */}
      <div className="border-b border-line px-6 pb-3 pt-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-[20px] font-semibold tracking-tight">SAC</h1>
            <p className="mt-0.5 text-[12.5px] text-muted">
              Prints de dúvidas mandados no grupo do WhatsApp. Reagir ✅ no grupo resolve; responder citando o
              print vira comentário.
            </p>
          </div>
          <button
            onClick={() => setVerMetricas((v) => !v)}
            className={`btn-ghost py-1.5 text-[12px] ${verMetricas ? "border-accent text-text" : ""}`}
          >
            <BarChart3 className="h-3.5 w-3.5" /> Métricas
          </button>
          {admin && (
            <Link href="/sac/configuracoes" className="btn-ghost py-1.5 text-[12px]">
              <Settings className="h-3.5 w-3.5" /> Configurações
            </Link>
          )}
        </div>

        <Conexao conexao={conexao} admin={admin} />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
            <input
              value={busca}
              onChange={(e) => digitarBusca(e.target.value)}
              placeholder="Buscar no título, legenda e respostas"
              className="field w-[280px]! py-1.5! pl-8! text-[12.5px]!"
            />
          </div>
          {TIPOS.map((tipo) => {
            const opcoes = tags.filter((t) => t.type === tipo);
            if (!opcoes.length) return null;
            return (
              <select
                key={tipo}
                value={filtros[tipo]}
                onChange={(e) => filtrar(tipo, e.target.value)}
                className={`field w-auto! py-1.5! text-[12.5px]! ${filtros[tipo] ? "border-accent!" : ""}`}
              >
                <option value="">
                  {tipo === "canal" ? "Todos os canais" : tipo === "categoria" ? "Todas as categorias" : tipo === "evento" ? "Todos os eventos" : "Qualquer prioridade"}
                </option>
                {opcoes.map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.label}
                    {t.active ? "" : " (inativa)"}
                  </option>
                ))}
              </select>
            );
          })}
          <select
            value={filtros.periodo}
            onChange={(e) => filtrar("periodo", e.target.value)}
            className={`field w-auto! py-1.5! text-[12.5px]! ${filtros.periodo ? "border-accent!" : ""}`}
          >
            <option value="">Abertos + resolvidos em 7 dias</option>
            <option value="7">Recebidos em 7 dias</option>
            <option value="30">Recebidos em 30 dias</option>
            <option value="90">Recebidos em 90 dias</option>
            <option value="tudo">Tudo</option>
          </select>
          <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-dim">
            <input
              type="checkbox"
              checked={filtros.arquivados}
              onChange={(e) => filtrar("arquivados", e.target.checked ? "1" : "")}
              className="accent-[#8013a8]"
            />
            Mostrar arquivados
          </label>
          {temFiltro && (
            <button
              onClick={() => {
                setBusca("");
                navegar((p) => {
                  for (const k of ["q", ...TIPOS, "periodo"]) p.delete(k);
                });
              }}
              className="flex items-center gap-1 text-[12px] text-faint transition hover:text-text"
            >
              <X className="h-3 w-3" /> Limpar filtros
            </button>
          )}
        </div>

        {verMetricas && <Metricas m={metricas} />}
        {aviso && (
          <p className="mt-2 text-[12px] text-warn">
            {aviso}{" "}
            <button onClick={() => setAviso(null)} className="underline">
              ok
            </button>
          </p>
        )}
      </div>

      {/* Quadro */}
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={(e: DragStartEvent) => {
          arrastandoRef.current = true;
          setArrastando(lista.find((c) => c.id === String(e.active.id)) ?? null);
        }}
        onDragCancel={() => {
          arrastandoRef.current = false;
          setArrastando(null);
        }}
        onDragEnd={soltar}
      >
        <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden p-5">
          <div className="flex h-full items-start gap-3">
            {colunas.map((c) => (
              <Coluna key={c.status} status={c.status} nome={c.nome} total={c.cards.length}>
                <SortableContext items={c.cards.map((k) => k.id)} strategy={verticalListSortingStrategy}>
                  {c.cards.map((k) => (
                    <Cartao
                      key={k.id}
                      card={k}
                      porSlug={porSlug}
                      sla={sla}
                      onOpen={() => abrir(k.id)}
                      onCadastrar={setCadastrar}
                    />
                  ))}
                </SortableContext>
                {!c.cards.length && (
                  <p className="px-2 py-6 text-center text-[11.5px] text-faint">
                    {c.status === "novo" ? "Nenhuma dúvida esperando resposta." : "Nada por aqui."}
                  </p>
                )}
              </Coluna>
            ))}
          </div>
        </div>

        <DragOverlay>
          {arrastando && (
            <div className="card w-[284px] rotate-2 p-3 text-[12.5px] shadow-2xl">
              {arrastando.titulo || "Sem título"}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <CadastrarTag slug={cadastrar} onClose={() => setCadastrar(null)} />
      {cardAberto && (
        <DetalheSac key={cardAberto} cardId={cardAberto} tags={tags} onClose={() => abrir(null)} />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Conexao({ conexao, admin }: { conexao: ConexaoSac; admin: boolean }) {
  if (conexao.estado === "open" && conexao.grupo) return null;
  const texto =
    conexao.estado === "sem-config"
      ? "O WhatsApp do SAC ainda não está conectado — os prints do grupo não chegam até aqui."
      : conexao.estado === "erro"
        ? `Não foi possível falar com a Evolution: ${conexao.mensagem ?? "erro desconhecido"}.`
        : conexao.estado === "connecting"
          ? "O WhatsApp do SAC está conectando…"
          : conexao.estado === "open"
            ? "WhatsApp conectado, mas falta escolher o grupo do SAC."
            : "WhatsApp desconectado — os prints novos não estão chegando.";
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-[12px] text-warn">
      <WifiOff className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1">{texto}</span>
      {admin ? (
        <Link href="/sac/configuracoes" className="font-semibold underline">
          {conexao.estado === "open" ? "Escolher o grupo" : "Conectar"}
        </Link>
      ) : (
        <span className="text-faint">Peça para um administrador conectar.</span>
      )}
    </div>
  );
}

function Coluna({
  status,
  nome,
  total,
  children,
}: {
  status: SacStatus;
  nome: string;
  total: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status}` });
  return (
    <div className="flex h-full w-[296px] shrink-0 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span
          className={`h-2 w-2 rounded-full ${
            status === "novo" ? "bg-warn" : status === "respondido_grupo" ? "bg-accent" : status === "resolvido" ? "bg-ok" : "bg-faint"
          }`}
        />
        <h3 className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{nome}</h3>
        <span className="text-[11px] text-faint">{total}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`min-h-0 flex-1 overflow-y-auto rounded-lg border p-2 transition ${
          isOver ? "border-accent bg-brand-soft/40" : "border-line bg-graphite/50"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function Cartao({
  card,
  porSlug,
  sla,
  onOpen,
  onCadastrar,
}: {
  card: CardSac;
  porSlug: Map<string, TagSac>;
  sla: { amarelo: number; vermelho: number };
  onOpen: () => void;
  onCadastrar: (slug: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  const aberto = card.status === "novo" || card.status === "respondido_grupo";
  const selos = TIPOS.flatMap((tipo) => (card[tipo] ? [{ tipo, slug: card[tipo]! }] : []));

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      className={`group mb-2 cursor-pointer overflow-hidden rounded-lg border bg-graphite transition hover:border-faint ${
        card.prioridade ? "border-[#ff5a5f]/50" : "border-line"
      } ${isDragging ? "opacity-40" : ""}`}
    >
      {card.capa && (
        <div className="relative bg-ink">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/sac/imagem/${card.capa}`}
            alt=""
            loading="lazy"
            draggable={false}
            className="h-32 w-full object-cover object-top"
          />
          {card.anexos > 1 && (
            <span className="absolute right-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              +{card.anexos - 1}
            </span>
          )}
        </div>
      )}

      <div className="p-2.5">
        {(selos.length > 0 || !card.temLegenda) && (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {selos.map((s) => (
              <Selo key={s.tipo} tipo={s.tipo} slug={s.slug} tag={porSlug.get(s.slug)} />
            ))}
            {!selos.length && (
              <span className="rounded bg-surface px-1.5 py-[1px] text-[10px] text-faint">Sem classificação</span>
            )}
          </div>
        )}

        <p className={`text-[12.5px] leading-snug ${card.titulo ? "text-text" : "italic text-faint"}`}>
          {card.titulo || "Sem título"}
        </p>

        {card.tagsDesconhecidas.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {card.tagsDesconhecidas.map((t) => (
              <button
                key={t}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onCadastrar(t);
                }}
                className="flex items-center gap-0.5 rounded bg-surface px-1.5 py-[1px] text-[10px] text-muted transition hover:bg-surface2 hover:text-text"
                title="Tag ainda não cadastrada — clique para cadastrar"
              >
                #{t} <Plus className="h-2.5 w-2.5" />
              </button>
            ))}
          </div>
        )}

        <div className="mt-2 flex items-center gap-2.5 text-[10.5px] text-faint">
          <span className={`flex items-center gap-1 ${corDoPrazo(card.receivedAt, aberto, sla)}`}>
            <Clock className="h-3 w-3" />
            {ha(card.status === "resolvido" && card.resolvedAt ? card.resolvedAt : card.receivedAt)}
          </span>
          {card.comentarios > 0 && (
            <span className="flex items-center gap-0.5">
              <MessageSquare className="h-3 w-3" />
              {card.comentarios}
            </span>
          )}
          {card.anexos > 1 && (
            <span className="flex items-center gap-0.5">
              <Images className="h-3 w-3" />
              {card.anexos}
            </span>
          )}
          {card.senderName && <span className="ml-auto truncate">{card.senderName}</span>}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Metricas({ m }: { m: MetricasSac }) {
  return (
    <div className="mt-3 grid gap-3 lg:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.3fr)]">
      <Numero rotulo={`Recebidos em ${m.dias} dias`} valor={m.recebidos.toLocaleString("pt-BR")} nota={`${m.resolvidos} resolvidos`} />
      <Numero rotulo="Até a 1ª resposta no grupo" valor={duracao(m.primeiraRespostaMin)} nota="média" />
      <Numero rotulo="Até resolver" valor={duracao(m.resolucaoMin)} nota="média" />
      <div className="card grid grid-cols-3 gap-3 p-3">
        <Barras titulo="Canal" itens={m.porCanal} />
        <Barras titulo="Categoria" itens={m.porCategoria} />
        <Barras titulo="Evento" itens={m.porEvento} />
      </div>
    </div>
  );
}

function Numero({ rotulo, valor, nota }: { rotulo: string; valor: string; nota: string }) {
  return (
    <div className="card p-3">
      <p className="text-[11px] text-faint">{rotulo}</p>
      <p className="mt-1 text-[20px] font-semibold tracking-tight">{valor}</p>
      <p className="text-[11px] text-muted">{nota}</p>
    </div>
  );
}

function Barras({ titulo, itens }: { titulo: string; itens: Contagem[] }) {
  const max = Math.max(1, ...itens.map((i) => i.total));
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-[11px] font-semibold text-dim">{titulo}</p>
      {!itens.length && <p className="text-[11px] text-faint">—</p>}
      {itens.slice(0, 5).map((i) => (
        <div key={i.slug} className="mb-1">
          <div className="flex justify-between gap-2 text-[10.5px]">
            <span className="truncate text-muted">{i.label}</span>
            <span className="text-dim">{i.total}</span>
          </div>
          <div className="mt-0.5 h-1 rounded-full bg-surface">
            <div
              className="h-1 rounded-full"
              style={{ width: `${(i.total / max) * 100}%`, backgroundColor: i.color ?? "#C77BE8" }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
