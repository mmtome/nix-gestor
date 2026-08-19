// Enums da spec (seção 4) mantidos como união de strings — o SQLite não tem enum
// nativo. A validação acontece aqui e nos schemas Zod das actions.

export const ROLES = ["ADMIN", "MEMBER"] as const;
export type Role = (typeof ROLES)[number];

export const PROJECT_ROLES = ["OWNER", "EDITOR", "VIEWER"] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const PROJECT_STATUSES = ["ON_TRACK", "AT_RISK", "OFF_TRACK"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  ON_TRACK: "Em dia",
  AT_RISK: "Em risco",
  OFF_TRACK: "Em atraso",
};

// Cores de status são semânticas, não de marca: atraso continua vermelho.
// O "em risco" usa o âmbar da NIX, que já é a cor de alerta do manual.
export const PROJECT_STATUS_COLOR: Record<ProjectStatus, string> = {
  ON_TRACK: "#6FDCA5",
  AT_RISK: "#FFAB00",
  OFF_TRACK: "#FF6B6B",
};

export const NOTIFICATION_TYPES = [
  "TASK_ASSIGNED",
  "COMMENT_ADDED",
  "DUE_DATE_CHANGED",
  "TASK_COMPLETED",
  "MENTIONED",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const VIEW_TYPES = ["list", "board", "calendar"] as const;
export type ViewType = (typeof VIEW_TYPES)[number];

// Paleta de 16 cores para projetos e tags (seção 8 da spec), reancorada na
// identidade do Manual da Marca NIX: as quatro cores da marca abrem a lista.
export const PALETTE = [
  "#8013A8", // Violeta NIX
  "#B863E0",
  "#FFAB00", // Âmbar NIX
  "#FB7601", // Laranja NIX
  "#E8574F",
  "#F06A6A",
  "#EC8D71",
  "#A8C466",
  "#6FDCA5",
  "#4FB3A6",
  "#4573D2",
  "#5B8DEF",
  "#8D84E8",
  "#F9AAEF",
  "#A093AB",
  "#766A80",
] as const;
