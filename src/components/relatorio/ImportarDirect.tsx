"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderOpen, Loader2, MessageCircle, Upload } from "lucide-react";
import { salvarDirect } from "@/actions/relatorio";
import { lerExportacao } from "@/lib/exportacao";
import { MESES_CURTOS } from "@/lib/relatorio";

/* ============================================================================
   Importa o Direct do arquivo de "Exportar suas informações" — opcional: a
   coleta pela API (lib/directApi.ts) já preenche os meses sozinha. O arquivo
   completa o que ela não alcança: o passado distante, ligações e solicitações.

   A leitura acontece aqui, no navegador: o servidor recebe só os números de
   cada mês. Por isso o arquivo pode ter gigas (vem com as fotos do Direct) —
   nada dele é enviado.
   ========================================================================== */

export type ResumoDirect = { de: string; ate: string; meses: number; atualizado: string } | null;

const rotulo = (ano: number, mes: number) => `${MESES_CURTOS[mes - 1].toLowerCase()}/${ano}`;

export function ImportarDirect({
  projectId,
  resumo,
}: {
  projectId: string;
  resumo?: ResumoDirect;
}) {
  const router = useRouter();
  const zip = useRef<HTMLInputElement>(null);
  const pasta = useRef<HTMLInputElement>(null);
  const [etapa, setEtapa] = useState<string | null>(null);
  const [fim, setFim] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);

  // `webkitdirectory` não está nos tipos do React; vai direto no elemento.
  useEffect(() => {
    pasta.current?.setAttribute("webkitdirectory", "");
  }, []);

  async function importar(lista: FileList | null) {
    const arquivos = [...(lista ?? [])];
    if (!arquivos.length) return;
    setFim(null);
    setEtapa("Abrindo o arquivo…");
    try {
      const r = await lerExportacao(arquivos, setEtapa);
      if (!r.meses.length) throw new Error("O arquivo não tem nenhuma mensagem.");
      setEtapa(`Salvando ${r.meses.length} meses…`);
      for (let i = 0; i < r.meses.length; i += 24) {
        const s = await salvarDirect(projectId, r.meses.slice(i, i + 24));
        if (!s.ok) throw new Error(s.erro);
      }
      const a = r.meses[0];
      const b = r.meses.at(-1)!;
      setFim({
        tom: "ok",
        texto: `Direct de ${rotulo(a.ano, a.mes)} a ${rotulo(b.ano, b.mes)} importado: ${r.conversas.toLocaleString(
          "pt-BR",
        )} conversas. Os slides aparecem no relatório de cada mês.`,
      });
      router.refresh();
    } catch (e) {
      setFim({ tom: "erro", texto: e instanceof Error ? e.message : "Não foi possível ler o arquivo." });
    } finally {
      setEtapa(null);
      if (zip.current) zip.current.value = "";
      if (pasta.current) pasta.current.value = "";
    }
  }

  const entradas = (
    <>
      <input
        ref={zip}
        type="file"
        accept=".zip,application/zip"
        multiple
        className="hidden"
        onChange={(e) => importar(e.target.files)}
      />
      <input ref={pasta} type="file" multiple className="hidden" onChange={(e) => importar(e.target.files)} />
    </>
  );

  return (
    <div className="card p-5 lg:col-span-2">
      {entradas}
      <div className="flex items-start gap-2">
        <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-semibold tracking-tight">Direct</h2>
          <p className="mt-0.5 text-[11.5px] text-muted">
            Automático: com a conta conectada, o gestor lê o Direct de hora em hora e o relatório de
            cada mês já sai com mensagens, conversas, tempo de resposta, assuntos, dúvidas e o
            comparativo com o ano anterior.
            {resumo && ` Há Direct de ${resumo.de} a ${resumo.ate}, atualizado em ${resumo.atualizado}.`}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button onClick={() => zip.current?.click()} disabled={!!etapa} className="btn-ghost">
          {etapa ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          Importar arquivo (.zip)
        </button>
        <button onClick={() => pasta.current?.click()} disabled={!!etapa} className="btn-ghost">
          <FolderOpen className="h-3.5 w-3.5" /> Pasta já descompactada
        </button>
        {etapa && <span className="text-[11.5px] text-muted">{etapa}</span>}
      </div>

      {fim && <p className={`mt-3 text-[11.5px] ${fim.tom === "ok" ? "text-ok" : "text-warn"}`}>{fim.texto}</p>}

      <p className="mt-3 text-[11px] leading-relaxed text-faint">
        Opcional — o arquivo exportado completa o que a API não dá: os meses de antes da coleta
        (com conversas longas inteiras), as ligações e as solicitações de mensagem. No Instagram do
        cliente: Central de Contas → Suas informações e permissões → Exportar suas
        informações → Criar exportação → a conta → Exportar para o dispositivo → Personalizar
        informações: só <b>Mensagens</b> · Período: <b>Desde o início</b> · Formato: <b>JSON</b> ·
        Qualidade da mídia: baixa. A Meta avisa por e-mail quando fica pronto. O arquivo é lido aqui
        no navegador: o texto das mensagens não vai para o gestor, só as contagens de cada mês.
      </p>
    </div>
  );
}
