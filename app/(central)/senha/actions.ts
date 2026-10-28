"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function definirSenha(formData: FormData) {
  const senha = String(formData.get("senha") ?? "");
  const confirmacao = String(formData.get("confirmacao") ?? "");
  const falha = (m: string): never => redirect("/senha?erro=" + encodeURIComponent(m));
  if (senha.length < 10) falha("Use pelo menos 10 caracteres.");
  if (senha !== confirmacao) falha("As duas senhas não são iguais.");
  const supabase = createClient();
  if (!supabase) falha("O banco de dados ainda não está configurado.");
  const { error } = await supabase!.auth.updateUser({ password: senha });
  if (error) falha("Não foi possível salvar a senha. Tente outra.");
  redirect("/senha?ok=1");
}
