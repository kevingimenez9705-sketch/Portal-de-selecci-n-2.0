-- ══════════════════════════════════════════════════════════════════════════
--  Mapa de equipos, limpieza semanal y puestos de Elegí tu vacante
-- ──────────────────────────────────────────────────────────────────────────
--  - seleccion_locales: selector, regional y zonal de cada local (Mapa de
--    equipos) y el ESTADO DE NÓMINA del último import. Al importar las
--    solicitudes, cada vacante toma sola el selector asignado a su local.
--  - seleccion_busquedas.archivada: "Limpiar semana" saca las vacantes del
--    tablero sin borrarlas: siguen contando en Estadísticas.
--  - Elegí tu vacante: el puesto es Empleado polivalente part-time o full-time.
--
--  CÓMO EJECUTAR: Supabase → ats-gastronomico → SQL Editor → pegar todo → Run.
--  Se puede volver a correr sin problema.
-- ══════════════════════════════════════════════════════════════════════════

alter table public.seleccion_locales
    add column if not exists selector      text,
    add column if not exists regional      text,
    add column if not exists zonal         text,
    add column if not exists estado_nomina text;

alter table public.seleccion_busquedas
    add column if not exists archivada timestamptz;   -- "Limpiar semana": fuera del tablero, sigue en estadísticas

-- Primera carga del mapa: lo que dice la última vacante de cada local (solo donde está vacío)
update public.seleccion_locales l set
    selector      = coalesce(l.selector, u.selector),
    regional      = coalesce(l.regional, u.regional),
    zonal         = coalesce(l.zonal, u.zonal),
    estado_nomina = coalesce(l.estado_nomina, u.estado_nomina)
  from (select distinct on (public.seleccion_norm_(b.local), b.marca)
               public.seleccion_norm_(b.local) as clave, b.marca,
               nullif(trim(b.selector), '') as selector, nullif(trim(b.regional), '') as regional,
               nullif(trim(b.zonal), '') as zonal, b.estado_nomina
          from public.seleccion_busquedas b
         where coalesce(trim(b.local), '') <> ''
         order by public.seleccion_norm_(b.local), b.marca, b.id desc) u
 where public.seleccion_norm_(l.local) = u.clave and l.marca = u.marca
   and (l.selector is null or l.regional is null or l.zonal is null or l.estado_nomina is null);

-- Elegí tu vacante: solo Empleado polivalente (part-time o full-time); encargado o gerente se comenta en la entrevista
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
