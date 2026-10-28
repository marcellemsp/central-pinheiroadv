// Situações de uma pendência (caso_pendencias.status), na ordem do fluxo.
export const SITUACOES: [string, string][] = [
  ["a_fazer", "a fazer"],
  ["em_elaboracao", "em elaboração"],
  ["revisao_pendente", "em revisão"],
  ["devolvida", "devolvida para ajustes"],
  ["pronta_protocolar", "pronta para protocolar"],
  ["aguardando_cliente", "aguardando cliente ou terceiro"],
  ["aguardando", "aguardando a pendência anterior"],
  ["bloqueada", "bloqueada"],
  ["concluida", "concluída"],
];
export const SITUACAO_IDS = SITUACOES.map(s => s[0]);
export const ehSituacao = (s: unknown): s is string => typeof s === "string" && SITUACAO_IDS.includes(s);
export const DESCRICAO_SITUACOES = SITUACOES.map(([k, l]) => `${k} (${l})`).join(", ");

/** Data de hoje em São Paulo, AAAA-MM-DD. */
export function hojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}
