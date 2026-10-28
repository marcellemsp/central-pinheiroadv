import { createBrowserClient } from "@supabase/ssr";
import { protegerExclusao } from "./guard-exclusao";

// Cliente do navegador. protegerExclusao() intercepta .delete(): quem não coordena vê o pedido
// de exclusão com motivo, e nada é apagado direto (o RLS barra de todo jeito).
export const createClient = () =>
  protegerExclusao(
    createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    ),
  );
