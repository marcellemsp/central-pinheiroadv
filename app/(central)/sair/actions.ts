"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function sair() {
  const supabase = createClient();
  await supabase?.auth.signOut();
  cookies().delete("pa_ultimo_acesso");
  redirect("/login");
}
