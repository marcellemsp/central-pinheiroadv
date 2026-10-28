-- Tira a checagem de acesso do esquema público, para ela não ficar exposta
-- como rota da API (/rest/v1/rpc). As políticas passam a usar a versão privada.

create schema if not exists privado;
revoke all on schema privado from public, anon;
grant usage on schema privado to authenticated;

create or replace function privado.usuario_autorizado()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.usuarios_autorizados
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function privado.usuario_autorizado() from public, anon;
grant execute on function privado.usuario_autorizado() to authenticated;

drop policy if exists "autorizados" on public.clientes;
create policy "autorizados" on public.clientes for all to authenticated
  using ((select privado.usuario_autorizado())) with check ((select privado.usuario_autorizado()));
drop policy if exists "autorizados" on public.casos;
create policy "autorizados" on public.casos for all to authenticated
  using ((select privado.usuario_autorizado())) with check ((select privado.usuario_autorizado()));
drop policy if exists "autorizados" on public.pendencias;
create policy "autorizados" on public.pendencias for all to authenticated
  using ((select privado.usuario_autorizado())) with check ((select privado.usuario_autorizado()));

drop function if exists public.usuario_autorizado();
