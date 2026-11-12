-- ══════════════════════════════════════════════════════════════════════════
--  Asignaciones de locales (Mapa de equipos) desde las hojas de asignaciones
-- ──────────────────────────────────────────────────────────────────────────
--  El Apps Script lee cada 10 minutos las hojas de asignaciones de cada marca
--  ("Solicitudes y Asignaciones | Sabores / Extremas", pestaña SOLICITUDES -
--  GENERAL: A = selector, B = GR, C = GZ, D = local, V = estado de nómina) y
--  llama a seleccion_asignaciones_sync. La hoja es la fuente del Mapa:
--   · Regional (GR) y zonal (GZ): siempre los de la hoja.
--   · Local de la hoja que no está en el portal → se crea (zona por localidad).
--   · Local que dejó de estar en la hoja → sale del Mapa (en_hoja queda viejo).
--   · Selector y nómina se pisan solo cuando CAMBIAN en la hoja: lo que se
--     reasigne a mano en el portal se mantiene hasta que la hoja diga otra cosa.
--
--  CÓMO EJECUTAR: Supabase → ats-gastronomico → SQL Editor → pegar todo → Run.
--  Se puede volver a correr sin problema.
-- ══════════════════════════════════════════════════════════════════════════

alter table public.seleccion_locales
    add column if not exists asignacion_hoja jsonb,   -- último valor leído de la hoja (para no pisar cambios del portal)
    add column if not exists alias text[],            -- otros nombres del mismo local en las hojas ("SABORES LANUS 3" = "SABORES LANUS 1/3")
    add column if not exists en_hoja timestamptz;     -- última vez que figuró en su hoja de asignaciones (el Mapa muestra solo esos)

-- Mismo local escrito distinto en la hoja y en el portal:
--   "SABORES EXPRESS ADROGUE" = "SABORES ADROGUE" · "APERTURA EXTREMAS PILAR" = "EXTREMAS PILAR"
--   "SABORES CORDOBA (PROVINCIA)" = "SABORES CORDOBA" · "GENERAL RODRIGUEZ" = "GRAL. RODRIGUEZ"
--   "SABORES FLORES 1" = "SABORES FLORES" (el 1 es el primero; el 2 sigue siendo otro local)
--   "SABORES EL PALOMAR" = "SABORES PALOMAR" · "RAMOS MEJIA" = "RAMOS"
create or replace function public.seleccion_clave_local_(v text) returns text
language sql immutable set search_path = public as $$
    select trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
        seleccion_norm_(v),
        '\([^)]*\)', ' ', 'g'),                       -- (PROVINCIA), (CABA)…
        '[.,]', ' ', 'g'),
        '^(APERTURA|APER)\s+', ''),
        '^SABORES EXPRESS\s+', 'SABORES '),
        '^HAMBURGUESAS EXTREMAS\s+', 'EXTREMAS '),
        '\mGENERAL\M', 'GRAL', 'g'),
        '\mPRESIDENTE\M', 'PTE', 'g'),
        '\mRAMOS MEJIA\M', 'RAMOS', 'g'),
        '^(SABORES|EXTREMAS) EL\s+', '\1 '),
        '\s+1\s*$', ''),
        '\s+', ' ', 'g'))
$$;

-- Columna V de la hoja → estado de nómina del portal
create or replace function public.seleccion_estado_nomina_(v text) returns text
language sql immutable set search_path = public as $$
    select case
        when seleccion_norm_(v) ~ 'EXCED|EXCESO|SOBR' then 'EXCEDIDO'
        when seleccion_norm_(v) ~ 'DEBE|FALT|PEND|INCOMPLET|COMPLETAR' then 'DEBE COMPLETAR'
        when seleccion_norm_(v) ~ 'COMPLET|CUBIERT|^OK' then 'COMPLETO'
    end
$$;

create or replace function public.seleccion_asignaciones_sync(filas jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$   -- definer: usa seleccion_norm_ (cerrada al público); igual exige el código
declare
    r record; l record; v_sel text; nueva jsonb; vieja jsonb; v_existe boolean; v_reg text; v_zon text; v_zona text;
    actualizados int := 0; sin_cambios int := 0;
    creados text[] := '{}'; sin_local text[] := '{}'; sin_selector text[] := '{}';
begin
    if not (seleccion_codigo_ok() or current_user = 'service_role') then
        raise exception 'Código de equipo inválido' using errcode = '42501';
    end if;
    for r in select * from jsonb_to_recordset(coalesce(filas, '[]')) as x(marca text, selector text, regional text, zonal text, local text, estado text) loop
        if nullif(trim(r.local), '') is null then continue; end if;
        select * into l from seleccion_locales s
         where s.marca = r.marca and (seleccion_clave_local_(s.local) = seleccion_clave_local_(r.local)
            or seleccion_clave_local_(r.local) in (select seleccion_clave_local_(a) from unnest(coalesce(s.alias, '{}')) a))
         -- primero el nombre exacto (local o alias): "SANTA FE 1" y "SANTA FE (PROVINCIA)" comparten clave
         order by (seleccion_norm_(r.local) = seleccion_norm_(s.local) or seleccion_norm_(r.local) in (select seleccion_norm_(a) from unnest(coalesce(s.alias, '{}')) a)) desc,
                  s.activo desc nulls last, s.id limit 1;
        v_existe := found;
        v_sel := null;
        -- El selector de la hoja ("AGUSTINA", "Agustina Castillo") → nombre del equipo en el portal
        select e.nombre into v_sel from seleccion_equipo e
         where e.es_selector and nullif(trim(r.selector), '') is not null
           and (seleccion_norm_(e.nombre) = seleccion_norm_(split_part(r.selector, '·', 1))
             or seleccion_norm_(e.nombre_completo) = seleccion_norm_(split_part(r.selector, '·', 1))
             or seleccion_norm_(e.nombre) = split_part(seleccion_norm_(split_part(r.selector, '·', 1)), ' ', 1))
         order by e.activo desc, e.id limit 1;
        if v_sel is null and nullif(trim(r.selector), '') is not null and not (trim(r.selector) = any(sin_selector)) then
            sin_selector := sin_selector || trim(r.selector);
        end if;
        nueva := jsonb_strip_nulls(jsonb_build_object('selector', v_sel, 'regional', nullif(trim(r.regional), ''),
            'zonal', nullif(trim(r.zonal), ''), 'estado_nomina', seleccion_estado_nomina_(r.estado)));

        -- Local de la hoja que no está en el portal: se crea (con GR o GZ, así no entran filas sueltas)
        if not v_existe then
            if not (nueva ? 'regional' or nueva ? 'zonal') then
                if coalesce(array_length(sin_local, 1), 0) < 40 then sin_local := sin_local || trim(r.local); end if;
                continue;
            end if;
            -- Zona por la localidad del nombre: "SABORES CAMPANA 2" → CAMPANA → Norte
            v_zona := (select z.zona from seleccion_zonas z
                        where seleccion_norm_(z.localidad) = regexp_replace(regexp_replace(seleccion_clave_local_(r.local),
                              '^(SABORES|EXTREMAS|EMPANADA MANIA|MANIA)\s+', ''), '\s+\d+$', '')
                        limit 1);
            insert into seleccion_locales (marca, local, zona, selector, regional, zonal, estado_nomina, activo, asignacion_hoja, en_hoja)
            values (r.marca, trim(r.local), v_zona, nueva->>'selector', nueva->>'regional', nueva->>'zonal', nueva->>'estado_nomina',
                    true, nueva, now())
            on conflict (marca, local) do nothing;
            if found then creados := creados || trim(r.local); end if;
            continue;
        end if;

        -- Regional y zonal: siempre los de la hoja. Selector y nómina: solo si cambiaron en la hoja.
        vieja := coalesce(l.asignacion_hoja, '{}');
        v_reg := coalesce(nueva->>'regional', l.regional);
        v_zon := coalesce(nueva->>'zonal', l.zonal);
        if nueva = vieja and v_reg is not distinct from l.regional and v_zon is not distinct from l.zonal and l.activo then
            update seleccion_locales set en_hoja = now() where id = l.id;
            sin_cambios := sin_cambios + 1;
            continue;
        end if;
        update seleccion_locales set
            selector      = case when nueva ? 'selector' and nueva->>'selector' is distinct from vieja->>'selector' then nueva->>'selector' else selector end,
            regional      = v_reg,
            zonal         = v_zon,
            estado_nomina = case when nueva ? 'estado_nomina' and nueva->>'estado_nomina' is distinct from vieja->>'estado_nomina' then nueva->>'estado_nomina' else estado_nomina end,
            activo        = true,              -- figura en la hoja: vuelve al Mapa aunque se hubiera dado de baja
            asignacion_hoja = nueva,
            en_hoja       = now()
         where id = l.id;
        actualizados := actualizados + 1;
    end loop;
    return jsonb_build_object('actualizados', actualizados, 'sin_cambios', sin_cambios, 'creados', to_jsonb(creados),
        'sin_local', to_jsonb(sin_local), 'sin_selector', to_jsonb(sin_selector));
end;
$$;

revoke execute on function public.seleccion_asignaciones_sync(jsonb) from public;
grant execute on function public.seleccion_asignaciones_sync(jsonb) to anon, authenticated, service_role;
