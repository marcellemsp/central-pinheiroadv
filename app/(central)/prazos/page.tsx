import AvisoConfiguracao from "@/components/AvisoConfiguracao";
import CalculadoraPrazo from "@/components/CalculadoraPrazo";
import { opcoesClientes } from "@/lib/dados";
import { formatarData, hojeSP, listarPendencias, somarDias } from "@/lib/pendencias";
import { nomeDoBucket } from "@/lib/buckets";
import type { Pendencia } from "@/lib/types";
import { tituloPagina, tituloSecao } from "@/lib/ui";

export const metadata = { title: "Prazos" };
export const dynamic = "force-dynamic";

export default async function PrazosPage() {
  const todas = await listarPendencias();
  if (!todas) return <AvisoConfiguracao />;
  const clientes = await opcoesClientes();
  const hoje = hojeSP();
  const semana = somarDias(hoje, 7);
  const comPrazo = todas
    .filter((p) => p.bucket !== "concluido" && p.prazo)
    .sort((a, b) => a.prazo!.localeCompare(b.prazo!));

  const grupos: [string, Pendencia[]][] = [
    ["Vencidos", comPrazo.filter((p) => p.prazo! < hoje)],
    ["Hoje", comPrazo.filter((p) => p.prazo === hoje)],
    ["Próximos 7 dias", comPrazo.filter((p) => p.prazo! > hoje && p.prazo! <= semana)],
    ["Depois", comPrazo.filter((p) => p.prazo! > semana)],
  ];

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <span className="label">Prazos</span>
        <h1 className={tituloPagina}>Calculadora e agenda de prazos</h1>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className={tituloSecao}>Calcular um prazo</h2>
        <CalculadoraPrazo hoje={hoje} clientes={clientes} />
      </section>

      <section className="flex flex-col gap-6">
        <h2 className={tituloSecao}>Prazos em aberto</h2>
        {comPrazo.length === 0 ? (
          <p className="text-ink-muted border-t border-line pt-3">Nenhuma pendência com prazo.</p>
        ) : (
          grupos
            .filter(([, itens]) => itens.length > 0)
            .map(([nome, itens]) => (
              <div key={nome} className="flex flex-col gap-2">
                <h3 className={`text-sm font-semibold ${nome === "Vencidos" || nome === "Hoje" ? "text-bordo" : "text-ink-muted"}`}>
                  {nome}
                </h3>
                <ul className="border-t border-line">
                  {itens.map((p) => (
                    <li key={p.id} className="border-b border-line py-3 flex items-start justify-between gap-4">
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="font-medium">{p.titulo}</span>
                        <span className="text-xs text-ink-muted">
                          {[p.cliente?.nome, nomeDoBucket(p.bucket)].filter(Boolean).join(" · ")}
                        </span>
                      </div>
                      <span className={`text-sm whitespace-nowrap ${p.prazo! <= hoje ? "text-bordo font-semibold" : ""}`}>
                        {formatarData(p.prazo!)}
                        {p.prazo_fatal ? " ●" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))
        )}
      </section>
    </div>
  );
}
