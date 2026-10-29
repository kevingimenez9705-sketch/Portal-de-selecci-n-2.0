-- ══════════════════════════════════════════════════════════════════════════
--  Vacantes "tal cual" la hoja Solicitudes de TAREAS GRUPALES
-- ──────────────────────────────────────────────────────────────────────────
--  Cada vacante (seleccion_busquedas) pasa a tener las mismas columnas que una
--  fila de "Solicitudes Sabores / Extremas". Al crearla solo se carga la
--  solicitud (selector, regional, zonal, local, puesto…); la fecha y hora de
--  citación, el ESTADO, el primer día y los datos de la persona se van
--  completando a medida que avanza el proceso.
--
--  PRIMER DIA usa la columna "ingreso" que ya existía.
--  CÓMO EJECUTAR: Supabase → ats-gastronomico → SQL Editor → pegar todo → Run.
--  Se puede volver a correr sin problema.
-- ══════════════════════════════════════════════════════════════════════════

alter table public.seleccion_busquedas
    add column if not exists fecha_citacion   date,      -- FECHA
    add column if not exists hora_citacion    text,      -- HORA
    add column if not exists estado           text,      -- ESTADO (lista de la planilla)
    add column if not exists fecha_estado     date,      -- cuándo cambió el ESTADO por última vez (alerta 72hs del zonal)
    add column if not exists postulante_id    bigint references public.seleccion_postulantes(id) on delete set null,
    add column if not exists nombre           text,
    add column if not exists apellido         text,
    add column if not exists email            text,
    add column if not exists tel              text,
    add column if not exists tel_emergencia   text,
    add column if not exists fecha_nacimiento date,
    add column if not exists nacionalidad     text,
    add column if not exists cuil             text,
    add column if not exists dni              text,
    add column if not exists sexo             text,
    add column if not exists domicilio        text,
    add column if not exists domicilio_numero text,      -- NUMERO (del domicilio)
    add column if not exists codigo_postal    text,
    add column if not exists localidad        text,
    add column if not exists provincia        text,
    add column if not exists pais             text,
    add column if not exists altas_rrhh       text,
    add column if not exists registro_datos   text,
    add column if not exists id_postulante    text;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'seleccion_busquedas_estado_chk') then
        alter table public.seleccion_busquedas add constraint seleccion_busquedas_estado_chk check (
            estado is null or estado in ('ENVIADO A ZONAL', 'APROBADO ZONAL', 'RECHAZADO ZONAL', 'CITADO', 'HUELLA', 'COMUNICADO'));
    end if;
end $$;

create index if not exists seleccion_busquedas_postulante_idx on public.seleccion_busquedas (postulante_id);
