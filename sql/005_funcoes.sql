-- Central PinheiroAdv v1 — funções, gatilhos e calendário.
-- Prefixo pa_ (Pinheiro Advogados). Funções chamadas pela aplicação ficam em public;
-- as auxiliares de permissão ficam em privado.

-- ───────── quem está logado ─────────
create or replace function privado.eh_coordenador()
returns boolean language sql stable security definer set search_path = '' as $$
  select privado.usuario_autorizado() and exists (
    select 1 from public.usuarios u where u.id = auth.uid() and u.papel = 'coordenador' and u.ativo
  );
$$;
revoke all on function privado.eh_coordenador() from public, anon;
grant execute on function privado.eh_coordenador() to authenticated;

create or replace function privado.meu_nome()
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(split_part(trim(u.nome_completo), ' ', 1), split_part(u.email, '@', 1))
  from public.usuarios u where u.id = auth.uid();
$$;
revoke all on function privado.meu_nome() from public, anon;
grant execute on function privado.meu_nome() to authenticated;

-- Cadastro automático em usuarios quando alguém entra pela primeira vez.
create or replace function privado.tg_novo_usuario()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.usuarios (id, email, nome_completo)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists pa_novo_usuario on auth.users;
create trigger pa_novo_usuario after insert on auth.users
  for each row execute function privado.tg_novo_usuario();

-- atualizado_em genérico
create or replace function privado.tg_atualizado_em()
returns trigger language plpgsql set search_path = '' as $$
begin new.atualizado_em := now(); return new; end;
$$;
create trigger usuarios_atualizado before update on public.usuarios for each row execute function privado.tg_atualizado_em();
create trigger empresas_atualizado before update on public.empresas for each row execute function privado.tg_atualizado_em();
create trigger casos_atualizado before update on public.casos for each row execute function privado.tg_atualizado_em();

-- Número CNJ: valida o dígito só quando tem cara de CNJ (SEI, TIF etc. passam direto).
create or replace function privado.tg_casos_cnj()
returns trigger language plpgsql set search_path = '' as $$
declare
  d text := regexp_replace(coalesce(new.numero, ''), '\D', '', 'g');
  dv int;
begin
  if new.numero ~ '\d{5,7}-\d{2}\.\d{4,5}\.\d\.\d{2}' then
    if length(d) <> 20 then
      raise exception 'Número CNJ incompleto: %', new.numero;
    end if;
    dv := 98 - ((substr(d, 1, 7) || substr(d, 10, 11) || '00')::numeric % 97)::int;
    if dv <> substr(d, 8, 2)::int then
      raise exception 'Número CNJ inválido (dígito verificador não confere): %', new.numero;
    end if;
  end if;
  return new;
end;
$$;
create trigger casos_cnj before insert or update of numero on public.casos for each row execute function privado.tg_casos_cnj();

-- ═════════════════════════ CALENDÁRIO E PRAZOS ═════════════════════════

-- Esferas de calendário que valem para cada tribunal / órgão.
create or replace function public.pa_esferas(p_tribunal text, p_municipais boolean default false)
returns text[] language sql immutable set search_path = '' as $$
  select case upper(coalesce(p_tribunal, 'TJRJ'))
    when 'TJRJ' then array['nacional', 'forense', 'rj', 'tjrj']
    when 'TRF2' then array['nacional', 'forense', 'trf2']
    when 'STJ' then array['nacional', 'forense', 'stj']
    when 'STF' then array['nacional', 'forense', 'stf']
    when 'SEFAZ-RJ' then array['nacional', 'rj', 'rio', 'sefaz']
    when 'PGFN' then array['nacional', 'rio', 'pgfn']
    when 'CARF' then array['nacional', 'pgfn']
    else array['nacional', 'forense', 'rj']
  end || case when p_municipais then array['rio'] else array[]::text[] end;
$$;

-- Motivo de um dia não ser útil para as esferas dadas (null = dia útil).
create or replace function public.pa_nao_util(p_dia date, p_esferas text[])
returns text language sql stable set search_path = '' as $$
  select case extract(isodow from p_dia)::int when 6 then 'sábado' when 7 then 'domingo' else (
    select string_agg(d.motivo, ' / ' order by d.motivo) from public.dias_nao_uteis d
    where d.data = p_dia and d.status = 'confirmado' and d.exclusao_id is null
      and (cardinality(d.esferas) = 0 or d.esferas && p_esferas)
  ) end;
$$;

create or replace function public.pa_proximo_util(p_dia date, p_esferas text[])
returns date language plpgsql stable set search_path = '' as $$
declare d date := p_dia;
begin
  while public.pa_nao_util(d, p_esferas) is not null loop d := d + 1; end loop;
  return d;
end;
$$;

create or replace function public.pa_sub_uteis_esf(d date, n integer, esferas text[])
returns date language plpgsql stable set search_path = '' as $$
declare x date := d; k int := 0;
begin
  if d is null then return null; end if;
  while k < coalesce(n, 0) loop
    x := x - 1;
    if public.pa_nao_util(x, esferas) is null then k := k + 1; end if;
  end loop;
  return x;
end;
$$;

create or replace function public.pa_add_uteis_esf(d date, n integer, esferas text[])
returns date language plpgsql stable set search_path = '' as $$
declare x date := d; k int := 0;
begin
  if d is null then return null; end if;
  while k < coalesce(n, 0) loop
    x := x + 1;
    if public.pa_nao_util(x, esferas) is null then k := k + 1; end if;
  end loop;
  return x;
end;
$$;

create or replace function public.pa_sub_uteis(d date, n integer, tribunal text default 'TJRJ')
returns date language sql stable set search_path = '' as $$
  select public.pa_sub_uteis_esf(d, n, public.pa_esferas(tribunal, false));
$$;

-- Motor de prazos. regra: cpc | clt2017 | juizado (dias úteis) · corridos · paf (Decreto 70.235).
create or replace function public.pa_prazo(evento date, dias integer, regra text default 'cpc', tribunal text default 'TJRJ',
  incluir_municipais boolean default false, djen boolean default false)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  esf text[] := public.pa_esferas(tribunal, incluir_municipais);
  uteis boolean := regra in ('cpc', 'clt2017', 'juizado');
  passos jsonb := '[]';
  pub date := null;
  inicio date := evento;
  d date;
  n int := 0;
  mot text;
  final date;
  pend jsonb;
begin
  if evento is null or coalesce(dias, 0) < 1 then raise exception 'Informe a data e o número de dias.'; end if;
  if djen and uteis then
    pub := public.pa_proximo_util(evento + 1, esf);
    passos := passos || jsonb_build_object('data', evento, 'contado', false, 'rotulo', 'Disponibilização');
    d := evento + 1;
    while d < pub loop
      passos := passos || jsonb_build_object('data', d, 'contado', false, 'rotulo', public.pa_nao_util(d, esf));
      d := d + 1;
    end loop;
    passos := passos || jsonb_build_object('data', pub, 'contado', false, 'rotulo', 'Publicação');
    inicio := pub;
  else
    passos := passos || jsonb_build_object('data', evento, 'contado', false, 'rotulo', 'Dia do começo');
  end if;

  d := inicio;
  if uteis then
    while n < dias loop
      d := d + 1;
      mot := public.pa_nao_util(d, esf);
      if mot is null then
        n := n + 1;
        passos := passos || jsonb_build_object('data', d, 'contado', true, 'n', n);
      else
        passos := passos || jsonb_build_object('data', d, 'contado', false, 'rotulo', mot);
      end if;
    end loop;
    final := d;
  else
    -- corridos: o prazo só começa em dia útil no processo administrativo (paf)
    d := inicio + 1;
    if regra = 'paf' then
      while public.pa_nao_util(d, esf) is not null loop
        passos := passos || jsonb_build_object('data', d, 'contado', false, 'rotulo', public.pa_nao_util(d, esf));
        d := d + 1;
      end loop;
    end if;
    while n < dias loop
      n := n + 1;
      passos := passos || jsonb_build_object('data', d, 'contado', true, 'n', n);
      final := d;
      d := d + 1;
    end loop;
    while public.pa_nao_util(final, esf) is not null loop
      passos := passos || jsonb_build_object('data', final + 1, 'contado', false, 'rotulo', 'prorrogado: ' || public.pa_nao_util(final, esf));
      final := final + 1;
    end loop;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('data', x.data, 'motivo', x.motivo, 'esferas', x.esferas, 'fonte', x.fonte) order by x.data), '[]')
    into pend from public.dias_nao_uteis x
    where x.status = 'pendente' and x.data between evento and final and (cardinality(x.esferas) = 0 or x.esferas && esf);

  return jsonb_build_object('final', final, 'evento', evento, 'publicacao', pub, 'dias', dias, 'regra', regra,
    'tribunal', tribunal, 'esferas', esf, 'incluir_municipais', incluir_municipais, 'djen', djen and uteis,
    'passos', passos, 'pendentes', pend,
    'calendario_atualizado_em', (select max(criado_em) from public.dias_nao_uteis));
end;
$$;

-- Páscoa (Meeus) e semeadura dos feriados de um ano.
create or replace function public.pa_pascoa(ano integer)
returns date language plpgsql immutable set search_path = '' as $$
declare a int; b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int; mes int; dia int;
begin
  a := ano % 19; b := ano / 100; c := ano % 100; d := b / 4; e := b % 4; f := (b + 8) / 25; g := (b - f + 1) / 3;
  h := (19 * a + b - d - g + 15) % 30; i := c / 4; k := c % 4; l := (32 + 2 * e + 2 * i - h - k) % 7;
  m := (a + 11 * h + 22 * l) / 451; mes := (h + l - 7 * m + 114) / 31; dia := ((h + l - 7 * m + 114) % 31) + 1;
  return make_date(ano, mes, dia);
end;
$$;

create or replace function privado.semear_feriados(ano integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  p date := public.pa_pascoa(ano);
  n int;
  quem text := coalesce(privado.meu_nome(), 'sistema');
begin
  insert into public.dias_nao_uteis (data, motivo, esferas, tipo, fonte, status, criado_por)
  select v.data, v.motivo, v.esferas, v.tipo, 'semeadura automática', 'confirmado', quem
  from (values
    (make_date(ano, 1, 1), 'Confraternização Universal', array['nacional'], 'feriado'),
    (make_date(ano, 4, 21), 'Tiradentes', array['nacional'], 'feriado'),
    (make_date(ano, 5, 1), 'Dia do Trabalho', array['nacional'], 'feriado'),
    (make_date(ano, 9, 7), 'Independência', array['nacional'], 'feriado'),
    (make_date(ano, 10, 12), 'Nossa Senhora Aparecida', array['nacional'], 'feriado'),
    (make_date(ano, 11, 2), 'Finados', array['nacional'], 'feriado'),
    (make_date(ano, 11, 15), 'Proclamação da República', array['nacional'], 'feriado'),
    (make_date(ano, 11, 20), 'Dia da Consciência Negra', array['nacional'], 'feriado'),
    (make_date(ano, 12, 25), 'Natal', array['nacional'], 'feriado'),
    (p - 48, 'Carnaval (segunda)', array['forense', 'rj', 'rio', 'sefaz', 'pgfn'], 'feriado'),
    (p - 47, 'Carnaval (terça)', array['forense', 'rj', 'rio', 'sefaz', 'pgfn'], 'feriado'),
    (p - 46, 'Quarta-feira de Cinzas (até 12h)', array['tjrj', 'trf2'], 'ponto_facultativo'),
    (p - 2, 'Sexta-feira Santa', array['nacional'], 'feriado'),
    (p + 60, 'Corpus Christi', array['forense', 'rio', 'sefaz', 'pgfn'], 'feriado'),
    (make_date(ano, 4, 23), 'São Jorge', array['rj', 'tjrj', 'sefaz'], 'feriado'),
    (make_date(ano, 1, 20), 'São Sebastião', array['rio'], 'feriado'),
    (p - 4, 'Quarta-feira Santa (Lei 5.010/66)', array['trf2', 'stj', 'stf'], 'feriado'),
    (p - 3, 'Quinta-feira Santa (Lei 5.010/66)', array['trf2', 'stj', 'stf', 'tjrj'], 'feriado'),
    (make_date(ano, 8, 11), 'Dia do Advogado / Cursos jurídicos (Lei 5.010/66)', array['trf2', 'stj', 'stf'], 'feriado'),
    (make_date(ano, 11, 1), 'Todos os Santos (Lei 5.010/66)', array['trf2', 'stj', 'stf'], 'feriado'),
    (make_date(ano, 12, 8), 'Dia da Justiça', array['forense'], 'feriado')
  ) as v(data, motivo, esferas, tipo)
  on conflict (data, motivo) do nothing;
  get diagnostics n = row_count;

  -- Suspensão dos prazos de 20/12 a 20/01 (CPC, art. 220).
  insert into public.dias_nao_uteis (data, motivo, esferas, tipo, fonte, status, criado_por)
  select g::date, 'Suspensão de prazos (CPC, art. 220)', array['forense'], 'suspensao', 'semeadura automática', 'confirmado', quem
  from generate_series(make_date(ano, 1, 1), make_date(ano, 1, 20), interval '1 day') g
  union all
  select g::date, 'Suspensão de prazos (CPC, art. 220)', array['forense'], 'suspensao', 'semeadura automática', 'confirmado', quem
  from generate_series(make_date(ano, 12, 20), make_date(ano, 12, 31), interval '1 day') g
  on conflict (data, motivo) do nothing;
  return n;
end;
$$;
revoke all on function privado.semear_feriados(integer) from public, anon, authenticated;

create or replace function public.pa_semear_feriados(ano integer)
returns integer language plpgsql security definer set search_path = '' as $$
begin
  if not privado.usuario_autorizado() then raise exception 'acesso negado' using errcode = '42501'; end if;
  return privado.semear_feriados(ano);
end;
$$;

-- ═════════════════════════ ROTINAS (pendências recorrentes) ═════════════════════════

-- Próxima data de uma regra de recorrência, já ajustada para dia útil (calendário civil: nacional + RJ + Rio).
create or replace function public.pa_proxima_data(base date, r jsonb)
returns date language plpgsql stable set search_path = '' as $$
declare
  freq text := coalesce(r->>'freq', 'mensal');
  dia text := coalesce(r->>'dia', 'fixo');
  ref int := nullif(r->>'dia_ref', '')::int;
  ajuste text := coalesce(r->>'ajuste', 'ant');
  esf text[] := array['nacional', 'rj', 'rio'];
  meses int;
  m date; ultimo date; d date; k int;
begin
  if freq in ('semanal', 'quinzenal') then
    d := base + case when freq = 'semanal' then 7 else 14 end;
  else
    meses := case freq when 'bimestral' then 2 when 'trimestral' then 3 when 'semestral' then 6 when 'anual' then 12 else 1 end;
    m := (date_trunc('month', base) + make_interval(months => meses))::date;
    ultimo := (m + interval '1 month' - interval '1 day')::date;
    if dia = 'ult' then d := ultimo;
    elsif dia = 'prim' then return public.pa_proximo_util(m, esf);
    elsif dia = 'ultu' then
      d := ultimo;
      while public.pa_nao_util(d, esf) is not null loop d := d - 1; end loop;
      return d;
    elsif dia = 'util_n' then
      d := m; k := case when public.pa_nao_util(d, esf) is null then 1 else 0 end;
      while k < coalesce(ref, 1) and d < ultimo loop
        d := d + 1;
        if public.pa_nao_util(d, esf) is null then k := k + 1; end if;
      end loop;
      return d;
    else
      d := m + (least(coalesce(ref, extract(day from base)::int), extract(day from ultimo)::int) - 1);
    end if;
  end if;
  if ajuste = 'ant' then
    while public.pa_nao_util(d, esf) is not null loop d := d - 1; end loop;
  elsif ajuste = 'prox' then
    d := public.pa_proximo_util(d, esf);
  end if;
  return d;
end;
$$;

-- Prévia das próximas N datas de uma rotina a partir do mês de início.
create or replace function public.pa_rotina_datas(p_inicio date, p_rec jsonb, p_n integer default 5)
returns table (prazo date, interno date, referencia text) language plpgsql stable set search_path = '' as $$
declare
  r jsonb := p_rec;
  base date := (date_trunc('month', p_inicio) - make_interval(months => case coalesce(p_rec->>'freq', 'mensal')
    when 'bimestral' then 2 when 'trimestral' then 3 when 'semestral' then 6 when 'anual' then 12 else 1 end))::date;
  i int := 0;
  d date;
  meses text[] := array['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
begin
  -- a primeira ocorrência é a do próprio mês de início
  if coalesce(r->>'freq', 'mensal') in ('semanal', 'quinzenal') then base := p_inicio - case when r->>'freq' = 'semanal' then 7 else 14 end; end if;
  while i < coalesce(p_n, 5) loop
    d := public.pa_proxima_data(base, r);
    if r->>'fim' = 'data' and nullif(r->>'fim_data', '') is not null and d > (r->>'fim_data')::date then exit; end if;
    if r->>'fim' = 'n' and nullif(r->>'fim_n', '') is not null and i + 1 > (r->>'fim_n')::int then exit; end if;
    prazo := d;
    interno := public.pa_sub_uteis_esf(d, 2, array['nacional', 'rj', 'rio']);
    referencia := case when r->>'ref' = 'anterior'
      then meses[extract(month from (d - interval '1 month'))::int] || '/' || extract(year from (d - interval '1 month'))::int
      when r->>'ref' = 'corrente' then meses[extract(month from d)::int] || '/' || extract(year from d)::int
      else null end;
    return next;
    base := d; i := i + 1;
    -- com dia fixo, mantém a âncora do dia do mês e não a data ajustada
    if coalesce(r->>'freq', 'mensal') not in ('semanal', 'quinzenal') then base := make_date(extract(year from d)::int, extract(month from d)::int, 1); end if;
  end loop;
end;
$$;

-- Cria ou altera uma rotina. p_escopo: null (nova) | 'ocorrencia' | 'serie'.
create or replace function public.pa_rotina_salvar(p_id uuid, p jsonb, p_escopo text default null, p_autor text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_prazo date;
  v_rec jsonb := p->'recorrencia';
  atual public.caso_pendencias;
begin
  if not privado.usuario_autorizado() then raise exception 'acesso negado' using errcode = '42501'; end if;
  if p_id is null then
    select x.prazo into v_prazo from public.pa_rotina_datas(coalesce(nullif(p->>'inicio', '')::date, current_date), v_rec, 1) x;
    insert into public.caso_pendencias (titulo, tipo, responsavel, revisor, descricao, caso_id, empresa_id, recorrencia, recorrencia_id,
      recorrencia_seq, recorrencia_ativa, prazo, prazo_interno, fatal, status)
    values (p->>'titulo', coalesce(p->>'tipo', 'documento'), p->>'responsavel', nullif(p->>'revisor', ''), p->>'descricao',
      nullif(p->>'caso_id', '')::uuid, nullif(p->>'empresa_id', '')::uuid, v_rec, gen_random_uuid(), 1, true, v_prazo,
      public.pa_sub_uteis_esf(v_prazo, 2, array['nacional', 'rj', 'rio']), false, 'a_fazer')
    returning id into v_id;
    insert into public.pendencia_eventos (pendencia_id, caso_id, empresa_id, autor, acao)
      select id, caso_id, empresa_id, p_autor, 'criou a rotina' from public.caso_pendencias where id = v_id;
    return v_id;
  end if;

  select * into atual from public.caso_pendencias where id = p_id;
  if atual.id is null then raise exception 'Rotina não encontrada.'; end if;
  update public.caso_pendencias set
    titulo = coalesce(p->>'titulo', titulo), tipo = coalesce(p->>'tipo', tipo), responsavel = coalesce(p->>'responsavel', responsavel),
    revisor = nullif(p->>'revisor', ''), descricao = p->>'descricao', caso_id = nullif(p->>'caso_id', '')::uuid,
    prazo = coalesce(nullif(p->>'prazo', '')::date, prazo),
    recorrencia = case when p ? 'recorrencia' then p->'recorrencia' else recorrencia end
  where id = p_id;
  if p_escopo = 'serie' and p ? 'recorrencia' then
    update public.caso_pendencias set recorrencia = p->'recorrencia', titulo = coalesce(p->>'titulo', titulo),
      responsavel = coalesce(p->>'responsavel', responsavel)
    where recorrencia_id = atual.recorrencia_id and status <> 'concluida' and id <> p_id;
  end if;
  insert into public.pendencia_eventos (pendencia_id, caso_id, empresa_id, autor, acao)
    values (p_id, atual.caso_id, atual.empresa_id, p_autor, case when p_escopo = 'serie' then 'alterou a rotina (esta e as próximas)' else 'alterou só esta ocorrência' end);
  return p_id;
end;
$$;

-- ───────── gatilhos de caso_pendencias ─────────
create or replace function privado.tg_pendencia_antes()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.atualizado_em := now();
  if new.status = 'concluida' and (tg_op = 'INSERT' or old.status is distinct from 'concluida') then
    new.concluida_em := coalesce(new.concluida_em, now());
    if coalesce((new.recorrencia->>'registrar_documento')::boolean, false) and coalesce(trim(new.arquivo_url), '') = '' then
      raise exception 'Para concluir esta rotina, informe o link do documento.';
    end if;
  elsif new.status <> 'concluida' then
    new.concluida_em := null;
  end if;
  if new.status = 'revisao_pendente' and (tg_op = 'INSERT' or old.status is distinct from 'revisao_pendente') then
    new.versao := coalesce(new.versao, 0) + 1;
    new.enviado_em := coalesce(new.enviado_em, now());
  end if;
  return new;
end;
$$;
create trigger pendencia_antes before insert or update on public.caso_pendencias
  for each row execute function privado.tg_pendencia_antes();

create or replace function privado.tg_pendencia_depois()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  prox date;
  esf text[] := array['nacional', 'rj', 'rio'];
  r jsonb := new.recorrencia;
  f record;
begin
  if new.status = 'concluida' and old.status is distinct from 'concluida' then
    -- rotina: nasce a próxima ocorrência
    if r is not null and coalesce(new.recorrencia_ativa, true) and new.prazo is not null then
      prox := public.pa_proxima_data(new.prazo, r);
      if not (r->>'fim' = 'data' and nullif(r->>'fim_data', '') is not null and prox > (r->>'fim_data')::date)
         and not (r->>'fim' = 'n' and nullif(r->>'fim_n', '') is not null and coalesce(new.recorrencia_seq, 1) + 1 > (r->>'fim_n')::int)
         and not exists (select 1 from public.caso_pendencias x where x.recorrencia_id = new.recorrencia_id and x.recorrencia_seq = coalesce(new.recorrencia_seq, 1) + 1) then
        insert into public.caso_pendencias (caso_id, empresa_id, certidao_subtipo, titulo, tipo, responsavel, revisor, fatal, prazo, prazo_interno,
          contagem, prioridade, descricao, recorrencia, recorrencia_id, recorrencia_seq, recorrencia_ativa, status)
        values (new.caso_id, new.empresa_id, new.certidao_subtipo, new.titulo, new.tipo, new.responsavel, new.revisor, new.fatal, prox,
          case when new.prazo_interno is not null then public.pa_sub_uteis_esf(prox, greatest(new.prazo - new.prazo_interno, 0)::int, esf) end,
          new.contagem, new.prioridade, new.descricao, r, new.recorrencia_id, coalesce(new.recorrencia_seq, 1) + 1, true, 'a_fazer');
      end if;
      if coalesce((r->>'registrar_documento')::boolean, false) and new.empresa_id is not null then
        insert into public.empresa_documentos (empresa_id, tipo, nome, url, dados)
        values (new.empresa_id, 'relatorio_cliente', new.titulo, new.arquivo_url,
          jsonb_build_object('enviado_em', current_date, 'pendencia_id', new.id));
      end if;
    end if;
    -- encadeadas: a seguinte deixa de aguardar
    for f in select * from public.caso_pendencias where depende_de = new.id and status = 'aguardando' loop
      update public.caso_pendencias set status = 'a_fazer',
        prazo = case when f.prazo_relativo_uteis is not null then public.pa_add_uteis_esf(current_date, f.prazo_relativo_uteis, esf) else f.prazo end
      where id = f.id;
      insert into public.pendencia_eventos (pendencia_id, caso_id, empresa_id, autor, acao)
        values (f.id, f.caso_id, f.empresa_id, 'sistema', 'liberada: a anterior foi concluída');
      insert into public.notificacoes (usuario_id, tipo, titulo, mensagem, pendencia_id)
        select u.id, 'atribuicao', 'Pendência liberada: ' || f.titulo, 'A anterior (' || new.titulo || ') foi concluída.', f.id
        from public.usuarios u
        where lower(split_part(trim(u.nome_completo), ' ', 1)) = lower(split_part(trim(coalesce(f.responsavel, '')), ' ', 1)) and u.ativo;
    end loop;
  end if;
  return new;
end;
$$;
create trigger pendencia_depois after update on public.caso_pendencias
  for each row execute function privado.tg_pendencia_depois();

-- Pendências rolantes: o que venceu sem ser feito passa para o próximo dia útil.
create or replace function public.pa_rolar_pendencias()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  esf text[] := array['nacional', 'rj', 'rio'];
  n int := 0;
  p record;
  dt jsonb;
  nova date;
begin
  if not privado.usuario_autorizado() then return 0; end if;
  for p in select * from public.caso_pendencias where tipo = 'rolante' and status <> 'concluida' and prazo < hoje and exclusao_id is null loop
    dt := coalesce(p.detalhes, '{}');
    nova := case coalesce(dt->>'rola', 'util')
      when 'util2' then public.pa_add_uteis_esf(hoje - 1, 2, esf)
      when 'semana' then public.pa_proximo_util(hoje + (8 - extract(isodow from hoje)::int), esf)
      else public.pa_proximo_util(hoje, esf) end;
    if nullif(dt->>'limite', '') is not null and nova > (dt->>'limite')::date then nova := (dt->>'limite')::date; end if;
    if nova <= p.prazo then continue; end if;
    dt := dt || jsonb_build_object('adiamentos', coalesce((dt->>'adiamentos')::int, 0) + 1, 'desde', coalesce(dt->>'desde', p.prazo::text));
    if coalesce((dt->>'adiamentos')::int, 0) >= coalesce((dt->>'avisar_apos')::int, 3) then dt := dt || '{"avisado": true}'; end if;
    update public.caso_pendencias set prazo = nova, detalhes = dt where id = p.id;
    insert into public.pendencia_eventos (pendencia_id, caso_id, empresa_id, autor, acao)
      values (p.id, p.caso_id, p.empresa_id, 'sistema', 'rolou de ' || to_char(p.prazo, 'DD/MM') || ' para ' || to_char(nova, 'DD/MM'));
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ═════════════════════════ PUBLICAÇÕES (ALERTES) ═════════════════════════

create or replace function public.pa_alertes_importar(p_itens jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  it jsonb;
  novos int := 0;
  repetidos int := 0;
  num text;
  v_caso public.casos;
begin
  if not privado.usuario_autorizado() then raise exception 'acesso negado' using errcode = '42501'; end if;
  for it in select * from jsonb_array_elements(coalesce(p_itens, '[]')) loop
    num := nullif(regexp_replace(coalesce(it->>'processo', ''), '\D', '', 'g'), '');
    select * into v_caso from public.casos c
      where num is not null and regexp_replace(coalesce(c.numero, ''), '\D', '', 'g') = num and c.exclusao_id is null
      order by c.ativo desc limit 1;
    insert into public.alertes (source_id, data, cliente, tribunal, processo, numero_norm, tipo, teor, resumo, url_documento, docx_url,
      prazo_expresso, metadata, caso_id, empresa_id)
    values (coalesce(it->>'source_id', md5(it::text)), coalesce(nullif(it->>'data', '')::date, current_date), it->>'cliente', it->>'tribunal',
      it->>'processo', num, it->>'tipo', it->>'teor', it->>'resumo', coalesce(it->>'url', it->>'url_documento'), coalesce(it->>'docx', it->>'docx_url'),
      nullif(it->>'prazo_expresso', '')::int,
      jsonb_strip_nulls(jsonb_build_object('responsavel', it->>'responsavel', 'intimacao', it->>'intimacao', 'arquivo', it->>'arquivo')),
      v_caso.id, v_caso.empresa_id)
    on conflict (source_id) do nothing;
    if found then novos := novos + 1; else repetidos := repetidos + 1; end if;
  end loop;
  return jsonb_build_object('novos', novos, 'repetidos', repetidos);
end;
$$;

-- Aprova a destinação: cria o andamento e, se for o caso, a pendência.
create or replace function public.pa_alerte_aprovar(p_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a public.alertes;
  v_and uuid;
  v_pend uuid;
  quem text := privado.meu_nome();
begin
  if not privado.usuario_autorizado() then raise exception 'acesso negado' using errcode = '42501'; end if;
  select * into a from public.alertes where id = p_id for update;
  if a.id is null then raise exception 'Publicação não encontrada.'; end if;
  if a.caso_id is null then raise exception 'Vincule a publicação a um caso antes de aprovar.'; end if;
  if a.status = 'aprovada' then raise exception 'Esta publicação já foi aprovada.'; end if;

  insert into public.caso_andamentos (caso_id, empresa_id, data, descricao, fonte, anexo_url)
  values (a.caso_id, a.empresa_id, coalesce(nullif(p->>'data_andamento', '')::date, a.data),
    coalesce(nullif(trim(p->>'texto_andamento'), ''), 'Publicação de ' || to_char(a.data, 'DD/MM/YYYY')), 'publicacao', a.url_documento)
  returning id into v_and;

  if p->>'destino' = 'pendencia' then
    insert into public.caso_pendencias (caso_id, empresa_id, titulo, tipo, responsavel, revisor, fatal, prazo, prazo_interno, contagem,
      descricao, origem_andamento_id, status)
    values (a.caso_id, a.empresa_id, coalesce(nullif(trim(p->>'titulo'), ''), p->>'providencia_nome', 'Providência'),
      coalesce(p->>'tipo_pend', 'peca'), nullif(p->>'responsavel', ''), nullif(p->>'revisor', ''),
      nullif(p->>'prazo', '') is not null, nullif(p->>'prazo', '')::date, nullif(p->>'prazo_interno', '')::date,
      coalesce(p->>'contagem', 'uteis'), nullif(p->>'obs', ''), v_and, 'a_fazer')
    returning id into v_pend;
    update public.casos set prazo_proximo = least(coalesce(prazo_proximo, 'infinity'::date), nullif(p->>'prazo', '')::date)
      where id = a.caso_id and nullif(p->>'prazo', '') is not null;
  end if;

  update public.alertes set status = 'aprovada', proposta = p, aprovado_por = quem, aprovado_em = now(),
    proposto_por = coalesce(proposto_por, quem), proposto_em = coalesce(proposto_em, now()),
    andamento_id = v_and, pendencia_id = v_pend, devolucao_obs = null
  where id = p_id;
  insert into public.alerte_eventos (alerte_id, autor, acao, obs)
    values (p_id, quem, case when v_pend is null then 'aprovou como NAF' else 'aprovou com pendência' end, nullif(p->>'obs_aprovacao', ''));
  return jsonb_build_object('andamento_id', v_and, 'pendencia_id', v_pend);
end;
$$;

create or replace function public.pa_alerte_devolver(p_id uuid, p_obs text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not privado.usuario_autorizado() then raise exception 'acesso negado' using errcode = '42501'; end if;
  update public.alertes set status = 'devolvida', devolucao_obs = nullif(trim(p_obs), '') where id = p_id;
  insert into public.alerte_eventos (alerte_id, autor, acao, obs) values (p_id, privado.meu_nome(), 'devolveu', nullif(trim(p_obs), ''));
end;
$$;

-- ═════════════════════════ EXCLUSÃO COM APROVAÇÃO ═════════════════════════

create or replace function public.pa_solicitar_exclusao(p_tabela text, p_id uuid, p_motivo text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  ctx jsonb;
  v_id uuid;
begin
  if not privado.usuario_autorizado() then raise exception 'acesso negado' using errcode = '42501'; end if;
  if p_tabela not in ('caso_pendencias', 'caso_andamentos', 'casos', 'empresas', 'alertes', 'providencias', 'despesas',
    'reembolso_lotes', 'caixa_movimentos', 'dias_nao_uteis') then
    raise exception 'Tabela sem exclusão por aprovação: %', p_tabela;
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then raise exception 'Motivo é obrigatório.'; end if;
  execute format('select to_jsonb(t) from public.%I t where id = $1 and exclusao_id is null', p_tabela) into ctx using p_id;
  if ctx is null then raise exception 'Item não encontrado ou já com pedido de exclusão.'; end if;
  insert into public.exclusoes_pendentes (tabela, row_id, contexto, motivo, pedido_por)
    values (p_tabela, p_id, ctx, trim(p_motivo), coalesce(privado.meu_nome(), '—')) returning id into v_id;
  execute format('update public.%I set exclusao_id = $1 where id = $2', p_tabela) using v_id, p_id;
  return v_id;
end;
$$;

create or replace function public.pa_aprovar_exclusao(p_id uuid, p_obs text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare e public.exclusoes_pendentes;
begin
  if not privado.eh_coordenador() then raise exception 'Só a coordenação aprova exclusões.' using errcode = '42501'; end if;
  select * into e from public.exclusoes_pendentes where id = p_id and status = 'pendente' for update;
  if e.id is null then raise exception 'Pedido não encontrado.'; end if;
  execute format('delete from public.%I where id = $1', e.tabela) using e.row_id;
  update public.exclusoes_pendentes set status = 'aprovada', decidido_por = privado.meu_nome(), decidido_em = now(), decisao_obs = nullif(trim(p_obs), '') where id = p_id;
end;
$$;

create or replace function public.pa_devolver_exclusao(p_id uuid, p_obs text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare e public.exclusoes_pendentes;
begin
  if not privado.eh_coordenador() then raise exception 'Só a coordenação decide exclusões.' using errcode = '42501'; end if;
  select * into e from public.exclusoes_pendentes where id = p_id and status = 'pendente' for update;
  if e.id is null then raise exception 'Pedido não encontrado.'; end if;
  execute format('update public.%I set exclusao_id = null where id = $1', e.tabela) using e.row_id;
  update public.exclusoes_pendentes set status = 'devolvida', decidido_por = privado.meu_nome(), decidido_em = now(), decisao_obs = nullif(trim(p_obs), '') where id = p_id;
end;
$$;

create or replace function public.pa_cancelar_exclusao(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare e public.exclusoes_pendentes;
begin
  select * into e from public.exclusoes_pendentes where id = p_id and status = 'pendente' for update;
  if e.id is null then raise exception 'Pedido não encontrado.'; end if;
  if not (privado.eh_coordenador() or lower(e.pedido_por) = lower(coalesce(privado.meu_nome(), ''))) then
    raise exception 'Só quem pediu pode cancelar.' using errcode = '42501';
  end if;
  execute format('update public.%I set exclusao_id = null where id = $1', e.tabela) using e.row_id;
  update public.exclusoes_pendentes set status = 'cancelada', decidido_por = privado.meu_nome(), decidido_em = now() where id = p_id;
end;
$$;

-- ═════════════════════════ DILIGÊNCIAS E CAIXINHA ═════════════════════════

create or replace function public.pa_pagar_lote(ids uuid[], forma text default 'pix', obs text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  l public.reembolso_lotes;
  v_total numeric(12,2);
  v_qtd int;
begin
  if not privado.eh_coordenador() then raise exception 'Só a coordenação paga reembolsos.' using errcode = '42501'; end if;
  select coalesce(sum(valor), 0), count(*) into v_total, v_qtd from public.despesas where id = any(ids) and status = 'aguardando';
  if v_qtd = 0 then raise exception 'Nenhum gasto aguardando entre os selecionados.'; end if;
  insert into public.reembolso_lotes (pago_por, pago_por_nome, forma, total, qtd, obs)
    values (auth.uid(), privado.meu_nome(), coalesce(forma, 'pix'), v_total, v_qtd, obs) returning * into l;
  update public.despesas set status = 'pago', lote_id = l.id, lote_numero = l.numero, pago_em = now()
    where id = any(ids) and status = 'aguardando';
  insert into public.caixa_movimentos (tipo, valor, descricao, lote_id, responsavel_nome, criado_por)
    values ('lote', -v_total, 'Reembolso lote #' || l.numero, l.id, privado.meu_nome(), privado.meu_nome());
  return jsonb_build_object('id', l.id, 'numero', l.numero, 'qtd', v_qtd, 'total', v_total);
end;
$$;

create or replace function public.pa_estornar_lote(p_lote uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  l public.reembolso_lotes;
  n int;
begin
  if not privado.eh_coordenador() then raise exception 'Só a coordenação estorna lotes.' using errcode = '42501'; end if;
  select * into l from public.reembolso_lotes where id = p_lote for update;
  if l.id is null or l.estornado_em is not null then raise exception 'Lote não encontrado ou já estornado.'; end if;
  update public.despesas set status = 'aguardando', lote_id = null, lote_numero = null, pago_em = null where lote_id = p_lote;
  get diagnostics n = row_count;
  insert into public.caixa_movimentos (tipo, valor, descricao, lote_id, responsavel_nome, criado_por)
    values ('ajuste', l.total, 'Estorno do lote #' || l.numero, l.id, privado.meu_nome(), privado.meu_nome());
  update public.reembolso_lotes set estornado_em = now() where id = p_lote;
  return jsonb_build_object('devolvidas', n);
end;
$$;

create or replace function public.pa_editar_despesa(p_id uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare d public.despesas;
begin
  select * into d from public.despesas where id = p_id for update;
  if d.id is null then raise exception 'Gasto não encontrado.'; end if;
  if not (privado.eh_coordenador() or (privado.usuario_autorizado() and d.usuario_id = auth.uid() and d.status = 'aguardando')) then
    raise exception 'Você só pode editar seus gastos ainda não pagos.' using errcode = '42501';
  end if;
  update public.despesas set
    data = coalesce(nullif(p->>'data', '')::date, data), local = coalesce(p->>'local', local), categoria = coalesce(p->>'categoria', categoria),
    meio = case when p ? 'meio' then p->>'meio' else meio end, valor = coalesce(nullif(p->>'valor', '')::numeric, valor),
    obs = case when p ? 'obs' then p->>'obs' else obs end,
    empresa_id = case when p ? 'empresa_id' then nullif(p->>'empresa_id', '')::uuid else empresa_id end,
    cliente_txt = case when p ? 'cliente_txt' then p->>'cliente_txt' else cliente_txt end,
    usuario_id = case when p ? 'usuario_id' and privado.eh_coordenador() then nullif(p->>'usuario_id', '')::uuid else usuario_id end,
    pessoa_nome = case when p ? 'pessoa_nome' and privado.eh_coordenador() then p->>'pessoa_nome' else pessoa_nome end
  where id = p_id;
end;
$$;

create or replace function public.pa_excluir_despesa(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare d public.despesas;
begin
  select * into d from public.despesas where id = p_id for update;
  if d.id is null then raise exception 'Gasto não encontrado.'; end if;
  if d.status = 'pago' then raise exception 'Gasto já pago: estorne o lote antes.'; end if;
  if not (privado.eh_coordenador() or (privado.usuario_autorizado() and d.usuario_id = auth.uid())) then
    raise exception 'Você só pode excluir seus próprios gastos.' using errcode = '42501';
  end if;
  delete from public.despesas where id = p_id;
end;
$$;

-- ═════════════════════════ ACERVO DE DOCUMENTOS DO PROCESSO ═════════════════════════

create or replace function public.pa_documento_adicionar(p_caso uuid, p jsonb, p_autor text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not privado.usuario_autorizado() then raise exception 'acesso negado' using errcode = '42501'; end if;
  insert into public.caso_documentos (caso_id, chave, sistema, data, tipo, titulo, titulo_acervo, link, classe, subtipo, validade, tags,
    observacao, classe_origem, classificado_por, classificado_em)
  values (p_caso, 'manual:' || gen_random_uuid(), 'manual', nullif(p->>'data', '')::date, p->>'tipo', p->>'titulo', p->>'titulo_acervo',
    p->>'link', nullif(p->>'classe', ''), nullif(p->>'subtipo', ''), nullif(p->>'validade', '')::date,
    coalesce(array(select jsonb_array_elements_text(p->'tags')), '{}'), nullif(p->>'observacao', ''), 'humano', p_autor, now())
  returning id into v_id;
  insert into public.documento_eventos (documento_id, caso_id, acao, autor) values (v_id, p_caso, 'adicionou', p_autor);
  return v_id;
end;
$$;

create or replace function public.pa_documento_editar(p_id uuid, p_patch jsonb, p_autor text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not privado.usuario_autorizado() then raise exception 'acesso negado' using errcode = '42501'; end if;
  update public.caso_documentos set
    classe = case when p_patch ? 'classe' then nullif(p_patch->>'classe', '') else classe end,
    subtipo = case when p_patch ? 'subtipo' then nullif(p_patch->>'subtipo', '') else subtipo end,
    titulo_acervo = case when p_patch ? 'titulo_acervo' then nullif(p_patch->>'titulo_acervo', '') else titulo_acervo end,
    validade = case when p_patch ? 'validade' then nullif(p_patch->>'validade', '')::date else validade end,
    tags = case when p_patch ? 'tags' then coalesce(array(select jsonb_array_elements_text(p_patch->'tags')), '{}') else tags end,
    observacao = case when p_patch ? 'observacao' then nullif(p_patch->>'observacao', '') else observacao end,
    link = case when p_patch ? 'link' then nullif(p_patch->>'link', '') else link end,
    data = case when p_patch ? 'data' then nullif(p_patch->>'data', '')::date else data end,
    classe_origem = 'humano', classificado_por = p_autor, classificado_em = now()
  where id = p_id;
  insert into public.documento_eventos (documento_id, caso_id, acao, autor, detalhe)
    select id, caso_id, 'editou', p_autor, p_patch from public.caso_documentos where id = p_id;
end;
$$;

create or replace function public.pa_documento_aproveitar(p_id uuid, p_destino text, p_params jsonb default '{}', p_autor text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  d public.caso_documentos;
  c public.casos;
  v_ev uuid;
  v_doc uuid;
  v_novo uuid;
  det jsonb := coalesce(p_params, '{}');
begin
  if not privado.usuario_autorizado() then raise exception 'acesso negado' using errcode = '42501'; end if;
  select * into d from public.caso_documentos where id = p_id;
  if d.id is null then raise exception 'Documento não encontrado.'; end if;
  select * into c from public.casos where id = d.caso_id;
  if p_destino in ('certidoes', 'documentos_empresa') then
    insert into public.empresa_documentos (empresa_id, tipo, nome, url, validade, observacao, dados)
    values (c.empresa_id, case when p_destino = 'certidoes' then 'certidao' else coalesce(det->>'tipo', 'outros') end,
      coalesce(det->>'nome', d.titulo_acervo, d.titulo, d.tipo, 'Documento'), d.link,
      coalesce(nullif(det->>'validade', '')::date, d.validade), 'Aproveitado do processo ' || coalesce(c.numero, c.titulo),
      jsonb_strip_nulls(jsonb_build_object('subtipo', coalesce(det->>'subtipo', d.subtipo), 'emitida_em', coalesce(det->>'emitida_em', d.data::text),
        'origem_documento', d.id)))
    returning id into v_doc;
    det := det || jsonb_build_object('empresa_documento_id', v_doc);
  elsif p_destino = 'caso' then
    if nullif(det->>'caso_id', '') is null then raise exception 'Escolha o caso de destino.'; end if;
    insert into public.caso_documentos (caso_id, chave, sistema, data, tipo, titulo, titulo_acervo, link, classe, subtipo, validade, tags,
      observacao, classe_origem, classificado_por, classificado_em, hash_texto)
    values ((det->>'caso_id')::uuid, 'copia:' || d.id || ':' || gen_random_uuid(), d.sistema, d.data, d.tipo, d.titulo, d.titulo_acervo, d.link,
      d.classe, d.subtipo, d.validade, d.tags, coalesce(det->>'obs', 'Trazido do processo ' || coalesce(c.numero, c.titulo)), 'humano', p_autor, now(), d.hash_texto)
    returning id into v_novo;
    det := det || jsonb_build_object('caso_documento_id', v_novo);
  elsif p_destino <> 'modelos' then
    raise exception 'Destino desconhecido: %', p_destino;
  end if;
  insert into public.documento_eventos (documento_id, caso_id, acao, autor, detalhe)
    values (p_id, d.caso_id, 'aproveitou:' || p_destino, p_autor, det) returning id into v_ev;
  update public.caso_documentos set aproveitado = coalesce(aproveitado, '[]') ||
    jsonb_build_array(jsonb_build_object('destino', p_destino, 'detalhe', det, 'por', p_autor, 'em', now(), 'evento_id', v_ev))
  where id = p_id;
  return v_ev;
end;
$$;

create or replace function public.pa_documento_sugestao(p_id uuid, p_acao text, p_autor text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare d public.caso_documentos;
begin
  if not privado.usuario_autorizado() then raise exception 'acesso negado' using errcode = '42501'; end if;
  select * into d from public.caso_documentos where id = p_id;
  if d.sugestao is null then raise exception 'Sem sugestão para este documento.'; end if;
  if p_acao = 'confirmar' then
    perform public.pa_documento_aproveitar(p_id, d.sugestao->>'destino', d.sugestao, p_autor);
  end if;
  update public.caso_documentos set sugestao_decisao = jsonb_build_object('acao', p_acao, 'por', p_autor, 'em', now(), 'sugestao', d.sugestao), sugestao = null
    where id = p_id;
end;
$$;

create or replace function public.pa_documento_desfazer(p_evento_id uuid, p_autor text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare e public.documento_eventos;
begin
  if not privado.usuario_autorizado() then raise exception 'acesso negado' using errcode = '42501'; end if;
  select * into e from public.documento_eventos where id = p_evento_id and desfeito_em is null;
  if e.id is null then raise exception 'Nada a desfazer.'; end if;
  if not (privado.eh_coordenador() or (lower(coalesce(e.autor, '')) = lower(coalesce(p_autor, '')) and e.criado_em > now() - interval '10 minutes')) then
    raise exception 'Passaram os 10 minutos: peça à coordenação para desfazer.';
  end if;
  if nullif(e.detalhe->>'empresa_documento_id', '') is not null then delete from public.empresa_documentos where id = (e.detalhe->>'empresa_documento_id')::uuid; end if;
  if nullif(e.detalhe->>'caso_documento_id', '') is not null then delete from public.caso_documentos where id = (e.detalhe->>'caso_documento_id')::uuid; end if;
  update public.caso_documentos set aproveitado = coalesce((select jsonb_agg(x) from jsonb_array_elements(aproveitado) x where x->>'evento_id' <> p_evento_id::text), '[]')
    where id = e.documento_id;
  update public.documento_eventos set desfeito_em = now() where id = p_evento_id;
end;
$$;

create or replace function public.pa_documento_ocorrencias(p_id uuid)
returns table (caso_id uuid, numero text) language sql stable security definer set search_path = '' as $$
  select c.id, coalesce(c.numero, c.titulo)
  from public.caso_documentos d
  join public.casos o on o.id = d.caso_id
  join public.caso_documentos x on x.hash_texto = d.hash_texto and x.caso_id <> d.caso_id
  join public.casos c on c.id = x.caso_id and c.empresa_id = o.empresa_id
  where d.id = p_id and d.hash_texto is not null and privado.usuario_autorizado()
  group by c.id, c.numero, c.titulo;
$$;

-- Funções da aplicação: só usuários logados (a autorização é checada dentro ou pelo RLS).
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'pa\_%' loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
