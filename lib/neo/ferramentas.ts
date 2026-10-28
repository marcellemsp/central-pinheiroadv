import { createClient } from "@supabase/supabase-js";
import { SITUACAO_IDS, DESCRICAO_SITUACOES } from "./situacoes";

// Ferramentas do Neo dentro da Central. Usam as mesmas funções do banco que o conector MCP
// (public.neo_*), com a chave NEO_CHAVE do servidor; quem chama já passou pelo login.

const DATA = { type: "string", description: "Data no formato AAAA-MM-DD" };

export const FERRAMENTAS_NEO = [
  {
    name: "resumo_do_dia",
    description: "Pendências do dia: vencidas, com prazo hoje, prazos dos próximos 7 dias, sem prazo, publicações sem destinação e contagem por situação.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "listar_pendencias",
    description: "Lista pendências, filtrando por situação ou por texto no título, no cliente ou no caso.",
    input_schema: {
      type: "object" as const,
      properties: {
        situacao: { type: "string", enum: SITUACAO_IDS, description: DESCRICAO_SITUACOES },
        busca: { type: "string" },
        incluir_concluidas: { type: "boolean" },
      },
    },
  },
  {
    name: "criar_pendencia",
    description: "Cria uma pendência, opcionalmente ligada a um cliente pelo nome. Situação padrão: a_fazer.",
    input_schema: {
      type: "object" as const,
      properties: {
        titulo: { type: "string" },
        prazo: DATA,
        prazo_fatal: { type: "boolean" },
        situacao: { type: "string", enum: SITUACAO_IDS },
        descricao: { type: "string" },
        cliente: { type: "string" },
      },
      required: ["titulo"],
    },
  },
  {
    name: "atualizar_pendencia",
    description: "Muda situação, prazo ou título de uma pendência pelo id. Para concluir, use situacao = concluida. Ache o id com listar_pendencias.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string" },
        situacao: { type: "string", enum: SITUACAO_IDS },
        prazo: DATA,
        titulo: { type: "string" },
      },
      required: ["id"],
    },
  },
];

function banco() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function rpc(nome: string, args: Record<string, unknown>) {
  const chave = process.env.NEO_CHAVE;
  if (!chave) throw new Error("NEO_CHAVE não configurada no servidor.");
  const { data, error } = await banco().rpc(nome, { p_chave: chave, ...args });
  if (error) throw new Error(error.message);
  return data;
}

export async function executarFerramenta(nome: string, a: any): Promise<unknown> {
  const opc = (v: unknown) => (v === undefined || v === "" ? null : v);
  switch (nome) {
    case "resumo_do_dia":
      return rpc("neo_resumo", {});
    case "listar_pendencias":
      return rpc("neo_listar", { p_situacao: opc(a?.situacao), p_busca: opc(a?.busca), p_incluir_concluidas: !!a?.incluir_concluidas });
    case "criar_pendencia":
      return rpc("neo_criar", {
        p_titulo: a?.titulo, p_prazo: opc(a?.prazo), p_prazo_fatal: !!a?.prazo_fatal,
        p_situacao: opc(a?.situacao) ?? "a_fazer", p_descricao: opc(a?.descricao), p_cliente: opc(a?.cliente),
      });
    case "atualizar_pendencia":
      return rpc("neo_atualizar", { p_id: a?.id, p_situacao: opc(a?.situacao), p_prazo: opc(a?.prazo), p_titulo: opc(a?.titulo) });
    default:
      throw new Error(`Ferramenta desconhecida: ${nome}`);
  }
}
