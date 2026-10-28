-- Central PinheiroAdv v1 — estrutura completa.
-- Reconstruída a partir do código da Central Medinadv (mesma arquitetura e fluxos),
-- sem nenhum dado da Medina. A versão 0 (clientes / casos / pendencias por buckets)
-- vai para o esquema "legado"; as três pendências dela são migradas em 006_acesso_neo.sql.

create schema if not exists legado;
alter table if exists public.pendencias set schema legado;
alter table if exists public.casos set schema legado;
alter table if exists public.clientes set schema legado;
revoke all on all tables in schema legado from anon, authenticated;

-- ───────── equipe ─────────
create table public.usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  nome_completo text,
  papel text not null default 'advogado' check (papel in ('coordenador', 'advogado', 'estagiario', 'externo')),
  funcao text,
  banca text,
  oab text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ───────── clientes ─────────
create table public.grupos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  banca text,
  descricao text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  nome_exibicao text,
  cnpj_raiz text,
  banca text,
  area text,
  tags text[] not null default '{}',
  contatos jsonb not null default '[]',
  observacoes text,
  grupo_id uuid references public.grupos(id) on delete set null,
  ativo boolean not null default true,
  exclusao_id uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index empresas_grupo_idx on public.empresas (grupo_id);

create table public.empresa_documentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo text not null,
  nome text not null,
  url text,
  validade date,
  observacao text,
  dados jsonb not null default '{}',
  criado_em timestamptz not null default now()
);
create index empresa_documentos_emp_idx on public.empresa_documentos (empresa_id, tipo);

-- ───────── casos ─────────
create table public.casos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  area text not null default 'contencioso' check (area in ('contencioso', 'consultoria', 'incentivo', 'transacao', 'fiscalizacao')),
  titulo text not null,
  numero text,
  orgao text,
  situacao text not null default 'Em preparação',
  advogado text,
  observacoes text,
  prazo_proximo date,
  prazo_fatal boolean,
  dados jsonb not null default '{}',
  ativo boolean not null default true,
  eproc_ultimo_seq integer,
  tribunal_ultimo_seq integer,
  exclusao_id uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index casos_empresa_idx on public.casos (empresa_id);
create index casos_area_idx on public.casos (area, ativo);

create or replace view public.empresa_casos_resumo with (security_invoker = true) as
  select empresa_id, count(*)::int as total, count(*) filter (where ativo)::int as ativos
  from public.casos where exclusao_id is null group by empresa_id;

create table public.caso_andamentos (
  id uuid primary key default gen_random_uuid(),
  caso_id uuid not null references public.casos(id) on delete cascade,
  empresa_id uuid references public.empresas(id) on delete cascade,
  data date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  hora time,
  descricao text not null,
  fonte text not null default 'manual',
  anexo_url text,
  ref_externa text,
  urgente boolean default false,
  urgente_motivo text,
  urgente_tratado_em timestamptz,
  urgente_tratado_por text,
  exclusao_id uuid,
  criado_em timestamptz not null default now()
);
create index caso_andamentos_caso_idx on public.caso_andamentos (caso_id, data desc);

create table public.caso_pendencias (
  id uuid primary key default gen_random_uuid(),
  caso_id uuid references public.casos(id) on delete cascade,
  empresa_id uuid references public.empresas(id) on delete cascade,
  certidao_subtipo text,
  titulo text not null,
  tipo text not null default 'peca',
  responsavel text,
  status text not null default 'a_fazer',
  fatal boolean not null default false,
  prazo date,
  prazo_interno date,
  hora time,
  contagem text default 'uteis',
  revisor text,
  revisor_anterior text,
  prioridade text default 'normal',
  descricao text,
  detalhes jsonb,
  origem_andamento_id uuid references public.caso_andamentos(id) on delete set null,
  depende_de uuid references public.caso_pendencias(id) on delete set null,
  prazo_relativo_uteis integer,
  arquivo_url text,
  versao integer,
  devolucao_obs text,
  enviado_em timestamptz,
  subida_por text,
  subida_obs text,
  retorno_para text,
  origem_revisao text,
  recorrencia jsonb,
  recorrencia_id uuid,
  recorrencia_seq integer,
  recorrencia_ativa boolean,
  concluida_em timestamptz,
  exclusao_id uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index caso_pendencias_caso_idx on public.caso_pendencias (caso_id);
create index caso_pendencias_emp_idx on public.caso_pendencias (empresa_id);
create index caso_pendencias_abertas_idx on public.caso_pendencias (prazo) where status <> 'concluida';
create index caso_pendencias_rec_idx on public.caso_pendencias (recorrencia_id);

create table public.pendencia_eventos (
  id uuid primary key default gen_random_uuid(),
  pendencia_id uuid not null references public.caso_pendencias(id) on delete cascade,
  caso_id uuid,
  empresa_id uuid,
  autor text,
  acao text not null,
  obs text,
  despacho jsonb,
  criado_em timestamptz not null default now()
);
create index pendencia_eventos_pend_idx on public.pendencia_eventos (pendencia_id, criado_em desc);

-- Acervo de documentos do processo (cópia integral / eproc).
create table public.caso_documentos (
  id uuid primary key default gen_random_uuid(),
  caso_id uuid not null references public.casos(id) on delete cascade,
  chave text not null,
  sistema text,
  data date,
  evento integer,
  folhas integer,
  tipo text,
  titulo text,
  link text,
  ausente_desde date,
  paginas integer[],
  classe text,
  subtipo text,
  titulo_acervo text,
  validade date,
  tags text[],
  observacao text,
  confianca text,
  classe_origem text,
  classificado_por text,
  classificado_em timestamptz,
  sugestao jsonb,
  sugestao_decisao jsonb,
  aproveitado jsonb not null default '[]',
  hash_texto text,
  criado_em timestamptz not null default now(),
  unique (caso_id, chave)
);

create table public.documento_eventos (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid references public.caso_documentos(id) on delete cascade,
  caso_id uuid,
  acao text not null,
  autor text,
  detalhe jsonb,
  desfeito_em timestamptz,
  criado_em timestamptz not null default now()
);

-- ───────── acompanhamento de processos ─────────
create table public.acompanhamentos (
  id uuid primary key default gen_random_uuid(),
  caso_id uuid not null references public.casos(id) on delete cascade,
  empresa_id uuid references public.empresas(id) on delete cascade,
  frequencia text not null default 'diario' check (frequencia in ('diario', 'semanal')),
  dia_semana integer,
  responsavel text not null,
  onde text,
  o_que text,
  motivo text,
  origem text,
  status text not null default 'ativo' check (status in ('sugerido', 'ativo', 'pausado', 'encerrado', 'rejeitado')),
  ate date,
  inicio date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  modo text default 'humano',
  furar_fila_alerte boolean default false,
  palavras_urgente text[],
  integra_completa_pendente boolean,
  se_falhar text,
  link_consulta text,
  sugerido_por text,
  criado_por text,
  aprovado_por text,
  aprovado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index acompanhamentos_caso_idx on public.acompanhamentos (caso_id);

create table public.acompanhamento_registros (
  id uuid primary key default gen_random_uuid(),
  acompanhamento_id uuid not null references public.acompanhamentos(id) on delete cascade,
  caso_id uuid,
  tipo text not null,
  resultado text,
  data_ref date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  data_ultimo_andamento date,
  andamento_id uuid,
  autor text,
  obs text,
  origem text,
  visita jsonb,
  visitas jsonb,
  decisao text,
  decidido_por text,
  decidido_em timestamptz,
  criado_em timestamptz not null default now()
);
create index acompanhamento_registros_ac_idx on public.acompanhamento_registros (acompanhamento_id, data_ref);

create table public.assuntos_monitorados (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table public.achados (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'tese',
  rodada text,
  assunto text,
  empresa_id uuid references public.empresas(id) on delete set null,
  caso_id uuid references public.casos(id) on delete set null,
  titulo text not null,
  trecho text,
  resumo text,
  fonte text,
  diario text,
  tipo_pub text,
  url text,
  data_pub date,
  prazo date,
  relevancia integer,
  match text,
  status text not null default 'novo',
  tratado_em timestamptz,
  tratado_por text,
  criado_em timestamptz not null default now()
);

-- ───────── publicações (Alertes) ─────────
create table public.providencias (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  dias integer,
  contagem text not null default 'uteis',
  tipo_pend text not null default 'peca',
  titulo_padrao text,
  ler_prazo_do_teor boolean not null default false,
  ordem integer not null default 100,
  ativo boolean not null default true,
  exclusao_id uuid,
  criado_em timestamptz not null default now()
);

create table public.alertes (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  cliente text,
  tribunal text,
  teor text,
  resumo text,
  publicacao_em date,
  url_documento text,
  docx_url text,
  processo text,
  numero_norm text,
  metadata jsonb not null default '{}',
  source_id text unique,
  tipo text,
  prazo_expresso integer,
  caso_id uuid references public.casos(id) on delete set null,
  empresa_id uuid references public.empresas(id) on delete set null,
  status text not null default 'novo' check (status in ('novo', 'proposta', 'devolvida', 'segurando', 'aprovada', 'descartada')),
  proposta jsonb,
  proposto_por text,
  proposto_em timestamptz,
  aprovado_por text,
  aprovado_em timestamptz,
  devolucao_obs text,
  segurar_obs text,
  segurar_para date,
  andamento_id uuid,
  pendencia_id uuid,
  exclusao_id uuid,
  criado_em timestamptz not null default now()
);
create index alertes_data_idx on public.alertes (data desc);
create index alertes_num_idx on public.alertes (numero_norm);

create table public.alerte_eventos (
  id uuid primary key default gen_random_uuid(),
  alerte_id uuid not null references public.alertes(id) on delete cascade,
  autor text,
  acao text not null,
  obs text,
  criado_em timestamptz not null default now()
);

-- ───────── certidões ─────────
create table public.certidao_config (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  subtipo text not null,
  nao_aplica boolean not null default false,
  responsavel text,
  obs text,
  atualizado_por text,
  atualizado_em timestamptz not null default now(),
  unique (empresa_id, subtipo)
);

create table public.certidao_eventos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  subtipo text not null,
  documento_id uuid references public.empresa_documentos(id) on delete set null,
  tipo text not null,
  autor text,
  obs text,
  criado_em timestamptz not null default now()
);

-- ───────── calendário ─────────
create table public.dias_nao_uteis (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  motivo text not null,
  esferas text[] not null default '{}',
  tipo text not null default 'feriado',
  fonte text,
  status text not null default 'confirmado' check (status in ('confirmado', 'pendente', 'rejeitado')),
  observacao text,
  exclusao_id uuid,
  criado_por text,
  criado_em timestamptz not null default now(),
  unique (data, motivo)
);
create index dias_nao_uteis_data_idx on public.dias_nao_uteis (data) where status = 'confirmado';

-- Compromissos da agenda externa (Google Agenda), quando a integração for ligada.
create table public.eventos_agenda (
  id text primary key,
  subject text,
  data_inicio timestamptz,
  data_fim timestamptz,
  categories text[],
  web_link text,
  atualizado_em timestamptz not null default now()
);

-- ───────── diligências e caixinha ─────────
create table public.reembolso_lotes (
  id uuid primary key default gen_random_uuid(),
  numero serial,
  data date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  pago_por uuid,
  pago_por_nome text,
  forma text not null default 'pix',
  total numeric(12,2) not null default 0,
  qtd integer not null default 0,
  obs text,
  anexos jsonb not null default '[]',
  estornado_em timestamptz,
  exclusao_id uuid,
  criado_em timestamptz not null default now()
);

create table public.despesas (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  usuario_id uuid,
  pessoa_nome text not null,
  empresa_id uuid references public.empresas(id) on delete set null,
  caso_id uuid references public.casos(id) on delete set null,
  cliente_txt text,
  local text,
  categoria text not null,
  meio text,
  valor numeric(12,2) not null check (valor >= 0),
  status text not null default 'aguardando' check (status in ('aguardando', 'pago', 'recusado')),
  motivo_recusa text,
  lote_id uuid references public.reembolso_lotes(id) on delete set null,
  lote_numero integer,
  pago_em timestamptz,
  comprovante_path text,
  obs text,
  exclusao_id uuid,
  criado_em timestamptz not null default now(),
  criado_por text
);

create table public.caixa_movimentos (
  id uuid primary key default gen_random_uuid(),
  data date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  tipo text not null check (tipo in ('aporte', 'lote', 'ajuste', 'conferencia')),
  valor numeric(12,2) not null,
  descricao text,
  lote_id uuid references public.reembolso_lotes(id) on delete set null,
  responsavel_nome text,
  exclusao_id uuid,
  criado_por text,
  criado_em timestamptz not null default now()
);

-- ───────── exclusão com aprovação e avisos ─────────
create table public.exclusoes_pendentes (
  id uuid primary key default gen_random_uuid(),
  tabela text not null,
  row_id uuid not null,
  contexto jsonb,
  motivo text not null,
  pedido_por text not null,
  pedido_em timestamptz not null default now(),
  status text not null default 'pendente' check (status in ('pendente', 'aprovada', 'devolvida', 'cancelada')),
  decidido_por text,
  decidido_em timestamptz,
  decisao_obs text
);

create table public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  tipo text not null default 'sistema',
  titulo text not null,
  mensagem text,
  pendencia_id uuid,
  processo_id uuid,
  lida boolean not null default false,
  lida_em timestamptz,
  criado_em timestamptz not null default now()
);
