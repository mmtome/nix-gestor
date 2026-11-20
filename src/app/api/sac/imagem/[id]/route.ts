import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { readAttachment } from "@/lib/storage";

/**
 * Print do SAC. O store do Blob é privado e os prints têm dados de clientes:
 * só sai daqui, para quem está logado no gestor.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { id } = await params;
  const anexo = await db.sacAttachment.findUnique({ where: { id } });
  if (!anexo) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const file = await readAttachment(anexo.storageKey);
  if (!file) return NextResponse.json({ error: "arquivo indisponível" }, { status: 410 });

  return new NextResponse(file.body as BodyInit, {
    headers: {
      "Content-Type": file.contentType ?? anexo.mimetype,
      "Cache-Control": "private, max-age=86400, immutable",
    },
  });
}
