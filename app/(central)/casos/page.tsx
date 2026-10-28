import Link from "next/link";
import AvisoConfiguracao from "@/components/AvisoConfiguracao";
import { AREAS, STATUS_CASO, listarCasos, opcoesClientes } from "@/lib/dados";
import { botao, campo, painel, rotuloCampo, tituloPagina } from "@/lib/ui";
import { criarCaso } from "./actions";

export const metadata = { title: "Casos" };
export const dynamic = "force-dynamic";

export default async function CasosPage({ searchParams }: { searchParams: { todos?: string } }) {
  const casos = await listarCasos();
  if (!casos) return <AvisoConfiguracao />;
  const clientes = await opcoesClientes();
  const mostrarTodos = searchParams.todos === "1";
  const lista = mostrarTodos ? casos : casos.filter((c) => c.status !== "encerrado");
  const encerrados = casos.length - casos.filter((c) => c.status !== "encerrado").length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="label">Casos</span>
        <h1 className={tituloPagina}>Processos e consultas</h1>
      </div>

      <form action={criarCaso} className={`${painel} flex flex-wrap items-end gap-3`}>
        <label className="flex flex-col gap-1 flex-[3_1_240px] min-w-0">
          <span className={rotuloCampo}>Novo caso</span>
          <input name="titulo" required placeholder="Ex.: Mandado de segurança ISS" className={campo} />
        </label>
        <label className="flex flex-col gap-1 flex-[2_1_180px] min-w-0">
          <span className={rotuloCampo}>Cliente</span>
          <select name="cliente_id" className={campo} defaultValue="">
            <option value="">Sem cliente</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 flex-[2_1_200px] min-w-0">
          <span className={rotuloCampo}>Número do processo</span>
          <input name="numero_processo" className={campo} />
        </label>
        <label className="flex flex-col gap-1 flex-[1_1_140px] min-w-0">
          <span className={rotuloCampo}>Área</span>
          <select name="area" className={campo} defaultValue="">
            <option value="">—</option>
            {AREAS.map((a) => <option key={a}>{a}</option>)}
          </select>
        </label>
        <button type="submit" className={botao}>Adicionar</button>
      </form>

      {lista.length === 0 ? (
        <p className="text-ink-muted border-t border-line pt-6">Nenhum caso cadastrado ainda.</p>
      ) : (
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full text-sm border-collapse min-w-[720px]">
            <thead>
              <tr className="text-left text-ink-muted">
                <th className="font-semibold py-3 pr-4">Caso</th>
                <th className="font-semibold py-3 pr-4">Cliente</th>
                <th className="font-semibold py-3 pr-4">Processo</th>
                <th className="font-semibold py-3 pr-4">Área</th>
                <th className="font-semibold py-3 pr-4">Situação</th>
                <th className="font-semibold py-3">Pendências</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.id} className="border-t border-line">
                  <td className="py-3 pr-4">
                    <Link href={`/casos/${c.id}`} className="font-medium text-petroleo">{c.titulo}</Link>
                  </td>
                  <td className="py-3 pr-4 text-ink-muted">
                    {c.cliente ? <Link href={`/clientes/${c.cliente.id}`} className="text-ink-muted">{c.cliente.nome}</Link> : "—"}
                  </td>
                  <td className="py-3 pr-4 text-ink-muted whitespace-nowrap">{c.numero_processo ?? "—"}</td>
                  <td className="py-3 pr-4 text-ink-muted">{c.area ?? "—"}</td>
                  <td className="py-3 pr-4">{STATUS_CASO.find((s) => s.id === c.status)?.nome ?? c.status}</td>
                  <td className="py-3">{c.pendencias.filter((p) => p.bucket !== "concluido").length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {encerrados > 0 && (
        <Link href={mostrarTodos ? "/casos" : "/casos?todos=1"} className="text-sm font-semibold text-petroleo self-start">
          {mostrarTodos ? "Esconder encerrados" : `Mostrar ${encerrados} encerrado${encerrados > 1 ? "s" : ""}`}
        </Link>
      )}
    </div>
  );
}
