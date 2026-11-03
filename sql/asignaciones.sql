-- ══════════════════════════════════════════════════════════════════════════
--  Asignaciones de locales (Mapa de equipos) desde las hojas de asignaciones
-- ──────────────────────────────────────────────────────────────────────────
--  El Apps Script lee cada 10 minutos las hojas de asignaciones de cada marca
--  (A = selector, B = regional, C = zonal, D = local, V = estado del local) y
--  llama a seleccion_asignaciones_sync. Cada dato se pisa solo cuando CAMBIA
--  en la hoja: lo que se reasigne a mano en el portal se mantiene hasta que la
--  hoja diga otra cosa para ese local.
--
--  CÓMO EJECUTAR: Supabase → ats-gastronomico → SQL Editor → pegar todo → Run.
--  Se puede volver a correr sin problema.
-- ══════════════════════════════════════════════════════════════════════════

alter table public.seleccion_locales
    add column if not exists asignacion_hoja jsonb,   -- último valor leído de la hoja (para no pisar cambios del portal)
    add column if not exists alias text[];            -- otros nombres del mismo local en las hojas ("SABORES LANUS 3" = "SABORES LANUS 1/3")

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
    r record; l record; v_sel text; nueva jsonb; vieja jsonb;
    actualizados int := 0; sin_cambios int := 0;
    sin_local text[] := '{}'; sin_selector text[] := '{}';
begin
    if not (seleccion_codigo_ok() or current_user = 'service_role') then
        raise exception 'Código de equipo inválido' using errcode = '42501';
    end if;
    for r in select * from jsonb_to_recordset(coalesce(filas, '[]')) as x(marca text, selector text, regional text, zonal text, local text, estado text) loop
        select * into l from seleccion_locales s
         where s.marca = r.marca and (seleccion_clave_local_(s.local) = seleccion_clave_local_(r.local)
            or seleccion_clave_local_(r.local) in (select seleccion_clave_local_(a) from unnest(coalesce(s.alias, '{}')) a))
         order by s.activo desc nulls last, s.id limit 1;
        if not found then
            if array_length(sin_local, 1) is null or array_length(sin_local, 1) < 40 then sin_local := sin_local || trim(r.local); end if;
            continue;
        end if;
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
        vieja := coalesce(l.asignacion_hoja, '{}');
        if nueva = vieja then sin_cambios := sin_cambios + 1; continue; end if;
        update seleccion_locales set
            selector      = case when nueva ? 'selector' and nueva->>'selector' is distinct from vieja->>'selector' then nueva->>'selector' else selector end,
            regional      = case when nueva ? 'regional' and nueva->>'regional' is distinct from vieja->>'regional' then nueva->>'regional' else regional end,
            zonal         = case when nueva ? 'zonal' and nueva->>'zonal' is distinct from vieja->>'zonal' then nueva->>'zonal' else zonal end,
            estado_nomina = case when nueva ? 'estado_nomina' and nueva->>'estado_nomina' is distinct from vieja->>'estado_nomina' then nueva->>'estado_nomina' else estado_nomina end,
            asignacion_hoja = nueva
         where id = l.id;
        actualizados := actualizados + 1;
    end loop;
    return jsonb_build_object('actualizados', actualizados, 'sin_cambios', sin_cambios,
        'sin_local', to_jsonb(sin_local), 'sin_selector', to_jsonb(sin_selector));
end;
$$;

revoke execute on function public.seleccion_asignaciones_sync(jsonb) from public;
grant execute on function public.seleccion_asignaciones_sync(jsonb) to anon, authenticated, service_role;
