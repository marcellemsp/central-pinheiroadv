-- Central PinheiroAdv v1 — acesso (RLS), arquivos, tempo real, Neo e migração da v0.

-- ───────── RLS ─────────
-- Regra geral: só e-mails em usuarios_autorizados leem e gravam; apagar é da coordenação.
-- Linhas com pedido de exclusão em aberto (exclusao_id) somem das telas até a decisão.
do $$
declare
  t text;
  tem_exclusao boolean;
begin
  foreach t in array array['grupos', 'empresas', 'empresa_documentos', 'casos', 'caso_andamentos', 'caso_pendencias',
    'pendencia_eventos', 'caso_documentos', 'documento_eventos', 'acompanhamentos', 'acompanhamento_registros',
    'assuntos_monitorados', 'achados', 'providencias', 'alertes', 'alerte_eventos', 'certidao_config', 'certidao_eventos',
    'dias_nao_uteis', 'eventos_agenda', 'reembolso_lotes', 'despesas', 'caixa_movimentos', 'exclusoes_pendentes'] loop
    select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'exclusao_id')
      into tem_exclusao;
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy ler on public.%I for select to authenticated using (privado.usuario_autorizado()%s)', t,
      case when tem_exclusao then ' and exclusao_id is null' else '' end);
    execute format('create policy incluir on public.%I for insert to authenticated with check (privado.usuario_autorizado())', t);
    execute format('create policy alterar on public.%I for update to authenticated using (privado.usuario_autorizado()) with check (privado.usuario_autorizado())', t);
    execute format('create policy apagar on public.%I for delete to authenticated using (privado.eh_coordenador())', t);
  end loop;
end $$;

-- Gastos: cada um vê os seus; a coordenação vê todos.
drop policy ler on public.despesas;
create policy ler on public.despesas for select to authenticated
  using (privado.usuario_autorizado() and exclusao_id is null and (usuario_id = auth.uid() or privado.eh_coordenador()));
drop policy alterar on public.despesas;
create policy alterar on public.despesas for update to authenticated
  using (privado.usuario_autorizado() and (privado.eh_coordenador() or (usuario_id = auth.uid() and status = 'aguardando')))
  with check (privado.usuario_autorizado());

alter table public.usuarios enable row level security;
create policy ler on public.usuarios for select to authenticated using (privado.usuario_autorizado());
create policy incluir on public.usuarios for insert to authenticated with check (privado.usuario_autorizado() and id = auth.uid());
create policy alterar on public.usuarios for update to authenticated
  using (privado.usuario_autorizado() and (id = auth.uid() or privado.eh_coordenador()))
  with check (privado.usuario_autorizado() and (privado.eh_coordenador() or papel = (select u.papel from public.usuarios u where u.id = auth.uid())));

alter table public.notificacoes enable row level security;
create policy ler on public.notificacoes for select to authenticated using (privado.usuario_autorizado() and usuario_id = auth.uid());
create policy incluir on public.notificacoes for insert to authenticated with check (privado.usuario_autorizado());
create policy alterar on public.notificacoes for update to authenticated using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy apagar on public.notificacoes for delete to authenticated using (usuario_id = auth.uid());

grant select on public.empresa_casos_resumo to authenticated;

-- ───────── comprovantes de gastos (Storage privado) ─────────
insert into storage.buckets (id, name, public) values ('comprovantes', 'comprovantes', false) on conflict (id) do nothing;
create policy "comprovantes autorizados" on storage.objects for all to authenticated
  using (bucket_id = 'comprovantes' and privado.usuario_autorizado())
  with check (bucket_id = 'comprovantes' and privado.usuario_autorizado());

-- ───────── tempo real ─────────
alter publication supabase_realtime add table public.caso_pendencias, public.caso_andamentos, public.caso_documentos, public.alertes,
  public.certidao_config, public.despesas, public.dias_nao_uteis, public.empresa_documentos, public.exclusoes_pendentes, public.notificacoes;

-- ───────── Marcelle coordena ─────────
insert into public.usuarios (id, email, nome_completo, papel, oab)
select u.id, u.email, 'Marcelle Pinheiro', 'coordenador', null from auth.users u where u.email = 'marcellemspinheiro@gmail.com'
on conflict (id) do update set papel = 'coordenador', nome_completo = coalesce(public.usuarios.nome_completo, excluded.nome_completo);

-- ───────── feriados dos próximos anos ─────────
select privado.semear_feriados(a) from generate_series(2026, 2028) a;

-- ───────── migração das pendências da v0 ─────────
insert into public.empresas (nome) select 'Yasmin' where exists (select 1 from legado.pendencias where titulo ilike 'Yasmin%');
insert into public.empresas (nome) select 'Igreja' where exists (select 1 from legado.pendencias where titulo ilike 'Igreja%');
insert into public.caso_pendencias (empresa_id, titulo, tipo, responsavel, status, prazo, fatal, descricao, criado_em)
select e.id, trim(split_part(p.titulo, '—', 2)), 'analise', 'Marcelle',
  case p.bucket when 'concluido' then 'concluida' when 'aguardando' then 'aguardando_cliente' when 'protocolar' then 'pronta_protocolar'
    when 'producao' then 'em_elaboracao' else 'a_fazer' end,
  p.prazo, p.prazo_fatal, p.descricao, p.criado_em
from legado.pendencias p
left join public.empresas e on e.nome = trim(split_part(p.titulo, '—', 1));

-- ───────── providências padrão (editáveis em Configurações) ─────────
insert into public.providencias (nome, dias, contagem, tipo_pend, titulo_padrao, ler_prazo_do_teor, ordem) values
  ('Manifestação', 15, 'uteis', 'peca', 'Manifestação', true, 10),
  ('Contrarrazões', 15, 'uteis', 'peca', 'Contrarrazões', false, 20),
  ('Apelação', 15, 'uteis', 'peca', 'Apelação', false, 30),
  ('Agravo de instrumento', 15, 'uteis', 'peca', 'Agravo de instrumento', false, 40),
  ('Embargos de declaração', 5, 'uteis', 'peca', 'Embargos de declaração', false, 50),
  ('Recurso especial / extraordinário', 15, 'uteis', 'peca', 'Recurso especial', false, 60),
  ('Impugnação administrativa', 30, 'corridos', 'peca', 'Impugnação', false, 70),
  ('Recurso voluntário (CARF)', 30, 'corridos', 'peca', 'Recurso voluntário', false, 80),
  ('Cumprir despacho', null, 'uteis', 'diligencia', null, true, 90),
  ('Ciência ao cliente', null, 'uteis', 'solicitacao', 'Informar o cliente', false, 100);

-- ═════════════════════════ NEO ═════════════════════════
-- As funções antigas apontavam para a tabela da v0; são refeitas sobre caso_pendencias.
drop function if exists public.neo_resumo(text);
drop function if exists public.neo_listar(text, text, text, boolean);
drop function if exists public.neo_criar(text, text, date, boolean, text, text);
drop function if exists public.neo_atualizar(text, uuid, text, date, text);
drop function if exists privado.neo_pendencia_json(legado.pendencias);

create or replace function privado.neo_pendencia_json(p public.caso_pendencias)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', p.id, 'titulo', p.titulo, 'tipo', p.tipo, 'situacao', p.status, 'prazo', p.prazo, 'prazo_interno', p.prazo_interno,
    'fatal', p.fatal, 'responsavel', p.responsavel, 'descricao', p.descricao,
    'cliente', (select coalesce(e.nome_exibicao, e.nome) from public.empresas e where e.id = p.empresa_id),
    'caso', (select coalesce(c.numero, '') || case when c.numero is not null then ' · ' else '' end || c.titulo from public.casos c where c.id = p.caso_id),
    'concluida_em', p.concluida_em));
$$;
revoke all on function privado.neo_pendencia_json(public.caso_pendencias) from public, anon, authenticated;

create or replace function public.neo_resumo(p_chave text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  perform privado.neo_exigir(p_chave);
  return jsonb_build_object(
    'hoje', v_hoje,
    'vencidas', coalesce((select jsonb_agg(privado.neo_pendencia_json(p) order by p.prazo) from public.caso_pendencias p
      where p.status <> 'concluida' and p.exclusao_id is null and p.prazo < v_hoje), '[]'),
    'para_hoje', coalesce((select jsonb_agg(privado.neo_pendencia_json(p)) from public.caso_pendencias p
      where p.status <> 'concluida' and p.exclusao_id is null and (p.prazo = v_hoje or p.prazo_interno = v_hoje)), '[]'),
    'proximos_7_dias', coalesce((select jsonb_agg(privado.neo_pendencia_json(p) order by p.prazo) from public.caso_pendencias p
      where p.status <> 'concluida' and p.exclusao_id is null and p.prazo > v_hoje and p.prazo <= v_hoje + 7), '[]'),
    'sem_prazo', coalesce((select jsonb_agg(privado.neo_pendencia_json(p) order by p.criado_em) from public.caso_pendencias p
      where p.status not in ('concluida', 'aguardando') and p.exclusao_id is null and p.prazo is null), '[]'),
    'publicacoes_sem_destinacao', (select count(*) from public.alertes a where a.status in ('novo', 'devolvida') and a.exclusao_id is null),
    'em_aberto_por_situacao', coalesce((select jsonb_object_agg(status, n) from (
      select status, count(*) n from public.caso_pendencias where status <> 'concluida' and exclusao_id is null group by status) t), '{}'));
end;
$$;

create or replace function public.neo_listar(p_chave text, p_situacao text default null, p_busca text default null, p_incluir_concluidas boolean default false)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform privado.neo_exigir(p_chave);
  return coalesce((
    select jsonb_agg(privado.neo_pendencia_json(p) order by p.prazo nulls last, p.criado_em)
    from public.caso_pendencias p
    left join public.empresas e on e.id = p.empresa_id
    left join public.casos c on c.id = p.caso_id
    where p.exclusao_id is null
      and (p_situacao is null or p.status = p_situacao)
      and (p_incluir_concluidas or p_situacao = 'concluida' or p.status <> 'concluida')
      and (p_busca is null or p.titulo ilike '%' || p_busca || '%' or e.nome ilike '%' || p_busca || '%'
        or e.nome_exibicao ilike '%' || p_busca || '%' or c.titulo ilike '%' || p_busca || '%' or c.numero ilike '%' || p_busca || '%')
  ), '[]');
end;
$$;

create or replace function public.neo_criar(p_chave text, p_titulo text, p_prazo date default null, p_prazo_fatal boolean default false,
  p_situacao text default 'a_fazer', p_descricao text default null, p_cliente text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v public.caso_pendencias;
  v_emp uuid;
begin
  perform privado.neo_exigir(p_chave);
  if coalesce(trim(p_titulo), '') = '' then raise exception 'título vazio'; end if;
  if nullif(trim(p_cliente), '') is not null then
    select id into v_emp from public.empresas where exclusao_id is null and (nome ilike trim(p_cliente) || '%' or nome_exibicao ilike trim(p_cliente) || '%')
      order by ativo desc, nome limit 1;
    if v_emp is null then
      insert into public.empresas (nome) values (trim(p_cliente)) returning id into v_emp;
    end if;
  end if;
  insert into public.caso_pendencias (titulo, prazo, fatal, status, descricao, empresa_id, tipo, responsavel)
  values (trim(p_titulo), p_prazo, coalesce(p_prazo_fatal, false), coalesce(p_situacao, 'a_fazer'), p_descricao, v_emp, 'analise', 'Marcelle')
  returning * into v;
  insert into public.pendencia_eventos (pendencia_id, empresa_id, autor, acao) values (v.id, v_emp, 'Neo', 'criou pelo Neo');
  return privado.neo_pendencia_json(v);
end;
$$;

create or replace function public.neo_atualizar(p_chave text, p_id uuid, p_situacao text default null, p_prazo date default null, p_titulo text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v public.caso_pendencias;
begin
  perform privado.neo_exigir(p_chave);
  update public.caso_pendencias set
    status = coalesce(p_situacao, status),
    prazo = coalesce(p_prazo, prazo),
    titulo = coalesce(nullif(trim(p_titulo), ''), titulo)
  where id = p_id
  returning * into v;
  if v.id is null then raise exception 'pendência não encontrada'; end if;
  insert into public.pendencia_eventos (pendencia_id, caso_id, empresa_id, autor, acao)
    values (v.id, v.caso_id, v.empresa_id, 'Neo', 'atualizou pelo Neo' || coalesce(' · ' || p_situacao, ''));
  return privado.neo_pendencia_json(v);
end;
$$;

revoke all on function public.neo_resumo(text) from public, authenticated;
revoke all on function public.neo_listar(text, text, text, boolean) from public, authenticated;
revoke all on function public.neo_criar(text, text, date, boolean, text, text, text) from public, authenticated;
revoke all on function public.neo_atualizar(text, uuid, text, date, text) from public, authenticated;
grant execute on function public.neo_resumo(text) to anon;
grant execute on function public.neo_listar(text, text, text, boolean) to anon;
grant execute on function public.neo_criar(text, text, date, boolean, text, text, text) to anon;
grant execute on function public.neo_atualizar(text, uuid, text, date, text) to anon;
