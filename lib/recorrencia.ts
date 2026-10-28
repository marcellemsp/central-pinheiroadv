// Pendências recorrentes (custas mensais, comprovação de depósito, penhora de faturamento…).
// A regra fica em caso_pendencias.recorrencia (jsonb). Quem cria a próxima ocorrência é o trigger
// public.pa_pend_recorrente (ao concluir a atual). Este arquivo só espelha a mesma regra no cliente
// para mostrar prévia/próxima data — a lógica canônica é a função SQL public.pa_proxima_data.

export type RecFreq = "semanal" | "quinzenal" | "mensal" | "bimestral" | "trimestral" | "semestral" | "anual";
export type RecDia = "fixo" | "ult" | "prim" | "ultu" | "util_n"; // util_n = Nº dia útil (dia_ref = N), calendário civil no banco
export type RecAjuste = "ant" | "prox" | "man";
export type RecFim = "nunca" | "data" | "n";
export type Recorrencia = { freq: RecFreq; dia: RecDia; dia_ref?: number | null; ajuste: RecAjuste; fim: RecFim; fim_data?: string | null; fim_n?: number | null;
  /** rotinas do cliente (22/10/2026) */ ref?: "anterior" | "corrente" | null; calendario?: "civil" | null; registrar_documento?: boolean; padrao?: Record<string, any> | null };

export const REC_FREQS: [RecFreq, string, string][] = [
  ["semanal", "Semanal", "toda semana"], ["quinzenal", "Quinzenal", "a cada 15 dias"], ["mensal", "Mensal", "todo mês"],
  ["bimestral", "Bimestral", "a cada 2 meses"], ["trimestral", "Trimestral", "a cada 3 meses"], ["semestral", "Semestral", "a cada 6 meses"], ["anual", "Anual", "todo ano"],
];
export const REC_DIAS: [RecDia, string][] = [["fixo", "Mesmo dia do mês"], ["ult", "Último dia do mês"], ["prim", "Primeiro dia útil"], ["ultu", "Último dia útil"], ["util_n", "Nº dia útil do mês"]];
export const REC_AJUSTES: [RecAjuste, string][] = [["ant", "Antecipa pro dia útil anterior"], ["prox", "Adia pro próximo dia útil"], ["man", "Mantém a data"]];
export const REC_FINS: [RecFim, string][] = [["nunca", "Nunca (até encerrar)"], ["data", "Em uma data"], ["n", "Após N ocorrências"]];

export const recPadrao = (prazo?: string | null): Recorrencia => ({ freq: "mensal", dia: "fixo", dia_ref: prazo ? Number(prazo.slice(8, 10)) : null, ajuste: "ant", fim: "nunca", fim_data: null, fim_n: null });

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (s: string) => new Date(s.slice(0, 10) + "T12:00:00");
const fds = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
const mensal = (f: RecFreq) => !(f === "semanal" || f === "quinzenal");
const meses = (f: RecFreq) => ({ mensal: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 } as Record<string, number>)[f] ?? 1;

/** Próxima data a partir de `base` (prazo da ocorrência atual), já ajustada para dia útil conforme a regra. */
export function proximaData(base: string, r: Recorrencia): string {
  const b = parse(base); let d: Date;
  if (!mensal(r.freq)) { d = new Date(b); d.setDate(d.getDate() + (r.freq === "semanal" ? 7 : 14)); }
  else {
    const m = new Date(b.getFullYear(), b.getMonth() + meses(r.freq), 1, 12);
    const ultimo = new Date(m.getFullYear(), m.getMonth() + 1, 0, 12);
    if (r.dia === "ult") d = ultimo;
    else if (r.dia === "prim") { d = m; while (fds(d)) d.setDate(d.getDate() + 1); return iso(d); }
    else if (r.dia === "ultu") { d = ultimo; while (fds(d)) d.setDate(d.getDate() - 1); return iso(d); }
else if (r.dia === "util_n") { d = m; let k = fds(d) ? 0 : 1; while (k < (r.dia_ref ?? 1) && d.getMonth() === m.getMonth()) { d.setDate(d.getDate() + 1); if (!fds(d)) k++; } return iso(d); } // prévia aproximada (sem feriados); a data oficial vem de pa_proxima_data
    else { const ref = r.dia_ref ?? b.getDate(); d = new Date(m.getFullYear(), m.getMonth(), Math.min(ref, ultimo.getDate()), 12); }
  }
  if (r.ajuste === "ant") while (fds(d)) d.setDate(d.getDate() - 1);
  else if (r.ajuste === "prox") while (fds(d)) d.setDate(d.getDate() + 1);
  return iso(d);
}

/** Próximas N datas previstas depois de `base`, respeitando o término da regra. */
export function proximasDatas(base: string, r: Recorrencia, n = 5, seqAtual = 1): string[] {
  const out: string[] = []; let cur = base; let seq = seqAtual;
  for (let i = 0; i < n; i++) {
    const nx = proximaData(cur, r); seq++;
    if (r.fim === "data" && r.fim_data && nx > r.fim_data) break;
    if (r.fim === "n" && r.fim_n && seq > r.fim_n) break;
    out.push(nx); cur = nx;
  }
  return out;
}

/** Data da próxima ocorrência desta pendência (ou null se a série terminou / está pausada). */
export function proximaOcorrencia(p: { prazo?: string | null; recorrencia?: Recorrencia | null; recorrencia_seq?: number | null; recorrencia_ativa?: boolean | null }): string | null {
  if (!p.recorrencia || !p.prazo || p.recorrencia_ativa === false) return null;
  return proximasDatas(p.prazo, p.recorrencia, 1, p.recorrencia_seq ?? 1)[0] ?? null;
}

export const labelRec = (r: Recorrencia) => `${REC_FREQS.find(f => f[0] === r.freq)?.[1] ?? r.freq}`;

export function resumoRec(r: Recorrencia): string {
  const f = REC_FREQS.find(x => x[0] === r.freq)?.[2] ?? r.freq;
  const dia = !mensal(r.freq) ? "" : r.dia === "fixo" ? ` no dia ${r.dia_ref ?? "—"}` : r.dia === "ult" ? " no último dia do mês" : r.dia === "prim" ? " no primeiro dia útil" : r.dia === "util_n" ? ` no ${r.dia_ref ?? "?"}º dia útil` : " no último dia útil";
  const aj = r.dia === "prim" || r.dia === "ultu" || r.dia === "util_n" || !mensal(r.freq) ? "" : r.ajuste === "ant" ? "; fim de semana antecipa" : r.ajuste === "prox" ? "; fim de semana adia" : "";
  const fim = r.fim === "data" && r.fim_data ? ` até ${r.fim_data.slice(8, 10)}/${r.fim_data.slice(5, 7)}/${r.fim_data.slice(0, 4)}` : r.fim === "n" && r.fim_n ? ` por ${r.fim_n} ocorrências` : " até encerrar";
  return `Repete ${f}${dia}${fim}${aj}. A próxima nasce quando esta for concluída.`;
}
