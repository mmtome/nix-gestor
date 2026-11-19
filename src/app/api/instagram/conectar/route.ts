import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { assertProjectAccess } from "@/lib/permissions";
import { assinarEstado, urlDeLogin } from "@/lib/meta";

/* ============================================================================
   Início do "Conectar com Instagram".

   O botão do cartão "Conta do Instagram" aponta para cá com ?projeto=<id>.
   Daqui a pessoa vai para o login da Meta, e a Meta devolve em /callback.
   ========================================================================== */

export async function GET(req: Request) {
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projeto") ?? "";
  const voltar = (q: string) =>
    NextResponse.redirect(new URL(`/projects/${projectId}/relatorio?${q}`, url));

  const user = await getSession();
  if (!user) return NextResponse.redirect(new URL("/login", url));
  if (!projectId) return NextResponse.redirect(new URL("/home", url));

  try {
    await assertProjectAccess(user, projectId, true);
  } catch {
    return voltar("ig=erro&motivo=" + encodeURIComponent("Sem permissão para editar este projeto."));
  }

  const destino = urlDeLogin(await assinarEstado(projectId, user.id));
  if (!destino) {
    return voltar(
      "ig=erro&motivo=" +
        encodeURIComponent("O app da Meta não está configurado na Vercel (INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, INSTAGRAM_CONFIG_ID)."),
    );
  }
  return NextResponse.redirect(destino);
}
