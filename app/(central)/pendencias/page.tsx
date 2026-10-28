import AvisoConfiguracao from "@/components/AvisoConfiguracao";
import PendenciasView from "@/components/PendenciasView";
import { hojeSP, listarClientes, listarPendencias } from "@/lib/pendencias";

export const metadata = { title: "Pendências" };
export const dynamic = "force-dynamic";

export default async function PendenciasPage() {
  const pendencias = await listarPendencias();
  if (!pendencias) return <AvisoConfiguracao />;
  const clientes = await listarClientes();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="label">Pendências</span>
        <h1 className="font-serif text-4xl font-medium text-ink-heading">O que está em andamento</h1>
      </div>
      <PendenciasView pendencias={pendencias} clientes={clientes} hoje={hojeSP()} />
    </div>
  );
}
