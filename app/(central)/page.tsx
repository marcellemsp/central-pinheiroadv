import Link from "next/link";
import AvisoConfiguracao from "@/components/AvisoConfiguracao";
import { BUCKETS, nomeDoBucket } from "@/lib/buckets";
import { formatarData, hojeSP, listarPendencias, somarDias } from "@/lib/pendencias";
import type { Pendencia } from "@/lib/types";

export const dynamic = "force-dynamic";

function saudacao(): string {
  const hora = Number(
    new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }).format(new Date()),
  );
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

export default async function InicioPage() {
  const todas = await listarPendencias();
  if (!todas) return <AvisoConfiguracao />;

  const hoje = hojeSP();
  const limite = somarDias(hoje, 7);
  const abertas = todas.filter((p) => p.bucket !== "concluido");
  const vencidas = abertas.filter((p) => p.prazo && p.prazo < hoje);
  const deHoje = abertas.filter((p) => p.prazo === hoje);
  const proximas = abertas
    .filter((p) => p.prazo && p.prazo > hoje && p.prazo <= limite)
    .sort((a, b) => a.prazo!.localeCompare(b.prazo!));
  const dataExtenso = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <span className="label">{dataExtenso}</span>
        <h1 className="font-serif text-4xl font-medium text-ink-heading">{saudacao()}, Marcelle.</h1>
      </div>

      <section className="grid gap-8 md:grid-cols-2">
        <Bloco titulo="Para hoje" vazio="Nenhum prazo para hoje." itens={[...vencidas, ...deHoje]} hoje={hoje} destaque />
        <Bloco titulo="Próximos 7 dias" vazio="Nenhum prazo na semana." itens={proximas} hoje={hoje} />
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-4 border-b border-line pb-3">
          <h2 className="font-serif text-2xl font-semibold text-ink-heading">Em aberto</h2>
          <Link href="/pendencias" className="text-sm font-semibold text-petroleo">
            Ver todas
          </Link>
        </div>
        <div className="grid gap-px bg-line border border-line grid-cols-2 sm:grid-cols-4">
          {BUCKETS.filter((b) => b.id !== "concluido").map((b) => (
            <div key={b.id} className="bg-surface-200 p-4 flex flex-col gap-1">
              <span className="text-3xl font-serif text-ink-heading">{abertas.filter((p) => p.bucket === b.id).length}</span>
              <span className="text-sm text-ink-muted">{b.nome}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Bloco({
  titulo,
  vazio,
  itens,
  hoje,
  destaque,
}: {
  titulo: string;
  vazio: string;
  itens: Pendencia[];
  hoje: string;
  destaque?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className={`font-serif text-2xl font-semibold ${destaque ? "text-ink-heading" : "text-ink-heading"}`}>{titulo}</h2>
      {itens.length === 0 ? (
        <p className="text-ink-muted border-t border-line pt-3">{vazio}</p>
      ) : (
        <ul className="border-t border-line">
          {itens.map((p) => (
            <li key={p.id} className="border-b border-line py-3 flex items-start justify-between gap-4">
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="font-medium">{p.titulo}</span>
                <span className="text-xs text-ink-muted">
                  {[p.cliente?.nome, nomeDoBucket(p.bucket)].filter(Boolean).join(" · ")}
                </span>
              </div>
              {p.prazo && (
                <span className={`text-sm whitespace-nowrap ${p.prazo <= hoje ? "text-bordo font-semibold" : "text-ink-muted"}`}>
                  {p.prazo < hoje ? "Vencido · " : ""}
                  {formatarData(p.prazo)}
                  {p.prazo_fatal ? " ●" : ""}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
