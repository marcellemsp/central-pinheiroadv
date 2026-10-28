import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import AppShell from "@/components/AppShell";
import CertidoesView from "@/components/Certidoes";
import { ehCoordenador } from "@/lib/perfil";

export const metadata = { title: "Certidões" };
export const dynamic = "force-dynamic";

export default async function CertidoesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: usuario } = await supabase.from("usuarios").select("*").eq("id", user.id).maybeSingle();
  const nome = usuario?.nome_completo ?? user.email?.split("@")[0] ?? "";
  const coord = (usuario as any)?.papel === "coordenador" || ehCoordenador(usuario?.banca ?? nome);
  return (
    <AppShell userEmail={user.email ?? ""} userName={usuario?.nome_completo}>
      <CertidoesView usuarioNome={nome} coord={coord} />
    </AppShell>
  );
}
