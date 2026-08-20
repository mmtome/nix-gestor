"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AtSign, Loader2, Plus } from "lucide-react";
import { criarRelatorio, salvarContaInstagram } from "@/actions/relatorio";
import { MESES } from "@/lib/relatorio";

/* --------------------------------------------------------- novo relatório */

export function NovoRelatorio({
  projectId,
  ocupados,
}: {
  projectId: string;
  /** "ano-mes" dos relatórios que já existem, para não oferecer duplicata. */
  ocupados: string[];
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
      router.push(`/projects/${projectId}/relatorio/${r.id}`);
    });
  }

  return (
    <div className="card p-5">
      <h2 className="text-[13px] font-semibold tracking-tight">Novo relatório</h2>
      <p className="mt-0.5 text-[11.5px] text-muted">
        Um relatório por mês. Ele nasce vazio e você preenche ou importa da API.
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
          Criar
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

export function ContaInstagram({
  projectId,
  inicial,
}: {
  projectId: string;
  inicial: { username: string; igUserId: string; temToken: boolean } | null;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [username, setUsername] = useState(inicial?.username ?? "");
  const [token, setToken] = useState("");
  const [resultado, setResultado] = useState<
    { tom: "ok" | "erro"; texto: string } | null
  >(null);
  const [salvando, iniciar] = useTransition();

  function salvar() {
    setResultado(null);
    iniciar(async () => {
      const r = await salvarContaInstagram(projectId, {
        username,
        // Campo em branco mantém o token atual em vez de apagá-lo.
        ...(token ? { accessToken: token } : {}),
      });
      if (!r.ok) {
        setResultado({ tom: "erro", texto: r.erro });
        return;
      }
      setToken("");
      setResultado({
        tom: "ok",
        texto: r.igUserId
          ? `Conectado como @${r.username} (id ${r.igUserId}).`
          : "Conta salva.",
      });
      router.refresh();
    });
  }

  const conectada = !!inicial?.igUserId && !!inicial?.temToken;

  return (
    <div className="card p-5">
      <div className="flex items-start gap-2">
        <AtSign className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-semibold tracking-tight">Conta do Instagram</h2>
          <p className="mt-0.5 text-[11.5px] text-muted">
            {conectada
              ? `@${inicial.username} conectada — o botão “Importar da API” aparece dentro do relatório.`
              : "Sem conta conectada. Os relatórios funcionam normalmente no modo manual."}
          </p>
        </div>
        <button onClick={() => setAberto((v) => !v)} className="btn-ghost shrink-0">
          {aberto ? "Fechar" : conectada ? "Editar" : "Conectar"}
        </button>
      </div>

      {aberto && (
        <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="mb-1 block text-[11px] font-medium text-dim">Usuário</span>
              <input
                className="field"
                placeholder="uberabarodeoshow"
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/^@/, ""))}
              />
            </label>
            <div>
              <span className="mb-1 block text-[11px] font-medium text-dim">
                Instagram User ID
              </span>
              <p className="field tabular-nums text-faint">
                {inicial?.igUserId || "preenchido a partir do token"}
              </p>
            </div>
          </div>

          <label>
            <span className="mb-1 block text-[11px] font-medium text-dim">
              Token de acesso de longa duração
            </span>
            <input
              className="field"
              type="password"
              placeholder={inicial?.temToken ? "•••••• (deixe em branco para manter)" : "IGAA..."}
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </label>

          <p className="text-[11px] leading-relaxed text-faint">
            Cole o token e o app pergunta à Meta de quem ele é — o User ID vem daí, então não
            há como errar de conta. O token precisa dos escopos{" "}
            <code>instagram_business_basic</code> e{" "}
            <code>instagram_business_manage_insights</code>, mais{" "}
            <code>instagram_business_content_publish</code> se for publicar. A conta precisa ser
            Business ou Creator.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <button onClick={salvar} disabled={salvando || !username} className="btn-primary">
              {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Salvar conta
            </button>
            {resultado && (
              <span
                className={`text-[11.5px] ${resultado.tom === "ok" ? "text-ok" : "text-warn"}`}
              >
                {resultado.texto}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
