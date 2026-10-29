-- ══════════════════════════════════════════════════════════════════════════
--  Locales, zonas, datos de ingreso e iCheck (lo que hacían Locales.gs,
--  CopiarDatosIngreso.gs y la pestaña exportacion_icheck de TAREAS GRUPALES)
-- ──────────────────────────────────────────────────────────────────────────
--  seleccion_locales:  un local por fila, con el nombre tal cual aparece en las
--                      Solicitudes (ej. EXTREMAS BANFIELD). Zona, localidad,
--                      dirección y razón social (Direcciones Sabores/Extremas).
--  seleccion_zonas:    localidad de residencia → zona y localidades cercanas.
--  seleccion_ingresos: respuestas del formulario de ingreso ("Proceso de
--                      Ingreso"); el Apps Script SincronizarBase.gs las manda con
--                      seleccion_sync_ingresos() y el portal las copia a la vacante
--                      por email.
--  icheck_exportado:   fecha en que la vacante (en HUELLA) se bajó para iCheck.
--
--  Los datos de locales y zonas NO están en este archivo (el repo es público):
--  se cargan aparte en Supabase.
--  CÓMO EJECUTAR: Supabase → ats-gastronomico → SQL Editor → pegar todo → Run.
--  Se puede volver a correr sin problema.
-- ══════════════════════════════════════════════════════════════════════════

create table if not exists public.seleccion_locales (
    id           bigint generated always as identity primary key,
    marca        text not null check (marca in ('Hamburguesas Extremas', 'Sabores Express')),
    local        text not null,
    zona         text,
    localidad    text,
    direccion    text,
    razon_social text,
    activo       boolean not null default true,
    unique (marca, local)
);

create table if not exists public.seleccion_zonas (
    localidad text primary key,
    zona      text not null,
    cercanas  text[] not null default '{}'
);

create table if not exists public.seleccion_ingresos (
    id               bigint generated always as identity primary key,
    email            text not null,
    marca_temporal   timestamptz not null,
    nombre           text,
    apellido         text,
    tel              text,
    tel_emergencia   text,
    fecha_nacimiento date,
    nacionalidad     text,
    cuil             text,
    dni              text,
    sexo             text,
    domicilio        text,
    domicilio_numero text,
    codigo_postal    text,
    localidad        text,
    provincia        text,
    pais             text,
    creado           timestamptz not null default now(),
    unique (email, marca_temporal)
);

alter table public.seleccion_busquedas add column if not exists icheck_exportado date;

do $$
declare t text;
begin
    foreach t in array array['seleccion_locales', 'seleccion_zonas', 'seleccion_ingresos'] loop
        execute format('alter table public.%I enable row level security', t);
        execute format('drop policy if exists "Portal: código del equipo" on public.%I', t);
        execute format('create policy "Portal: código del equipo" on public.%I for all to anon, authenticated using ((select public.seleccion_codigo_ok())) with check ((select public.seleccion_codigo_ok()))', t);
    end loop;
end $$;

-- Formulario de ingreso → portal. Una fila por respuesta (email + marca temporal):
-- si la misma respuesta vuelve a llegar, se actualiza; las nuevas se agregan.
create or replace function public.seleccion_sync_ingresos(filas jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
    f jsonb;
    nuevas int := 0; actualizadas int := 0; omitidas int := 0;
    insertada boolean;
begin
    if not public.seleccion_codigo_ok() then
        raise exception 'Código del equipo inválido' using errcode = '42501';
    end if;
    if jsonb_typeof(filas) is distinct from 'array' then
        raise exception 'Se esperaba una lista de filas';
    end if;

    for f in select value from jsonb_array_elements(filas) loop
        if nullif(lower(trim(f->>'email')), '') is null or coalesce(f->>'marca_temporal', '') !~ '^\d{4}-\d{2}-\d{2}T' then
            omitidas := omitidas + 1;
            continue;
        end if;
        insertada := null;
        insert into seleccion_ingresos as i (email, marca_temporal, nombre, apellido, tel, tel_emergencia, fecha_nacimiento,
            nacionalidad, cuil, dni, sexo, domicilio, domicilio_numero, codigo_postal, localidad, provincia, pais)
        select lower(trim(r.email)), r.marca_temporal::timestamptz, nullif(trim(r.nombre), ''), nullif(trim(r.apellido), ''),
               nullif(trim(r.tel), ''), nullif(trim(r.tel_emergencia), ''),
               case when r.fecha_nacimiento ~ '^\d{4}-\d{2}-\d{2}$' then r.fecha_nacimiento::date end,
               nullif(trim(r.nacionalidad), ''), nullif(regexp_replace(coalesce(r.cuil, ''), '\D', '', 'g'), ''),
               nullif(regexp_replace(coalesce(r.dni, ''), '\D', '', 'g'), ''), nullif(trim(r.sexo), ''),
               nullif(trim(r.domicilio), ''), nullif(trim(r.domicilio_numero), ''), nullif(trim(r.codigo_postal), ''),
               nullif(trim(r.localidad), ''), nullif(trim(r.provincia), ''), nullif(trim(r.pais), '')
          from jsonb_to_record(f) as r(email text, marca_temporal text, nombre text, apellido text, tel text, tel_emergencia text,
               fecha_nacimiento text, nacionalidad text, cuil text, dni text, sexo text, domicilio text, domicilio_numero text,
               codigo_postal text, localidad text, provincia text, pais text)
        on conflict (email, marca_temporal) do update set
            nombre = excluded.nombre, apellido = excluded.apellido, tel = excluded.tel, tel_emergencia = excluded.tel_emergencia,
            fecha_nacimiento = excluded.fecha_nacimiento, nacionalidad = excluded.nacionalidad, cuil = excluded.cuil,
            dni = excluded.dni, sexo = excluded.sexo, domicilio = excluded.domicilio, domicilio_numero = excluded.domicilio_numero,
            codigo_postal = excluded.codigo_postal, localidad = excluded.localidad, provincia = excluded.provincia, pais = excluded.pais
        where (i.nombre, i.apellido, i.tel, i.tel_emergencia, i.fecha_nacimiento, i.nacionalidad, i.cuil, i.dni, i.sexo,
               i.domicilio, i.domicilio_numero, i.codigo_postal, i.localidad, i.provincia, i.pais)
              is distinct from
              (excluded.nombre, excluded.apellido, excluded.tel, excluded.tel_emergencia, excluded.fecha_nacimiento,
               excluded.nacionalidad, excluded.cuil, excluded.dni, excluded.sexo, excluded.domicilio, excluded.domicilio_numero,
               excluded.codigo_postal, excluded.localidad, excluded.provincia, excluded.pais)
        returning (xmax = 0) into insertada;
        if not found then null;
        elsif insertada then nuevas := nuevas + 1;
        else actualizadas := actualizadas + 1;
        end if;
    end loop;

    return jsonb_build_object('nuevas', nuevas, 'actualizadas', actualizadas, 'omitidas', omitidas);
end;
$$;

revoke execute on function public.seleccion_sync_ingresos(jsonb) from public;
grant execute on function public.seleccion_sync_ingresos(jsonb) to anon, authenticated;
