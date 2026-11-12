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
    r record; l record; v_sel text; nueva jsonb; vieja jsonb; v_reg text; v_zon text; v_zona text;
    actualizados int := 0; sin_cambios int := 0; vistos bigint[] := '{}';
    creados text[] := '{}'; sin_local text[] := '{}'; sin_selector text[] := '{}';
begin
    if not (seleccion_codigo_ok() or current_user = 'service_role') then
        raise exception 'Código de equipo inválido' using errcode = '42501';
    end if;
    -- Cada fila con su local del portal. Las claves se calculan UNA vez por fila y por local (materialized):
    -- sin eso se recalculaban en cada comparación y la llamada pasaba el límite de 3 s.
    for r in
        with f as materialized (
            select x.*, seleccion_clave_local_(x.local) k, seleccion_norm_(x.local) n,
                   nullif(seleccion_norm_(split_part(x.selector, '·', 1)), '') sn
              from jsonb_to_recordset(coalesce(filas, '[]')) as x(marca text, selector text, regional text, zonal text, local text, estado text)
             where nullif(trim(x.local), '') is not null
        ), lc as materialized (
            select s.id, s.marca, s.activo, seleccion_clave_local_(s.local) k, seleccion_norm_(s.local) n from seleccion_locales s
            union all
            select s.id, s.marca, s.activo, seleccion_clave_local_(a), seleccion_norm_(a) from seleccion_locales s, unnest(coalesce(s.alias, '{}')) a
        ), eq as materialized (
            select e.id, e.nombre, e.activo, seleccion_norm_(e.nombre) nn, seleccion_norm_(e.nombre_completo) nc from seleccion_equipo e where e.es_selector
        )
        select f.*,
               -- primero el nombre exacto (local o alias): "SANTA FE 1" y "SANTA FE (PROVINCIA)" comparten clave
               (select lc.id from lc where lc.marca = f.marca and lc.k = f.k
                 order by (lc.n = f.n) desc, lc.activo desc nulls last, lc.id limit 1) as loc_id,
               -- el selector de la hoja ("AGUSTINA", "Agustina Castillo") → nombre del equipo en el portal
               (select eq.nombre from eq where f.sn is not null and (eq.nn = f.sn or eq.nc = f.sn or eq.nn = split_part(f.sn, ' ', 1))
                 order by eq.activo desc, eq.id limit 1) as sel
          from f
    loop
        v_sel := r.sel;
        if v_sel is null and nullif(trim(r.selector), '') is not null and not (trim(r.selector) = any(sin_selector)) then
            sin_selector := sin_selector || trim(r.selector);
        end if;
        nueva := jsonb_strip_nulls(jsonb_build_object('selector', v_sel, 'regional', nullif(trim(r.regional), ''),
            'zonal', nullif(trim(r.zonal), ''), 'estado_nomina', seleccion_estado_nomina_(r.estado)));

        -- Local de la hoja que no está en el portal: se crea (con GR o GZ, así no entran filas sueltas)
        if r.loc_id is null then
            if not (nueva ? 'regional' or nueva ? 'zonal') then
                if coalesce(array_length(sin_local, 1), 0) < 40 then sin_local := sin_local || trim(r.local); end if;
                continue;
            end if;
            -- Zona por la localidad del nombre: "SABORES CAMPANA 2" → CAMPANA → Lejanos
            v_zona := (select z.zona from seleccion_zonas z
                        where seleccion_norm_(z.localidad) = regexp_replace(regexp_replace(r.k,
                              '^(SABORES|EXTREMAS|EMPANADA MANIA|MANIA)\s+', ''), '\s+\d+$', '')
                        limit 1);
            insert into seleccion_locales (marca, local, zona, selector, regional, zonal, estado_nomina, activo, asignacion_hoja, en_hoja)
            values (r.marca, trim(r.local), v_zona, nueva->>'selector', nueva->>'regional', nueva->>'zonal', nueva->>'estado_nomina',
                    true, nueva, now())
            on conflict (marca, local) do nothing;
            if found then creados := creados || trim(r.local); end if;
            continue;
        end if;

        select * into l from seleccion_locales where id = r.loc_id;
        vistos := vistos || l.id;
        -- Regional y zonal: siempre los de la hoja. Selector y nómina: solo si cambiaron en la hoja.
        vieja := coalesce(l.asignacion_hoja, '{}');
        v_reg := coalesce(nueva->>'regional', l.regional);
        v_zon := coalesce(nueva->>'zonal', l.zonal);
        if nueva = vieja and v_reg is not distinct from l.regional and v_zon is not distinct from l.zonal and l.activo then
            sin_cambios := sin_cambios + 1;
            continue;
        end if;
        update seleccion_locales set
            selector      = case when nueva ? 'selector' and nueva->>'selector' is distinct from vieja->>'selector' then nueva->>'selector' else selector end,
            regional      = v_reg,
            zonal         = v_zon,
            estado_nomina = case when nueva ? 'estado_nomina' and nueva->>'estado_nomina' is distinct from vieja->>'estado_nomina' then nueva->>'estado_nomina' else estado_nomina end,
            activo        = true,              -- figura en la hoja: vuelve al Mapa aunque se hubiera dado de baja
            asignacion_hoja = nueva
         where id = l.id;
        actualizados := actualizados + 1;
    end loop;
    -- Los que figuran en la hoja: una sola actualización al final
    update seleccion_locales set en_hoja = now() where id = any(vistos);
    return jsonb_build_object('actualizados', actualizados, 'sin_cambios', sin_cambios, 'creados', to_jsonb(creados),
        'sin_local', to_jsonb(sin_local), 'sin_selector', to_jsonb(sin_selector));
end;
$$;

revoke execute on function public.seleccion_asignaciones_sync(jsonb) from public;
grant execute on function public.seleccion_asignaciones_sync(jsonb) to anon, authenticated, service_role;
