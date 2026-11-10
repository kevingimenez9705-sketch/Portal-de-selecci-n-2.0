-- ══════════════════════════════════════════════════════════════════════════
--  Citación a onboarding desde el portal (lo que hace Onboarding.gs con la planilla)
-- ──────────────────────────────────────────────────────────────────────────
--  1. En el portal (panel "Zonal y onboarding") el equipo elige a quiénes citar,
--     con fecha y hora de onboarding y primer día → quedan "pedidos" (onb_pedido).
--  2. El Apps Script SincronizarPortal (cada 10 min) manda el mail de bienvenida
--     de siempre (mismo texto, botón "Confirmo asistencia") y avisa el resultado:
--     enviado → ESTADO = CITADO; error → queda el motivo para corregirlo.
--  3. La persona toca "Confirmo asistencia" → confirmar.html → ALTAS RRHH =
--     CONFIRMA ONB (si estaba vacía).
--
--  Citables: Extremas con APROBADO ZONAL; Sabores con ESTADO vacío o APROBADO ZONAL
--  (Sabores no pasa por zonal: el APROBADO ZONAL lo pone el equipo).
--  Una vez pedida, la citación sale aunque alguien ya haya puesto CITADO a mano. Si
--  antes del envío la vacante pasó a otro ESTADO (HUELLA, COMUNICADO…) o se cerró,
--  no sale: el panel la marca "No enviado · se modificó la vacante" y queda la nota
--  en el historial (antes se descartaba sin aviso).
--
--  CÓMO EJECUTAR: Supabase → ats-gastronomico → SQL Editor → pegar todo → Run.
--  Se puede volver a correr sin problema.
-- ══════════════════════════════════════════════════════════════════════════

alter table public.seleccion_busquedas
    add column if not exists onb_pedido     timestamptz,   -- el equipo pidió mandar la citación
    add column if not exists onb_enviado    timestamptz,   -- salió el mail
    add column if not exists onb_error      text,          -- por qué no salió (el equipo lo corrige y vuelve a citar)
    add column if not exists onb_token      text,          -- clave del botón "Confirmo asistencia"
    add column if not exists onb_confirmado timestamptz;   -- la persona confirmó

-- Dirección de un local (Direcciones Extremas / Sabores, cargadas en seleccion_locales). Es un dato público.
-- Mismo criterio que el portal (claveLocal / infoLocal) y asignaciones.sql: "SABORES EXPRESS SAN MIGUEL 3"
-- = "SABORES SAN MIGUEL 3", "EXTREMAS PALOMAR" = "EXTREMAS EL PALOMAR", y también por alias.
-- Necesita seleccion_clave_local_ y la columna alias (asignaciones.sql).
create or replace function public.seleccion_onb_direccion_(p_marca text, p_local text) returns text
language sql stable security definer set search_path = public as $$
    select l.direccion from seleccion_locales l
     where (seleccion_clave_local_(l.local) = seleccion_clave_local_(p_local)
         or seleccion_clave_local_(p_local) in (select seleccion_clave_local_(a) from unnest(coalesce(l.alias, '{}')) a))
       and coalesce(trim(l.direccion), '') <> ''
     -- primero la misma marca y el nombre exacto: "SANTA FE 1" y "SANTA FE (PROVINCIA)" comparten clave
     order by (l.marca = p_marca) desc,
              (seleccion_norm_(p_local) = seleccion_norm_(l.local)
                or seleccion_norm_(p_local) in (select seleccion_norm_(a) from unnest(coalesce(l.alias, '{}')) a)) desc,
              l.activo desc, l.id limit 1
$$;

-- ¿La citación pedida todavía puede salir? (mismas reglas que saleElMailOnb de onboarding.js)
create or replace function public.seleccion_onb_citable_(p_marca text, p_estado text, p_status text) returns boolean
language sql immutable set search_path = public as $$
    select coalesce(p_status in ('Proceso', 'Pausada')
       and ((p_marca = 'Hamburguesas Extremas' and p_estado in ('APROBADO ZONAL', 'CITADO'))
         or (p_marca = 'Sabores Express' and coalesce(trim(p_estado), '') in ('', 'APROBADO ZONAL', 'CITADO'))), false)
$$;

-- Citaciones pedidas que todavía no salieron, con todo lo que lleva el mail
create or replace function public.seleccion_onb_pendientes() returns jsonb
language plpgsql volatile security invoker set search_path = public as $$
begin
    if not (seleccion_codigo_ok() or current_user = 'service_role') then
        raise exception 'Código del equipo inválido' using errcode = '42501';
    end if;
    -- Pedidas que ya no corresponde mandar (la vacante se modificó antes del envío): no salen,
    -- queda el motivo en el panel y una nota en el historial de la vacante
    with modificadas as (
        update seleccion_busquedas b
           set onb_pedido = null,
               onb_error = 'Se modificó la vacante antes del envío ('
                   || case when b.status = 'Cancelada' then 'se canceló'
                           when nullif(trim(b.estado), '') is not null then 'pasó a ' || trim(b.estado)
                           when b.status in ('Proceso', 'Pausada') then 'quedó sin ESTADO'
                           else 'se cerró' end
                   || '). Si corresponde, volvé a citar.'
         where b.onb_pedido is not null
           and (b.onb_enviado is null or b.onb_enviado < b.onb_pedido)
           and not seleccion_onb_citable_(b.marca, b.estado, b.status)
        returning b.id, b.onb_error)
    insert into seleccion_comentarios (busqueda_id, texto, fecha, autor)
    select id, 'Citación a onboarding NO enviada: ' || onb_error, (now() at time zone 'America/Argentina/Buenos_Aires')::date, 'Onboarding'
      from modificadas;
    -- Cada citación lleva su clave para el botón "Confirmo asistencia"
    update seleccion_busquedas set onb_token = replace(gen_random_uuid()::text, '-', '')
     where onb_pedido is not null and onb_token is null;
    return coalesce((
        select jsonb_agg(jsonb_build_object(
                   'id', b.id, 'numero', b.numero, 'marca', b.marca, 'estado', b.estado,
                   'email', lower(trim(coalesce(b.email, ''))), 'nombre', b.nombre, 'apellido', b.apellido,
                   'local', b.local, 'local_entrenamiento', b.local_entrenamiento, 'puesto', b.puesto,
                   'fecha_onboarding', b.fecha_citacion, 'hora_onboarding', b.hora_citacion, 'primer_dia', b.ingreso,
                   'direccion_local', seleccion_onb_direccion_(b.marca, regexp_replace(b.local, '^\s*(APERTURA|APER)\.?\s+', '', 'i')),
                   'direccion_entrenamiento', case when coalesce(trim(b.local_entrenamiento), '') <> ''
                                                   then seleccion_onb_direccion_(b.marca, b.local_entrenamiento) end,
                   'token', b.onb_token) order by b.id)
          from seleccion_busquedas b
         where b.onb_pedido is not null
           and (b.onb_enviado is null or b.onb_enviado < b.onb_pedido)
           and seleccion_onb_citable_(b.marca, b.estado, b.status)), '[]'::jsonb);
end;
$$;

-- Resultado del envío: [{ id, ok, error }]
create or replace function public.seleccion_onb_resultado(filas jsonb) returns jsonb
language plpgsql volatile security invoker set search_path = public as $$
declare
    r record;
    v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
    v_sello text := to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI');
    enviados int := 0; errores int := 0;
begin
    if not (seleccion_codigo_ok() or current_user = 'service_role') then
        raise exception 'Código del equipo inválido' using errcode = '42501';
    end if;
    for r in select * from jsonb_to_recordset(coalesce(filas, '[]'::jsonb)) as x(id bigint, ok boolean, error text) loop
        if r.ok then
            -- Si en estos segundos alguien la adelantó (HUELLA, COMUNICADO), no se la vuelve atrás
            update seleccion_busquedas
               set estado = case when estado in ('HUELLA', 'COMUNICADO') then estado else 'CITADO' end,
                   fecha_estado = case when estado in ('HUELLA', 'COMUNICADO') then fecha_estado else v_hoy end,
                   onb_enviado = now(), onb_error = null
             where id = r.id;
            if found then
                enviados := enviados + 1;
                insert into seleccion_comentarios (busqueda_id, texto, fecha, autor)
                values (r.id, 'Citación a onboarding enviada: ' || v_sello, v_hoy, 'Onboarding');
            end if;
        else
            -- No salió: se deja de intentar hasta que el equipo lo corrija y vuelva a citar
            update seleccion_busquedas set onb_error = left(coalesce(nullif(trim(r.error), ''), 'No se pudo enviar'), 300), onb_pedido = null
             where id = r.id;
            if found then errores := errores + 1; end if;
        end if;
    end loop;
    return jsonb_build_object('enviados', enviados, 'errores', errores);
end;
$$;

-- Botón "Confirmo asistencia" del mail (página pública confirmar.html)
create or replace function public.seleccion_onb_confirmar(v bigint, k text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
    b seleccion_busquedas;
    v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
    select * into b from seleccion_busquedas
     where id = v and onb_token is not null and onb_token = coalesce(k, '') limit 1;
    if not found then
        return jsonb_build_object('ok', false, 'motivo', 'enlace');
    end if;
    if b.onb_confirmado is null then
        update seleccion_busquedas
           set onb_confirmado = now(),
               altas_rrhh = case when coalesce(trim(altas_rrhh), '') = '' then 'CONFIRMA ONB' else altas_rrhh end
         where id = b.id;
        insert into seleccion_comentarios (busqueda_id, texto, fecha, autor)
        values (b.id, 'Confirmó onboarding: ' || to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI'), v_hoy, 'Onboarding');
    end if;
    -- Solo lo que la persona ya sabe por el mail
    return jsonb_build_object('ok', true, 'nombre', initcap(lower(coalesce(b.nombre, ''))),
        'marca', b.marca, 'fecha', b.fecha_citacion, 'hora', b.hora_citacion);
end;
$$;

do $$
declare f text;
begin
    foreach f in array array['seleccion_onb_pendientes()', 'seleccion_onb_resultado(jsonb)'] loop
        execute format('revoke execute on function public.%s from public', f);
        execute format('grant execute on function public.%s to anon, authenticated, service_role', f);
    end loop;
    revoke execute on function public.seleccion_onb_confirmar(bigint, text) from public;
    grant execute on function public.seleccion_onb_confirmar(bigint, text) to anon, authenticated;
end $$;
