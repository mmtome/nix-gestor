/**
 * Aplica o projeto e o relatório de exemplo do Uberaba Rodeo Show sem
 * reexecutar o seed inteiro — que apagaria tudo.
 *
 * Uso:  npx tsx scripts/exemplo-urs.ts
 */

import { readFileSync, existsSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { aplicarExemploUrs } from "../prisma/exemplo-urs";

for (const arquivo of [".env.local", ".env"]) {
  if (!existsSync(arquivo)) continue;
  for (const linha of readFileSync(arquivo, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(linha.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}

const db = new PrismaClient();

async function main() {
  const usuarios = await db.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true },
  });
  if (!usuarios.length) throw new Error("Nenhum usuário no banco — rode o seed antes.");

  const membros = usuarios.map((u, i) => ({
    userId: u.id,
    role: (i === 0 ? "OWNER" : "EDITOR") as "OWNER" | "EDITOR",
  }));

  const id = await aplicarExemploUrs(db, membros);
  console.log(`Projeto de exemplo pronto: ${id}`);
  console.log("Abra a aba Relatório do projeto \"Uberaba Rodeo Show\".");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
