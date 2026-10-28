// Tipos e constantes de gastos de diligências (compartilhados entre lançar / coordenar)
export type Despesa = {
  id: string; data: string; usuario_id: string | null; pessoa_nome: string;
  empresa_id: string | null; caso_id: string | null; cliente_txt: string | null; local: string | null;
  categoria: string; meio: string | null; valor: number; status: "aguardando" | "pago" | "recusado";
  motivo_recusa: string | null; lote_id: string | null; lote_numero: number | null; pago_em: string | null;
  comprovante_path: string | null; obs: string | null; criado_em: string; criado_por: string | null;
};
export type Lote = { id: string; numero: number; data: string; pago_por: string | null; pago_por_nome: string | null; forma: string; total: number; qtd: number; obs: string | null; anexos: any[]; criado_em: string };
export type CaixaMov = { id: string; data: string; tipo: "aporte" | "lote" | "ajuste" | "conferencia"; valor: number; descricao: string | null; lote_id: string | null; responsavel_nome: string | null; criado_em: string };

export const CATEGORIAS: [string, string, string][] = [
  ["transporte_ida", "Transporte · ida", ""], ["transporte_volta", "Transporte · volta", ""], ["almoco", "Almoço", ""], ["copias", "Cópias / impressão", ""], ["outro", "Outro", "•"],
];
export const MEIOS: [string, string][] = [["metro", "Metrô"], ["onibus", "Ônibus"], ["vlt", "VLT"], ["barca", "Barca"], ["trem", "Trem"], ["uber", "Uber / táxi"], ["outro", "Outro"]];
export const catLabel = (c: string) => CATEGORIAS.find(x => x[0] === c)?.[1] ?? c;
export const catIcon = (c: string) => CATEGORIAS.find(x => x[0] === c)?.[2] ?? "•";
export const meioLabel = (m: string | null) => MEIOS.find(x => x[0] === m)?.[1] ?? (m ?? "");
export const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const fmtD = (d?: string | null) => d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—";
export const fmtDc = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
export const hojeIso = () => new Date().toISOString().slice(0, 10);
export const iniciais = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join("");
export const corPessoa = (n: string) => { const cores = ["var(--atencao)", "var(--acao)", "var(--ok)", "var(--destaque)", "var(--alerta)", "var(--atencao)", "var(--acao)"]; let h = 0; for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return cores[h % cores.length]; };
