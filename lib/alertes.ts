// Tipos e helpers do fluxo Alertes → destinação → aprovação (v43).
export type AlerteStatus = "novo" | "proposta" | "devolvida" | "segurando" | "aprovada" | "descartada";

export type Proposta = {
  destino: "pendencia" | "naf";
  texto_andamento: string;
  data_andamento?: string | null;
  // só para pendência
  providencia_id?: string | null; providencia_nome?: string | null;
  titulo?: string; tipo_pend?: string; dias?: number | null; contagem?: "uteis" | "corridos";
  prazo?: string | null; prazo_interno?: string | null; tribunal?: string;
  responsavel?: string | null; revisor?: string | null;
  obs?: string; obs_aprovacao?: string; ajustado?: boolean;
};

export type Alerte = {
  id: string; data: string; cliente: string | null; tribunal: string | null; teor: string | null; resumo: string | null;
  publicacao_em: string | null; url_documento: string | null; docx_url: string | null; processo: string | null; numero_norm: string | null;
  criado_em: string; metadata: any; source_id: string | null; tipo: string | null; prazo_expresso: number | null;
  caso_id: string | null; empresa_id: string | null; status: AlerteStatus;
  proposta: Proposta | null; proposto_por: string | null; proposto_em: string | null;
  aprovado_por: string | null; aprovado_em: string | null; devolucao_obs: string | null; segurar_obs: string | null; segurar_para: string | null;
  andamento_id: string | null; pendencia_id: string | null;
};

export type AlerteEvento = { id: string; alerte_id: string; autor: string | null; acao: string; obs: string | null; criado_em: string };

export type Providencia = { id: string; nome: string; dias: number | null; contagem: "uteis" | "corridos"; tipo_pend: string; titulo_padrao: string | null; ler_prazo_do_teor: boolean; ordem: number; ativo: boolean };

export type CasoMin = { id: string; empresa_id: string; titulo: string; numero: string | null; orgao: string | null; advogado: string | null; area: string; situacao: string | null; dados: any; ativo: boolean; empresa_nome?: string | null };

export const STATUS_ALERTE: Record<AlerteStatus, { l: string; cls: "gray" | "blue" | "amber" | "red" | "green" | "purple" }> = {
  novo: { l: "sem destinação", cls: "gray" },
  proposta: { l: "aguardando aprovação", cls: "blue" },
  devolvida: { l: "devolvida", cls: "red" },
  segurando: { l: "segurando", cls: "amber" },
  aprovada: { l: "aprovada", cls: "green" },
  descartada: { l: "descartada", cls: "gray" },
};

export const numNorm = (s?: string | null) => (s ?? "").replace(/\D/g, "") || null;
export const fmtD = (d?: string | null) => d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—";
export const fmtDT = (d?: string | null) => d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
export const hojeIso = () => new Date().toISOString().slice(0, 10);
export const primeiroNome = (n?: string | null) => (n ?? "").trim().split(/\s+/)[0] ?? "";

/** Lê "no prazo de 5 (cinco) dias" / "em 15 dias" do teor. */
export function lerPrazoDoTeor(teor?: string | null): number | null {
  if (!teor) return null;
  const m = teor.match(/prazo\s+(?:de|em)?\s*(\d{1,3})\s*(?:\([^)]*\))?\s*dias?/i) || teor.match(/\bem\s+(\d{1,3})\s*(?:\([^)]*\))?\s*dias?\b/i) || teor.match(/(\d{1,3})\s*\([a-zç]+\)\s*dias?/i);
  return m ? Number(m[1]) : null;
}

/** Tipo de publicação a partir do teor/tipo informado. */
export function classificarTipo(a: { tipo?: string | null; teor?: string | null }): string {
  if (a.tipo) return a.tipo;
  const t = (a.teor ?? "").toLowerCase();
  if (/ac[óo]rd[ãa]o|ementa/.test(t)) return "Acórdão";
  if (/senten[çc]a/.test(t)) return "Sentença";
  if (/pauta|sess[ãa]o de julgamento/.test(t)) return "Pauta de julgamento";
  if (/ato ordinat[óo]rio|certifico/.test(t)) return "Ato ordinatório";
  if (/decis[ãa]o|defiro|indefiro/.test(t)) return "Decisão";
  return "Despacho";
}

/** Sugestão de redação do andamento no padrão do relatório (voz ativa, sem "intime-se", sem citação literal). */
export function sugerirTextoAndamento(a: { tipo?: string | null; teor?: string | null; prazo_expresso?: number | null; resumo?: string | null }): string {
  if (a.resumo && a.resumo.trim().length > 20) return a.resumo.trim();
  const tipo = classificarTipo(a).toLowerCase();
  const teor = (a.teor ?? "").replace(/\s+/g, " ").trim();
  const prazo = a.prazo_expresso ?? lerPrazoDoTeor(teor);
  // recorta a primeira frase útil, sem "Intime-se", "Certifico que", etc.
  let nucleo = teor.replace(/^(intime[m]?-se|cite[m]?-se|certifico(?: e dou f[ée])? que|fica[m]? intimad[oa]s?|vistos[.,]?)\s*/i, "").replace(/\.\s.*$/, "").trim();
  if (nucleo.length > 220) nucleo = nucleo.slice(0, 217).replace(/\s+\S*$/, "") + "…";
  if (nucleo) nucleo = nucleo.charAt(0).toLowerCase() + nucleo.slice(1);
  const verbo = tipo === "acórdão" ? "Publicado acórdão" : tipo === "sentença" ? "Publicada sentença" : tipo === "decisão" ? "Publicada decisão" : tipo === "ato ordinatório" ? "Certificado pela serventia" : tipo === "pauta de julgamento" ? "Publicada pauta de julgamento" : "Publicado despacho";
  const prazoTxt = prazo ? ` Prazo de ${prazo} dias.` : "";
  return nucleo ? `${verbo}: ${nucleo}.${prazoTxt}` : `${verbo}.${prazoTxt}`;
}

/** Tribunal a partir do número CNJ / texto (espelha inferirTribunal da calculadora, sem importar o componente). */
export function tribunalDe(...pistas: (string | null | undefined)[]): string {
  const s = pistas.filter(Boolean).join(" ").toUpperCase();
  if (/STF|SUPREMO/.test(s)) return "STF";
  if (/STJ|SUPERIOR TRIBUNAL/.test(s)) return "STJ";
  if (/TRF|JFRJ|JUSTI[ÇC]A FEDERAL|\.4\.02\./.test(s)) return "TRF2";
  if (/CARF/.test(s)) return "CARF";
  if (/PGFN|RECEITA FEDERAL|DRJ|\bRFB\b/.test(s)) return "PGFN";
  if (/SEFAZ|SEI-RJ|SEI ?RJ|CONSELHO DE CONTRIBUINTES|JRF/.test(s)) return "SEFAZ-RJ";
  if (/TJRJ|\.8\.19\./.test(s)) return "TJRJ";
  return "OUTRO";
}
