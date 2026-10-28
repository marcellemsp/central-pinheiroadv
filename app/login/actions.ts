"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";

function erro(msg: string, modo?: string): never {
  const q = new URLSearchParams({ erro: msg });
  if (modo) q.set("modo", modo);
  redirect("/login?" + q.toString());
}

function checarEmail(email: string, modo?: string) {
  const permitido = process.env.ALLOWED_EMAIL?.toLowerCase();
  if (!email) erro("Informe o e-mail.", modo);
  if (permitido && email !== permitido) erro("Este e-mail não tem acesso à Central.", modo);
}

// Entrada principal, inclusive no app instalado no iPhone, que não recebe
// a sessão aberta pelo link do e-mail no Safari.
export async function entrarComSenha(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const senha = String(formData.get("senha") ?? "");
  checarEmail(email);
  const supabase = createClient();
  if (!supabase) erro("O banco de dados ainda não está configurado.");
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) erro("E-mail ou senha incorretos.");
  redirect("/");
}

// Link mágico por e-mail: serve para o primeiro acesso e para quando a
// senha for esquecida (depois de entrar, defina uma nova em Senha).
export async function enviarLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  checarEmail(email, "link");
  const supabase = createClient();
  if (!supabase) erro("O banco de dados ainda não está configurado.", "link");
  const h = headers();
  const origem = h.get("origin") ?? `https://${h.get("host")}`;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origem}/auth/callback` },
  });
  if (error) erro("Não foi possível enviar o e-mail. Tente de novo em um minuto.", "link");
  redirect("/login?enviado=1");
}
