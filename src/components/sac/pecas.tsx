"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { cadastrarTagSac } from "@/actions/sac";
import { NOME_TIPO, type TagSac, type TipoTag } from "@/lib/sac/tipos";

/* Peças comuns do SAC: selo de tag, tempo relativo, prazo e o cadastro de tag. */

const COR_PADRAO: Record<TipoTag, string> = {
  canal: "#A093AB",
  categoria: "#A093AB",
  evento: "#9BB4FF",
  prioridade: "#FF5A5F",
};

export function Selo({ tag, slug, tipo }: { tag?: TagSac; slug: string; tipo: TipoTag }) {
  const cor = tag?.color ?? COR_PADRAO[tipo];
  return (
    <span
      className="inline-flex max-w-full items-center truncate rounded px-1.5 py-[1px] text-[10px] font-medium"
      style={{ backgroundColor: `${cor}24`, color: cor }}
      title={`${NOME_TIPO[tipo]}: ${tag?.label ?? slug}`}
    >
      {tag?.label ?? `#${slug}`}
    </span>
  );
}

/** "há 5 min", "há 2 h", "há 3 dias". */
export function ha(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} ${d === 1 ? "dia" : "dias"}`;
}

/** Cor do prazo (seção 7): normal, amarelo e vermelho conforme as horas sem resposta. */
export function corDoPrazo(iso: string, aberto: boolean, sla: { amarelo: number; vermelho: number }) {
  if (!aberto) return "text-faint";
  const horas = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (horas >= sla.vermelho) return "text-[#ff6b6b]";
  if (horas >= sla.amarelo) return "text-warn";
  return "text-faint";
}

/** "25 min", "3 h 10 min", "2 dias". */
export function duracao(min: number | null): string {
  if (min === null) return "—";
  if (min < 60) return `${Math.max(1, Math.round(min))} min`;
  const h = Math.floor(min / 60);
  if (h < 48) {
    const m = Math.round(min % 60);
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  return `${Math.round(h / 24)} dias`;
}

/** Cadastrar a #palavra que veio na legenda e ainda não existe. */
export function CadastrarTag({
  slug,
  onClose,
}: {
  slug: string | null;
  onClose: () => void;
}) {
  return (
    <Modal open={!!slug} onClose={onClose} title={`Cadastrar #${slug ?? ""}`} width="max-w-md">
      {slug && <FormTag key={slug} slug={slug} onClose={onClose} />}
    </Modal>
  );
}

function FormTag({ slug, onClose }: { slug: string; onClose: () => void }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoTag>("evento");
  const [nome, setNome] = useState(slug.charAt(0).toUpperCase() + slug.slice(1));
  const [apelidos, setApelidos] = useState("");
  const [cor, setCor] = useState("#9BB4FF");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, start] = useTransition();

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await cadastrarTagSac({
        slug,
        type: tipo,
        label: nome,
        aliases: apelidos.split(","),
        color: cor,
      });
      if (!r.ok) return setErro(r.erro);
      onClose();
      router.refresh();
    });
  }

  return (
    <form onSubmit={salvar} className="space-y-3 text-[12.5px]">
      <p className="text-muted">
        Os cards que já vieram com <b className="text-text">#{slug}</b> passam a usar a tag.
      </p>
      <label className="block">
        <span className="mb-1 block text-[11px] text-faint">Tipo</span>
        <select className="field" value={tipo} onChange={(e) => setTipo(e.target.value as TipoTag)}>
          {(Object.keys(NOME_TIPO) as TipoTag[]).map((t) => (
            <option key={t} value={t}>
              {NOME_TIPO[t]}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] text-faint">Nome que aparece no card</span>
        <input className="field" value={nome} onChange={(e) => setNome(e.target.value)} />
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] text-faint">Outras formas de escrever (separe por vírgula)</span>
        <input className="field" value={apelidos} onChange={(e) => setApelidos(e.target.value)} />
      </label>
      <label className="flex items-center gap-2">
        <input type="color" value={cor} onChange={(e) => setCor(e.target.value)} className="h-7 w-10 rounded bg-transparent" />
        <span className="text-[11px] text-faint">Cor do selo</span>
      </label>
      {erro && <p className="text-warn">{erro}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onClose} className="btn-ghost">
          Cancelar
        </button>
        <button type="submit" disabled={pendente} className="btn-primary">
          Cadastrar
        </button>
      </div>
    </form>
  );
}
