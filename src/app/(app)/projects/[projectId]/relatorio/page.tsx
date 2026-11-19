import Link from "next/link";
import { FileBarChart } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertProjectAccess } from "@/lib/permissions";
import { nomeDoMes, numero, comSinal } from "@/lib/relatorio";
import { NovoRelatorio, ContaInstagram } from "@/components/relatorio/Controles";

export default async function RelatorioListaPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const { projectId } = await params;
  const sp = await searchParams;
  const retorno = Object.fromEntries(
    ["ig", "conta", "motivo", "outras"].map((k) => [k, typeof sp[k] === "string" ? sp[k] : undefined]),
  );
  await assertProjectAccess(user, projectId, false);

  const [relatorios, conta] = await Promise.all([
    db.relatorioMensal.findMany({
      where: { projectId },
      orderBy: [{ ano: "desc" }, { mes: "desc" }],
      select: {
        id: true,
        ano: true,
        mes: true,
        alcance: true,
        seguidores: true,
        seguidoresDelta: true,
        fonte: true,
        atualizadoEm: true,
      },
    }),
    db.instagramAccount.findUnique({
      where: { projectId },
      select: { username: true, igUserId: true, accessToken: true, conectadoEm: true },
    }),
  ]);

  const porAno = new Map<number, typeof relatorios>();
  for (const r of relatorios) {
    porAno.set(r.ano, [...(porAno.get(r.ano) ?? []), r]);
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-6">
      <div className="mb-6">
        <h1 className="text-[19px] font-semibold tracking-tight">Relatórios de resultados</h1>
        <p className="mt-1 text-[13px] text-muted">
          Uma apresentação por mês, pronta para virar PDF e ir para o cliente.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <NovoRelatorio
          projectId={projectId}
          ocupados={relatorios.map((r) => `${r.ano}-${r.mes}`)}
          contaConectada={!!(conta?.igUserId && conta?.accessToken)}
        />
        <ContaInstagram
          projectId={projectId}
          inicial={
            conta
              ? {
                  username: conta.username,
                  conectada: !!(conta.igUserId && conta.accessToken),
                  conectadoEm: conta.conectadoEm
                    ? conta.conectadoEm.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
                    : null,
                }
              : null
          }
          retorno={retorno}
        />
      </div>

      {relatorios.length === 0 ? (
        <div className="card mt-6 p-10 text-center">
          <FileBarChart className="mx-auto h-6 w-6 text-faint" />
          <p className="mt-3 text-[13px] text-muted">Nenhum relatório ainda.</p>
          <p className="mt-1 text-[12px] text-faint">
            Crie o do mês passado para começar o histórico — os gráficos comparativos do ano
            se montam sozinhos conforme os meses forem entrando.
          </p>
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-7">
          {[...porAno.entries()].map(([ano, itens]) => (
            <section key={ano}>
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                {ano}
              </h2>
              <div className="overflow-hidden rounded-[10px] border border-line">
                {itens.map((r, i) => (
                  <Link
                    key={r.id}
                    href={`/projects/${projectId}/relatorio/${r.id}`}
                    className={`flex flex-wrap items-center gap-x-6 gap-y-1 bg-graphite px-4 py-3 transition hover:bg-surface ${
                      i > 0 ? "border-t border-line" : ""
                    }`}
                  >
                    <span className="w-28 shrink-0 text-[13px] font-medium">
                      {nomeDoMes(r.mes)}
                    </span>
                    <span className="text-[12px] tabular-nums text-dim">
                      {numero(r.alcance)}{" "}
                      <span className="text-faint">de alcance</span>
                    </span>
                    <span className="text-[12px] tabular-nums text-dim">
                      {numero(r.seguidores)}{" "}
                      <span className="text-faint">seguidores</span>
                    </span>
                    <span
                      className={`text-[12px] tabular-nums ${
                        r.seguidoresDelta >= 0 ? "text-ok" : "text-warn"
                      }`}
                    >
                      {comSinal(r.seguidoresDelta)}
                    </span>
                    <span className="ml-auto text-[10.5px] uppercase tracking-[0.1em] text-faint">
                      {r.fonte === "api"
                        ? "API"
                        : r.fonte === "misto"
                          ? "API + manual"
                          : "manual"}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
