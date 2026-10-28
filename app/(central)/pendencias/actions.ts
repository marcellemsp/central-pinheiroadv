"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isBucket } from "@/lib/buckets";

function cliente() {
  const supabase = createClient();
  if (!supabase) throw new Error("Banco de dados não configurado.");
  return supabase;
}

export async function criarPendencia(formData: FormData) {
  const titulo = String(formData.get("titulo") ?? "").trim();
  if (!titulo) return;
  const prazo = String(formData.get("prazo") ?? "").trim() || null;
  const clienteId = String(formData.get("cliente_id") ?? "").trim() || null;
  const bucket = String(formData.get("bucket") ?? "triagem");
  const { error } = await cliente()
    .from("pendencias")
    .insert({
      titulo,
      prazo,
      prazo_fatal: formData.get("prazo_fatal") === "on",
      cliente_id: clienteId,
      bucket: isBucket(bucket) ? bucket : "triagem",
    });
  if (error) throw new Error(error.message);
  revalidatePath("/pendencias");
  revalidatePath("/");
}

export async function moverPendencia(id: string, bucket: string) {
  if (!isBucket(bucket)) throw new Error("Bucket inválido.");
  const { error } = await cliente()
    .from("pendencias")
    .update({ bucket, ordem: Date.now() / 1000 })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/pendencias");
  revalidatePath("/");
}

export async function concluirPendencia(id: string) {
  return moverPendencia(id, "concluido");
}
