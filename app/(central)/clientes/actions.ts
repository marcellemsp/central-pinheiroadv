"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function sb() {
  const c = createClient();
  if (!c) throw new Error("Banco de dados não configurado.");
  return c;
}

const texto = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? null : v;
};

export async function criarCliente(fd: FormData) {
  const nome = texto(fd, "nome");
  if (!nome) return;
  const { data, error } = await sb()
    .from("clientes")
    .insert({ nome, documento: texto(fd, "documento"), contato: texto(fd, "contato") })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/clientes");
  redirect(`/clientes/${data.id}`);
}

export async function salvarCliente(fd: FormData) {
  const id = texto(fd, "id");
  const nome = texto(fd, "nome");
  if (!id || !nome) return;
  const { error } = await sb()
    .from("clientes")
    .update({
      nome,
      documento: texto(fd, "documento"),
      contato: texto(fd, "contato"),
      observacoes: texto(fd, "observacoes"),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/clientes/${id}`);
  revalidatePath("/clientes");
}
