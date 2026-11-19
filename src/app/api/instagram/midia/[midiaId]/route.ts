import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertProjectAccess } from "@/lib/permissions";
import { GRAPH } from "@/lib/meta";
import { credencialDaConta } from "@/lib/insights";

/* ============================================================================
   Imagem de um post, para os destaques do relatório.

   O endereço que a Meta dá para a imagem expira em poucos dias, então o
   relatório guarda este caminho em vez dele: a cada abertura pedimos à Meta o
   endereço do momento e redirecionamos. Funciona enquanto a conta estiver
   conectada e o post existir.
   ========================================================================== */

type Midia = {
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  children?: { data?: { media_type?: string; media_url?: string; thumbnail_url?: string }[] };
};

const imagemDe = (m: Omit<Midia, "children">) =>
  m.media_type === "VIDEO" ? m.thumbnail_url : (m.media_url ?? m.thumbnail_url);

export async function GET(req: Request, { params }: { params: Promise<{ midiaId: string }> }) {
  const { midiaId } = await params;
  const projectId = new URL(req.url).searchParams.get("projeto") ?? "";
  if (!/^\d+$/.test(midiaId) || !projectId) return new NextResponse(null, { status: 400 });

  const user = await getSession();
  if (!user) return new NextResponse(null, { status: 401 });
  try {
    await assertProjectAccess(user, projectId, false);
  } catch {
    return new NextResponse(null, { status: 403 });
  }

  const conta = await db.instagramAccount.findUnique({
    where: { projectId },
    select: { igUserId: true, accessToken: true },
  });
  const cred = credencialDaConta(conta);
  if (!cred) return new NextResponse(null, { status: 404 });

  const campos = "media_type,media_url,thumbnail_url,children{media_type,media_url,thumbnail_url}";
  const res = await fetch(
    `${GRAPH}/${midiaId}?fields=${campos}&access_token=${encodeURIComponent(cred.token)}`,
    { cache: "no-store" },
  );
  if (!res.ok) return new NextResponse(null, { status: 404 });
  const m = (await res.json()) as Midia;

  const url = imagemDe(m) ?? (m.children?.data?.[0] ? imagemDe(m.children.data[0]) : undefined);
  if (!url) return new NextResponse(null, { status: 404 });

  const r = NextResponse.redirect(url);
  r.headers.set("Cache-Control", "private, max-age=3600");
  return r;
}
