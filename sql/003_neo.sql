-- Funções do Neo, o assistente da Central.
-- O servidor do Neo (/api/mcp) não tem sessão de usuário. Ele chama estas
-- funções passando a chave do Neo, cujo hash SHA-256 fica em privado.neo_chaves.
-- O hash é inserido à parte, pelo painel, nunca neste arquivo.

create table if not exists privado.neo_chaves (
  hash text primary key,
  descricao text,
  criado_em timestamptz not null default now()
);
revoke all on privado.neo_chaves from public, anon, authenticated;

create or replace function privado.neo_chave_ok(p_chave text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(length(p_chave) >= 32, false) and exists (
    select 1 from privado.neo_chaves
    where hash = encode(extensions.digest(p_chave, 'sha256'), 'hex')
  );
$$;
revoke all on function privado.neo_chave_ok(text) from public, anon, authenticated;

create or replace function privado.neo_exigir(p_chave text)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not privado.neo_chave_ok(p_chave) then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
end;
$$;
revoke all on function privado.neo_exigir(text) from public, anon, authenticated;

create or replace function privado.neo_pendencia_json(p public.pendencias)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id,
    'titulo', p.titulo,
    'descricao', p.descricao,
    'situacao', p.bucket,
    'prazo', p.prazo,
    'prazo_fatal', p.prazo_fatal,
    'cliente', (select c.nome from public.clientes c where c.id = p.cliente_id),
    'concluido_em', p.concluido_em
  );
$$;
revoke all on function privado.neo_pendencia_json(public.pendencias) from public, anon, authenticated;

-- Resumo do dia --------------------------------------------------------------
create or replace function public.neo_resumo(p_chave text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  perform privado.neo_exigir(p_chave);
  return jsonb_build_object(
    'hoje', v_hoje,
    'vencidas', coalesce((select jsonb_agg(privado.neo_pendencia_json(p) order by p.prazo)
      from public.pendencias p where p.bucket <> 'concluido' and p.prazo < v_hoje), '[]'::jsonb),
    'para_hoje', coalesce((select jsonb_agg(privado.neo_pendencia_json(p))
      from public.pendencias p where p.bucket <> 'concluido' and p.prazo = v_hoje), '[]'::jsonb),
    'proximos_7_dias', coalesce((select jsonb_agg(privado.neo_pendencia_json(p) order by p.prazo)
      from public.pendencias p where p.bucket <> 'concluido' and p.prazo > v_hoje and p.prazo <= v_hoje + 7), '[]'::jsonb),
    'sem_prazo', coalesce((select jsonb_agg(privado.neo_pendencia_json(p) order by p.ordem)
      from public.pendencias p where p.bucket <> 'concluido' and p.prazo is null), '[]'::jsonb),
    'em_aberto_por_situacao', coalesce((select jsonb_object_agg(bucket, n) from (
      select bucket, count(*) n from public.pendencias where bucket <> 'concluido' group by bucket) t), '{}'::jsonb)
  );
end;
$$;

-- Listar ---------------------------------------------------------------------
create or replace function public.neo_listar(p_chave text, p_situacao text default null, p_busca text default null, p_incluir_concluidas boolean default false)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform privado.neo_exigir(p_chave);
  return coalesce((
    select jsonb_agg(privado.neo_pendencia_json(p) order by p.prazo nulls last, p.ordem)
    from public.pendencias p
    left join public.clientes c on c.id = p.cliente_id
    where (p_situacao is null or p.bucket = p_situacao)
      and (p_incluir_concluidas or p_situacao = 'concluido' or p.bucket <> 'concluido')
      and (p_busca is null or p.titulo ilike '%' || p_busca || '%' or c.nome ilike '%' || p_busca || '%')
  ), '[]'::jsonb);
end;
$$;

-- Criar ----------------------------------------------------------------------
create or replace function public.neo_criar(p_chave text, p_titulo text, p_prazo date default null, p_prazo_fatal boolean default false, p_situacao text default 'triagem', p_descricao text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v public.pendencias;
begin
  perform privado.neo_exigir(p_chave);
  if coalesce(trim(p_titulo), '') = '' then
    raise exception 'título vazio';
  end if;
  insert into public.pendencias (titulo, prazo, prazo_fatal, bucket, descricao)
  values (trim(p_titulo), p_prazo, coalesce(p_prazo_fatal, false), coalesce(p_situacao, 'triagem'), p_descricao)
  returning * into v;
  return privado.neo_pendencia_json(v);
end;
$$;

-- Atualizar ------------------------------------------------------------------
create or replace function public.neo_atualizar(p_chave text, p_id uuid, p_situacao text default null, p_prazo date default null, p_titulo text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v public.pendencias;
begin
  perform privado.neo_exigir(p_chave);
  update public.pendencias set
    bucket = coalesce(p_situacao, bucket),
    prazo = coalesce(p_prazo, prazo),
    titulo = coalesce(nullif(trim(p_titulo), ''), titulo),
    ordem = case when p_situacao is not null then extract(epoch from now()) else ordem end
  where id = p_id
  returning * into v;
  if v.id is null then
    raise exception 'pendência não encontrada';
  end if;
  return privado.neo_pendencia_json(v);
end;
$$;

-- Só o papel anon chama (o servidor do Neo usa a chave publicável).
revoke all on function public.neo_resumo(text) from public, authenticated;
revoke all on function public.neo_listar(text, text, text, boolean) from public, authenticated;
revoke all on function public.neo_criar(text, text, date, boolean, text, text) from public, authenticated;
revoke all on function public.neo_atualizar(text, uuid, text, date, text) from public, authenticated;
grant execute on function public.neo_resumo(text) to anon;
grant execute on function public.neo_listar(text, text, text, boolean) to anon;
grant execute on function public.neo_criar(text, text, date, boolean, text, text) to anon;
grant execute on function public.neo_atualizar(text, uuid, text, date, text) to anon;
