import "server-only";
import type { CredenciaisEvolution } from "./config";

/**
 * Cliente da Evolution API v2.3.7 (self-hosted). Ela mantém o número do SAC
 * conectado como um "aparelho conectado" do WhatsApp — o mesmo que o WhatsApp
 * Web — e manda cada mensagem para /api/sac/webhook.
 *
 * Autenticação: cabeçalho `apikey` com a chave global (AUTHENTICATION_API_KEY
 * do servidor da Evolution).
 */

export class ErroEvolution extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
    this.name = "ErroEvolution";
  }
}

/** Eventos que o gestor pede para receber. */
export const EVENTOS_WEBHOOK = ["MESSAGES_UPSERT", "CONNECTION_UPDATE"];

/** Configuração da instância exigida pela spec (seção 9). */
const AJUSTES = {
  rejectCall: false, // nunca recusar ligação de cliente
  msgCall: "",
  groupsIgnore: false, // senão o grupo não chega
  alwaysOnline: false, // senão o celular para de notificar
  readMessages: false, // o cliente não pode ver "lida" por causa do gestor
  readStatus: false,
  syncFullHistory: false,
};

async function chamar<T>(
  c: CredenciaisEvolution,
  metodo: "GET" | "POST" | "DELETE",
  caminho: string,
  corpo?: unknown,
  timeout = 20_000,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${c.url}${caminho}`, {
      method: metodo,
      headers: { apikey: c.chave, ...(corpo ? { "Content-Type": "application/json" } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(timeout),
      cache: "no-store",
    });
  } catch (e) {
    const tempo = e instanceof Error && e.name === "TimeoutError";
    throw new ErroEvolution(
      tempo ? "A Evolution não respondeu a tempo." : `Não foi possível falar com a Evolution (${c.url}).`,
    );
  }
  const texto = await res.text();
  let json: unknown = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    // resposta sem JSON: a mensagem de erro usa o texto
  }
  if (!res.ok) {
    const j = json as { response?: { message?: unknown }; message?: unknown } | null;
    const msg = j?.response?.message ?? j?.message ?? texto.slice(0, 200);
    const detalhe = Array.isArray(msg) ? msg.flat().join("; ") : String(msg || res.statusText);
    if (res.status === 401) throw new ErroEvolution("A Evolution recusou a chave (apikey).", 401);
    throw new ErroEvolution(`Evolution respondeu ${res.status}: ${detalhe}`, res.status);
  }
  return json as T;
}

const inst = (c: CredenciaisEvolution) => encodeURIComponent(c.instancia);

export type EstadoConexao = "open" | "close" | "connecting" | "inexistente";

export async function estadoConexao(c: CredenciaisEvolution, timeout = 6_000): Promise<EstadoConexao> {
  try {
    const r = await chamar<{ instance?: { state?: string } }>(
      c,
      "GET",
      `/instance/connectionState/${inst(c)}`,
      undefined,
      timeout,
    );
    const s = r?.instance?.state;
    return s === "open" || s === "connecting" ? s : s ? "close" : "inexistente";
  } catch (e) {
    if (e instanceof ErroEvolution && e.status === 404) return "inexistente";
    throw e;
  }
}

/** Cria a instância se faltar e aplica os ajustes e o webhook (pode repetir). */
export async function prepararInstancia(c: CredenciaisEvolution, webhookUrl: string) {
  if ((await estadoConexao(c)) === "inexistente") {
    await chamar(c, "POST", "/instance/create", {
      instanceName: c.instancia,
      integration: "WHATSAPP-BAILEYS",
      qrcode: false,
      ...AJUSTES,
    });
  }
  await chamar(c, "POST", `/settings/set/${inst(c)}`, AJUSTES);
  await chamar(c, "POST", `/webhook/set/${inst(c)}`, {
    webhook: {
      enabled: true,
      url: webhookUrl,
      byEvents: false,
      base64: true,
      events: EVENTOS_WEBHOOK,
    },
  });
}

/** QR code para conectar o número (ou aviso de que já está conectado). */
export async function qrCode(
  c: CredenciaisEvolution,
): Promise<{ conectado: true } | { conectado: false; imagem: string | null }> {
  const r = await chamar<{ base64?: string; instance?: { state?: string } }>(
    c,
    "GET",
    `/instance/connect/${inst(c)}`,
    undefined,
    30_000,
  );
  if (r?.instance?.state === "open") return { conectado: true };
  return { conectado: false, imagem: r?.base64 ?? null };
}

export async function desconectar(c: CredenciaisEvolution) {
  await chamar(c, "DELETE", `/instance/logout/${inst(c)}`);
}

export async function listarGrupos(c: CredenciaisEvolution) {
  const r = await chamar<{ id?: string; subject?: string; size?: number }[]>(
    c,
    "GET",
    `/group/fetchAllGroups/${inst(c)}?getParticipants=false`,
    undefined,
    45_000,
  );
  return (Array.isArray(r) ? r : [])
    .filter((g): g is { id: string; subject?: string; size?: number } => !!g.id)
    .map((g) => ({ jid: g.id, nome: g.subject || g.id, pessoas: g.size ?? null }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** A imagem de uma mensagem, quando o webhook chegou sem o base64. */
export async function baixarMidia(c: CredenciaisEvolution, waMessageId: string) {
  const r = await chamar<{ base64?: string; mimetype?: string }>(
    c,
    "POST",
    `/chat/getBase64FromMediaMessage/${inst(c)}`,
    { message: { key: { id: waMessageId } }, convertToMp4: false },
    45_000,
  );
  return r?.base64 ? { base64: r.base64, mimetype: r.mimetype } : null;
}

/** Reage no print do grupo ("" tira a reação). */
export async function reagir(
  c: CredenciaisEvolution,
  key: { remoteJid: string; fromMe: boolean; id: string },
  emoji: string,
) {
  await chamar(c, "POST", `/message/sendReaction/${inst(c)}`, { key, reaction: emoji });
}
