// Acompanhamento Push (v53): a rotina eproc consulta, o advogado decide.
// Helpers puros (também usados pelas rotas /api/varredura*) + carregamento dos itens Push para a Home e a página.
// 26/10/2026: rótulo de cada visita do robô (rotuloVisita): sem novidade / novidade / consultado · cópia na fila (lido) / não consultado (fila) / falhas.
import type { createClient } from "./supabase";
import { type AcompItem, type Registro, hojeISO, addDias, norm } from "./acompanhamento";

type SB = ReturnType<typeof createClient>;

// Palavras que marcam urgência na lista do dia da varredura (urgente_previsto). 16/10/2026: SISBAJUD/RENAJUD/BACENJUD
// (constrição patrimonial). O decurso de prazo do cliente ("Decorrido prazo" + cliente_nomes) é decidido pela própria
// varredura, não por palavra. Mesma janela de 15 dias da pa_copias_importar v1.10.
export const PALAVRAS_URGENTE_PADRAO = ["sentença", "acórdão", "liminar", "tutela", "sisbajud", "renajud", "bacenjud"];

/* ───────── sistema / sub eproc ───────── */
export type SubEproc = "tjrj1" | "tjrj2" | "jfrj" | "trf2" | "jfes" | "trf4" | "tjrs1" | "tjrs2" | "tjsc1" | "tjsc2" | "tjto1" | "tjto2";
export const HOSTS: Record<SubEproc, string> = {
  tjrj1: "https://eproc1g.tjrj.jus.br", tjrj2: "https://eproc2g.tjrj.jus.br",
  jfrj: "https://eproc.jfrj.jus.br", trf2: "https://eproc.trf2.jus.br", jfes: "https://eproc.jfes.jus.br",
  trf4: "https://eproc.trf4.jus.br", tjrs1: "https://eproc1g.tjrs.jus.br", tjrs2: "https://eproc2g.tjrs.jus.br",
  tjsc1: "https://eproc1g.tjsc.jus.br", tjsc2: "https://eproc2g.tjsc.jus.br",
  tjto1: "https://eproc1.tjto.jus.br/eprocV2_prod_1grau", tjto2: "https://eproc2.tjto.jus.br/eprocV2_prod_2grau",
};

/** Texto que descreve o sistema do caso (campo "onde" do acompanhamento ou dados do caso). */
export const ondeTexto = (c?: { onde?: string | null; caso?: { dados?: Record<string, any> | null; orgao?: string | null } | null } | null) =>
  [c?.onde, c?.caso?.dados?.sistema, c?.caso?.dados?.tribunal, c?.caso?.orgao].filter(Boolean).join(" · ");

/** O processo está num sistema eproc? (pelo texto do "onde"/sistema ou pelo segmento do CNJ) */
export function ehEproc(onde: string | null | undefined, numero: string | null | undefined): boolean {
  const s = (onde ?? "").toLowerCase();
  if (/e-?proc/.test(s)) return true;
  if (/pje|e-saj|esaj|dcp|sei|comprot|projudi|themis|e-cac|ecac/.test(s)) return false;
  const n = (numero ?? "").replace(/\D/g, "");
  if (n.length !== 20) return false;
  const j = n.slice(13, 14), tr = n.slice(14, 16);
  return (j === "8" && ["19", "21", "24", "27"].includes(tr)) || (j === "4" && ["02", "04"].includes(tr));
}

/** Sub/host do eproc a partir do "onde", do órgão e do nº CNJ. null = não dá para saber. */
export function subEproc(onde: string | null | undefined, numero: string | null | undefined): SubEproc | null {
  const s = (onde ?? "").toUpperCase();
  const n = (numero ?? "").replace(/\D/g, "");
  const j = n.length === 20 ? n.slice(13, 14) : "", tr = n.length === 20 ? n.slice(14, 16) : "", origem = n.length === 20 ? n.slice(16, 20) : "";
  const g2 = origem === "0000" || /2[ºo°]?\s*G|\b2G\b|TURMA|C[ÂA]MARA|DESEMBARG|RELATOR/.test(s);
  if (/TJRJ/.test(s) || (j === "8" && tr === "19")) return g2 ? "tjrj2" : "tjrj1";
  // Federal 2ª Região (4.02): TRF2 = 2ª instância (origem 0000). Vara federal (1ª inst, origem ≠ 0000) = JFRJ/JFES.
  // IMPORTANTE: não deixar a mera presença do texto "TRF-2" forçar trf2 — varas da 2ª Região no RJ aparecem rotuladas
  // como "TRF-2" na planilha, mas são jfrj (learning 21 de 02 Contexto/eproc-aprendizados.md).
  if (j === "4" && tr === "02") {
    if (origem === "0000") return "trf2";
    if (/JFES|ESP[IÍ]RITO\s*SANTO/.test(s)) return "jfes";
    return "jfrj";
  }
  if (j === "4" && tr === "04") return "trf4";
  if (/TJRS/.test(s) || (j === "8" && tr === "21")) return g2 ? "tjrs2" : "tjrs1";
  if (/TJSC/.test(s) || (j === "8" && tr === "24")) return g2 ? "tjsc2" : "tjsc1";
  if (/TJTO/.test(s) || (j === "8" && tr === "27")) return g2 ? "tjto2" : "tjto1";
  // sem CNJ útil: cair no texto (jfrj antes de trf2 para não errar vara → tribunal)
  if (/JFRJ/.test(s)) return "jfrj";
  if (/JFES/.test(s)) return "jfes";
  if (/TRF-?2|TRF2/.test(s)) return "trf2";
  if (/TRF-?4|TRF4/.test(s)) return "trf4";
  return null;
}

/** Caso já tem íntegra na Central? (pelo marcador gravado pela Rotina A) */
export const temIntegra = (c?: { eproc_ultimo_seq?: number | null } | null) => !!c && c.eproc_ultimo_seq != null;

/* ───────── visita da rotina (payload gravado em acompanhamento_registros.visita) ───────── */
export type EventoNovo = { seq: number; data: string; evento: string; doc?: boolean };
export type Visita = {
  caso_id: string; numero: string; sub?: string; visto_em?: string; rodada?: string;
  trib_ultimo_seq?: number | null; central_ultimo_seq?: number | null;
  acao?: "sem_novidade" | "delta" | "integra_completa" | "adiado_buildup" | "nenhuma"; eventos?: string;
  arquivo?: string | null; resultado?: string;
  urgente_previsto?: boolean; urgente_trecho?: string | null; eventos_novos?: EventoNovo[];
lido?: boolean; obs?: string | null; // lido = abriu e leu os movimentos, mas deixou a cópia para depois (adiado_buildup)
};

const ROT_FALHA: Record<string, string> = { login: "Falha de login", "2fa": "Falha no código 2FA", "429": "Bloqueado pelo tribunal (429)", nao_encontrado: "Não encontrado", download: "Erro no download", arquivo_desatualizado: "Erro · arquivo desatualizado", erro: "Erro", sem_host: "Erro · sistema não identificado", inconsistencia: "Erro · inconsistência" };
export const visitaLida = (v?: Partial<Visita> | null) => !!v && (v.lido === true || /^lido sem baixar/i.test(String(v.obs ?? "")));
/** Rótulo de uma visita do robô (regra de 26/10/2026). ok = conta como consulta bem-sucedida. */
export function rotuloVisita(v?: Partial<Visita> | null): { t: string; ok: boolean } {
if (!v) return { t: "Sem dados da visita", ok: false };
const res = String(v.resultado ?? "");
if (res.startsWith("falhou") || res === "sem_host" || res === "inconsistencia") { const k = res.replace("falhou:", ""); return { t: ROT_FALHA[k] ?? `Erro (${k})`, ok: false }; }
if (v.acao === "adiado_buildup") return visitaLida(v) ? { t: "Consultado · cópia na fila", ok: true } : { t: "Não consultado (fila)", ok: false };
if (v.acao === "delta" || v.acao === "integra_completa") return { t: "Novidade", ok: true };
if (v.acao === "sem_novidade") return { t: "Sem novidade", ok: true };
return { t: "Não consultado", ok: false };
}
/** Rodada da visita ("12:00 retentativa", "19:30 base") ou a hora. */
export const rodadaVisita = (v?: Partial<Visita> | null) => v?.rodada || (v?.visto_em ? new Date(v.visto_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "");

export type AndCopia = { id: string; caso_id: string; data: string; descricao: string; fonte: string; urgente: boolean | null; urgente_motivo: string | null; criado_em: string; ref_externa?: string | null };
export type AlerteHoje = { id: string; caso_id: string; status: string; proposto_por: string | null; aprovado_por: string | null; proposta: any };

/** Item Push enriquecido: registro de hoje da rotina (se houver), andamentos capturados e alerte do dia. */
export type PushItem = AcompItem & {
  regHoje: Registro | null;        // consulta/rotina_falhou de hoje, origem rotina
  visita: Visita | null;
  capturados: AndCopia[];          // andamentos fonte 'copia' gravados pela Rotina A desde a visita (até 3 dias)
  alerteHoje: AlerteHoje | null;
  estado: "decidir" | "decidido" | "sem_novidade" | "falhou" | "aguardando" | "fila" | "lido";
};

export const regRotinaHoje = (it: AcompItem, hoje = hojeISO()) =>
  [...it.regs].filter(r => r.origem === "rotina" && r.data_ref === hoje && (r.tipo === "consulta" || r.tipo === "rotina_falhou" || r.tipo === "nao_consultado")).sort((a, b) => b.criado_em.localeCompare(a.criado_em))[0] ?? null;

/** Hoje a rotina falhou neste caso (push) → volta a ser consulta manual no dia. */
export const falhouHoje = (it: AcompItem) => it.modo === "push" && it.se_falhar !== "avisar" && regRotinaHoje(it)?.tipo === "rotina_falhou";

export function estadoPush(it: AcompItem, r: Registro | null): PushItem["estado"] {
  if (!r) return "aguardando";
  if (r.tipo === "rotina_falhou") return "falhou";
if (r.tipo === "nao_consultado") return "fila";
if ((r.visita as any)?.acao === "adiado_buildup") return visitaLida(r.visita as any) ? "lido" : "fila";
  if (r.resultado === "sem_novidade") return "sem_novidade";
  return r.decisao ? "decidido" : "decidir";
}

/** Enriquecimento dos itens em modo push com andamentos capturados e alerte do dia. */
export async function enriquecerPush(supabase: SB, itens: AcompItem[]): Promise<PushItem[]> {
  const push = itens.filter(i => i.modo === "push" && i.status !== "sugerido");
  if (!push.length) return [];
  const hoje = hojeISO(); const casoIds = Array.from(new Set(push.map(i => i.caso_id)));
  const [{ data: ands }, { data: als }] = await Promise.all([
    supabase.from("caso_andamentos").select("id, caso_id, data, descricao, fonte, urgente, urgente_motivo, criado_em, ref_externa").in("caso_id", casoIds).eq("fonte", "copia").gte("criado_em", addDias(hoje, -3) + "T00:00:00").order("data", { ascending: false }).order("criado_em", { ascending: false }).limit(2000),
    supabase.from("alertes").select("id, caso_id, status, proposto_por, aprovado_por, proposta").in("caso_id", casoIds).eq("data", hoje).limit(500),
  ]);
  return push.map(it => {
    const r = regRotinaHoje(it, hoje);
    const visita = (r?.visita ?? null) as Visita | null;
    const desde = r ? r.criado_em : hoje + "T00:00:00";
    const capturados = ((ands ?? []) as AndCopia[]).filter(a => a.caso_id === it.caso_id && (a.criado_em >= desde || !r)).slice(0, 12);
    const alerteHoje = ((als ?? []) as AlerteHoje[]).find(a => a.caso_id === it.caso_id) ?? null;
    return { ...it, regHoje: r, visita, capturados, alerteHoje, estado: estadoPush(it, r) };
  });
}

/** Decide um item do dia: ciente / pendência / prazo. */
export async function decidirPush(supabase: SB, item: PushItem, decisao: "ciente" | "pendencia" | "prazo", quem: string | null) {
  if (!item.regHoje) return { error: { message: "Sem visita da rotina hoje para decidir." } } as any;
  return supabase.from("acompanhamento_registros").update({ decisao, decidido_por: quem, decidido_em: new Date().toISOString() }).eq("id", item.regHoje.id);
}

/** Cumprimento das decisões Push nos últimos N dias úteis (antes de hoje): visitas com andamento × decididas. */
export function cumprimentoPush(itens: AcompItem[], dias: string[]) {
  const ini = dias[dias.length - 1]; const fim = dias[0];
  const por: Record<string, { feitas: number; total: number }> = {};
  itens.filter(i => i.modo === "push" && i.status === "ativo").forEach(i => {
    const k = (i.responsavel ?? "").trim().split(/\s+/)[0] ?? ""; por[k] ??= { feitas: 0, total: 0 };
    i.regs.filter(r => r.origem === "rotina" && r.tipo === "consulta" && r.resultado === "teve_andamento" && r.data_ref >= ini && r.data_ref <= fim).forEach(r => { por[k].total++; if (r.decisao) por[k].feitas++; });
  });
  return por;
}

export const primeiroNomeDe = (s?: string | null) => (s ?? "").trim().split(/\s+/)[0] ?? "";
export { norm };
