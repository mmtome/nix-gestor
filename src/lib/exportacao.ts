import { descobrirDono, lerMensagem, resumirDirect, corrigirTexto } from "./direct";
import type { ConversaBruta, MensagemBruta } from "./direct";

/* ============================================================================
   Leitura do arquivo de "Exportar suas informações", no navegador.

   Aceita o .zip (ou as várias partes, quando a Meta divide) e também a pasta
   já descompactada. Do zip só são abertas as conversas (message_N.json): as
   fotos e os vídeos que vêm junto nem saem do disco, por isso um arquivo de
   alguns gigas é lido em segundos.
   ========================================================================== */

/** your_instagram_activity/messages/inbox/fulano_123/message_1.json */
const CONVERSA = /(?:^|\/)messages\/(inbox|message_requests)\/([^/]+)\/message_\d+\.json$/i;
const CONVERSA_HTML = /(?:^|\/)messages\/(inbox|message_requests)\/[^/]+\/message_\d+\.html$/i;

type Bruto = { participants?: { name?: unknown }[]; messages?: Record<string, unknown>[] };

export async function lerExportacao(arquivos: File[], avisar: (etapa: string) => void) {
  const conversas = new Map<string, ConversaBruta>();
  let html = 0;
  let lidos = 0;

  const juntar = (caminho: string, texto: string) => {
    const m = caminho.replace(/\\/g, "/").match(CONVERSA);
    if (!m) return;
    const [, pasta, pastaConversa] = m;
    const id = `${pasta}/${pastaConversa}`;
    let bruto: Bruto;
    try {
      bruto = JSON.parse(texto);
    } catch {
      return;
    }
    const c = conversas.get(id) ?? {
      id,
      pasta: pasta.toLowerCase() as ConversaBruta["pasta"],
      participantes: [],
      mensagens: [] as MensagemBruta[],
    };
    for (const p of bruto.participants ?? []) {
      const nome = corrigirTexto(p?.name);
      if (nome && !c.participantes.includes(nome)) c.participantes.push(nome);
    }
    for (const raw of bruto.messages ?? []) {
      const msg = raw && typeof raw === "object" ? lerMensagem(raw) : null;
      if (msg) c.mensagens.push(msg);
    }
    conversas.set(id, c);
    if (++lidos % 200 === 0) avisar(`Lendo as conversas… ${lidos.toLocaleString("pt-BR")}`);
  };

  for (const arquivo of arquivos) {
    const caminho = arquivo.webkitRelativePath || arquivo.name;
    if (/\.zip$/i.test(arquivo.name)) {
      avisar(`Abrindo ${arquivo.name}…`);
      const { BlobReader, ZipReader, TextWriter, configure } = await import("@zip.js/zip.js");
      // Sem worker: o Next não serve o script dele, e o JSON é leve.
      configure({ useWebWorkers: false });
      const zip = new ZipReader(new BlobReader(arquivo));
      try {
        for (const entrada of await zip.getEntries()) {
          if (entrada.directory) continue;
          if (CONVERSA_HTML.test(entrada.filename)) html++;
          if (!CONVERSA.test(entrada.filename)) continue;
          juntar(entrada.filename, await entrada.getData(new TextWriter()));
        }
      } finally {
        await zip.close();
      }
    } else if (CONVERSA.test(caminho.replace(/\\/g, "/"))) {
      juntar(caminho, await arquivo.text());
    } else if (CONVERSA_HTML.test(caminho.replace(/\\/g, "/"))) {
      html++;
    }
  }

  if (!conversas.size) {
    throw new Error(
      html
        ? "O arquivo veio em HTML. Peça a exportação de novo escolhendo o formato JSON."
        : "Nenhuma conversa do Direct encontrada. Confira se a exportação incluiu “Mensagens”.",
    );
  }

  avisar(`Contando ${conversas.size.toLocaleString("pt-BR")} conversas…`);
  // Respiro para a tela mostrar a etapa antes da conta, que trava o navegador por um instante.
  await new Promise((r) => setTimeout(r, 30));

  const lista = [...conversas.values()];
  const dono = descobrirDono(lista);
  const meses = resumirDirect(lista, dono);
  return {
    dono,
    conversas: lista.length,
    mensagens: lista.reduce((s, c) => s + c.mensagens.length, 0),
    meses: meses.sort((a, b) => a.ano - b.ano || a.mes - b.mes),
  };
}
