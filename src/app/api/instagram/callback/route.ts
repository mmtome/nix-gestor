import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertProjectAccess } from "@/lib/permissions";
import { refreshAll } from "@/lib/revalidate";
import { cifrar, contasDoToken, lerEstado, trocarCodigo } from "@/lib/meta";

/* ============================================================================
   Volta do login da Meta (o "URL de redirecionamento" cadastrado no painel).

   Troca o código pelo token, pergunta quais contas o cliente compartilhou e
   grava a do projeto. O token sai daqui cifrado: ele não vence.
   ========================================================================== */

export async function GET(req: Request) {
  const url = new URL(req.url);
  const estado = await lerEstado(url.searchParams.get("state") ?? "");
  if (!estado) return NextResponse.redirect(new URL("/home", url));

  const { projectId } = estado;
  const voltar = (q: string) =>
    NextResponse.redirect(new URL(`/projects/${projectId}/relatorio?${q}`, url));
  const falha = (motivo: string) => voltar("ig=erro&motivo=" + encodeURIComponent(motivo));

  const user = await getSession();
  if (!user || user.id !== estado.userId) return NextResponse.redirect(new URL("/login", url));
  try {
    await assertProjectAccess(user, projectId, true);
  } catch {
    return falha("Sem permissão para editar este projeto.");
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return falha(url.searchParams.get("error_description") || "O login foi cancelado na Meta.");
  }

  let token: string;
  let contas: { id: string; username: string }[];
  try {
    token = await trocarCodigo(code);
    contas = await contasDoToken(token);
  } catch (e) {
    return falha(`A Meta recusou a conexão: ${e instanceof Error ? e.message : "erro desconhecido"}`);
  }

  if (!contas.length) {
    return falha(
      "Nenhuma conta do Instagram foi compartilhada nesse login. Conecte de novo e marque a conta do cliente na tela da Meta.",
    );
  }

  // Um login pode trazer várias contas do mesmo portfólio. Fica a que já era
  // do projeto; sem histórico, a primeira — e o aviso lista as outras.
  const atual = await db.instagramAccount.findUnique({
    where: { projectId },
    select: { username: true },
  });
  const escolhida =
    contas.find((c) => c.username && c.username === atual?.username) ?? contas[0];
  const outras = contas.filter((c) => c.id !== escolhida.id).map((c) => c.username);

  const dados = {
    username: escolhida.username || atual?.username || escolhida.id,
    igUserId: escolhida.id,
    accessToken: cifrar(token),
    conectadoEm: new Date(),
  };
  await db.instagramAccount.upsert({
    where: { projectId },
    create: { projectId, ...dados },
    update: dados,
  });

  refreshAll();
  const q = new URLSearchParams({ ig: "ok", conta: dados.username });
  if (outras.length) q.set("outras", outras.join(","));
  return voltar(q.toString());
}
