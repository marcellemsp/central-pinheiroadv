import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import AppShell from "@/components/AppShell";
import GrupoDetalheView from "@/components/GrupoDetalheView";

export const dynamic = "force-dynamic";

export default async function GrupoDetalhePage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: usuario } = await supabase.from("usuarios").select("*").eq("id", user.id).maybeSingle();
  return (
    <AppShell userEmail={user.email ?? ""} userName={usuario?.nome_completo}>
      <GrupoDetalheView grupoId={params.id} />
    </AppShell>
  );
}
