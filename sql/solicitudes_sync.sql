-- ══════════════════════════════════════════════════════════════════════════
--  Solicitudes Extremas / Sabores (TAREAS GRUPALES) → vacantes del portal
-- ──────────────────────────────────────────────────────────────────────────
--  El Apps Script (paso 8 de SincronizarPortal) manda todas las filas de las
--  pestañas "Solicitudes Extremas" y "Solicitudes Sabores". Acá:
--   · Cada fila se reconoce por su contenido (local, puesto y persona), aunque
--     se ordene la hoja o se muevan filas. Se actualizan SOLO los datos que
--     cambiaron en la hoja desde la última lectura: lo que se edite a mano en el
--     portal se respeta hasta que la hoja diga otra cosa para ese dato.
--   · Fila nueva en la hoja → se vincula con una vacante del portal del mismo
--     local y puesto (primero la de la misma persona); si no hay, se crea.
--   · Cambiar el ESTADO en la hoja hace lo mismo que en el portal: fechas de la
--     demora, COMUNICADO = vacante cubierta, etc.
--   · Borrar una fila de la hoja NO borra la vacante del portal.
--
--  CÓMO EJECUTAR: Supabase → ats-gastronomico → SQL Editor → pegar todo → Run.
--  Se puede volver a correr sin problema.
-- ══════════════════════════════════════════════════════════════════════════

alter table public.seleccion_busquedas
    add column if not exists planilla_hoja jsonb,   -- últimos valores leídos de su fila en Solicitudes
    add column if not exists planilla_fila text,    -- dónde estaba la fila la última vez ('Solicitudes Extremas!12')
    add column if not exists planilla_vinculada timestamptz;   -- desde cuándo su fila guarda el N° de la vacante

-- Columnas de la hoja Solicitudes que se copian a la vacante (mismo nombre que en el portal)
create or replace function public.seleccion_solicitud_campos_() returns text[]
language sql immutable set search_path = public as $$
    select array['selector', 'regional', 'zonal', 'local', 'local_entrenamiento', 'puesto', 'jornada', 'notas',
                 'fecha_citacion', 'hora_citacion', 'estado', 'ingreso', 'nombre', 'apellido', 'email', 'tel',
                 'tel_emergencia', 'fecha_nacimiento', 'nacionalidad', 'cuil', 'dni', 'sexo', 'domicilio',
                 'domicilio_numero', 'codigo_postal', 'localidad', 'provincia', 'pais', 'altas_rrhh',
                 'registro_datos', 'id_postulante']
$$;

-- Los datos de la hoja ("cambios") aplicados sobre una vacante (null = vacante nueva),
-- con lo mismo que hace el portal al cambiar el ESTADO a mano
create or replace function public.seleccion_solicitud_aplicar_(b seleccion_busquedas, cambios jsonb, p_marca text)
returns seleccion_busquedas
language plpgsql stable set search_path = public as $$
declare
    r seleccion_busquedas;
    v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
    v_sel text;
begin
    r := jsonb_populate_record(b, cambios);
    r.marca := coalesce(b.marca, p_marca);
    r.local := coalesce(r.local, b.local);
    r.puesto := coalesce(r.puesto, b.puesto);
    -- "GUSTAVO" / "Agustina Castillo" → nombre del selector en Equipo
    if cambios ? 'selector' and nullif(trim(r.selector), '') is not null then
        select e.nombre into v_sel from seleccion_equipo e
         where seleccion_norm_(e.nombre) = seleccion_norm_(r.selector)
            or seleccion_norm_(e.nombre_completo) = seleccion_norm_(r.selector)
            or seleccion_norm_(e.nombre) = split_part(seleccion_norm_(r.selector), ' ', 1)
         order by e.activo desc, e.id limit 1;
        r.selector := coalesce(v_sel, initcap(lower(trim(r.selector))));
    end if;
    -- Zona del local (lista de locales, también por alias)
    if b.id is null or cambios ? 'local' or r.zona is null then
        r.zona := coalesce((select l.zona from seleccion_locales l
                             where l.marca = r.marca and coalesce(l.zona, '') <> ''
                               and (seleccion_clave_local_(l.local) = seleccion_clave_local_(r.local)
                                 or seleccion_clave_local_(r.local) in (select seleccion_clave_local_(a) from unnest(coalesce(l.alias, '{}')) a))
                             order by (seleccion_norm_(l.local) = seleccion_norm_(r.local)) desc, l.id limit 1), r.zona);
    end if;
    if b.id is null then
        r.motivo := case when r.local ~* 'APER' then 'Apertura' else 'Rotación' end;
        r.status := 'Proceso';
    end if;
    -- ESTADO: mismas consecuencias que en el portal
    if cambios ? 'estado' and r.estado is distinct from b.estado then
        r.fecha_estado := case when r.estado is null then null else v_hoy end;
        if r.estado in ('ENVIADO A ZONAL', 'APROBADO ZONAL', 'RECHAZADO ZONAL') and r.enviado_zonal is null then r.enviado_zonal := v_hoy; end if;
        if r.estado = 'APROBADO ZONAL' and r.decision_zonal is null then r.decision_zonal := v_hoy; end if;
        if r.estado = 'COMUNICADO' then
            r.status := case when b.status = 'Finalizada' then 'Finalizada' else 'Cerrada' end;
            r.ingreso := coalesce(r.ingreso, v_hoy);
        elsif b.estado = 'COMUNICADO' and b.status = 'Cerrada' then
            r.status := 'Proceso';                       -- se corrigió un COMUNICADO: vuelve a estar abierta
        end if;
    end if;
    r.ingreso_nombre := case when r.estado = 'COMUNICADO' then nullif(trim(concat_ws(' ', r.nombre, r.apellido)), '') end;
    -- La persona en la Base de postulantes (por email)
    if r.postulante_id is null and nullif(trim(r.email), '') is not null then
        r.postulante_id := (select p.id from seleccion_postulantes p where lower(trim(p.email)) = lower(trim(r.email)) order by p.id desc limit 1);
    end if;
    return r;
end;
$$;

-- Una fila de la hoja sobre su vacante (b; null = crearla). Devuelve { id, numero, creada, actualizada }
create or replace function public.seleccion_solicitud_fila_(b seleccion_busquedas, nueva jsonb, p_hoja text, p_fila int, p_marca text)
returns jsonb
language plpgsql volatile set search_path = public as $$
declare
    r seleccion_busquedas; vieja jsonb; cambios jsonb := '{}'; k text;
    creada boolean := false; actualizada boolean := false;
    v_ref text := p_hoja || '!' || p_fila;
begin
    if b.id is null then
        r := seleccion_solicitud_aplicar_(null, nueva, p_marca);
        insert into seleccion_busquedas (marca, selector, regional, zonal, local, local_entrenamiento, puesto, jornada, notas,
            fecha_citacion, hora_citacion, estado, ingreso, nombre, apellido, email, tel, tel_emergencia, fecha_nacimiento,
            nacionalidad, cuil, dni, sexo, domicilio, domicilio_numero, codigo_postal, localidad, provincia, pais, altas_rrhh,
            registro_datos, id_postulante, zona, motivo, status, ingreso_nombre, fecha_estado, enviado_zonal, decision_zonal,
            postulante_id)
        values (r.marca, r.selector, r.regional, r.zonal, r.local, r.local_entrenamiento, r.puesto, r.jornada, r.notas,
            r.fecha_citacion, r.hora_citacion, r.estado, r.ingreso, r.nombre, r.apellido, r.email, r.tel, r.tel_emergencia, r.fecha_nacimiento,
            r.nacionalidad, r.cuil, r.dni, r.sexo, r.domicilio, r.domicilio_numero, r.codigo_postal, r.localidad, r.provincia, r.pais, r.altas_rrhh,
            r.registro_datos, r.id_postulante, r.zona, r.motivo, r.status, r.ingreso_nombre, r.fecha_estado, r.enviado_zonal, r.decision_zonal,
            r.postulante_id)
        returning * into b;
        insert into seleccion_comentarios (busqueda_id, texto, fecha, autor)
        values (b.id, 'Vacante creada desde ' || p_hoja || ' (fila ' || p_fila || ')',
                (now() at time zone 'America/Argentina/Buenos_Aires')::date, 'Planilla');
        creada := true;
    else
        -- Solo lo que cambió en la hoja desde la última lectura (lo editado en el portal se respeta)
        vieja := coalesce(b.planilla_hoja, '{}');
        foreach k in array seleccion_solicitud_campos_() loop
            if (nueva->k) is distinct from (vieja->k) then cambios := cambios || jsonb_build_object(k, nueva->k); end if;
        end loop;
        if cambios <> '{}' then
            r := seleccion_solicitud_aplicar_(b, cambios, p_marca);
            if row(r.*) is distinct from row(b.*) then
                update seleccion_busquedas set
                    selector = r.selector, regional = r.regional, zonal = r.zonal, local = r.local, local_entrenamiento = r.local_entrenamiento,
                    puesto = r.puesto, jornada = r.jornada, notas = r.notas, fecha_citacion = r.fecha_citacion, hora_citacion = r.hora_citacion,
                    estado = r.estado, ingreso = r.ingreso, nombre = r.nombre, apellido = r.apellido, email = r.email, tel = r.tel,
                    tel_emergencia = r.tel_emergencia, fecha_nacimiento = r.fecha_nacimiento, nacionalidad = r.nacionalidad, cuil = r.cuil,
                    dni = r.dni, sexo = r.sexo, domicilio = r.domicilio, domicilio_numero = r.domicilio_numero, codigo_postal = r.codigo_postal,
                    localidad = r.localidad, provincia = r.provincia, pais = r.pais, altas_rrhh = r.altas_rrhh, registro_datos = r.registro_datos,
                    id_postulante = r.id_postulante, zona = r.zona, status = r.status, ingreso_nombre = r.ingreso_nombre,
                    fecha_estado = r.fecha_estado, enviado_zonal = r.enviado_zonal, decision_zonal = r.decision_zonal, postulante_id = r.postulante_id
                 where id = b.id;
                actualizada := true;
            end if;
        end if;
    end if;
    update seleccion_busquedas set planilla_hoja = nueva, planilla_fila = v_ref, planilla_vinculada = coalesce(planilla_vinculada, now())
     where id = b.id;
    return jsonb_build_object('id', b.id, 'numero', b.numero, 'creada', creada, 'actualizada', actualizada);
end;
$$;

-- p_filas: [{ fila, numero, datos: { selector, local, puesto, … } }]  (una pestaña completa por llamada)
-- Cada fila se reconoce por su CONTENIDO (local, puesto y persona), no por la posición: la hoja se
-- ordena, se cortan y pegan filas… El N° que guarda la fila ya no se usa para vincular.
-- Devuelve { creadas, actualizadas, vincular: [{ fila, numero }] }
create or replace function public.seleccion_solicitudes_sync(p_hoja text, p_marca text, p_filas jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$   -- definer: usa seleccion_norm_ (cerrada al público); igual exige el código
declare
    f record; b seleccion_busquedas; res jsonb; paso int; v_ref text;
    vistos bigint[] := '{}'; hechas int[] := '{}'; vincular jsonb := '[]';
    creadas int := 0; actualizadas int := 0;
begin
    if not (seleccion_codigo_ok() or current_user = 'service_role') then
        raise exception 'Código del equipo inválido' using errcode = '42501';
    end if;
    if p_marca not in ('Hamburguesas Extremas', 'Sabores Express') then
        raise exception 'Marca desconocida: %', p_marca;
    end if;
    drop table if exists _sol;
    create temp table _sol (fila int primary key, numero text, nueva jsonb, clave text, persona text) on commit drop;
    insert into _sol
    select x.fila, upper(nullif(trim(x.numero), '')), n.v, seleccion_clave_local_(n.v->>'local'),
           seleccion_norm_(concat_ws(' ', n.v->>'nombre', n.v->>'apellido'))
      from jsonb_to_recordset(coalesce(p_filas, '[]')) as x(fila int, numero text, datos jsonb)
      cross join lateral (select jsonb_strip_nulls(coalesce(x.datos, '{}')) as v) n
     where coalesce(x.datos->>'local', '') <> ''
    on conflict (fila) do nothing;

    -- 1) la misma fila sin cambios · 2) misma persona en el mismo local y puesto · 3) mismo local y puesto en
    -- esa misma fila (cambió la persona) · 4) mismo local y puesto que estaba en la hoja · 5) cargada en el
    -- portal con la misma persona · 6) abierta en el portal del mismo local y puesto · 7) vacante nueva
    for paso in 1..7 loop
        for f in select * from _sol where not (fila = any(hechas)) order by fila loop
            b := null;
            v_ref := p_hoja || '!' || f.fila;
            if paso = 1 then
                select * into b from seleccion_busquedas s
                 where s.marca = p_marca and s.planilla_hoja = f.nueva and not (s.id = any(vistos))
                 order by (s.planilla_fila = v_ref) desc nulls last, s.id limit 1;
            elsif paso = 2 then
                select * into b from seleccion_busquedas s
                 where s.marca = p_marca and s.planilla_hoja is not null and not (s.id = any(vistos)) and f.persona <> ''
                   and seleccion_clave_local_(s.planilla_hoja->>'local') = f.clave
                   and (s.planilla_hoja->>'puesto') is not distinct from (f.nueva->>'puesto')
                   and ((f.nueva->>'id_postulante') = (s.planilla_hoja->>'id_postulante')
                     or (f.nueva->>'email') = (s.planilla_hoja->>'email')
                     or seleccion_norm_(concat_ws(' ', s.planilla_hoja->>'nombre', s.planilla_hoja->>'apellido')) = f.persona)
                 order by (s.planilla_fila = v_ref) desc nulls last, s.id limit 1;
            elsif paso = 3 then
                select * into b from seleccion_busquedas s
                 where s.marca = p_marca and s.planilla_hoja is not null and not (s.id = any(vistos))
                   and s.planilla_fila = v_ref
                   and seleccion_clave_local_(s.planilla_hoja->>'local') = f.clave
                   and (s.planilla_hoja->>'puesto') is not distinct from (f.nueva->>'puesto')
                 limit 1;
            elsif paso = 4 then
                select * into b from seleccion_busquedas s
                 where s.marca = p_marca and s.planilla_hoja is not null and not (s.id = any(vistos))
                   and s.planilla_fila like p_hoja || '!%'
                   and seleccion_clave_local_(s.planilla_hoja->>'local') = f.clave
                   and (s.planilla_hoja->>'puesto') is not distinct from (f.nueva->>'puesto')
                 order by s.id limit 1;
            elsif paso = 5 then
                select * into b from seleccion_busquedas s
                 where s.marca = p_marca and s.planilla_hoja is null and s.archivada is null and not (s.id = any(vistos))
                   and seleccion_clave_local_(s.local) = f.clave and s.puesto = f.nueva->>'puesto'
                   and seleccion_norm_(concat_ws(' ', s.nombre, s.apellido)) = f.persona
                 order by s.id limit 1;
            elsif paso = 6 then
                select * into b from seleccion_busquedas s
                 where s.marca = p_marca and s.planilla_hoja is null and s.archivada is null and not (s.id = any(vistos))
                   and s.status in ('Proceso', 'Pausada')
                   and seleccion_clave_local_(s.local) = f.clave and s.puesto = f.nueva->>'puesto'
                 order by s.id limit 1;
            elsif coalesce(f.nueva->>'puesto', '') = '' then
                continue;                                   -- sin puesto todavía: se crea en la próxima vuelta
            end if;
            if paso < 7 and b.id is null then continue; end if;
            res := seleccion_solicitud_fila_(b, f.nueva, p_hoja, f.fila, p_marca);
            hechas := hechas || f.fila;
            vistos := vistos || (res->>'id')::bigint;
            if (res->>'creada')::boolean then creadas := creadas + 1; end if;
            if (res->>'actualizada')::boolean then actualizadas := actualizadas + 1; end if;
            if f.numero is distinct from res->>'numero' then
                vincular := vincular || jsonb_build_object('fila', f.fila, 'numero', res->>'numero');
            end if;
        end loop;
    end loop;
    -- Vacantes cuya fila ya no está en la hoja: se olvida la posición (la vacante sigue en el portal)
    update seleccion_busquedas set planilla_fila = null
     where planilla_fila like p_hoja || '!%' and not (id = any(vistos));
    return jsonb_build_object('creadas', creadas, 'actualizadas', actualizadas, 'vincular', vincular);
end;
$$;

do $$
begin
    revoke execute on function public.seleccion_solicitudes_sync(text, text, jsonb) from public;
    grant execute on function public.seleccion_solicitudes_sync(text, text, jsonb) to anon, authenticated, service_role;
    -- Piezas internas: solo las usa seleccion_solicitudes_sync
    revoke execute on function public.seleccion_solicitud_fila_(seleccion_busquedas, jsonb, text, int, text) from public, anon, authenticated;
    revoke execute on function public.seleccion_solicitud_aplicar_(seleccion_busquedas, jsonb, text) from public, anon, authenticated;
end $$;
