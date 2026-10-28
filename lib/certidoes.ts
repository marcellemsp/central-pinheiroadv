// Controle de Certidões (v50): certidões negativas por cliente, com validade e aviso em 30/15 dias.
// A certidão continua sendo um empresa_documentos tipo "certidao" (subtipo, emitida_em, validade, codigo, situacao).
// A "vigente" de cada cliente+tipo é a de validade mais recente. As anteriores ficam como histórico.
import type { createClient } from "./supabase";
import { TIPOS_DOC } from "./areas";
import { CARTEIRAS, ehCoordenadorNome } from "./equipe";

type SB = ReturnType<typeof createClient>;

export const CERT_TIPOS = ["CND Federal (RFB/PGFN)", "CND Estadual — ICMS", "CND Municipal", "CRF FGTS", "CNDT Trabalhista"] as const;
export type CertTipo = typeof CERT_TIPOS[number] | "Outra";
export const CERT_CURTO: Record<string, string> = { "CND Federal (RFB/PGFN)": "CND Federal", "CND Estadual — ICMS": "CND Estadual", "CND Municipal": "CND Municipal", "CRF FGTS": "CRF FGTS", "CNDT Trabalhista": "CNDT" };
export const CERT_ORGAO: Record<string, string> = { "CND Federal (RFB/PGFN)": "RFB / PGFN", "CND Estadual — ICMS": "SEFAZ-RJ", "CND Municipal": "Prefeitura", "CRF FGTS": "Caixa", "CNDT Trabalhista": "TST" };
export const CERT_LINKS: [string, string, string][] = [
  ["CND Federal", "RFB / PGFN", "https://solucoes.receita.fazenda.gov.br/Servicos/certidaointernet/PJ/Emitir"],
  ["CND Estadual RJ", "SEFAZ-RJ", "https://www4.fazenda.rj.gov.br/certidao-fiscal-web/emitirCertidao.jsf"],
  ["CND Municipal Rio", "carioca.rio", "https://carioca.rio/servicos/certidao-de-divida-ativa-e-de-situacao-fiscal-e-cadastral/"],
  ["CRF FGTS", "Caixa", "https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf"],
  ["CNDT", "TST", "https://cndt-certidao.tst.jus.br/inicio.faces"],
];
export const SITUACOES = ["Negativa", "Positiva com efeitos de negativa", "Positiva"] as const;
export const AVISO_AMARELO = 30, AVISO_VERMELHO = 15;
export const validadeDias = (subtipo: string) => ((TIPOS_DOC.find(t => t.k === "certidao") as any)?.validadeDias?.[subtipo] as number | undefined) ?? 180;

export type DocCert = { id: string; empresa_id: string; tipo: string; nome: string; url: string | null; validade: string | null; observacao: string | null; dados: Record<string, any>; criado_em: string };
export type CertConfig = { id: string; empresa_id: string; subtipo: string; nao_aplica: boolean; responsavel: string | null; obs: string | null; atualizado_por: string | null; atualizado_em: string };
export type CertEvento = { id: string; empresa_id: string; subtipo: string; documento_id: string | null; tipo: "cobranca" | "renovou" | "cadastrou" | "nao_aplica" | "reativou" | "pendencia"; autor: string | null; obs: string | null; criado_em: string };
export type EmpMin = { id: string; nome: string; nome_exibicao: string | null; banca: string | null; ativo?: boolean };

export type Sit = "g" | "a" | "r" | "n";
/** Uma célula do controle: cliente × tipo de certidão. */
export type CertItem = {
  empresa: EmpMin; subtipo: string; curto: string;
  doc: DocCert | null;          // vigente (validade mais recente)
  historico: DocCert[];         // todas, mais recente primeiro
  eventos: CertEvento[];
  cfg: CertConfig | null; naoAplica: boolean;
  responsavel: string;          // advogado do cliente (ou override)
  dias: number | null;          // dias até vencer (negativo = vencida)
  sit: Sit; positiva: boolean;  // positiva c/ efeitos → marcada
  cobrancaHoje: CertEvento | null;
  pendencias: CertPend[];       // pendências desta certidão (abertas + concluídas nos últimos 90d), sem caso
  pendencia: CertPend | null;   // próxima aberta (menor prazo; "aguardando" por último)
};

export type CertPend = { id: string; caso_id: string | null; titulo: string; tipo: string; prazo: string | null; responsavel: string | null; status: string; depende_de: string | null; prazo_relativo_uteis: number | null; criado_em: string };
export const pendAberta = (p: { status: string }) => p.status !== "concluida";
/** Ordena pendências: abertas com prazo → abertas sem prazo → aguardando → concluídas. */
export function ordenarPend(ps: CertPend[]) {
  const r = (p: CertPend) => p.status === "concluida" ? 3 : p.status === "aguardando" ? 2 : p.prazo ? 0 : 1;
  return [...ps].sort((a, b) => r(a) - r(b) || (a.prazo ?? "9").localeCompare(b.prazo ?? "9") || a.criado_em.localeCompare(b.criado_em));
}

export const isoLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export const hojeISO = () => isoLocal(new Date());
export const addDias = (iso: string, n: number) => { const x = new Date(iso + "T12:00:00"); x.setDate(x.getDate() + n); return isoLocal(x); };
export const fmtData = (iso?: string | null) => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—";
export const fmtCurta = (iso?: string | null) => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—";
export const fmtHora = (ts?: string | null) => ts ? new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
export const diasAte = (iso: string, hoje = hojeISO()) => Math.round((new Date(iso + "T12:00:00").getTime() - new Date(hoje + "T12:00:00").getTime()) / 864e5);
export const norm = (s?: string | null) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().split(/\s+/)[0] ?? "";
export const primeiro = (s?: string | null) => (s ?? "").trim().split(/\s+/)[0] ?? "";
export const sitDe = (dias: number | null): Sit => dias === null ? "n" : dias <= AVISO_VERMELHO ? "r" : dias <= AVISO_AMARELO ? "a" : "g";
export const labelDias = (it: CertItem) => it.sit === "n" ? "—" : it.dias! < 0 ? `vencida há ${-it.dias!}d` : it.dias === 0 ? "vence hoje" : `vence em ${it.dias}d`;
export const ORDEM_SIT: Record<Sit, number> = { r: 0, a: 1, n: 2, g: 3 };

export type Eu = { id: string; nome: string; primeiro: string; email: string; coord: boolean };
export async function carregarEu(supabase: SB): Promise<Eu | null> {
  const { data: { user } } = await supabase.auth.getUser(); if (!user) return null;
  const { data: u } = await supabase.from("usuarios").select("id, email, nome_completo, papel").eq("id", user.id).maybeSingle();
  const nome = (u as any)?.nome_completo ?? user.email?.split("@")[0] ?? "";
  return { id: user.id, nome, primeiro: primeiro(nome), email: user.email ?? "", coord: (u as any)?.papel === "coordenador" || ehCoordenadorNome(nome) };
}

/** Advogado responsável por cada empresa: o que tem mais casos ativos nela. */
async function responsaveis(supabase: SB, empIds: string[]) {
  const m = new Map<string, string>(); if (!empIds.length) return m;
  const { data } = await supabase.from("casos").select("empresa_id, advogado").in("empresa_id", empIds).eq("ativo", true).not("advogado", "is", null).limit(5000);
  const cont = new Map<string, Map<string, number>>();
  for (const c of (data ?? []) as { empresa_id: string; advogado: string }[]) { const k = primeiro(c.advogado); if (!k) continue; const mm = cont.get(c.empresa_id) ?? new Map(); mm.set(k, (mm.get(k) ?? 0) + 1); cont.set(c.empresa_id, mm); }
  for (const [e, mm] of cont) m.set(e, [...mm.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  return m;
}
const BANCA_ADV: Record<string, string> = CARTEIRAS;

/** Carrega o controle: todas as empresas ativas × 5 tipos (ou só uma empresa). */
export async function carregarCertidoes(supabase: SB, f: { empresaId?: string; responsavel?: string } = {}): Promise<CertItem[]> {
  const hoje = hojeISO();
  let qe = supabase.from("empresas").select("id, nome, nome_exibicao, banca, ativo").eq("ativo", true).order("nome");
  if (f.empresaId) qe = qe.eq("id", f.empresaId);
  const { data: emps } = await qe.limit(2000);
  const empresas = (emps ?? []) as EmpMin[]; if (!empresas.length) return [];
  const ids = empresas.map(e => e.id);
  const q = (t: string): any => { const b = supabase.from(t).select("*"); return f.empresaId ? b.eq("empresa_id", f.empresaId) : b; };
  const [rDocs, rCfgs, rEvs, resp, rPend] = await Promise.all([
    q("empresa_documentos").eq("tipo", "certidao").order("validade", { ascending: false, nullsFirst: false }).limit(20000),
    q("certidao_config").limit(20000),
    q("certidao_eventos").gte("criado_em", addDias(hoje, -90)).order("criado_em", { ascending: false }).limit(20000),
    responsaveis(supabase, ids),
    // pendências abertas ligadas a uma certidão (empresa + tipo), sem caso
    q("caso_pendencias").not("certidao_subtipo", "is", null).or(`status.neq.concluida,concluida_em.gte.${addDias(hoje, -90)}`).order("prazo", { ascending: true, nullsFirst: false }).limit(5000),
  ]);
  const docs = rDocs.data as DocCert[] | null, cfgs = rCfgs.data as CertConfig[] | null, evs = rEvs.data as CertEvento[] | null;
  const pendPor = new Map<string, CertPend[]>();
  for (const p of (rPend.data ?? []) as any[]) { const k = p.empresa_id + "|" + p.certidao_subtipo; (pendPor.get(k) ?? pendPor.set(k, []).get(k)!).push({ id: p.id, caso_id: p.caso_id, titulo: p.titulo, tipo: p.tipo, prazo: p.prazo, responsavel: p.responsavel, status: p.status, depende_de: p.depende_de ?? null, prazo_relativo_uteis: p.prazo_relativo_uteis ?? null, criado_em: p.criado_em }); }
  const docsPor = new Map<string, DocCert[]>();
  for (const d of (docs ?? []) as DocCert[]) { const st = d.dados?.subtipo ?? "Outra"; const k = d.empresa_id + "|" + st; (docsPor.get(k) ?? docsPor.set(k, []).get(k)!).push(d); }
  const cfgPor = new Map(((cfgs ?? []) as CertConfig[]).map(c => [c.empresa_id + "|" + c.subtipo, c]));
  const evPor = new Map<string, CertEvento[]>();
  for (const e of (evs ?? []) as CertEvento[]) { const k = e.empresa_id + "|" + e.subtipo; (evPor.get(k) ?? evPor.set(k, []).get(k)!).push(e); }
  const itens: CertItem[] = [];
  for (const e of empresas) {
    const respPadrao = resp.get(e.id) ?? (e.banca ? BANCA_ADV[e.banca] : undefined) ?? "—";
    for (const st of CERT_TIPOS) {
      const k = e.id + "|" + st; const hist = (docsPor.get(k) ?? []).sort((a, b) => (b.validade ?? "").localeCompare(a.validade ?? "") || b.criado_em.localeCompare(a.criado_em));
      const doc = hist[0] ?? null; const cfg = cfgPor.get(k) ?? null; const naoAplica = !!cfg?.nao_aplica;
      const dias = doc?.validade ? diasAte(doc.validade, hoje) : null;
      const eventos = evPor.get(k) ?? [];
      const item: CertItem = { empresa: e, subtipo: st, curto: CERT_CURTO[st] ?? st, doc, historico: hist, eventos, cfg, naoAplica, responsavel: cfg?.responsavel || respPadrao, dias, sit: naoAplica ? "n" : sitDe(dias), positiva: /positiva com efeitos/i.test(doc?.dados?.situacao ?? ""), cobrancaHoje: eventos.find(x => x.tipo === "cobranca" && isoLocal(new Date(x.criado_em)) === hoje) ?? null, pendencias: [], pendencia: null };
      item.pendencias = ordenarPend(pendPor.get(k) ?? []); item.pendencia = item.pendencias.find(pendAberta) ?? null;
      itens.push(item);
    }
  }
  const r = f.responsavel ? norm(f.responsavel) : null;
  return r ? itens.filter(i => norm(i.responsavel) === r) : itens;
}

/** Contagem para o badge da barra lateral: vermelhas (vencidas ou ≤15d), da equipe ou só minhas. */
export async function contarVermelhas(supabase: SB, responsavel?: string) {
  const itens = await carregarCertidoes(supabase, responsavel ? { responsavel } : {});
  return itens.filter(i => i.sit === "r").length;
}

export function cumprimento(itens: CertItem[]) {
  const por = new Map<string, { total: number; ok: number; cobr: number }>();
  for (const i of itens) { if (i.naoAplica) continue; const k = i.responsavel; const r = por.get(k) ?? { total: 0, ok: 0, cobr: 0 }; r.total++; if (i.sit === "g") r.ok++; r.cobr += i.eventos.filter(e => e.tipo === "cobranca" && e.criado_em >= new Date(Date.now() - 30 * 864e5).toISOString()).length; por.set(k, r); }
  return [...por.entries()].filter(([k]) => k !== "—").map(([nome, v]) => ({ nome, ...v, pct: v.total ? Math.round((v.ok / v.total) * 100) : 100 })).sort((a, b) => a.nome.localeCompare(b.nome));
}

export async function registrarEvento(supabase: SB, it: Pick<CertItem, "empresa" | "subtipo">, e: { tipo: CertEvento["tipo"]; autor?: string | null; obs?: string | null; documento_id?: string | null }) {
  return supabase.from("certidao_eventos").insert({ empresa_id: it.empresa.id, subtipo: it.subtipo, ...e });
}
