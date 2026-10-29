-- ══════════════════════════════════════════════════════════════════════════
--  Nómina del local (excedido / debe completar / completo) y fotos del equipo
-- ──────────────────────────────────────────────────────────────────────────
--  estado_nomina:  "ESTADO DE NÓMINA" del local en SOLICITUDES DE PERSONAL.
--                  Lo completa "Importar solicitudes" y se puede cambiar a mano.
--  nomina_detalle: ideal y real del puesto pedido (ej: "PART: ideal 6 · real 5").
--  foto_url:       link https a la foto de cada integrante (se carga en Equipo).
--
--  CÓMO EJECUTAR: Supabase → ats-gastronomico → SQL Editor → pegar todo → Run.
--  Se puede volver a correr sin problema.
-- ══════════════════════════════════════════════════════════════════════════

alter table public.seleccion_busquedas
    add column if not exists estado_nomina  text,
    add column if not exists nomina_detalle text;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'seleccion_busquedas_nomina_chk') then
        alter table public.seleccion_busquedas add constraint seleccion_busquedas_nomina_chk check (
            estado_nomina is null or estado_nomina in ('DEBE COMPLETAR', 'EXCEDIDO', 'COMPLETO'));
    end if;
end $$;

alter table public.seleccion_equipo add column if not exists foto_url text;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'seleccion_equipo_foto_chk') then
        alter table public.seleccion_equipo add constraint seleccion_equipo_foto_chk check (foto_url is null or foto_url ~* '^https://');
    end if;
end $$;
