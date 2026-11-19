import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

/* ============================================================================
   Conexão com a Meta — "Instagram API with Unified Login".

   Desde 2026 a Meta não oferece mais a configuração "com login do Instagram"
   para apps novos: o app da NIX nasceu no login unificado. Na prática:

   - O login abre em www.facebook.com/dialog/oauth com um `config_id` (a
     configuração criada no painel da Meta). A pessoa entra com Instagram ou
     com Facebook, escolhe o portfólio empresarial e a conta.
   - O código volta para /api/instagram/callback e é trocado por um token de
     usuário do sistema (SUAT). Ele não vence e pertence ao portfólio do
     cliente, não a quem fez o login.
   - Tudo é chamado em graph.facebook.com com o id da conta no caminho; `/me`
     aqui é o usuário do sistema, não a conta do Instagram.

   O ID e a chave são os do app da Meta (Configurações do app → Básico), não
   um "Instagram app ID".
   ========================================================================== */

export const GRAPH = "https://graph.facebook.com/v27.0";

/** Tem que ser idêntico ao cadastrado no painel da Meta, byte a byte. */
export const REDIRECT_URI =
  process.env.INSTAGRAM_REDIRECT_URI ?? "https://nix-gestor.vercel.app/api/instagram/callback";

export function appDaMeta() {
  const id = process.env.INSTAGRAM_APP_ID;
  const secret = process.env.INSTAGRAM_APP_SECRET;
  const configId = process.env.INSTAGRAM_CONFIG_ID;
  if (!id || !secret || !configId) return null;
  return { id, secret, configId };
}

export function urlDeLogin(state: string): string | null {
  const app = appDaMeta();
  if (!app) return null;
  const q = new URLSearchParams({
    client_id: app.id,
    config_id: app.configId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    override_default_response_type: "true",
    state,
    // Sempre mostra as duas opções (Instagram e Facebook), mesmo com alguém
    // já logado no Facebook do navegador — é como se conecta conta de cliente.
    prompt: "login",
  });
  return `https://www.facebook.com/dialog/oauth?${q}`;
}

type ErroGraph = { error?: { message?: string } };

async function graph<T>(caminho: string, token: string): Promise<T> {
  const sep = caminho.includes("?") ? "&" : "?";
  const res = await fetch(`${GRAPH}/${caminho}${sep}access_token=${encodeURIComponent(token)}`, {
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as T & ErroGraph;
  if (!res.ok) throw new Error(json.error?.message || `Graph ${res.status}`);
  return json;
}

/** Troca o `code` do login pelo token. Só no servidor: usa a chave secreta. */
export async function trocarCodigo(code: string): Promise<string> {
  const app = appDaMeta();
  if (!app) throw new Error("Faltam INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET ou INSTAGRAM_CONFIG_ID.");
  const q = new URLSearchParams({
    client_id: app.id,
    client_secret: app.secret,
    redirect_uri: REDIRECT_URI,
    code,
  });
  const res = await fetch(`${GRAPH}/oauth/access_token?${q}`, { cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string } & ErroGraph;
  if (!res.ok || !json.access_token) {
    throw new Error(json.error?.message || `A Meta não devolveu o token (${res.status}).`);
  }
  return json.access_token;
}

/** As contas do Instagram que o cliente compartilhou com o app nesse login. */
export async function contasDoToken(token: string) {
  const r = await graph<{ data?: { id: string; username?: string }[] }>(
    "me/assigned_instagram_accounts?fields=id,username",
    token,
  );
  return (r.data ?? []).map((c) => ({ id: c.id, username: c.username ?? "" }));
}

/* ------------------------------------------------------------ estado */

/* O `state` leva o projeto e quem iniciou, assinado: na volta, garante que o
   login veio de um clique no gestor e que a conta cai no projeto certo. */

function segredoDoEstado() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET não definido no .env");
  return new TextEncoder().encode(`instagram-state:${s}`);
}

export async function assinarEstado(projectId: string, userId: string) {
  return new SignJWT({ p: projectId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("20m")
    .sign(segredoDoEstado());
}

export async function lerEstado(state: string) {
  try {
    const { payload } = await jwtVerify(state, segredoDoEstado());
    const projectId = typeof payload.p === "string" ? payload.p : null;
    if (!projectId || !payload.sub) return null;
    return { projectId, userId: payload.sub };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------- cofre */

/* O token não vence: vazar o banco seria vazar acesso permanente às contas.
   Ele é guardado cifrado (AES-256-GCM) com uma chave derivada do AUTH_SECRET,
   que fica só na Vercel. Valor sem o prefixo é texto puro de antes disso. */

const PREFIXO = "c1:";

function chave() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET não definido no .env");
  return createHash("sha256").update(`instagram-token:${s}`).digest();
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave(), iv);
  const corpo = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return PREFIXO + Buffer.concat([iv, c.getAuthTag(), corpo]).toString("base64url");
}

export function decifrar(valor: string): string {
  if (!valor.startsWith(PREFIXO)) return valor;
  const bruto = Buffer.from(valor.slice(PREFIXO.length), "base64url");
  const d = createDecipheriv("aes-256-gcm", chave(), bruto.subarray(0, 12));
  d.setAuthTag(bruto.subarray(12, 28));
  return Buffer.concat([d.update(bruto.subarray(28)), d.final()]).toString("utf8");
}
