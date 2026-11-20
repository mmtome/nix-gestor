import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtTZ } from "@/lib/dates";
import { montarRelatorioSac } from "@/lib/sac/relatorio";
import type { TipoTag } from "@/lib/sac/tipos";
import { RelatorioSac } from "@/components/sac/RelatorioSac";

/* Relatório do SAC: período e filtros na URL; o PDF sai pela impressão do navegador. */

type Busca = Partial<Record<"de" | "ate" | "canal" | "categoria" | "evento", string>>;

const DATA = /^\d{4}-\d{2}-\d{2}$/;

export default async function RelatorioSacPage({ searchParams }: { searchParams: Promise<Busca> }) {
  await requireUser();
  const sp = await searchParams;
  const hoje = fmtTZ(new Date(), "yyyy-MM-dd");
  let de = sp.de && DATA.test(sp.de) ? sp.de : `${hoje.slice(0, 8)}01`;
  let ate = sp.ate && DATA.test(sp.ate) ? sp.ate : hoje;
  if (de > ate) [de, ate] = [ate, de];

  const [dados, tags] = await Promise.all([
    montarRelatorioSac({
      de,
      ate,
      canal: sp.canal ?? "",
      categoria: sp.categoria ?? "",
      evento: sp.evento ?? "",
    }),
    db.sacTag.findMany({ orderBy: [{ type: "asc" }, { sort: "asc" }, { label: "asc" }] }),
  ]);

  return (
    <RelatorioSac
      dados={dados}
      hoje={hoje}
      tags={tags.map((t) => ({ slug: t.slug, type: t.type as TipoTag, label: t.label }))}
    />
  );
}
