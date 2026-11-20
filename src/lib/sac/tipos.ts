import type { SacStatus } from "./core";

/* Formas que trafegam do servidor para os componentes do SAC (datas em ISO). */

export type TipoTag = "canal" | "categoria" | "evento" | "prioridade";

export type TagSac = {
  slug: string;
  type: TipoTag;
  label: string;
  aliases: string[];
  color: string | null;
  active: boolean;
  sort: number;
};

export type CardSac = {
  id: string;
  status: SacStatus;
  titulo: string;
  canal: string | null;
  categoria: string | null;
  evento: string | null;
  prioridade: string | null;
  tagsDesconhecidas: string[];
  temLegenda: boolean;
  senderName: string | null;
  receivedAt: string;
  resolvedAt: string | null;
  ordem: string;
  capa: string | null;
  anexos: number;
  comentarios: number;
};

export type FiltrosSac = {
  q: string;
  canal: string;
  categoria: string;
  evento: string;
  prioridade: string;
  /** "" = padrão (abertos + resolvidos dos últimos 7 dias) | "7" | "30" | "90" | "tudo" */
  periodo: string;
  arquivados: boolean;
};

export type ConexaoSac = {
  estado: "open" | "close" | "connecting" | "inexistente" | "sem-config" | "erro";
  grupo: string | null;
  mensagem?: string;
};

export type Contagem = { slug: string; label: string; color: string | null; total: number };

export type MetricasSac = {
  dias: number;
  recebidos: number;
  resolvidos: number;
  primeiraRespostaMin: number | null;
  resolucaoMin: number | null;
  porCanal: Contagem[];
  porCategoria: Contagem[];
  porEvento: Contagem[];
};

export const COLUNAS: { status: SacStatus; nome: string }[] = [
  { status: "novo", nome: "Aguardando resposta" },
  { status: "respondido_grupo", nome: "Respondido no grupo" },
  { status: "resolvido", nome: "Resolvido" },
  { status: "arquivado", nome: "Arquivados" },
];

export const NOME_STATUS: Record<SacStatus, string> = {
  novo: "Aguardando resposta",
  respondido_grupo: "Respondido no grupo",
  resolvido: "Resolvido",
  arquivado: "Arquivado",
};

export const NOME_TIPO: Record<TipoTag, string> = {
  canal: "Canal",
  categoria: "Categoria",
  evento: "Evento",
  prioridade: "Prioridade",
};
