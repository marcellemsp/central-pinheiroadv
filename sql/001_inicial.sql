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
returns trigger language plpgsql as $$
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
-- Só usuários autenticados acessam. O controle de quem pode entrar é feito
-- pelo ALLOWED_EMAIL na aplicação e pela lista de usuários do Supabase Auth.
alter table public.clientes enable row level security;
alter table public.casos enable row level security;
alter table public.pendencias enable row level security;

drop policy if exists "autenticados" on public.clientes;
create policy "autenticados" on public.clientes for all to authenticated using (true) with check (true);
drop policy if exists "autenticados" on public.casos;
create policy "autenticados" on public.casos for all to authenticated using (true) with check (true);
drop policy if exists "autenticados" on public.pendencias;
create policy "autenticados" on public.pendencias for all to authenticated using (true) with check (true);

-- Pendências iniciais (vindas das notas do iPhone, 27/10/2026) ----------------
insert into public.pendencias (titulo, bucket) values
  ('Yasmin — proposta do INSS', 'triagem'),
  ('Yasmin — proposta do carro', 'triagem'),
  ('Igreja — novo pedido', 'triagem');
