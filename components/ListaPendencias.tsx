import Link from "next/link";
import { nomeDoBucket } from "@/lib/buckets";
import { formatarData, hojeSP } from "@/lib/pendencias";
import type { Pendencia } from "@/lib/types";

// Lista enxuta de pendências, usada nas páginas de cliente e de caso.
export default function ListaPendencias({ itens, vazio }: { itens: Pendencia[]; vazio: string }) {
  const hoje = hojeSP();
  const abertas = itens.filter((p) => p.bucket !== "concluido");
  const concluidas = itens.filter((p) => p.bucket === "concluido");
  if (itens.length === 0) return <p className="text-ink-muted border-t border-line pt-3">{vazio}</p>;
  return (
    <ul className="border-t border-line">
      {[...abertas, ...concluidas].map((p) => {
        const feita = p.bucket === "concluido";
        const urgente = !feita && p.prazo && p.prazo <= hoje;
        return (
          <li key={p.id} className="border-b border-line py-3 flex items-start justify-between gap-4">
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className={feita ? "line-through text-ink-muted" : "font-medium"}>{p.titulo}</span>
              <span className="text-xs text-ink-muted">{nomeDoBucket(p.bucket)}</span>
            </div>
            {p.prazo && (
              <span className={`text-sm whitespace-nowrap ${urgente ? "text-bordo font-semibold" : "text-ink-muted"}`}>
                {!feita && p.prazo < hoje ? "Vencido · " : ""}
                {formatarData(p.prazo)}
                {p.prazo_fatal ? " ●" : ""}
              </span>
            )}
          </li>
        );
      })}
      <li className="pt-3">
        <Link href="/pendencias" className="text-sm font-semibold text-petroleo">
          Abrir em Pendências
        </Link>
      </li>
    </ul>
  );
}
