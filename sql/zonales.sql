-- ══════════════════════════════════════════════════════════════════════════
--  Circuito con los zonales desde el portal (lo que hace Zonales.gs con la planilla)
-- ──────────────────────────────────────────────────────────────────────────
--  Los regionales siguen trabajando en su hoja ("Base de Candidatos"), como
--  están capacitados. El Apps Script SincronizarPortal, cada 10 minutos:
--   - IDA: vacantes de Extremas en ENVIADO A ZONAL → se agregan a la hoja del
--     regional (según REGIONAL y la pestaña HOJAS ZONALES de TAREAS GRUPALES),
--     con su ID POSTULANTE, PUESTO (PART TIME / FULL TIME) y HORARIO (jornada).
--     Si ya estaba (copiada a mano), no se duplica.
--   - VUELTA: el zonal pone APROBADO / DESAPROBADO (en cualquier pestaña) → la
--     vacante pasa a APROBADO ZONAL / RECHAZADO ZONAL. Si cambió PUESTO u
--     HORARIO se copian; sus OBSERVACIONES quedan en el historial.
--   - Solo se tocan vacantes que siguen en ENVIADO A ZONAL.
--   - RECHAZADO ZONAL bloquea a la persona (BLOQUEADOS) y la saca de BASE DE
--     DATOS: ver sql/rechazado_zonal.sql.
--
--  CÓMO EJECUTAR: Supabase → ats-gastronomico → SQL Editor → pegar todo → Run.
--  Se puede volver a correr sin problema.
-- ══════════════════════════════════════════════════════════════════════════

alter table public.seleccion_busquedas
    add column if not exists zonal_copiado timestamptz,   -- cuándo se copió a la hoja del regional
    add column if not exists zonal_clave   text,          -- ID POSTULANTE con que se copió (si cambia la persona, se vuelve a mandar)
    add column if not exists zonal_obs     text;          -- OBSERVACIONES que dejó el zonal

-- ID POSTULANTE de la persona en la vacante (el de la planilla o uno del portal)
create or replace function public.seleccion_zonal_id_(b public.seleccion_busquedas, p_id_postulante text) returns text
language sql stable set search_path = public as $$
    select coalesce(nullif(trim(b.id_postulante), ''), nullif(trim(p_id_postulante), ''),
                    'PORTAL-' || coalesce(b.postulante_id::text, 'V' || b.id::text))
$$;

-- Vacantes de Extremas en ENVIADO A ZONAL, con lo que va en "Base de Candidatos"
create or replace function public.seleccion_zonal_pendientes() returns jsonb
language plpgsql stable security invoker set search_path = public as $$
begin
    if not (seleccion_codigo_ok() or current_user = 'service_role') then
        raise exception 'Código del equipo inválido' using errcode = '42501';
    end if;
    return coalesce((
        select jsonb_agg(jsonb_build_object(
                   'id', x.id, 'numero', x.numero, 'regional', x.regional,
                   'id_postulante', x.clave, 'copiado', x.zonal_copiado is not null and x.zonal_clave = x.clave,
                   'nombre', x.nombre, 'apellido', x.apellido, 'email', lower(trim(coalesce(x.email, ''))), 'tel', x.tel,
                   'fecha_nacimiento', to_char(x.fecha_nacimiento, 'FMDD/FMMM/YYYY'),
                   'zona', coalesce(x.zona_persona, ''), 'localidad', x.localidad, 'local', x.local,
                   'puesto', x.puesto, 'jornada', x.jornada) order by x.id)
          from (select b.*, p.zona as zona_persona, seleccion_zonal_id_(b, p.id_postulante) as clave
                  from seleccion_busquedas b
                  left join seleccion_postulantes p on p.id = b.postulante_id
                 where b.estado = 'ENVIADO A ZONAL'
                   and b.marca = 'Hamburguesas Extremas'
                   and b.status in ('Proceso', 'Pausada')
                   and coalesce(trim(b.nombre), '') not in ('', '-')) x), '[]'::jsonb);
end;
$$;

-- Ya copiadas a la hoja del regional: [{ id, id_postulante }]
create or replace function public.seleccion_zonal_marcar(filas jsonb) returns int
language plpgsql volatile security invoker set search_path = public as $$
declare n int;
begin
    if not (seleccion_codigo_ok() or current_user = 'service_role') then
        raise exception 'Código del equipo inválido' using errcode = '42501';
    end if;
    update seleccion_busquedas b
       set zonal_copiado = now(), zonal_clave = r.id_postulante,
           id_postulante = coalesce(nullif(trim(b.id_postulante), ''), r.id_postulante)
      from jsonb_to_recordset(coalesce(filas, '[]'::jsonb)) as r(id bigint, id_postulante text)
     where b.id = r.id;
    get diagnostics n = row_count;
    return n;
end;
$$;

-- Respuestas de los zonales: [{ id, resultado: APROBADO | DESAPROBADO, puesto, horario, obs }]
create or replace function public.seleccion_zonal_respuestas(filas jsonb) returns jsonb
language plpgsql volatile security invoker set search_path = public as $$
declare
    r record;
    v_res text;
    v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
    aprobados int := 0; rechazados int := 0;
begin
    if not (seleccion_codigo_ok() or current_user = 'service_role') then
        raise exception 'Código del equipo inválido' using errcode = '42501';
    end if;
    for r in select * from jsonb_to_recordset(coalesce(filas, '[]'::jsonb))
                 as x(id bigint, resultado text, puesto text, horario text, obs text) loop
        v_res := upper(trim(coalesce(r.resultado, '')));
        if v_res not in ('APROBADO', 'DESAPROBADO') then continue; end if;
        update seleccion_busquedas b set
            estado = case when v_res = 'APROBADO' then 'APROBADO ZONAL' else 'RECHAZADO ZONAL' end,
            fecha_estado = v_hoy,
            enviado_zonal = coalesce(b.enviado_zonal, v_hoy),
            decision_zonal = case when v_res = 'APROBADO' then coalesce(b.decision_zonal, v_hoy) else b.decision_zonal end,
            -- Solo si el zonal lo cambió: "PART TIME" del zonal = "PART TIME (5HS)" del portal
            puesto = case
                when nullif(trim(r.puesto), '') is null then b.puesto
                when (case when upper(r.puesto) like '%PART%' then 'PART' when upper(r.puesto) like '%FULL%' then 'FULL' else upper(trim(r.puesto)) end)
                   = (case when upper(coalesce(b.puesto, '')) like '%PART%' then 'PART' when upper(coalesce(b.puesto, '')) like '%FULL%' then 'FULL' else upper(trim(coalesce(b.puesto, ''))) end)
                    then b.puesto
                when upper(r.puesto) like '%PART%' then 'PART TIME (5HS)'
                when upper(r.puesto) like '%FULL%' then 'FULL TIME (9HS)'
                else upper(trim(r.puesto)) end,
            jornada = case when nullif(trim(r.horario), '') is null or upper(trim(r.horario)) = upper(trim(coalesce(b.jornada, '')))
                           then b.jornada else upper(trim(r.horario)) end,
            zonal_obs = coalesce(nullif(trim(r.obs), ''), b.zonal_obs)
         where b.id = r.id and b.estado = 'ENVIADO A ZONAL';
        if found then
            if v_res = 'APROBADO' then aprobados := aprobados + 1; else rechazados := rechazados + 1; end if;
            insert into seleccion_comentarios (busqueda_id, texto, fecha, autor)
            values (r.id, 'Zonal: ' || v_res || coalesce(' · ' || nullif(trim(r.obs), ''), ''), v_hoy, 'Zonal');
        end if;
    end loop;
    return jsonb_build_object('aprobados', aprobados, 'rechazados', rechazados);
end;
$$;

do $$
declare f text;
begin
    foreach f in array array['seleccion_zonal_pendientes()', 'seleccion_zonal_marcar(jsonb)', 'seleccion_zonal_respuestas(jsonb)'] loop
        execute format('revoke execute on function public.%s from public', f);
        execute format('grant execute on function public.%s to anon, authenticated, service_role', f);
    end loop;
end $$;
