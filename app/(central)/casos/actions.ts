"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isBucket } from "@/lib/buckets";

function sb() {
  const c = createClient();
  if (!c) throw new Error("Banco de dados não configurado.");
  return c;
}

const texto = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? null : v;
};

export async function criarCaso(fd: FormData) {
  const titulo = texto(fd, "titulo");
  if (!titulo) return;
  const { data, error } = await sb()
    .from("casos")
    .insert({
      titulo,
      cliente_id: texto(fd, "cliente_id"),
      numero_processo: texto(fd, "numero_processo"),
      orgao: texto(fd, "orgao"),
      area: texto(fd, "area"),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/casos");
  revalidatePath("/clientes");
  if (fd.get("ficar") === "1") {
    const cliente = texto(fd, "cliente_id");
    if (cliente) revalidatePath(`/clientes/${cliente}`);
    return;
  }
  redirect(`/casos/${data.id}`);
}

export async function salvarCaso(fd: FormData) {
  const id = texto(fd, "id");
  const titulo = texto(fd, "titulo");
  if (!id || !titulo) return;
  const { error } = await sb()
    .from("casos")
    .update({
      titulo,
      cliente_id: texto(fd, "cliente_id"),
      numero_processo: texto(fd, "numero_processo"),
      orgao: texto(fd, "orgao"),
      area: texto(fd, "area"),
      status: texto(fd, "status") ?? "ativo",
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/casos/${id}`);
  revalidatePath("/casos");
}

/** Cria uma pendência já ligada a um caso (e ao cliente dele). */
export async function criarPendenciaDoCaso(fd: FormData) {
  const titulo = texto(fd, "titulo");
  const casoId = texto(fd, "caso_id");
  if (!titulo || !casoId) return;
  const bucket = String(fd.get("bucket") ?? "triagem");
  const { error } = await sb()
    .from("pendencias")
    .insert({
      titulo,
      caso_id: casoId,
      cliente_id: texto(fd, "cliente_id"),
      prazo: texto(fd, "prazo"),
      prazo_fatal: fd.get("prazo_fatal") === "on",
      bucket: isBucket(bucket) ? bucket : "triagem",
    });
  if (error) throw new Error(error.message);
  revalidatePath(`/casos/${casoId}`);
  revalidatePath("/pendencias");
  revalidatePath("/prazos");
  revalidatePath("/");
}
