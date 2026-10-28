// Tipos compartilhados da Central PinheiroAdv. Os tipos de cada módulo (casos, pendências,
// publicações, certidões, gastos…) ficam junto dos componentes e de lib/*.ts.

export type Papel = "coordenador" | "advogado" | "estagiario" | "externo";

export interface Usuario {
  id: string;
  email: string;
  nome_completo: string | null;
  papel: Papel;
  funcao: string | null;
  banca: string | null;
  oab: string | null;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

export type NotificacaoTipo = "atribuicao" | "revisao" | "acompanhamento" | "certidao" | "sistema";

export interface Notificacao {
  id: string;
  usuario_id: string;
  tipo: NotificacaoTipo;
  titulo: string;
  mensagem: string | null;
  pendencia_id: string | null;
  lida: boolean;
  lida_em: string | null;
  criado_em: string;
}
