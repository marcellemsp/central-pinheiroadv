// Símbolo Raiz do Pinheiro Advogados: azulejo em pixels, quatro pinheiros
// nascendo de um ponto central em bordô. Sempre quadrado, nunca girado.

const CELULAS: [number, number][] = [
  [46.5, 18.5],
  [39.5, 25.5], [46.5, 25.5], [53.5, 25.5],
  [32.5, 32.5], [39.5, 32.5], [46.5, 32.5], [53.5, 32.5], [60.5, 32.5],
  [25.5, 39.5], [32.5, 39.5], [46.5, 39.5], [60.5, 39.5], [67.5, 39.5],
  [18.5, 46.5], [25.5, 46.5], [32.5, 46.5], [39.5, 46.5], [53.5, 46.5], [60.5, 46.5], [67.5, 46.5], [74.5, 46.5],
  [25.5, 53.5], [32.5, 53.5], [46.5, 53.5], [60.5, 53.5], [67.5, 53.5],
  [32.5, 60.5], [39.5, 60.5], [46.5, 60.5], [53.5, 60.5], [60.5, 60.5],
  [39.5, 67.5], [46.5, 67.5], [53.5, 67.5],
  [46.5, 74.5],
];

const ACENTOS: [number, number][] = [
  [46.5, 46.5],
  [11.5, 11.5], [81.5, 11.5], [11.5, 81.5], [81.5, 81.5],
];

type Props = {
  size?: number;
  /** "claro" para fundos claros, "petroleo" para fundos em petróleo. */
  sobre?: "claro" | "petroleo";
  className?: string;
};

export default function RaizMark({ size = 40, sobre = "claro", className }: Props) {
  const corForma = sobre === "petroleo" ? "rgb(var(--on-brand))" : "rgb(var(--brand-petroleo))";
  const corAcento = "rgb(var(--brand-bordo))";
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" className={className}>
      <rect x="5" y="5" width="90" height="90" fill="none" stroke={corForma} strokeWidth={size < 32 ? 4 : 3} />
      <g fill={corForma}>
        {CELULAS.map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="6" height="6" />
        ))}
      </g>
      <g fill={corAcento}>
        {ACENTOS.map(([x, y]) => (
          <rect key={`a${x}-${y}`} x={x} y={y} width="6" height="6" />
        ))}
      </g>
    </svg>
  );
}
