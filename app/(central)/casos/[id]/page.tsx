import Link from "next/link";
import { notFound } from "next/navigation";
import AvisoConfiguracao from "@/components/AvisoConfiguracao";
import ListaPendencias from "@/components/ListaPendencias";
import { BUCKETS } from "@/lib/buckets";
import { AREAS, STATUS_CASO, obterCaso, opcoesClientes } from "@/lib/dados";
import { botao, botaoSecundario, campo, painel, rotuloCampo, tituloPagina, tituloSecao } from "@/lib/ui";
import { criarPendenciaDoCaso, salvarCaso } from "../actions";

export const dynamic = "force-dynamic";

export default async function CasoPage({ params }: { params: { id: string } }) {
  const r = await obterCaso(params.id);
  if (r === null) return <AvisoConfiguracao />;
  if (!r) notFound();
  const { caso, pendencias } = r;
  const clientes = await opcoesClientes();

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <Link href="/casos" className="label no-underline">Casos</Link>
        <h1 className={tituloPagina}>{caso.titulo}</h1>
        <span className="text-ink-muted">
          {[
            caso.cliente?.nome,
            caso.numero_processo,
            caso.orgao,
            caso.area,
            STATUS_CASO.find((s) => s.id === caso.status)?.nome,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="flex flex-col gap-4">
          <h2 className={tituloSecao}>Pendências do caso</h2>
          <form action={criarPendenciaDoCaso} className={`${painel} flex flex-wrap items-end gap-3`}>
            <input type="hidden" name="caso_id" value={caso.id} />
            <input type="hidden" name="cliente_id" value={caso.cliente?.id ?? ""} />
            <label className="flex flex-col gap-1 flex-[3_1_220px] min-w-0">
              <span className={rotuloCampo}>Nova pendência</span>
              <input name="titulo" required placeholder="Ex.: Réplica" className={campo} />
            </label>
            <label className="flex flex-col gap-1 flex-[1_1_150px]">
              <span className={rotuloCampo}>Prazo</span>
              <input type="date" name="prazo" className={campo} />
            </label>
            <label className="flex items-center gap-2 h-10 text-sm">
              <input type="checkbox" name="prazo_fatal" className="w-4 h-4 accent-[rgb(var(--brand-bordo))]" />
              Fatal
            </label>
            <input type="hidden" name="bucket" value={BUCKETS[0].id} />
            <button type="submit" className={botao}>Adicionar</button>
          </form>
          <ListaPendencias itens={pendencias} vazio="Nenhuma pendência neste caso." />
        </section>

        <section className="flex flex-col gap-4">
          <h2 className={tituloSecao}>Dados do caso</h2>
          <form action={salvarCaso} className="flex flex-col gap-3">
            <input type="hidden" name="id" value={caso.id} />
            <label className="flex flex-col gap-1">
              <span className={rotuloCampo}>Título</span>
              <input name="titulo" required defaultValue={caso.titulo} className={campo} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={rotuloCampo}>Cliente</span>
              <select name="cliente_id" defaultValue={caso.cliente?.id ?? ""} className={campo}>
                <option value="">Sem cliente</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className={rotuloCampo}>Número do processo</span>
                <input name="numero_processo" defaultValue={caso.numero_processo ?? ""} className={campo} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={rotuloCampo}>Área</span>
                <select name="area" defaultValue={caso.area ?? ""} className={campo}>
                  <option value="">—</option>
                  {AREAS.map((a) => <option key={a}>{a}</option>)}
                </select>
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className={rotuloCampo}>Vara, tribunal ou órgão</span>
                <input name="orgao" defaultValue={caso.orgao ?? ""} className={campo} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={rotuloCampo}>Situação do caso</span>
                <select name="status" defaultValue={caso.status} className={campo}>
                  {STATUS_CASO.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                </select>
              </label>
            </div>
            <button type="submit" className={`${botaoSecundario} self-start`}>Salvar dados</button>
          </form>
        </section>
      </div>
    </div>
  );
}
