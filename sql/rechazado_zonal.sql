-- ══════════════════════════════════════════════════════════════════════════
--  Rechazado por el zonal → la persona queda BLOQUEADA y sale de BASE DE DATOS
-- ──────────────────────────────────────────────────────────────────────────
--  Cuando una vacante pasa a RECHAZADO ZONAL (respuesta del zonal en su hoja,
--  cambio a mano en el portal o fila de Solicitudes), la persona de esa vacante:
--   - queda "Bloqueado" en la Base de postulantes del portal (no se puede
--     volver a colocar ni vuelve a la base como disponible);
--   - se suma a BLOQUEADOS con motivo "RECHAZADO ZONAL · <local>", así la
--     página Elegí tu vacante no la deja volver a anotarse.
--  El Apps Script SincronizarPortal copia ese bloqueo a la pestaña BLOQUEADOS
--  y saca sus filas de la pestaña BASE DE DATOS (apps-script/SincronizarBase.gs).
--
--  Para desbloquear a alguien: en BLOQUEADOS poner ACTIVO = NO y en el portal
--  cambiarle el estado en la Base.
--
--  CÓMO EJECUTAR: Supabase → ats-gastronomico → SQL Editor → pegar todo → Run.
--  Se puede volver a correr sin problema: a quien ya tuvo un bloqueo por
--  rechazo zonal (activo o no) no se lo vuelve a bloquear.
-- ══════════════════════════════════════════════════════════════════════════

-- Bloquea a la persona de la vacante. desde_cero = true (carga inicial): si ya tuvo
-- un bloqueo por rechazo zonal, aunque lo hayan desactivado, no se toca.
create or replace function public.seleccion_bloquear_rechazado_zonal_(b public.seleccion_busquedas, desde_cero boolean default false)
returns boolean language plpgsql security definer set search_path = public as $$
declare
    p    seleccion_postulantes;
    v_dni  text;
    v_cuil text;
    v_mail text;
    v_tel  text;
begin
    if coalesce(trim(b.nombre), '') in ('', '-') and b.postulante_id is null then return false; end if;

    -- La persona en la Base: la vinculada o la que coincide por DNI / mail
    select t.* into p from seleccion_postulantes t
     where t.id = b.postulante_id
        or (nullif(ltrim(regexp_replace(coalesce(b.dni, ''), '\D', '', 'g'), '0'), '') = ltrim(regexp_replace(coalesce(t.dni, ''), '\D', '', 'g'), '0'))
        or (nullif(lower(trim(coalesce(b.email, ''))), '') = lower(trim(coalesce(t.email, ''))))
     order by (t.id = b.postulante_id) is true desc, t.id
     limit 1;

    v_dni  := nullif(ltrim(regexp_replace(coalesce(nullif(b.dni, ''), p.dni, ''), '\D', '', 'g'), '0'), '');
    v_cuil := nullif(regexp_replace(coalesce(nullif(b.cuil, ''), p.cuil, ''), '\D', '', 'g'), '');
    v_mail := nullif(lower(trim(coalesce(nullif(b.email, ''), p.email, ''))), '');
    v_tel  := nullif(seleccion_clave_tel_(coalesce(nullif(b.tel, ''), p.telefono, '')), '');
    if length(v_tel) < 8 then v_tel := null; end if;
    if v_dni is null and v_cuil is null and v_mail is null and v_tel is null then return false; end if;

    -- ¿Ya tiene un bloqueo por rechazo zonal? (activo; en la carga inicial, activo o no)
    if exists (select 1 from seleccion_bloqueados x
                where (x.activo or desde_cero)
                  and seleccion_norm_(x.motivo) like '%RECHAZ%ZONAL%'
                  and ((v_dni is not null and ltrim(regexp_replace(coalesce(x.dni, ''), '\D', '', 'g'), '0') = v_dni)
                    or (v_cuil is not null and regexp_replace(coalesce(x.cuil, ''), '\D', '', 'g') = v_cuil)
                    or (v_mail is not null and lower(trim(coalesce(x.mail, ''))) = v_mail)
                    or (v_tel is not null and seleccion_clave_tel_(x.tel) = v_tel))) then
        if desde_cero then return false; end if;
    else
        insert into seleccion_bloqueados (dni, cuil, nombre, apellido, mail, tel, localidad, motivo, activo, origen)
        values (coalesce(nullif(regexp_replace(coalesce(b.dni, ''), '\D', '', 'g'), ''), p.dni), v_cuil,
                coalesce(nullif(trim(b.nombre), ''), p.nombre), coalesce(nullif(trim(b.apellido), ''), p.apellido),
                v_mail, coalesce(nullif(trim(b.tel), ''), p.telefono), coalesce(nullif(trim(b.localidad), ''), p.localidad),
                'RECHAZADO ZONAL' || coalesce(' · ' || nullif(trim(b.local), ''), ''), true, 'PORTAL');
    end if;

    -- Bloqueado en la Base (Descartado se respeta: tampoco se puede colocar)
    if p.id is not null then
        update seleccion_postulantes set estado = 'Bloqueado'
         where id = p.id and estado not in ('Bloqueado', 'Descartado');
    end if;
    return true;
end;
$$;

-- Cada vez que una vacante pasa a RECHAZADO ZONAL
create or replace function public.seleccion_busquedas_rechazo_zonal_() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if new.estado = 'RECHAZADO ZONAL' and (tg_op = 'INSERT' or old.estado is distinct from 'RECHAZADO ZONAL') then
        perform seleccion_bloquear_rechazado_zonal_(new);
    end if;
    return new;
end;
$$;

drop trigger if exists seleccion_busquedas_rechazo_zonal on public.seleccion_busquedas;
create trigger seleccion_busquedas_rechazo_zonal
    after insert or update of estado on public.seleccion_busquedas
    for each row when (new.estado = 'RECHAZADO ZONAL')
    execute function public.seleccion_busquedas_rechazo_zonal_();

revoke execute on function public.seleccion_bloquear_rechazado_zonal_(public.seleccion_busquedas, boolean) from public, anon, authenticated;
revoke execute on function public.seleccion_busquedas_rechazo_zonal_() from public, anon, authenticated;

-- Carga inicial: los que hoy están en RECHAZADO ZONAL
select count(*) filter (where public.seleccion_bloquear_rechazado_zonal_(b, true)) as bloqueados_ahora
  from public.seleccion_busquedas b
 where b.estado = 'RECHAZADO ZONAL';
