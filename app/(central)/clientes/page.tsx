import Link from "next/link";
import AvisoConfiguracao from "@/components/AvisoConfiguracao";
import { listarClientesCompleto } from "@/lib/dados";
import { botao, campo, rotuloCampo, painel, tituloPagina } from "@/lib/ui";
import { criarCliente } from "./actions";

export const metadata = { title: "Clientes" };
export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const clientes = await listarClientesCompleto();
  if (!clientes) return <AvisoConfiguracao />;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="label">Clientes</span>
        <h1 className={tituloPagina}>Quem o escritório atende</h1>
      </div>

      <form action={criarCliente} className={`${painel} flex flex-wrap items-end gap-3`}>
        <label className="flex flex-col gap-1 flex-[3_1_240px] min-w-0">
          <span className={rotuloCampo}>Novo cliente</span>
          <input name="nome" required placeholder="Nome ou razão social" className={campo} />
        </label>
        <label className="flex flex-col gap-1 flex-[2_1_180px] min-w-0">
          <span className={rotuloCampo}>CPF ou CNPJ</span>
          <input name="documento" className={campo} />
        </label>
        <label className="flex flex-col gap-1 flex-[2_1_180px] min-w-0">
          <span className={rotuloCampo}>Contato</span>
          <input name="contato" placeholder="Telefone ou e-mail" className={campo} />
        </label>
        <button type="submit" className={botao}>Adicionar</button>
      </form>

      {clientes.length === 0 ? (
        <p className="text-ink-muted border-t border-line pt-6">Nenhum cliente cadastrado ainda.</p>
      ) : (
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full text-sm border-collapse min-w-[560px]">
            <thead>
              <tr className="text-left text-ink-muted">
                <th className="font-semibold py-3 pr-4">Cliente</th>
                <th className="font-semibold py-3 pr-4">CPF ou CNPJ</th>
                <th className="font-semibold py-3 pr-4">Casos ativos</th>
                <th className="font-semibold py-3">Pendências em aberto</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id} className="border-t border-line">
                  <td className="py-3 pr-4">
                    <Link href={`/clientes/${c.id}`} className="font-medium text-petroleo">
                      {c.nome}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 text-ink-muted">{c.documento ?? "—"}</td>
                  <td className="py-3 pr-4">{c.casos.filter((x) => x.status !== "encerrado").length}</td>
                  <td className="py-3">{c.pendencias.filter((x) => x.bucket !== "concluido").length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
