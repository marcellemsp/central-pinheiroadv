import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { SITUACAO_IDS, DESCRICAO_SITUACOES } from "@/lib/neo/situacoes";

// Servidor MCP do Neo (transporte HTTP, respostas JSON).
// Conector no Claude: https://central-pinheiroadv.vercel.app/api/mcp?k=<NEO_CHAVE>
// A chave é conferida aqui e de novo no banco (funções public.neo_*).

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRpc = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: any };

const SITUACOES = SITUACAO_IDS;
const DATA = { type: "string", description: "Data no formato AAAA-MM-DD", pattern: "^\\d{4}-\\d{2}-\\d{2}$" };

const FERRAMENTAS = [
  {
    name: "resumo_do_dia",
    title: "Resumo do dia",
    description:
      "Pendências da Central PinheiroAdv para o dia: vencidas, com prazo hoje, prazos dos próximos 7 dias, pendências sem prazo e a contagem em aberto por situação. Use quando Marcelle pedir o resumo do dia ou disser 'bom dia, Neo'.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: "listar_pendencias",
    title: "Listar pendências",
    description: "Lista pendências, opcionalmente filtrando por situação ou por texto no título ou no nome do cliente.",
    inputSchema: {
      type: "object",
      properties: {
        situacao: { type: "string", enum: SITUACOES, description: DESCRICAO_SITUACOES },
        busca: { type: "string", description: "Texto a procurar no título, no cliente ou no caso (nome ou número)" },
        incluir_concluidas: { type: "boolean", default: false },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "criar_pendencia",
    title: "Criar pendência",
    description: "Cria uma pendência nova na Central, opcionalmente ligada a um cliente (pelo nome; se não existir, o cliente é criado). Situação padrão: a_fazer.",
    inputSchema: {
      type: "object",
      properties: {
        titulo: { type: "string", description: "Ex.: 'Yasmin — proposta do carro'" },
        prazo: DATA,
        prazo_fatal: { type: "boolean", default: false },
        situacao: { type: "string", enum: SITUACOES, default: "a_fazer" },
        descricao: { type: "string" },
        cliente: { type: "string", description: "Nome do cliente, ex.: 'Yasmin'" },
      },
      required: ["titulo"],
      additionalProperties: false,
    },
  },
  {
    name: "atualizar_pendencia",
    title: "Atualizar pendência",
    description:
      "Muda a situação, o prazo ou o título de uma pendência, pelo id. Para descobrir o id, use listar_pendencias com busca. Situações: " + DESCRICAO_SITUACOES,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "id da pendência" },
        situacao: { type: "string", enum: SITUACOES },
        prazo: DATA,
        titulo: { type: "string" },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "concluir_pendencia",
    title: "Concluir pendência",
    description: "Marca uma pendência como concluída, pelo id.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "id da pendência" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
];

function chaveValida(recebida: string | null): boolean {
  const esperada = process.env.NEO_CHAVE;
  if (!esperada || !recebida) return false;
  const a = Buffer.from(recebida);
  const b = Buffer.from(esperada);
  return a.length === b.length && timingSafeEqual(a, b);
}

function banco() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function rpc(nome: string, args: Record<string, unknown>, chave: string) {
  const { data, error } = await banco().rpc(nome, { p_chave: chave, ...args });
  if (error) throw new Error(error.message);
  return data;
}

async function chamarFerramenta(nome: string, a: any, chave: string) {
  const opc = (v: unknown) => (v === undefined || v === "" ? null : v);
  switch (nome) {
    case "resumo_do_dia":
      return rpc("neo_resumo", {}, chave);
    case "listar_pendencias":
      return rpc(
        "neo_listar",
        { p_situacao: opc(a?.situacao), p_busca: opc(a?.busca), p_incluir_concluidas: !!a?.incluir_concluidas },
        chave,
      );
    case "criar_pendencia":
      return rpc(
        "neo_criar",
        {
          p_titulo: a?.titulo,
          p_prazo: opc(a?.prazo),
          p_prazo_fatal: !!a?.prazo_fatal,
          p_situacao: opc(a?.situacao) ?? "a_fazer",
          p_descricao: opc(a?.descricao),
          p_cliente: opc(a?.cliente),
        },
        chave,
      );
    case "atualizar_pendencia":
      return rpc(
        "neo_atualizar",
        { p_id: a?.id, p_situacao: opc(a?.situacao), p_prazo: opc(a?.prazo), p_titulo: opc(a?.titulo) },
        chave,
      );
    case "concluir_pendencia":
      return rpc("neo_atualizar", { p_id: a?.id, p_situacao: "concluida" }, chave);
    default:
      throw new Error(`Ferramenta desconhecida: ${nome}`);
  }
}

async function responder(msg: JsonRpc, chave: string) {
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id: msg.id ?? null, result });
  const falha = (code: number, message: string) => ({ jsonrpc: "2.0", id: msg.id ?? null, error: { code, message } });

  switch (msg.method) {
    case "initialize":
      return ok({
        protocolVersion: msg.params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "neo", title: "Neo · Central PinheiroAdv", version: "0.1.0" },
        instructions:
          "Neo é o assistente da Central PinheiroAdv, sistema interno do Pinheiro Advogados (Marcelle Pinheiro). Situações: a_fazer, em_elaboracao, revisao_pendente, devolvida, pronta_protocolar, aguardando_cliente, aguardando, bloqueada, concluida. Datas em AAAA-MM-DD, fuso de São Paulo.",
      });
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: FERRAMENTAS });
    case "tools/call": {
      const nome = msg.params?.name;
      try {
        const dados = await chamarFerramenta(nome, msg.params?.arguments ?? {}, chave);
        return ok({
          content: [{ type: "text", text: JSON.stringify(dados, null, 2) }],
          structuredContent: Array.isArray(dados) ? { pendencias: dados } : dados,
        });
      } catch (e) {
        return ok({ content: [{ type: "text", text: `Erro: ${(e as Error).message}` }], isError: true });
      }
    }
    default:
      return falha(-32601, `Método não suportado: ${msg.method}`);
  }
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const auth = request.headers.get("authorization");
  const chave = url.searchParams.get("k") ?? (auth?.startsWith("Bearer ") ? auth.slice(7) : null);
  if (!chaveValida(chave)) {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Não autorizado" } }, { status: 401 });
  }

  let corpo: JsonRpc | JsonRpc[];
  try {
    corpo = await request.json();
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON inválido" } }, { status: 400 });
  }

  const lista = Array.isArray(corpo) ? corpo : [corpo];
  const respostas = [];
  for (const msg of lista) {
    // Notificações não têm resposta.
    if (msg.id === undefined || msg.method?.startsWith("notifications/")) continue;
    respostas.push(await responder(msg, chave!));
  }
  if (respostas.length === 0) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(corpo) ? respostas : respostas[0]);
}

export async function GET() {
  return new Response("Método não permitido", { status: 405, headers: { Allow: "POST" } });
}

export async function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
