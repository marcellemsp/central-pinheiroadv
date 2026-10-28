import type { BucketId } from "./buckets";

export type Cliente = {
  id: string;
  nome: string;
  documento: string | null;
  contato: string | null;
  observacoes: string | null;
  criado_em: string;
};

export type Caso = {
  id: string;
  cliente_id: string | null;
  titulo: string;
  numero_processo: string | null;
  orgao: string | null;
  area: string | null;
  status: string;
  criado_em: string;
};

export type Pendencia = {
  id: string;
  titulo: string;
  descricao: string | null;
  cliente_id: string | null;
  caso_id: string | null;
  bucket: BucketId;
  prazo: string | null; // data no formato AAAA-MM-DD
  prazo_fatal: boolean;
  responsavel: string;
  ordem: number;
  criado_em: string;
  atualizado_em: string;
  concluido_em: string | null;
  cliente?: Pick<Cliente, "id" | "nome"> | null;
};
