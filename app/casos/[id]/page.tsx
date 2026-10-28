import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import AppShell from "@/components/AppShell";
import CasoView, { type Andamento, type Pendencia } from "@/components/CasoView";
import type { Caso, Documento } from "@/components/ClienteView";
import type { Empresa } from "@/components/ClientesListView";
import { podeVerArea } from "@/lib/perfil";

export const dynamic = "force-dynamic";

export default async function CasoPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: usuario }, { data: caso }] = await Promise.all([
    supabase.from("usuarios").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("casos").select("*").eq("id", params.id).maybeSingle(),
  ]);
  if (!caso) notFound();
  if (!podeVerArea(usuario?.banca ?? usuario?.nome_completo ?? user.email, caso.area)) redirect(`/clientes/${caso.empresa_id}`);

  const [{ data: empresa }, { data: andamentos }, { data: pendencias }, { data: documentos }] = await Promise.all([
    supabase.from("empresas").select("*").eq("id", caso.empresa_id).maybeSingle(),
    supabase.from("caso_andamentos").select("*").eq("caso_id", caso.id).order("data", { ascending: false }).order("criado_em", { ascending: false }),
    supabase.from("caso_pendencias").select("*").eq("caso_id", caso.id).order("prazo", { ascending: true, nullsFirst: false }),
    supabase.from("empresa_documentos").select("*").eq("empresa_id", caso.empresa_id),
  ]);
  if (!empresa) notFound();

  return (
    <AppShell userEmail={user.email ?? ""} userName={usuario?.nome_completo}>
      <CasoView caso={caso as Caso} empresa={empresa as Empresa} andamentos={(andamentos ?? []) as Andamento[]} pendencias={(pendencias ?? []) as Pendencia[]} documentos={(documentos ?? []) as Documento[]} usuarioNome={usuario?.nome_completo ?? user.email?.split("@")[0]} />
    </AppShell>
  );
}
