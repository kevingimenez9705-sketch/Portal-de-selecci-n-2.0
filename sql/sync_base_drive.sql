-- ══════════════════════════════════════════════════════════════════════════
--  BASE DE DATOS de TAREAS GRUPALES → Base de postulantes del portal
-- ──────────────────────────────────────────────────────────────────────────
--  El flujo de n8n "Selección - BASE DE DATOS e Ingreso → Portal 2.0" (cada
--  10 min) lee la pestaña BASE DE DATOS (la que ya carga el script de la
--  planilla) y llama a seleccion_sync_postulantes() con las filas. La planilla
--  sigue igual: el portal recibe una copia. apps-script/SincronizarBase.gs hace
--  lo mismo desde la planilla, si alguna vez se prefiere sin n8n.
--
--  Reglas:
--   - Se reconoce a la persona por DNI y, si no tiene, por email.
--   - Si no está en el portal, se agrega (origen = 'TAREAS GRUPALES').
--   - Si ya está, solo se completan los datos vacíos: lo que el equipo
--     editó en el portal no se pisa. Excepciones: "Sugerido para" se toma
--     de la planilla, y si la planilla dice Bloqueado/Descartado, se aplica.
--   - Exige el código del equipo (encabezado x-codigo-equipo) o la clave
--     de servicio (la credencial de Supabase de n8n).
--
--  CÓMO EJECUTAR: Supabase → ats-gastronomico → SQL Editor → pegar todo → Run.
--  Se puede volver a correr sin problema.
-- ══════════════════════════════════════════════════════════════════════════

alter table public.seleccion_postulantes
    add column if not exists cuil           text,
    add column if not exists nacionalidad   text,
    add column if not exists tel_emergencia text,
    add column if not exists sugerido_para  text,
    add column if not exists origen         text;   -- 'TAREAS GRUPALES' si vino de la planilla

create index if not exists seleccion_postulantes_email_idx on public.seleccion_postulantes (lower(trim(email)));

create or replace function public.seleccion_sync_postulantes(filas jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
    f jsonb;
    x record;
    v_id bigint;
    n int;
    nuevos int := 0; completados int := 0; sin_cambios int := 0; omitidas int := 0;
begin
    -- El portal (código del equipo) o el flujo de n8n (clave de servicio)
    if not (public.seleccion_codigo_ok() or current_user = 'service_role') then
        raise exception 'Código del equipo inválido' using errcode = '42501';
    end if;
    if jsonb_typeof(filas) is distinct from 'array' then
        raise exception 'Se esperaba una lista de filas';
    end if;

    for f in select value from jsonb_array_elements(filas) loop
        select nullif(trim(r.nombre), '')                                   as nombre,
               nullif(trim(r.apellido), '')                                 as apellido,
               nullif(regexp_replace(coalesce(r.dni, ''), '\D', '', 'g'), '') as dni,
               nullif(trim(r.telefono), '')                                 as telefono,
               nullif(lower(trim(r.email)), '')                             as email,
               case when r.fecha_nacimiento ~ '^\d{4}-\d{2}-\d{2}$' then r.fecha_nacimiento::date end as fecha_nacimiento,
               nullif(trim(r.zona), '')                                     as zona,
               nullif(trim(r.localidad), '')                                as localidad,
               nullif(trim(r.sede_entrevista), '')                          as sede_entrevista,
               nullif(trim(r.puesto_interes), '')                           as puesto_interes,
               nullif(trim(r.horario), '')                                  as horario,
               case when r.curso_manipulacion in ('Sí', 'No', 'En trámite') then r.curso_manipulacion end as curso_manipulacion,
               case when r.antecedentes in ('Sí', 'No', 'En trámite') then r.antecedentes end             as antecedentes,
               nullif(trim(r.cv_url), '')                                   as cv_url,
               nullif(trim(r.observaciones), '')                            as observaciones,
               case when r.estado in ('Aprobado', 'En espera', 'Bloqueado', 'Descartado') then r.estado else 'En espera' end as estado,
               nullif(regexp_replace(coalesce(r.cuil, ''), '\D', '', 'g'), '') as cuil,
               nullif(trim(r.nacionalidad), '')                             as nacionalidad,
               nullif(trim(r.tel_emergencia), '')                           as tel_emergencia,
               nullif(trim(r.sugerido_para), '')                            as sugerido_para
          into x
          from jsonb_to_record(f) as r(nombre text, apellido text, dni text, telefono text, email text,
               fecha_nacimiento text, zona text, localidad text, sede_entrevista text, puesto_interes text,
               horario text, curso_manipulacion text, antecedentes text, cv_url text, observaciones text,
               estado text, cuil text, nacionalidad text, tel_emergencia text, sugerido_para text);

        if x.nombre is null or (x.dni is null and x.email is null) then
            omitidas := omitidas + 1;
            continue;
        end if;

        v_id := null;
        if x.dni is not null then
            select id into v_id from seleccion_postulantes where dni = x.dni order by id limit 1;
        end if;
        if v_id is null and x.email is not null then
            select id into v_id from seleccion_postulantes where lower(trim(email)) = x.email order by id limit 1;
        end if;

        if v_id is null then
            insert into seleccion_postulantes (nombre, apellido, dni, telefono, email, fecha_nacimiento, zona, localidad,
                sede_entrevista, puesto_interes, horario, curso_manipulacion, antecedentes, cv_url, observaciones, estado,
                cuil, nacionalidad, tel_emergencia, sugerido_para, origen)
            values (x.nombre, x.apellido, x.dni, x.telefono, x.email, x.fecha_nacimiento, x.zona, x.localidad,
                x.sede_entrevista, x.puesto_interes, x.horario, x.curso_manipulacion, x.antecedentes, x.cv_url, x.observaciones, x.estado,
                x.cuil, x.nacionalidad, x.tel_emergencia, x.sugerido_para, 'TAREAS GRUPALES');
            nuevos := nuevos + 1;
            continue;
        end if;

        -- Ya está: completa lo vacío. Si nada cambia no se escribe la fila.
        -- El DNI solo se completa si nadie más lo tiene (si lo tuviera, se la habría reconocido por DNI).
        update seleccion_postulantes p set
            apellido           = coalesce(p.apellido, x.apellido),
            dni                = coalesce(p.dni, x.dni),
            telefono           = coalesce(p.telefono, x.telefono),
            email              = coalesce(p.email, x.email),
            fecha_nacimiento   = coalesce(p.fecha_nacimiento, x.fecha_nacimiento),
            zona               = coalesce(p.zona, x.zona),
            localidad          = coalesce(p.localidad, x.localidad),
            sede_entrevista    = coalesce(p.sede_entrevista, x.sede_entrevista),
            puesto_interes     = coalesce(p.puesto_interes, x.puesto_interes),
            horario            = coalesce(p.horario, x.horario),
            curso_manipulacion = coalesce(p.curso_manipulacion, x.curso_manipulacion),
            antecedentes       = coalesce(p.antecedentes, x.antecedentes),
            cv_url             = coalesce(p.cv_url, x.cv_url),
            observaciones      = coalesce(p.observaciones, x.observaciones),
            estado             = case when x.estado in ('Bloqueado', 'Descartado') then x.estado else p.estado end,
            cuil               = coalesce(p.cuil, x.cuil),
            nacionalidad       = coalesce(p.nacionalidad, x.nacionalidad),
            tel_emergencia     = coalesce(p.tel_emergencia, x.tel_emergencia),
            sugerido_para      = coalesce(x.sugerido_para, p.sugerido_para)
        where p.id = v_id
          and (p.apellido, p.dni, p.telefono, p.email, p.fecha_nacimiento, p.zona, p.localidad, p.sede_entrevista,
               p.puesto_interes, p.horario, p.curso_manipulacion, p.antecedentes, p.cv_url, p.observaciones, p.estado,
               p.cuil, p.nacionalidad, p.tel_emergencia, p.sugerido_para)
              is distinct from
              (coalesce(p.apellido, x.apellido), coalesce(p.dni, x.dni), coalesce(p.telefono, x.telefono),
               coalesce(p.email, x.email), coalesce(p.fecha_nacimiento, x.fecha_nacimiento), coalesce(p.zona, x.zona),
               coalesce(p.localidad, x.localidad), coalesce(p.sede_entrevista, x.sede_entrevista),
               coalesce(p.puesto_interes, x.puesto_interes), coalesce(p.horario, x.horario),
               coalesce(p.curso_manipulacion, x.curso_manipulacion), coalesce(p.antecedentes, x.antecedentes),
               coalesce(p.cv_url, x.cv_url), coalesce(p.observaciones, x.observaciones),
               case when x.estado in ('Bloqueado', 'Descartado') then x.estado else p.estado end,
               coalesce(p.cuil, x.cuil), coalesce(p.nacionalidad, x.nacionalidad),
               coalesce(p.tel_emergencia, x.tel_emergencia), coalesce(x.sugerido_para, p.sugerido_para));
        get diagnostics n = row_count;
        if n > 0 then completados := completados + 1; else sin_cambios := sin_cambios + 1; end if;
    end loop;

    return jsonb_build_object('nuevos', nuevos, 'completados', completados, 'sin_cambios', sin_cambios, 'omitidas', omitidas);
end;
$$;

revoke execute on function public.seleccion_sync_postulantes(jsonb) from public;
grant execute on function public.seleccion_sync_postulantes(jsonb) to anon, authenticated, service_role;
