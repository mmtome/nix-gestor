-- Identidade visual da Agência NIX: os defaults de cor deixam de apontar para
-- o vermelho da marca anterior e passam a usar o Violeta NIX (#8013A8).

ALTER TABLE "User" ALTER COLUMN "avatarColor" SET DEFAULT '#8013A8';
ALTER TABLE "Project" ALTER COLUMN "color" SET DEFAULT '#8013A8';
