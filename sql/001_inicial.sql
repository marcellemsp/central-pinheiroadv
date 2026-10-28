-- Central PinheiroAdv — esquema inicial
-- Rode inteiro no SQL Editor do Supabase, uma vez, num projeto novo.

create extension if not exists "pgcrypto";

-- Clientes ------------------------------------------------------------------
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  documento text,            -- CPF ou CNPJ
  contato text,
  observacoes text,
  criado_em timestamptz not null default now()
);

-- Casos (processos judiciais, administrativos ou consultas) ------------------
create table if not exists public.casos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes(id) on delete set null,
  titulo text not null,
  numero_processo text,
  orgao text,
  area text,                 -- Tributário, Cível, Consultivo...
  status text not null default 'ativo',
  criado_em timestamptz not null default now()
);

-- Pendências -----------------------------------------------------------------
-- bucket: triagem | producao | aguardando | protocolar | concluido
-- responsavel: hoje sempre 'marcelle'; preparado para quando houver equipe.
create table if not exists public.pendencias (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  cliente_id uuid references public.clientes(id) on delete set null,
  caso_id uuid references public.casos(id) on delete set null,
  bucket text not null default 'triagem'
    check (bucket in ('triagem', 'producao', 'aguardando', 'protocolar', 'concluido')),
  prazo date,
  prazo_fatal boolean not null default false,
  responsavel text not null default 'marcelle',
  ordem double precision not null default extract(epoch from now()),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  concluido_em timestamptz
);

create index if not exists pendencias_bucket_idx on public.pendencias (bucket);
create index if not exists pendencias_prazo_idx on public.pendencias (prazo) where bucket <> 'concluido';

-- Mantém atualizado_em e concluido_em coerentes com o bucket.
create or replace function public.tg_pendencias_datas()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.atualizado_em := now();
  if new.bucket = 'concluido' and (tg_op = 'INSERT' or old.bucket <> 'concluido') then
    new.concluido_em := now();
  elsif new.bucket <> 'concluido' then
    new.concluido_em := null;
  end if;
  return new;
end;
$$;

drop trigger if exists pendencias_datas on public.pendencias;
create trigger pendencias_datas
  before insert or update on public.pendencias
  for each row execute function public.tg_pendencias_datas();

-- Segurança ------------------------------------------------------------------
-- Estar logado não basta: só e-mails da lista abaixo leem e gravam dados.
-- Assim, mesmo que alguém crie uma conta no Supabase Auth, não vê nada.
create table if not exists public.usuarios_autorizados (
  email text primary key,
  nome text,
  criado_em timestamptz not null default now()
);
alter table public.usuarios_autorizados enable row level security;
-- Sem políticas: a lista só é editada pelo painel do Supabase.

insert into public.usuarios_autorizados (email, nome)
values ('marcellemspinheiro@gmail.com', 'Marcelle Pinheiro')
on conflict (email) do nothing;

create or replace function public.usuario_autorizado()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.usuarios_autorizados
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.usuario_autorizado() from public, anon;
grant execute on function public.usuario_autorizado() to authenticated;

alter table public.clientes enable row level security;
alter table public.casos enable row level security;
alter table public.pendencias enable row level security;

drop policy if exists "autorizados" on public.clientes;
create policy "autorizados" on public.clientes for all to authenticated
  using ((select public.usuario_autorizado())) with check ((select public.usuario_autorizado()));
drop policy if exists "autorizados" on public.casos;
create policy "autorizados" on public.casos for all to authenticated
  using ((select public.usuario_autorizado())) with check ((select public.usuario_autorizado()));
drop policy if exists "autorizados" on public.pendencias;
create policy "autorizados" on public.pendencias for all to authenticated
  using ((select public.usuario_autorizado())) with check ((select public.usuario_autorizado()));

-- Pendências iniciais (vindas das notas do iPhone, 27/10/2026) ----------------
insert into public.pendencias (titulo, bucket) values
  ('Yasmin — proposta do INSS', 'triagem'),
  ('Yasmin — proposta do carro', 'triagem'),
  ('Igreja — novo pedido', 'triagem');
