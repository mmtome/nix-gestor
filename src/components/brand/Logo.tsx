// Símbolo oficial da Agência NIX (Manual da Marca v1.0, seções 02 e 03).
//
// Geometria normalizada pelo raio externo do anel (R = 400 neste viewBox):
//   anel      raio externo R · espessura 0,3877 R
//   ponto central          0,2073 R
//   ponto âmbar            0,3624 R, a 1,0496 R do centro, 38,5°
//
// A caixa mede 2,1835 R x 2,0161 R — o símbolo NÃO é quadrado. O viewBox
// preserva a proporção sozinho, então passar h-6 w-6 apenas o centraliza
// na caixa; em hipótese alguma ele é esticado (manual, seção 06).

const VIEWBOX = "0 0 873.4 806.4";

/** Versão policromática — a preferencial sempre que houver 4 cores. */
export function Symbol({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox={VIEWBOX} className={className} aria-hidden="true">
      <defs>
        <linearGradient id="nix-roxo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8013A8" />
          <stop offset="1" stopColor="#6E327C" />
        </linearGradient>
        <linearGradient id="nix-ambar" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFAB00" />
          <stop offset="1" stopColor="#FB7601" />
        </linearGradient>
      </defs>
      <circle
        cx="400"
        cy="406.4"
        r="322.46"
        fill="none"
        stroke="url(#nix-roxo)"
        strokeWidth="155.08"
      />
      <circle cx="400" cy="406.4" r="82.92" fill="url(#nix-roxo)" />
      <circle cx="728.44" cy="144.92" r="144.96" fill="url(#nix-ambar)" />
    </svg>
  );
}

/**
 * Versão monocromática — herda a cor por currentColor.
 * Reservada a marca d'água e reprodução de uma cor (manual, seção 03).
 */
export function SymbolMono({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox={VIEWBOX} className={className} aria-hidden="true" fill="currentColor">
      <circle
        cx="400"
        cy="406.4"
        r="322.46"
        fill="none"
        stroke="currentColor"
        strokeWidth="155.08"
      />
      <circle cx="400" cy="406.4" r="82.92" />
      <circle cx="728.44" cy="144.92" r="144.96" />
    </svg>
  );
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <Symbol className="h-6 w-6 shrink-0" />
      {!compact && (
        <div className="leading-none">
          <div className="text-[13px] font-semibold tracking-tight text-text">
            NIX <span className="text-accent">Gestor</span>
          </div>
          <div className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.18em] text-faint">
            Foco · Energia · Precisão
          </div>
        </div>
      )}
    </div>
  );
}
