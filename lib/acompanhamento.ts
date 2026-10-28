// Acompanhamento diário / semanal de processos (v49).
// Regras: diário = todo dia útil (feriados de Configurações); semanal = no dia escolhido (se cair em feriado, próximo dia útil).
// Consulta não feita no dia vira "não consultado" (derivado, aparece no histórico) e o item fica atrasado até alguém registrar.
import type { createClient } from "./supabase";
import { ehCoordenadorNome } from "./equipe";

type SB = ReturnType<typeof createClient>;

export type AcompStatus = "sugerido" | "ativo" | "pausado" | "encerrado" | "rejeitado";
export type Acomp = {
  id: string; caso_id: string; empresa_id: string | null;
  frequencia: "diario" | "semanal"; dia_semana: number | null;
  responsavel: string; onde: string | null; o_que: string | null; motivo: string | null; origem: string | null;
  status: AcompStatus; ate: string | null; inicio: string; modo?: "humano" | "push" | null; furar_fila_alerte?: boolean | null; palavras_urgente?: string[] | null; integra_completa_pendente?: boolean | null; se_falhar?: "manual" | "avisar" | null; link_consulta?: string | null;
  sugerido_por: string | null; criado_por: string | null; aprovado_por: string | null; aprovado_em: string | null;
  criado_em: string; atualizado_em: string;
};
export type Registro = {
  id: string; acompanhamento_id: string; caso_id: string;
  tipo: "consulta" | "cobranca" | "criado" | "sugerido" | "aprovado" | "rejeitado" | "frequencia" | "pausado" | "retomado" | "encerrado" | "editado" | "rotina_falhou" | "nao_consultado" | "base_recebida";
  resultado: "sem_novidade" | "teve_andamento" | null;
  data_ref: string; data_ultimo_andamento: string | null; andamento_id: string | null;
  autor: string | null; obs: string | null; criado_em: string; origem?: string | null; visita?: any; decisao?: "ciente" | "pendencia" | "prazo" | null; decidido_por?: string | null; decidido_em?: string | null; visitas?: any[] | null;
};
export type CasoMin = { id: string; titulo: string; numero: string | null; area: string; empresa_id: string; advogado: string | null; orgao: string | null; dados: Record<string, any> | null };
export type EmpMin = { id: string; nome: string; nome_exibicao: string | null; banca: string | null };

export type Situacao = {
  st: "atras" | "pend" | "feito" | "fora" | "pausado" | "sugerido";
  abertos: string[];      // dias devidos sem consulta desde a última consulta (atraso em aberto)
  perdidos: string[];     // todos os dias perdidos na janela (histórico)
  atraso: number;         // dias úteis desde o 1º dia em aberto
  devidoHoje: boolean;
  prox: string | null;    // próximo dia devido (quando "fora")
  ultConsulta: Registro | null;
  cobrancaHoje: Registro | null;
};
export type AcompItem = Acomp & { caso: CasoMin | null; empresa: EmpMin | null; regs: Registro[]; ultAndamento: string | null; sit: Situacao };

export const DIAS_SEM = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const DIAS_SEM_LONGO = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
export const ESFERAS_CONSULTA = ["nacional", "rj", "rio", "forense", "tjrj"];

/* ── datas locais (Brasília) ── */
export const isoLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export const hojeISO = () => isoLocal(new Date());
export const addDias = (iso: string, n: number) => { const x = new Date(iso + "T12:00:00"); x.setDate(x.getDate() + n); return isoLocal(x); };
export const dow = (iso: string) => new Date(iso + "T12:00:00").getDay();
export const fmtCurto = (iso?: string | null) => iso ? `${DIAS_SEM[dow(iso)].toLowerCase()} ${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—";
export const fmtData = (iso?: string | null) => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—";
export const fmtHora = (ts?: string | null) => ts ? new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
export const ehUtil = (iso: string, feriados: Set<string>) => { const d = dow(iso); return d !== 0 && d !== 6 && !feriados.has(iso); };
export const proxUtil = (iso: string, feriados: Set<string>) => { let x = iso; let k = 0; while (!ehUtil(x, feriados) && k < 15) { x = addDias(x, 1); k++; } return x; };
export function uteisEntre(de: string, ate: string, feriados: Set<string>) { let n = 0; let x = addDias(de, 1); while (x <= ate) { if (ehUtil(x, feriados)) n++; x = addDias(x, 1); } return n; }

export const labelFreq = (a: Pick<Acomp, "frequencia" | "dia_semana">) => a.frequencia === "diario" ? "Diário" : `Semanal · ${DIAS_SEM[a.dia_semana ?? 1].toLowerCase()}`;
export const ondePadrao = (c?: CasoMin | null) => [c?.dados?.sistema, c?.dados?.tribunal].filter(Boolean).join(" · ") || c?.orgao || "";

/** Dias devidos entre de..ate (inclusive). Semanal: o dia da semana escolhido, empurrado para o próximo útil se for feriado. */
export function diasDevidos(a: Pick<Acomp, "frequencia" | "dia_semana">, de: string, ate: string, feriados: Set<string>) {
  const out: string[] = []; let x = de;
  while (x <= ate) {
    if (a.frequencia === "diario") { if (ehUtil(x, feriados)) out.push(x); }
    else if (dow(x) === (a.dia_semana ?? 1)) { const u = proxUtil(x, feriados); if (u <= ate && !out.includes(u)) out.push(u); }
    x = addDias(x, 1);
  }
  return out;
}

export function situacao(a: Acomp, regs: Registro[], feriados: Set<string>, hoje = hojeISO()): Situacao {
  const consultas = regs.filter(r => r.tipo === "consulta").map(r => r.data_ref).sort();
  const ultC = [...regs].filter(r => r.tipo === "consulta").sort((x, y) => (y.data_ref + y.criado_em).localeCompare(x.data_ref + x.criado_em))[0] ?? null;
  const cobrancaHoje = regs.filter(r => r.tipo === "cobranca" && isoLocal(new Date(r.criado_em)) === hoje).sort((x, y) => y.criado_em.localeCompare(x.criado_em))[0] ?? null;
  const base: Situacao = { st: "fora", abertos: [], perdidos: [], atraso: 0, devidoHoje: false, prox: null, ultConsulta: ultC, cobrancaHoje };
  if (a.status === "sugerido") return { ...base, st: "sugerido" };
  const janelaIni = [a.inicio, addDias(hoje, -60)].sort().slice(-1)[0];
  const fim = a.ate && a.ate < hoje ? a.ate : hoje;
  const devidos = janelaIni <= fim ? diasDevidos(a, janelaIni, fim, feriados) : [];
  const devidoHoje = devidos.includes(hoje);
  const passados = devidos.filter(d => d < hoje);
  // dia devido d é cumprido se houver consulta em d (diário) ou entre d e o próximo devido (semanal)
  const cumprido = (d: string, i: number) => a.frequencia === "diario" ? consultas.includes(d) : consultas.some(c => c >= d && c < (passados[i + 1] ?? devidos[devidos.indexOf(d) + 1] ?? "9999-12-31"));
  const perdidos = passados.filter((d, i) => !cumprido(d, i));
  const ultData = consultas.slice(-1)[0] ?? "";
  const abertos = perdidos.filter(d => d > ultData);
  const prox = (() => { let x = addDias(hoje, 1); for (let k = 0; k < 21; k++) { const dd = diasDevidos(a, x, x, feriados); if (dd.length) return dd[0]; x = addDias(x, 1); } return null; })();
  const feitoHoje = consultas.includes(hoje);
  const sit: Situacao = { ...base, perdidos, abertos, devidoHoje, prox, atraso: abertos.length ? Math.max(1, uteisEntre(abertos[0], hoje, feriados)) : 0 };
  if (a.status === "pausado") return { ...sit, st: "pausado" };
  if (abertos.length && !feitoHoje) return { ...sit, st: "atras" };
  if (feitoHoje) return { ...sit, st: "feito" };
  if (devidoHoje) return { ...sit, st: "pend" };
  return { ...sit, st: "fora" };
}

export const ORDEM_ST: Record<Situacao["st"], number> = { atras: 0, pend: 1, feito: 2, fora: 3, pausado: 4, sugerido: 5 };

/** Consulta que de fato abriu o processo: manual, ou da rotina com sucesso (inclui "lido sem baixar"). Fila e falha não contam. */
export const consultaOk = (r: Registro) => r.tipo === "consulta" && !String((r.visita as any)?.resultado ?? "").startsWith("falhou");
/** Alerta de Atenção: sem consulta bem-sucedida além da frequência (diário: mais de 2 dias úteis; semanal: mais de 7 dias). null = em dia. */
export function semConsultaOk(it: AcompItem, feriados: Set<string>, hoje = hojeISO()): { desde: string | null; dias: number; ultima: Registro | null } | null {
if (it.status !== "ativo") return null;
const ult = it.regs.filter(consultaOk).map(r => r.data_ref).sort().slice(-1)[0] ?? null;
const base = ult ?? it.inicio;
if (!base || base >= hoje) return null;
const dias = it.frequencia === "diario" ? uteisEntre(base, hoje, feriados) : Math.round((Date.parse(hoje) - Date.parse(base)) / 864e5);
if (dias <= (it.frequencia === "diario" ? 2 : 7)) return null;
const ultima = [...it.regs].filter(r => r.tipo === "consulta" || r.tipo === "rotina_falhou" || r.tipo === "nao_consultado").sort((a, b) => (b.data_ref + b.criado_em).localeCompare(a.data_ref + a.criado_em))[0] ?? null;
return { desde: ult, dias, ultima };
}

export async function carregarFeriados(supabase: SB, de: string, ate: string) {
  const { data } = await supabase.from("dias_nao_uteis").select("data, esferas, tipo, status").gte("data", de).lte("data", ate).eq("status", "confirmado");
  const s = new Set<string>();
  (data ?? []).forEach((d: any) => { if (d.tipo === "ponto_facultativo") return; const esf: string[] = d.esferas ?? []; if (!esf.length || esf.some(e => ESFERAS_CONSULTA.includes(e))) s.add(d.data); });
  return s;
}

/** Carrega acompanhamentos vivos (ativos, pausados e sugestões) com caso, cliente, registros e último andamento do sistema. */
export async function carregarAcomp(supabase: SB, f: { casoId?: string; responsavel?: string; incluirSugestoes?: boolean } = {}): Promise<{ itens: AcompItem[]; feriados: Set<string> }> {
  const hoje = hojeISO(); const de = addDias(hoje, -60);
  let q = supabase.from("acompanhamentos").select("*").in("status", f.incluirSugestoes === false ? ["ativo", "pausado"] : ["ativo", "pausado", "sugerido"]);
  if (f.casoId) q = q.eq("caso_id", f.casoId);
  const [{ data: acs }, feriados] = await Promise.all([q.order("criado_em", { ascending: true }), carregarFeriados(supabase, addDias(de, -7), addDias(hoje, 30))]);
  let lista = (acs ?? []) as Acomp[];
  if (f.responsavel) { const r = norm(f.responsavel); lista = lista.filter(a => norm(a.responsavel) === r || norm(a.sugerido_por) === r); }
  if (!lista.length) return { itens: [], feriados };
  const ids = lista.map(a => a.id); const casoIds = Array.from(new Set(lista.map(a => a.caso_id)));
  const [{ data: casos }, { data: regs }, { data: ands }] = await Promise.all([
    supabase.from("casos").select("id, titulo, numero, area, empresa_id, advogado, orgao, dados").in("id", casoIds),
    supabase.from("acompanhamento_registros").select("*").in("acompanhamento_id", ids).gte("data_ref", addDias(de, -7)).order("criado_em", { ascending: false }).limit(5000),
    supabase.from("caso_andamentos").select("caso_id, data").in("caso_id", casoIds).order("data", { ascending: false }).limit(3000),
  ]);
  const empIds = Array.from(new Set((casos ?? []).map((c: any) => c.empresa_id).filter(Boolean)));
  const { data: emps } = empIds.length ? await supabase.from("empresas").select("id, nome, nome_exibicao, banca").in("id", empIds) : { data: [] as any[] };
  const cM = new Map((casos ?? []).map((c: any) => [c.id, c as CasoMin]));
  const eM = new Map((emps ?? []).map((e: any) => [e.id, e as EmpMin]));
  const ultAnd = new Map<string, string>(); (ands ?? []).forEach((a: any) => { if (!ultAnd.has(a.caso_id) || a.data > ultAnd.get(a.caso_id)!) ultAnd.set(a.caso_id, a.data); });
  const itens: AcompItem[] = lista.map(a => {
    const rr = ((regs ?? []) as Registro[]).filter(r => r.acompanhamento_id === a.id);
    const caso = cM.get(a.caso_id) ?? null;
    return { ...a, caso, empresa: caso ? eM.get(caso.empresa_id) ?? null : null, regs: rr, ultAndamento: ultAnd.get(a.caso_id) ?? null, sit: situacao(a, rr, feriados, hoje) };
  });
  return { itens, feriados };
}

/** Cumprimento nos últimos N dias úteis (antes de hoje): dias devidos x cumpridos no próprio dia, por responsável. */
export function cumprimento(itens: AcompItem[], feriados: Set<string>, n = 7) {
  const hoje = hojeISO(); const dias: string[] = []; let x = addDias(hoje, -1);
  while (dias.length < n) { if (ehUtil(x, feriados)) dias.push(x); x = addDias(x, -1); if (x < addDias(hoje, -40)) break; }
  const ini = dias[dias.length - 1] ?? hoje;
  const por: Record<string, { feitos: number; total: number; cobr: number; pushFeitas: number; pushTotal: number }> = {};
  itens.filter(i => i.status === "ativo").forEach(i => {
    const k = primeiro(i.responsavel); por[k] ??= { feitos: 0, total: 0, cobr: 0, pushFeitas: 0, pushTotal: 0 };
    if (i.modo === "push") {
      // Push: o que se cobra do advogado é a decisão sobre o que a rotina capturou (não a consulta)
      i.regs.filter(r => r.origem === "rotina" && r.tipo === "consulta" && r.resultado === "teve_andamento" && r.data_ref >= ini && r.data_ref < hoje).forEach(r => { por[k].pushTotal++; if (r.decisao) por[k].pushFeitas++; });
      return;
    }
    const devidos = diasDevidos(i, [i.inicio, ini].sort().slice(-1)[0], addDias(hoje, -1), feriados);
    por[k].total += devidos.length; por[k].feitos += devidos.filter(d => !i.sit.perdidos.includes(d)).length;
    por[k].cobr += i.regs.filter(r => r.tipo === "cobranca" && r.data_ref >= ini).length;
  });
  return Object.entries(por).map(([nome, v]) => ({ nome, ...v, pct: v.total ? Math.round((v.feitos / v.total) * 100) : 100, pushPct: v.pushTotal ? Math.round((v.pushFeitas / v.pushTotal) * 100) : 100 })).sort((a, b) => a.nome.localeCompare(b.nome));
}

/* ── nomes ── */
export const norm = (s?: string | null) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().split(/\s+/)[0] ?? "";
export const primeiro = (s?: string | null) => (s ?? "").trim().split(/\s+/)[0] ?? "";

export type Eu = { id: string; nome: string; primeiro: string; email: string; coord: boolean; papel: string | null };
export async function carregarEu(supabase: SB): Promise<Eu | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: u } = await supabase.from("usuarios").select("id, email, nome_completo, papel").eq("id", user.id).maybeSingle();
  const nome = (u as any)?.nome_completo ?? user.email?.split("@")[0] ?? "";
  const papel = (u as any)?.papel ?? null;
  return { id: user.id, nome, primeiro: primeiro(nome), email: user.email ?? "", papel, coord: papel === "coordenador" || ehCoordenadorNome(nome) };
}

/** Registra evento no histórico do acompanhamento. */
export async function registrar(supabase: SB, a: Pick<Acomp, "id" | "caso_id">, r: Partial<Registro> & { tipo: Registro["tipo"] }) {
  return supabase.from("acompanhamento_registros").insert({ acompanhamento_id: a.id, caso_id: a.caso_id, data_ref: hojeISO(), ...r });
}
