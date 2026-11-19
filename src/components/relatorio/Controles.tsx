"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AtSign, Loader2, Plus } from "lucide-react";
import { criarRelatorio, desconectarInstagram } from "@/actions/relatorio";
import { MESES } from "@/lib/relatorio";

/* --------------------------------------------------------- novo relatório */

export function NovoRelatorio({
  projectId,
  ocupados,
  contaConectada,
}: {
  projectId: string;
  /** "ano-mes" dos relatórios que já existem, para não oferecer duplicata. */
  ocupados: string[];
  /** Com conta conectada, o relatório já abre puxando tudo da API. */
  contaConectada: boolean;
}) {
  const router = useRouter();
  const hoje = new Date();
  // O relatório fecha o mês anterior — é esse o padrão do fluxo da agência.
  const anterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);

  const [ano, setAno] = useState(anterior.getFullYear());
  const [mes, setMes] = useState(anterior.getMonth() + 1);
  const [erro, setErro] = useState<string | null>(null);
  const [criando, iniciar] = useTransition();

  const jaExiste = ocupados.includes(`${ano}-${mes}`);
  const anos = [hoje.getFullYear() + 1, hoje.getFullYear(), hoje.getFullYear() - 1];

  function criar() {
    setErro(null);
    iniciar(async () => {
      const r = await criarRelatorio(projectId, ano, mes);
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível criar.");
        return;
      }
      const gerar = contaConectada && !r.jaExistia ? "?gerar=1" : "";
      router.push(`/projects/${projectId}/relatorio/${r.id}${gerar}`);
    });
  }

  return (
    <div className="card p-5">
      <h2 className="text-[13px] font-semibold tracking-tight">Novo relatório</h2>
      <p className="mt-0.5 text-[11.5px] text-muted">
        {contaConectada
          ? "Escolha o mês: o relatório abre no modelo da agência já com os números da Meta, os meses anteriores do ano para o comparativo e um rascunho da conclusão."
          : "Um relatório por mês. Sem conta conectada, ele nasce vazio para preencher à mão."}
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="min-w-0">
          <span className="mb-1 block text-[11px] font-medium text-dim">Mês</span>
          <select className="field w-40" value={mes} onChange={(e) => setMes(Number(e.target.value))}>
            {MESES.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </label>

        <label className="min-w-0">
          <span className="mb-1 block text-[11px] font-medium text-dim">Ano</span>
          <select className="field w-28" value={ano} onChange={(e) => setAno(Number(e.target.value))}>
            {anos.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>

        <button onClick={criar} disabled={criando || jaExiste} className="btn-primary py-2">
          {criando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          {contaConectada ? "Gerar relatório" : "Criar"}
        </button>
      </div>

      {jaExiste && (
        <p className="mt-2 text-[11.5px] text-warn">
          Já existe relatório de {MESES[mes - 1]} de {ano} — abra pela lista ao lado.
        </p>
      )}
      {erro && <p className="mt-2 text-[11.5px] text-accent">{erro}</p>}
    </div>
  );
}

/* ------------------------------------------------------- conta do Instagram */

export type RetornoConexao = {
  ig?: string;
  conta?: string;
  motivo?: string;
  outras?: string;
};

export function ContaInstagram({
  projectId,
  inicial,
  retorno,
}: {
  projectId: string;
  inicial: { username: string; conectada: boolean; conectadoEm: string | null } | null;
  /** O que o /api/instagram/callback mandou de volta na URL. */
  retorno: RetornoConexao;
}) {
  const router = useRouter();
  const [confirmar, setConfirmar] = useState(false);
  const [desligando, iniciar] = useTransition();

  const conectada = !!inicial?.conectada;
  const conectar = `/api/instagram/conectar?projeto=${encodeURIComponent(projectId)}`;

  function desconectar() {
    iniciar(async () => {
      await desconectarInstagram(projectId);
      setConfirmar(false);
      router.replace(`/projects/${projectId}/relatorio`);
      router.refresh();
    });
  }

  return (
    <div className="card p-5">
      <div className="flex items-start gap-2">
        <AtSign className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-semibold tracking-tight">Conta do Instagram</h2>
          <p className="mt-0.5 text-[11.5px] text-muted">
            {conectada
              ? `@${inicial!.username} conectada${
                  inicial!.conectadoEm ? ` em ${inicial!.conectadoEm}` : ""
                } — o botão “Importar da API” aparece dentro do relatório.`
              : "Sem conta conectada. Os relatórios funcionam normalmente no modo manual."}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <a href={conectar} className={conectada ? "btn-ghost" : "btn-primary"}>
          {conectada ? "Reconectar" : "Conectar com Instagram"}
        </a>
        {conectada &&
          (confirmar ? (
            <>
              <button onClick={desconectar} disabled={desligando} className="btn-ghost text-warn">
                {desligando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Confirmar desconexão
              </button>
              <button onClick={() => setConfirmar(false)} className="btn-ghost">
                Cancelar
              </button>
            </>
          ) : (
            <button onClick={() => setConfirmar(true)} className="btn-ghost">
              Desconectar
            </button>
          ))}
      </div>

      {retorno.ig === "ok" && (
        <p className="mt-3 text-[11.5px] text-ok">
          Conectado como @{retorno.conta}.
          {retorno.outras &&
            ` O login também trouxe ${retorno.outras
              .split(",")
              .map((u) => "@" + u)
              .join(", ")}, que ficaram de fora deste projeto.`}
        </p>
      )}
      {retorno.ig === "erro" && (
        <p className="mt-3 text-[11.5px] text-warn">{retorno.motivo}</p>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-faint">
        Abre o login da Meta: entre com o Instagram do cliente (ou com o Facebook de quem
        acessa o portfólio dele), escolha o portfólio e a conta e permita. A conta precisa ser
        profissional e, enquanto o app estiver em desenvolvimento, testadora do app NIX Gestor.
      </p>
    </div>
  );
}
