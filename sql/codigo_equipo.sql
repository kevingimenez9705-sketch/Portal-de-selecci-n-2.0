-- ══════════════════════════════════════════════════════════════════════════
--  Acceso con CÓDIGO DEL EQUIPO (sin usuarios ni contraseñas individuales)
-- ──────────────────────────────────────────────────────────────────────────
--  Correr DESPUÉS de portal_seleccion.sql. Reemplaza el acceso por usuario:
--  el portal pide un único código, lo guarda en el navegador y lo manda en
--  cada consulta (encabezado x-codigo-equipo). Las tablas seleccion_* solo
--  responden si ese código es el correcto; sin código no se ve ni se toca nada.
--
--  CÓMO EJECUTAR:
--  1. Cambiá 'CAMBIAR-ESTE-CODIGO' (última línea) por el código del equipo:
--     mínimo 8 caracteres; mejor una frase corta que un número.
--  2. Supabase → ats-gastronomico → SQL Editor → pegá todo y Run.
--  Para cambiar el código más adelante, corré solo la última línea con el nuevo:
--  todos los navegadores van a tener que ingresarlo de nuevo.
-- ══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;

-- El código se guarda hasheado; RLS sin policies = nadie lo lee por la API.
create table if not exists public.seleccion_config (
    id          int primary key default 1 check (id = 1),
    codigo_hash text not null,
    actualizado timestamptz not null default now()
);
alter table public.seleccion_config enable row level security;

create or replace function public.seleccion_codigo_ok()
returns boolean language sql stable security definer set search_path = public, extensions as $$
    select exists (
        select 1 from seleccion_config c
        where c.codigo_hash = encode(extensions.digest(trim(coalesce(current_setting('request.headers', true)::json ->> 'x-codigo-equipo', '')), 'sha256'), 'hex')
    );
$$;
grant execute on function public.seleccion_codigo_ok() to anon, authenticated;

create or replace function public.seleccion_definir_codigo(nuevo text)
returns text language plpgsql security definer set search_path = public, extensions as $$
begin
    if length(trim(coalesce(nuevo, ''))) < 8 then
        raise exception 'El código tiene que tener al menos 8 caracteres';
    end if;
    if trim(nuevo) = 'CAMBIAR-ESTE-CODIGO' then
        raise exception 'Poné el código propio del equipo en lugar de CAMBIAR-ESTE-CODIGO';
    end if;
    insert into seleccion_config (id, codigo_hash) values (1, encode(extensions.digest(trim(nuevo), 'sha256'), 'hex'))
    on conflict (id) do update set codigo_hash = excluded.codigo_hash, actualizado = now();
    return 'Código del equipo guardado';
end;
$$;
-- Solo se puede cambiar desde el SQL Editor (no desde la página)
revoke execute on function public.seleccion_definir_codigo(text) from public, anon, authenticated;

-- ── Permisos: todo con el código, nada sin él ──
drop policy if exists "Equipo: ver"                 on public.seleccion_equipo;
drop policy if exists "Equipo: admin edita"         on public.seleccion_equipo;
drop policy if exists "Búsquedas: ver"              on public.seleccion_busquedas;
drop policy if exists "Búsquedas: crear"            on public.seleccion_busquedas;
drop policy if exists "Búsquedas: editar"           on public.seleccion_busquedas;
drop policy if exists "Búsquedas: borrar (admin)"   on public.seleccion_busquedas;
drop policy if exists "Postulantes: equipo"         on public.seleccion_postulantes;
drop policy if exists "Candidatos: equipo"          on public.seleccion_candidatos;
drop policy if exists "Comentarios: ver"            on public.seleccion_comentarios;
drop policy if exists "Comentarios: crear"          on public.seleccion_comentarios;
drop policy if exists "Comentarios: borrar (admin)" on public.seleccion_comentarios;

drop function if exists public.seleccion_es_miembro();
drop function if exists public.seleccion_es_admin();

-- Sin usuarios, el email y el rol del equipo ya no se usan
drop index if exists public.seleccion_equipo_email_idx;
alter table public.seleccion_equipo drop column if exists email;
alter table public.seleccion_equipo drop column if exists rol;

do $$
declare t text;
begin
    foreach t in array array['seleccion_equipo', 'seleccion_busquedas', 'seleccion_postulantes', 'seleccion_candidatos', 'seleccion_comentarios'] loop
        execute format('drop policy if exists "Portal: código del equipo" on public.%I', t);
        -- (select …) hace que el código se verifique una vez por consulta y no fila por fila
        execute format('create policy "Portal: código del equipo" on public.%I for all to anon, authenticated using ((select public.seleccion_codigo_ok())) with check ((select public.seleccion_codigo_ok()))', t);
    end loop;
end $$;

select public.seleccion_definir_codigo('CAMBIAR-ESTE-CODIGO');
