import type { SupabaseClient } from "@supabase/supabase-js";
import { BUCKET_IDS, isBucket } from "@/lib/buckets";
import { hojeSP, somarDias } from "@/lib/pendencias";

// Ferramentas do Neo dentro da Central. Rodam com a sessão de quem está
// logado, então valem as mesmas regras de acesso (RLS) da Central.

const SITUACOES = BUCKET_IDS as string[];
const DATA = { type: "string", description: "Data no formato AAAA-MM-DD" };

export const FERRAMENTAS_NEO = [
  {
    name: "resumo_do_dia",
    description:
      "Pendências do dia: vencidas, com prazo hoje, prazos dos próximos 7 dias, sem prazo e contagem por situação.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "listar_pendencias",
    description: "Lista pendências, filtrando por situação ou por texto no título ou no cliente.",
    input_schema: {
      type: "object" as const,
      properties: {
        situacao: { type: "string", enum: SITUACOES },
        busca: { type: "string" },
        incluir_concluidas: { type: "boolean" },
      },
    },
  },
  {
    name: "criar_pendencia",
    description: "Cria uma pendência. Situação padrão: triagem.",
    input_schema: {
      type: "object" as const,
      properties: {
        titulo: { type: "string" },
        prazo: DATA,
        prazo_fatal: { type: "boolean" },
        situacao: { type: "string", enum: SITUACOES },
        descricao: { type: "string" },
      },
      required: ["titulo"],
    },
  },
  {
    name: "atualizar_pendencia",
    description:
      "Muda situação, prazo ou título de uma pendência pelo id. Para concluir, use situacao = concluido. Ache o id com listar_pendencias.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string" },
        situacao: { type: "string", enum: SITUACOES },
        prazo: DATA,
        titulo: { type: "string" },
      },
      required: ["id"],
    },
  },
];

const CAMPOS = "id, titulo, descricao, bucket, prazo, prazo_fatal, concluido_em, ordem, cliente:clientes(nome)";

function simples(p: any) {
  return {
    id: p.id,
    titulo: p.titulo,
    situacao: p.bucket,
    prazo: p.prazo,
    prazo_fatal: p.prazo_fatal,
    cliente: p.cliente?.nome ?? null,
    descricao: p.descricao,
  };
}

export async function executarFerramenta(sb: SupabaseClient, nome: string, a: any): Promise<unknown> {
  switch (nome) {
    case "resumo_do_dia": {
      const hoje = hojeSP();
      const limite = somarDias(hoje, 7);
      const { data, error } = await sb.from("pendencias").select(CAMPOS).neq("bucket", "concluido").order("ordem");
      if (error) throw new Error(error.message);
      const abertas = (data ?? []).map(simples);
      const porSituacao: Record<string, number> = {};
      abertas.forEach((p) => (porSituacao[p.situacao] = (porSituacao[p.situacao] ?? 0) + 1));
      const comPrazo = abertas.filter((p) => p.prazo).sort((x, y) => x.prazo!.localeCompare(y.prazo!));
      return {
        hoje,
        vencidas: comPrazo.filter((p) => p.prazo! < hoje),
        para_hoje: comPrazo.filter((p) => p.prazo === hoje),
        proximos_7_dias: comPrazo.filter((p) => p.prazo! > hoje && p.prazo! <= limite),
        sem_prazo: abertas.filter((p) => !p.prazo),
        em_aberto_por_situacao: porSituacao,
      };
    }
    case "listar_pendencias": {
      let q = sb.from("pendencias").select(CAMPOS).order("prazo", { ascending: true, nullsFirst: false });
      if (a?.situacao && isBucket(a.situacao)) q = q.eq("bucket", a.situacao);
      else if (!a?.incluir_concluidas) q = q.neq("bucket", "concluido");
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      let lista = (data ?? []).map(simples);
      if (a?.busca) {
        const b = String(a.busca).toLowerCase();
        lista = lista.filter((p) => p.titulo.toLowerCase().includes(b) || (p.cliente ?? "").toLowerCase().includes(b));
      }
      return lista;
    }
    case "criar_pendencia": {
      const titulo = String(a?.titulo ?? "").trim();
      if (!titulo) throw new Error("Título vazio.");
      const { data, error } = await sb
        .from("pendencias")
        .insert({
          titulo,
          prazo: a?.prazo || null,
          prazo_fatal: !!a?.prazo_fatal,
          bucket: isBucket(a?.situacao) ? a.situacao : "triagem",
          descricao: a?.descricao || null,
        })
        .select(CAMPOS)
        .single();
      if (error) throw new Error(error.message);
      return simples(data);
    }
    case "atualizar_pendencia": {
      const mudancas: Record<string, unknown> = {};
      if (a?.situacao) {
        if (!isBucket(a.situacao)) throw new Error("Situação inválida.");
        mudancas.bucket = a.situacao;
        mudancas.ordem = Date.now() / 1000;
      }
      if (a?.prazo) mudancas.prazo = a.prazo;
      if (a?.titulo) mudancas.titulo = String(a.titulo).trim();
      if (Object.keys(mudancas).length === 0) throw new Error("Nada para mudar.");
      const { data, error } = await sb.from("pendencias").update(mudancas).eq("id", a?.id).select(CAMPOS).single();
      if (error) throw new Error(error.message);
      return simples(data);
    }
    default:
      throw new Error(`Ferramenta desconhecida: ${nome}`);
  }
}
