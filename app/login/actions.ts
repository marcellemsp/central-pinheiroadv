"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function erro(msg: string, email?: string): never {
  const q = new URLSearchParams({ erro: msg });
  if (email) {
    q.set("enviado", "1");
    q.set("email", email);
  }
  redirect("/login?" + q.toString());
}

export async function enviarLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const permitido = process.env.ALLOWED_EMAIL?.toLowerCase();
  if (!email) erro("Informe o e-mail.");
  if (permitido && email !== permitido) erro("Este e-mail não tem acesso à Central.");

  const supabase = createClient();
  if (!supabase) erro("O banco de dados ainda não está configurado.");

  const h = headers();
  const origem = h.get("origin") ?? `https://${h.get("host")}`;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origem}/auth/callback`, shouldCreateUser: true },
  });
  if (error) erro("Não foi possível enviar o e-mail. Tente de novo em um minuto.");
  redirect("/login?" + new URLSearchParams({ enviado: "1", email }).toString());
}

// Entrada pelo código de 6 dígitos do e-mail. É o caminho usado no app
// instalado no iPhone, que não recebe a sessão aberta pelo link no Safari.
export async function verificarCodigo(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("codigo") ?? "").replace(/\D/g, "");
  if (!email || token.length < 6) erro("Digite o código que chegou no e-mail.", email);

  const supabase = createClient();
  if (!supabase) erro("O banco de dados ainda não está configurado.");

  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) erro("Código inválido ou vencido. Peça um novo.", email);
  redirect("/");
}
