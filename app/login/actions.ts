"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function enviarLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const permitido = process.env.ALLOWED_EMAIL?.toLowerCase();
  if (!email) redirect("/login?erro=" + encodeURIComponent("Informe o e-mail."));
  if (permitido && email !== permitido) {
    redirect("/login?erro=" + encodeURIComponent("Este e-mail não tem acesso à Central."));
  }

  const supabase = createClient();
  if (!supabase) redirect("/login?erro=" + encodeURIComponent("O banco de dados ainda não está configurado."));

  const h = headers();
  const origem = h.get("origin") ?? `https://${h.get("host")}`;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origem}/auth/callback` },
  });
  if (error) redirect("/login?erro=" + encodeURIComponent("Não foi possível enviar o link. Tente de novo."));
  redirect("/login?enviado=1");
}
