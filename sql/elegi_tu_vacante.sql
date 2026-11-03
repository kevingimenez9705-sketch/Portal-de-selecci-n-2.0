-- ══════════════════════════════════════════════════════════════════════════
--  "Elegí tu vacante" en el portal (lo que hacían Codigo.gs + Index.html)
-- ──────────────────────────────────────────────────────────────────────────
--  La página pública elegi-tu-vacante.html no lleva código del equipo: solo
--  puede llamar a estas funciones, que validan todo de nuevo acá adentro.
--
--   seleccion_web_datos()                   localidades, sedes y puestos
--   seleccion_web_verificar(datos)          ¿bloqueado? ¿ya ocupa una vacante?
--   seleccion_web_doc_incompleta(datos, docs)  revisa (ya no bloquea)
--   seleccion_web_guardar(datos, extra)     lo suma a la Base de postulantes
--
--  Bloqueado = dijo que NO le interesa la propuesta (queda en la Base, visible,
--  y en BLOQUEADOS con motivo NO INTERESADO EN LA PROPUESTA). Con la
--  documentación incompleta entra En espera, con el aviso en observaciones; los
--  bloqueos viejos por DOCUMENTACIÓN INCOMPLETA ya no frenan a nadie.
--
--  Como en la planilla (SOLO_BASE = true): la persona deja sus datos y su
--  disponibilidad; la vacante la asigna el equipo de Selección.
--  Misma persona = coincide DNI, CUIL, mail o WhatsApp (últimos 10 dígitos).
--
--  La planilla TAREAS GRUPALES sigue igual: el Apps Script SincronizarPortal
--  (apps-script/SincronizarBase.gs) copia cada 10 min
--  lo nuevo a BASE DE DATOS y BLOQUEADOS (seleccion_web_pendientes y
--  seleccion_web_en_planilla) y trae BLOQUEADOS al portal
--  (seleccion_sync_bloqueados).
--
--  CÓMO EJECUTAR: Supabase → ats-gastronomico → SQL Editor → pegar todo → Run.
--  Se puede volver a correr sin problema.
-- ══════════════════════════════════════════════════════════════════════════

-- BLOQUEADOS: los de la planilla (los trae el Apps Script) y los que bloquea la página
create table if not exists public.seleccion_bloqueados (
    id          bigint generated always as identity primary key,
    fecha       timestamptz not null default now(),
    dni         text,
    cuil        text,
    nombre      text,
    apellido    text,
    mail        text,
    tel         text,
    localidad   text,
    motivo      text,
    activo      boolean not null default true,
    origen      text not null default 'PLANILLA' check (origen in ('PLANILLA', 'PORTAL')),
    en_planilla timestamptz   -- PORTAL: cuándo el Apps Script la copió a la pestaña BLOQUEADOS
);

alter table public.seleccion_postulantes
    add column if not exists interesado  text,
    add column if not exists sexo             text,
    add column if not exists domicilio        text,
    add column if not exists domicilio_numero text,
    add column if not exists codigo_postal    text,
    add column if not exists provincia        text,
    add column if not exists pais             text,
    add column if not exists formulario  jsonb,         -- lo que mandó la página, tal cual va a BASE DE DATOS
    add column if not exists en_planilla timestamptz;   -- cuándo el Apps Script copió ese formulario a la planilla

alter table public.seleccion_bloqueados enable row level security;
drop policy if exists "Portal: código del equipo" on public.seleccion_bloqueados;
create policy "Portal: código del equipo" on public.seleccion_bloqueados for all to anon, authenticated
    using ((select public.seleccion_codigo_ok())) with check ((select public.seleccion_codigo_ok()));

-- ── Ayudantes (no se pueden llamar desde afuera) ──

-- "Lanús " → "LANUS"
create or replace function public.seleccion_norm_(v text) returns text
language sql immutable set search_path = public as $$
    select regexp_replace(trim(translate(upper(coalesce(v, '')), 'ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'AAAAAEEEEIIIIOOOOOUUUUNC')), '\s+', ' ', 'g')
$$;

create or replace function public.seleccion_texto_(v text, maximo int) returns text
language sql immutable set search_path = public as $$
    select left(regexp_replace(trim(coalesce(v, '')), '\s+', ' ', 'g'), maximo)
$$;

-- WhatsApp → últimos 10 dígitos (así +54 9 11… y 11… son el mismo número)
create or replace function public.seleccion_clave_tel_(v text) returns text
language sql immutable set search_path = public as $$
    select case when length(d) >= 10 then right(d, 10) else d end
      from (select regexp_replace(coalesce(v, ''), '\D', '', 'g') as d) x
$$;

-- CUIL de persona: 20/23/24/27 y dígito verificador correcto
create or replace function public.seleccion_cuil_valido_(c text) returns boolean
language plpgsql immutable set search_path = public as $$
declare
    pesos int[] := array[5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    suma int := 0;
    dv int;
begin
    if coalesce(c, '') !~ '^\d{11}$' or left(c, 2) not in ('20', '23', '24', '27') then return false; end if;
    for i in 1..10 loop suma := suma + substr(c, i, 1)::int * pesos[i]; end loop;
    dv := 11 - (suma % 11);
    if dv = 11 then dv := 0; end if;
    return dv <> 10 and dv = substr(c, 11, 1)::int;
end;
$$;

-- Opciones del formulario (las mismas que CONFIG de Codigo.gs)
create or replace function public.seleccion_web_opciones_() returns jsonb
language sql immutable set search_path = public as $$
    select jsonb_build_object(
        'zonas',    jsonb_build_array('Sur', 'CABA', 'Oeste', 'Norte', 'Lejanos', 'Otras'),
        'sedes',    jsonb_build_array('Florida', 'Merlo', 'Adrogué'),
        'puestos',  jsonb_build_array('Empleado polivalente part-time', 'Empleado polivalente full-time'),
        'inicios',  jsonb_build_array('Inmediata', 'En 15 días', 'En 1 mes', 'Más adelante'),
        'jornadas', jsonb_build_array('Part-time', 'Full-time'),
        'franjas',  jsonb_build_array('Mañana', 'Tarde', 'Noche'),
        'dias',     jsonb_build_array('Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'),
        'sexos',    jsonb_build_array('Femenino', 'Masculino', 'X'),
        'provincias', jsonb_build_array('Buenos Aires', 'CABA', 'Catamarca', 'Chaco', 'Chubut', 'Córdoba', 'Corrientes',
                      'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja', 'Mendoza', 'Misiones', 'Neuquén', 'Río Negro',
                      'Salta', 'San Juan', 'San Luis', 'Santa Cruz', 'Santa Fe', 'Santiago del Estero', 'Tierra del Fuego', 'Tucumán'))
$$;

-- Datos personales limpios y validados (limpiarPostulante_). Error = mensaje para la persona.
create or replace function public.seleccion_web_persona_(d jsonb) returns jsonb
language plpgsql stable set search_path = public as $$
declare
    v_nombre   text := seleccion_texto_(d->>'nombre', 80);
    v_apellido text := seleccion_texto_(d->>'apellido', 80);
    v_mail     text := lower(seleccion_texto_(d->>'mail', 120));
    v_tel      text := regexp_replace(seleccion_texto_(d->>'tel', 30), '[^\d\s+-]', '', 'g');
    v_tel_e    text := regexp_replace(seleccion_texto_(d->>'telEmergencia', 30), '[^\d\s+-]', '', 'g');
    v_nac      text := seleccion_texto_(d->>'nacionalidad', 40);
    v_dni      text := regexp_replace(coalesce(d->>'dni', ''), '\D', '', 'g');
    v_cuil     text := regexp_replace(coalesce(d->>'cuil', ''), '\D', '', 'g');
    v_loc      text := seleccion_texto_(d->>'localidad', 80);
    -- Lo que lleva la vacante: sexo (como en el DNI: F, M o X) y domicilio
    v_sexo     text := case seleccion_texto_(d->>'sexo', 20) when 'Femenino' then 'F' when 'Masculino' then 'M' when 'X' then 'X'
                            when 'F' then 'F' when 'M' then 'M' else '' end;
    v_dom      text := seleccion_texto_(d->>'domicilio', 80);
    v_num      text := seleccion_texto_(d->>'numero', 10);
    v_cp       text := upper(replace(seleccion_texto_(d->>'codigoPostal', 10), ' ', ''));
    v_prov     text := seleccion_texto_(d->>'provincia', 40);
    v_pais     text := seleccion_texto_(d->>'pais', 40);
    v_fnac     date;
    v_edad     int;
begin
    if jsonb_typeof(d) is distinct from 'object' then raise exception 'Faltan tus datos.'; end if;
    if v_nombre = '' or v_apellido = '' then raise exception 'Completá nombre y apellido.'; end if;
    if length(v_dni) not between 7 and 8 then raise exception 'El DNI no es válido.'; end if;
    if not seleccion_cuil_valido_(v_cuil) then raise exception 'El CUIL no es válido.'; end if;
    if substr(v_cuil, 3, 8) <> right('0' || v_dni, 8) then raise exception 'El CUIL no coincide con el DNI.'; end if;
    begin
        if coalesce(d->>'fechaNac', '') ~ '^\d{4}-\d{2}-\d{2}$' then v_fnac := (d->>'fechaNac')::date; end if;
    exception when others then v_fnac := null;
    end;
    if v_fnac is null then raise exception 'La fecha de nacimiento no es válida.'; end if;
    v_edad := extract(year from age((now() at time zone 'America/Argentina/Buenos_Aires')::date, v_fnac));
    if v_edad < 16 or v_edad > 99 then raise exception 'Revisá la fecha de nacimiento.'; end if;
    if v_nac = '' then raise exception 'Completá tu nacionalidad.'; end if;
    if v_mail !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'El mail no es válido.'; end if;
    if length(regexp_replace(v_tel, '\D', '', 'g')) < 8 then raise exception 'El número de WhatsApp no es válido.'; end if;
    if length(regexp_replace(v_tel_e, '\D', '', 'g')) < 8 then raise exception 'El teléfono de emergencia no es válido.'; end if;
    if regexp_replace(v_tel_e, '\D', '', 'g') = regexp_replace(v_tel, '\D', '', 'g') then
        raise exception 'El teléfono de emergencia tiene que ser de otra persona.';
    end if;
    if v_loc = '' then raise exception 'Elegí dónde vivís.'; end if;
    if v_sexo = '' then raise exception 'Elegí el sexo que figura en tu DNI.'; end if;
    if v_dom = '' then raise exception 'Completá la calle de tu domicilio.'; end if;
    if v_num = '' then raise exception 'Completá el número de tu domicilio.'; end if;
    if v_cp !~ '^[A-Z]?\d{4}[A-Z]{0,3}$' then raise exception 'Revisá el código postal (4 números, o el CPA completo).'; end if;
    if not (seleccion_web_opciones_()->'provincias' ? v_prov) then raise exception 'Elegí tu provincia.'; end if;
    if v_pais = '' then raise exception 'Completá tu país.'; end if;

    return jsonb_build_object(
        'nombre', v_nombre, 'apellido', v_apellido, 'mail', v_mail, 'tel', v_tel, 'tel_emergencia', v_tel_e,
        'fecha_nac', v_fnac, 'nacionalidad', v_nac, 'dni', v_dni, 'cuil', v_cuil, 'localidad', v_loc,
        'sexo', v_sexo, 'domicilio', v_dom, 'domicilio_numero', v_num, 'codigo_postal', v_cp, 'provincia', v_prov, 'pais', v_pais,
        -- claves para reconocer a la misma persona
        'k_dni', ltrim(v_dni, '0'),
        'k_tel', case when length(seleccion_clave_tel_(v_tel)) >= 8 then seleccion_clave_tel_(v_tel) else '' end);
end;
$$;

-- Motivo del bloqueo ACTIVO de la persona ('' si no tiene motivo) o null si no está bloqueada.
-- Los bloqueos por documentación incompleta ya no cuentan.
create or replace function public.seleccion_web_bloqueo_(p jsonb) returns text
language sql stable set search_path = public as $$
    select coalesce(b.motivo, '') from seleccion_bloqueados b
     where b.activo
       and seleccion_norm_(b.motivo) not like '%DOCUMENTACION INCOMPLETA%'
       and ((p->>'k_dni' <> '' and ltrim(regexp_replace(coalesce(b.dni, ''), '\D', '', 'g'), '0') = p->>'k_dni')
         or regexp_replace(coalesce(b.cuil, ''), '\D', '', 'g') = p->>'cuil'
         or lower(trim(coalesce(b.mail, ''))) = p->>'mail'
         or (p->>'k_tel' <> '' and seleccion_clave_tel_(b.tel) = p->>'k_tel'))
     order by b.id limit 1
$$;

-- La persona en la Base de postulantes (id) o null
create or replace function public.seleccion_web_postulante_id_(p jsonb) returns bigint
language sql stable set search_path = public as $$
    select t.id from seleccion_postulantes t
     where (p->>'k_dni' <> '' and ltrim(regexp_replace(coalesce(t.dni, ''), '\D', '', 'g'), '0') = p->>'k_dni')
        or regexp_replace(coalesce(t.cuil, ''), '\D', '', 'g') = p->>'cuil'
        or lower(trim(coalesce(t.email, ''))) = p->>'mail'
        or (p->>'k_tel' <> '' and seleccion_clave_tel_(t.telefono) = p->>'k_tel')
     order by (p->>'k_dni' <> '' and ltrim(regexp_replace(coalesce(t.dni, ''), '\D', '', 'g'), '0') = p->>'k_dni') desc, t.id
     limit 1
$$;

-- Vacante abierta que la persona ya ocupa (lo que se le muestra) o null. Una persona = una vacante.
create or replace function public.seleccion_web_postulacion_(p jsonb) returns jsonb
language sql stable set search_path = public as $$
    select jsonb_build_object(
               'marca', b.marca,
               'local', initcap(lower(coalesce(b.local, ''))),
               'entrenamiento', initcap(lower(coalesce(b.local_entrenamiento, ''))),
               'puesto', initcap(lower(coalesce(b.puesto, ''))),
               'jornada', initcap(lower(coalesce(b.jornada, ''))))
      from seleccion_busquedas b
     where coalesce(trim(b.nombre), '') <> ''
       and b.status in ('Proceso', 'Pausada')
       and coalesce(b.estado, '') <> 'RECHAZADO ZONAL'
       and ((p->>'k_dni' <> '' and ltrim(regexp_replace(coalesce(b.dni, ''), '\D', '', 'g'), '0') = p->>'k_dni')
         or regexp_replace(coalesce(b.cuil, ''), '\D', '', 'g') = p->>'cuil'
         or lower(trim(coalesce(b.email, ''))) = p->>'mail'
         or (p->>'k_tel' <> '' and seleccion_clave_tel_(b.tel) = p->>'k_tel'))
     order by b.id limit 1
$$;

-- Respuestas de documentación a partir del MOTIVO del bloqueo (null si es por otro motivo)
create or replace function public.seleccion_web_docs_(motivo text) returns jsonb
language sql immutable set search_path = public as $$
    select case when m like '%DOCUMENTACION INCOMPLETA%' and (m like '%MANIPULACION%' or m like '%ANTECEDENTES%') then
               jsonb_build_object('manipulacion', case when m like '%MANIPULACION%' then 'No' else 'Sí' end,
                                  'antecedentes', case when m like '%ANTECEDENTES%' then 'No' else 'Sí' end)
           end
      from (select seleccion_norm_(motivo) as m) x
$$;

-- "falta Curso de Manipulación y Antecedentes Penales" (vacío si tiene todo)
create or replace function public.seleccion_web_faltan_(manipulacion text, antecedentes text) returns text
language sql immutable set search_path = public as $$
    select array_to_string(array_remove(array[
               case when manipulacion = 'No' then 'Curso de Manipulación' end,
               case when antecedentes = 'No' then 'Antecedentes Penales' end], null), ' y ')
$$;

-- Zona de la localidad: ZONAS, después LOCALES, si no "Otras" (zonaDe_)
create or replace function public.seleccion_web_zona_(p_localidad text) returns text
language sql stable set search_path = public as $$
    select coalesce(
        (select nullif(trim(z.zona), '') from seleccion_zonas z where seleccion_norm_(z.localidad) = seleccion_norm_(p_localidad) limit 1),
        (select nullif(trim(l.zona), '') from seleccion_locales l where seleccion_norm_(l.localidad) = seleccion_norm_(p_localidad) order by l.id limit 1),
        'Otras')
$$;

-- Freno ante envíos masivos: la página no deja pasar más de 150 altas cada 10 minutos
create or replace function public.seleccion_web_freno_() returns void
language plpgsql stable set search_path = public as $$
begin
    if (select count(*) from seleccion_postulantes where creado_por = 'Elegí tu vacante' and creado > now() - interval '10 minutes')
     + (select count(*) from seleccion_bloqueados where origen = 'PORTAL' and fecha > now() - interval '10 minutes') > 150 then
        raise exception 'Estamos recibiendo muchas postulaciones. Probá de nuevo en unos minutos.';
    end if;
end;
$$;

-- ── Lo que llama la página ──

create or replace function public.seleccion_web_datos() returns jsonb
language sql stable security definer set search_path = public as $$
    select seleccion_web_opciones_() || jsonb_build_object(
        -- [localidad, zona] de los locales y [localidad, zona, cercanas] de ZONAS: la página arma la lista igual que mapaLocalidades_
        'locales', coalesce((select jsonb_agg(jsonb_build_array(l.localidad, coalesce(nullif(trim(l.zona), ''), 'Otras')) order by l.id)
                               from seleccion_locales l where l.activo and coalesce(trim(l.localidad), '') <> ''), '[]'::jsonb),
        'zonasLocalidad', coalesce((select jsonb_agg(jsonb_build_array(z.localidad, z.zona, to_jsonb(z.cercanas)) order by z.localidad)
                                      from seleccion_zonas z), '[]'::jsonb))
$$;

-- Paso 1: ¿está bloqueada? ¿ya ocupa una vacante?
create or replace function public.seleccion_web_verificar(datos jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
    p jsonb := seleccion_web_persona_(datos);
begin
    if seleccion_web_bloqueo_(p) is not null then
        return jsonb_build_object('bloqueado', true, 'pendiente', false, 'docs', null, 'postulado', null);
    end if;
    return jsonb_build_object('bloqueado', false, 'pendiente', false, 'docs', null, 'postulado', seleccion_web_postulacion_(p));
end;
$$;

-- Documentación incompleta: ya no bloquea (entra En espera con el formulario). Queda por si una pestaña vieja la llama.
create or replace function public.seleccion_web_doc_incompleta(datos jsonb, docs jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
    p jsonb := seleccion_web_persona_(datos);
    v_manip text := case when docs->>'manipulacion' in ('Sí', 'No') then docs->>'manipulacion' end;
    v_antec text := case when docs->>'antecedentes' in ('Sí', 'No') then docs->>'antecedentes' end;
    v_previa jsonb;
begin
    if v_manip is null or v_antec is null then raise exception 'Respondé las preguntas de documentación.'; end if;
    if v_manip = 'Sí' and v_antec = 'Sí' then raise exception 'La documentación está completa.'; end if;
    v_previa := seleccion_web_postulacion_(p);
    if v_previa is not null then return jsonb_build_object('ok', false, 'motivo', 'yaPostulado', 'vacante', v_previa); end if;
    return jsonb_build_object('ok', true, 'pendiente', true);
end;
$$;

-- Formulario completo → Base de postulantes (guardarEnBase). Todo obligatorio: nunca se guarda con S/D.
create or replace function public.seleccion_web_guardar(datos jsonb, extra jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
    p jsonb := seleccion_web_persona_(datos);
    o jsonb := seleccion_web_opciones_();
    e jsonb := coalesce(extra, '{}'::jsonb);
    v_manip text := case when e->>'manipulacion' in ('Sí', 'No') then e->>'manipulacion' end;
    v_antec text := case when e->>'antecedentes' in ('Sí', 'No') then e->>'antecedentes' end;
    v_interesado text := case when e->>'interesado' in ('Sí', 'No') then e->>'interesado' end;
    v_puesto text := case when o->'puestos' ? coalesce(e->>'puesto', '') then e->>'puesto' end;
    v_sede text := case when o->'sedes' ? coalesce(e->>'sede', '') then e->>'sede' end;
    v_inicio text := seleccion_texto_(e->>'inicio', 30);
    v_coment text := seleccion_texto_(e->>'comentarios', 500);
    v_dias text[]; v_franjas text[]; v_jornadas text[];
    v_motivo text; v_docs jsonb; v_previa jsonb; v_faltan text; v_motivo_doc text;
    v_horario text; v_observ text; v_categoria text; v_formulario jsonb; v_id bigint; v_estado text;
begin
    -- Días, horarios y jornada: solo valores de la lista, en el orden de la lista
    select coalesce(array_agg(x order by n), '{}') into v_dias from jsonb_array_elements_text(o->'dias') with ordinality as t(x, n)
     where jsonb_typeof(e->'dias') = 'array' and e->'dias' ? x;
    select coalesce(array_agg(x order by n), '{}') into v_franjas from jsonb_array_elements_text(o->'franjas') with ordinality as t(x, n)
     where jsonb_typeof(e->'horario') = 'array' and e->'horario' ? x;
    select coalesce(array_agg(x order by n), '{}') into v_jornadas from jsonb_array_elements_text(o->'jornadas') with ordinality as t(x, n)
     where jsonb_typeof(e->'jornada') = 'array' and e->'jornada' ? x;

    perform pg_advisory_xact_lock(hashtext('seleccion_web'));

    v_motivo := seleccion_web_bloqueo_(p);
    if v_motivo is not null then return jsonb_build_object('ok', false, 'motivo', 'bloqueado'); end if;
    -- Quien ya ocupa una vacante no se suma además a la base
    v_previa := seleccion_web_postulacion_(p);
    if v_previa is not null then return jsonb_build_object('ok', false, 'motivo', 'yaPostulado', 'vacante', v_previa); end if;

    if v_puesto is null then raise exception 'Elegí un puesto.'; end if;
    if v_sede is null then raise exception 'Elegí la sede de la entrevista.'; end if;
    if v_inicio = '' then raise exception 'Elegí desde cuándo podés empezar.'; end if;
    if cardinality(v_dias) = 0 or cardinality(v_franjas) = 0 or cardinality(v_jornadas) = 0 then
        raise exception 'Completá tu disponibilidad.';
    end if;
    if v_manip is null or v_antec is null or v_interesado is null then raise exception 'Respondé las preguntas de Sí/No.'; end if;
    if v_coment = '' then raise exception 'Completá los comentarios.'; end if;
    perform seleccion_web_freno_();

    v_faltan := seleccion_web_faltan_(v_manip, v_antec);
    v_motivo_doc := case when v_faltan <> '' then 'DOCUMENTACIÓN INCOMPLETA: falta ' || v_faltan end;
    -- Igual que en BASE DE DATOS: "Lun, Mar · Mañana, Tarde · Part-time / Full-time" y "Inicio: … · comentarios"
    v_horario := array_to_string(v_dias, ', ') || ' · ' || array_to_string(v_franjas, ', ') || ' · ' || array_to_string(v_jornadas, ' / ');
    v_observ := array_to_string(array_remove(array[v_motivo_doc, 'Inicio: ' || v_inicio, v_coment], null), ' · ');
    v_categoria := case
        when 'Mañana' = any(v_franjas) and 'Noche' = any(v_franjas) then 'Cualquiera'
        when 'Mañana' = any(v_franjas) and 'Tarde' = any(v_franjas) then 'Mañana y tarde'
        when 'Tarde' = any(v_franjas) and 'Noche' = any(v_franjas) then 'Tarde y noche'
        else v_franjas[1] end;
    v_formulario := jsonb_build_object('fecha', now(), 'horario', v_horario, 'observaciones', v_observ, 'inicio', v_inicio,
                                       'comentarios', v_coment, 'dias', to_jsonb(v_dias), 'franjas', to_jsonb(v_franjas),
                                       'jornadas', to_jsonb(v_jornadas));
    v_estado := case when v_interesado = 'No' then 'Bloqueado' else 'En espera' end;

    v_id := seleccion_web_postulante_id_(p);
    if v_id is null then
        insert into seleccion_postulantes (nombre, apellido, dni, cuil, telefono, email, fecha_nacimiento, nacionalidad, tel_emergencia,
            zona, localidad, sede_entrevista, puesto_interes, horario, curso_manipulacion, antecedentes, interesado,
            observaciones, estado, origen, creado_por, formulario, en_planilla,
            sexo, domicilio, domicilio_numero, codigo_postal, provincia, pais)
        values (p->>'nombre', p->>'apellido', p->>'dni', p->>'cuil', p->>'tel', p->>'mail', (p->>'fecha_nac')::date, p->>'nacionalidad',
            p->>'tel_emergencia', seleccion_web_zona_(p->>'localidad'), p->>'localidad', v_sede, v_puesto, v_categoria, v_manip, v_antec,
            v_interesado, v_observ || ' · Disponibilidad: ' || v_horario, v_estado,
            'ELEGÍ TU VACANTE', 'Elegí tu vacante', v_formulario, null,
            p->>'sexo', p->>'domicilio', p->>'domicilio_numero', p->>'codigo_postal', p->>'provincia', p->>'pais');
    else
        -- Ya estaba en la base: se actualiza su disponibilidad (en la planilla suma una fila nueva, como antes).
        -- Nombre, contacto y estado que cargó el equipo no se pisan; solo se completan si estaban vacíos.
        update seleccion_postulantes t set
            nombre = coalesce(nullif(t.nombre, ''), p->>'nombre'), apellido = coalesce(nullif(t.apellido, ''), p->>'apellido'),
            dni = coalesce(nullif(t.dni, ''), p->>'dni'), cuil = coalesce(nullif(t.cuil, ''), p->>'cuil'),
            telefono = coalesce(nullif(t.telefono, ''), p->>'tel'), email = coalesce(nullif(t.email, ''), p->>'mail'),
            fecha_nacimiento = coalesce(t.fecha_nacimiento, (p->>'fecha_nac')::date),
            nacionalidad = coalesce(nullif(t.nacionalidad, ''), p->>'nacionalidad'),
            tel_emergencia = coalesce(nullif(t.tel_emergencia, ''), p->>'tel_emergencia'),
            localidad = p->>'localidad', zona = seleccion_web_zona_(p->>'localidad'),
            sede_entrevista = v_sede, puesto_interes = v_puesto, horario = v_categoria,
            curso_manipulacion = v_manip, antecedentes = v_antec, interesado = v_interesado,
            observaciones = v_observ || ' · Disponibilidad: ' || v_horario,
            estado = case when v_interesado = 'No' and t.estado is distinct from 'Descartado' then 'Bloqueado' else t.estado end,
            sexo = p->>'sexo', domicilio = p->>'domicilio', domicilio_numero = p->>'domicilio_numero',
            codigo_postal = p->>'codigo_postal', provincia = p->>'provincia', pais = p->>'pais',
            formulario = v_formulario, en_planilla = null
         where t.id = v_id;
    end if;

    -- No le interesa la propuesta: queda bloqueado (también en la pestaña BLOQUEADOS)
    if v_interesado = 'No' then
        insert into seleccion_bloqueados (dni, cuil, nombre, apellido, mail, tel, localidad, motivo, activo, origen)
        values (p->>'dni', p->>'cuil', p->>'nombre', p->>'apellido', p->>'mail', p->>'tel', p->>'localidad',
                'NO INTERESADO EN LA PROPUESTA', true, 'PORTAL');
    end if;
    return jsonb_build_object('ok', true);
end;
$$;

-- ── Lo que llama el Apps Script de la planilla (código del equipo) ──

-- Altas de la página que todavía no están en la planilla, con lo que va en cada columna
create or replace function public.seleccion_web_pendientes() returns jsonb
language plpgsql stable security invoker set search_path = public as $$
begin
    if not (seleccion_codigo_ok() or current_user = 'service_role') then
        raise exception 'Código del equipo inválido' using errcode = '42501';
    end if;
    return jsonb_build_object(
        'base', coalesce((select jsonb_agg(jsonb_build_object(
                    'id', t.id, 'nombre', t.nombre, 'apellido', t.apellido, 'mail', t.email, 'tel', t.telefono,
                    'fecha_nacimiento', to_char(t.fecha_nacimiento, 'FMDD/FMMM/YYYY'), 'zona', t.zona, 'localidad', t.localidad,
                    'sede', t.sede_entrevista, 'puesto', t.puesto_interes, 'horario', t.formulario->>'horario',
                    'observaciones', t.formulario->>'observaciones', 'manipulacion', t.curso_manipulacion,
                    'antecedentes', t.antecedentes, 'interesado', t.interesado, 'dni', t.dni,
                    'cuil', case when t.cuil ~ '^\d{11}$' then substr(t.cuil, 1, 2) || '-' || substr(t.cuil, 3, 8) || '-' || substr(t.cuil, 11) else t.cuil end,
                    'nacionalidad', t.nacionalidad, 'tel_emergencia', t.tel_emergencia,
                    'sexo', t.sexo, 'domicilio', t.domicilio, 'domicilio_numero', t.domicilio_numero,
                    'codigo_postal', t.codigo_postal, 'provincia', t.provincia, 'pais', t.pais) order by t.id)
                  from seleccion_postulantes t where t.formulario is not null and t.en_planilla is null), '[]'::jsonb),
        'bloqueados', coalesce((select jsonb_agg(jsonb_build_object(
                    'id', b.id, 'fecha', to_char(b.fecha at time zone 'America/Argentina/Buenos_Aires', 'FMDD/FMMM/YYYY HH24:MI:SS'),
                    'dni', b.dni,
                    'cuil', case when b.cuil ~ '^\d{11}$' then substr(b.cuil, 1, 2) || '-' || substr(b.cuil, 3, 8) || '-' || substr(b.cuil, 11) else b.cuil end,
                    'nombre', b.nombre, 'apellido', b.apellido, 'mail', b.mail, 'tel', b.tel, 'localidad', b.localidad,
                    'motivo', b.motivo, 'activo', case when b.activo then 'SÍ' else 'NO' end) order by b.id)
                  from seleccion_bloqueados b where b.origen = 'PORTAL' and b.en_planilla is null), '[]'::jsonb));
end;
$$;

-- El Apps Script ya copió estas filas a la planilla
create or replace function public.seleccion_web_en_planilla(tabla text, ids bigint[]) returns int
language plpgsql volatile security invoker set search_path = public as $$
declare n int;
begin
    if not (seleccion_codigo_ok() or current_user = 'service_role') then
        raise exception 'Código del equipo inválido' using errcode = '42501';
    end if;
    if tabla = 'base' then
        update seleccion_postulantes set en_planilla = now() where id = any(ids) and en_planilla is null;
    elsif tabla = 'bloqueados' then
        update seleccion_bloqueados set en_planilla = now() where id = any(ids) and en_planilla is null;
    else
        raise exception 'Tabla desconocida: %', tabla;
    end if;
    get diagnostics n = row_count;
    return n;
end;
$$;

-- Pestaña BLOQUEADOS → portal. La planilla manda: se reemplaza todo lo que vino de ella.
-- Lo bloqueado desde la página se borra 30 min después de copiarlo (para entonces ya vuelve como fila de la planilla).
create or replace function public.seleccion_sync_bloqueados(filas jsonb) returns jsonb
language plpgsql volatile security invoker set search_path = public as $$
declare n int;
begin
    if not (seleccion_codigo_ok() or current_user = 'service_role') then
        raise exception 'Código del equipo inválido' using errcode = '42501';
    end if;
    if jsonb_typeof(filas) is distinct from 'array' then
        raise exception 'Se esperaba una lista de filas';
    end if;

    delete from seleccion_bloqueados
     where origen = 'PLANILLA' or (origen = 'PORTAL' and en_planilla < now() - interval '30 minutes');
    insert into seleccion_bloqueados (fecha, dni, cuil, nombre, apellido, mail, tel, localidad, motivo, activo, origen)
    select coalesce(case when r.fecha ~ '^\d{4}-\d{2}-\d{2}T' then r.fecha::timestamptz end, now()),
           nullif(regexp_replace(coalesce(r.dni, ''), '\D', '', 'g'), ''),
           nullif(regexp_replace(coalesce(r.cuil, ''), '\D', '', 'g'), ''),
           nullif(trim(r.nombre), ''), nullif(trim(r.apellido), ''), nullif(lower(trim(r.mail)), ''),
           nullif(trim(r.tel), ''), nullif(trim(r.localidad), ''), nullif(trim(r.motivo), ''),
           upper(trim(coalesce(r.activo, ''))) <> 'NO', 'PLANILLA'
      from jsonb_to_recordset(filas) as r(fecha text, dni text, cuil text, nombre text, apellido text, mail text, tel text,
                                          localidad text, motivo text, activo text)
     where coalesce(r.dni, '') || coalesce(r.cuil, '') || coalesce(r.mail, '') || coalesce(r.tel, '') ~ '\S';
    get diagnostics n = row_count;
    return jsonb_build_object('bloqueados', n);
end;
$$;

-- ── Permisos ──
do $$
declare f text;
begin
    -- Ayudantes: nadie de afuera
    foreach f in array array[
        'seleccion_norm_(text)', 'seleccion_texto_(text, int)', 'seleccion_clave_tel_(text)', 'seleccion_cuil_valido_(text)',
        'seleccion_web_opciones_()', 'seleccion_web_persona_(jsonb)', 'seleccion_web_bloqueo_(jsonb)',
        'seleccion_web_postulante_id_(jsonb)', 'seleccion_web_postulacion_(jsonb)', 'seleccion_web_docs_(text)',
        'seleccion_web_faltan_(text, text)', 'seleccion_web_zona_(text)', 'seleccion_web_freno_()'] loop
        execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    end loop;
    -- La página pública
    foreach f in array array['seleccion_web_datos()', 'seleccion_web_verificar(jsonb)',
                             'seleccion_web_doc_incompleta(jsonb, jsonb)', 'seleccion_web_guardar(jsonb, jsonb)'] loop
        execute format('revoke execute on function public.%s from public', f);
        execute format('grant execute on function public.%s to anon, authenticated', f);
    end loop;
    -- El Apps Script y el portal (código del equipo); service_role por si vuelve a usarse n8n
    foreach f in array array['seleccion_web_pendientes()', 'seleccion_web_en_planilla(text, bigint[])', 'seleccion_sync_bloqueados(jsonb)'] loop
        execute format('revoke execute on function public.%s from public', f);
        execute format('grant execute on function public.%s to anon, authenticated, service_role', f);
    end loop;
end $$;
