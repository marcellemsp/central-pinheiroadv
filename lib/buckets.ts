// Buckets da Central PinheiroAdv: o caminho de uma pendência, da chegada ao fim.
// Versão enxuta do modelo da Central Medinadv, sem bancas e sem revisores.

export const BUCKETS = [
  { id: "triagem", nome: "Triagem", descricao: "Chegou e ainda não foi analisado" },
  { id: "producao", nome: "Em produção", descricao: "Peça, pesquisa ou diligência em andamento" },
  { id: "aguardando", nome: "Aguardando", descricao: "Depende do cliente, de terceiro ou do órgão" },
  { id: "protocolar", nome: "Protocolar", descricao: "Pronto, falta protocolar ou enviar" },
  { id: "concluido", nome: "Concluído", descricao: "Feito" },
] as const;

export type BucketId = (typeof BUCKETS)[number]["id"];

export const BUCKET_IDS = BUCKETS.map((b) => b.id) as BucketId[];

export function nomeDoBucket(id: string): string {
  return BUCKETS.find((b) => b.id === id)?.nome ?? id;
}

export function isBucket(v: unknown): v is BucketId {
  return typeof v === "string" && (BUCKET_IDS as string[]).includes(v);
}
