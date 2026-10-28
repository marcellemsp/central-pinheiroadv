import Link from "next/link";
import { notFound } from "next/navigation";
import AvisoConfiguracao from "@/components/AvisoConfiguracao";
import ListaPendencias from "@/components/ListaPendencias";
import { AREAS, STATUS_CASO, obterCliente } from "@/lib/dados";
import { areaTexto, botao, botaoSecundario, campo, painel, rotuloCampo, tituloPagina, tituloSecao } from "@/lib/ui";
import { salvarCliente } from "../actions";
import { criarCaso } from "../../casos/actions";

export const dynamic = "force-dynamic";

export default async function ClientePage({ params }: { params: { id: string } }) {
  const r = await obterCliente(params.id);
  if (r === null) return <AvisoConfiguracao />;
  if (!r) notFound();
  const { cliente, casos, pendencias } = r;

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <Link href="/clientes" className="label no-underline">Clientes</Link>
        <h1 className={tituloPagina}>{cliente.nome}</h1>
        {cliente.documento && <span className="text-ink-muted">{cliente.documento}</span>}
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="flex flex-col gap-4">
          <h2 className={tituloSecao}>Casos</h2>
          {casos.length === 0 ? (
            <p className="text-ink-muted border-t border-line pt-3">Nenhum caso deste cliente.</p>
          ) : (
            <ul className="border-t border-line">
              {casos.map((c) => (
                <li key={c.id} className="border-b border-line py-3 flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <Link href={`/casos/${c.id}`} className="font-medium text-petroleo">{c.titulo}</Link>
                    <span className="text-xs text-ink-muted">
                      {[c.numero_processo, c.orgao, c.area].filter(Boolean).join(" · ") || "Sem número"}
                    </span>
                  </div>
                  <span className="text-xs text-ink-muted whitespace-nowrap">
                    {STATUS_CASO.find((s) => s.id === c.status)?.nome ?? c.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <details className={painel}>
            <summary className="cursor-pointer font-semibold text-petroleo">Novo caso para {cliente.nome}</summary>
            <form action={criarCaso} className="flex flex-col gap-3 pt-4">
              <input type="hidden" name="cliente_id" value={cliente.id} />
              <label className="flex flex-col gap-1">
                <span className={rotuloCampo}>Título</span>
                <input name="titulo" required placeholder="Ex.: Ação contra a Geely" className={campo} />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className={rotuloCampo}>Número do processo</span>
                  <input name="numero_processo" className={campo} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={rotuloCampo}>Área</span>
                  <select name="area" className={campo} defaultValue="">
                    <option value="">—</option>
                    {AREAS.map((a) => <option key={a}>{a}</option>)}
                  </select>
                </label>
              </div>
              <label className="flex flex-col gap-1">
                <span className={rotuloCampo}>Vara, tribunal ou órgão</span>
                <input name="orgao" className={campo} />
              </label>
              <button type="submit" className={`${botao} self-start`}>Criar caso</button>
            </form>
          </details>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className={tituloSecao}>Pendências</h2>
          <ListaPendencias itens={pendencias} vazio="Nenhuma pendência deste cliente." />
        </section>
      </div>

      <section className="flex flex-col gap-4 max-w-2xl">
        <h2 className={tituloSecao}>Dados</h2>
        <form action={salvarCliente} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={cliente.id} />
          <label className="flex flex-col gap-1">
            <span className={rotuloCampo}>Nome</span>
            <input name="nome" required defaultValue={cliente.nome} className={campo} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className={rotuloCampo}>CPF ou CNPJ</span>
              <input name="documento" defaultValue={cliente.documento ?? ""} className={campo} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={rotuloCampo}>Contato</span>
              <input name="contato" defaultValue={cliente.contato ?? ""} className={campo} />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className={rotuloCampo}>Observações</span>
            <textarea name="observacoes" rows={4} defaultValue={cliente.observacoes ?? ""} className={areaTexto} />
          </label>
          <button type="submit" className={`${botaoSecundario} self-start`}>Salvar dados</button>
        </form>
      </section>
    </div>
  );
}
