-- Cumplimiento cargado en la planilla (informe_anual, hoja "cumplimiento"): ene-oct 2026 por semana
-- y semanas que todavía no están en el portal (p. ej. la del 23/11). Solo totales, sin datos personales.
create table if not exists public.cumplimiento_planilla (
  id bigserial primary key,
  mes text not null,              -- AAAA-MM
  semana date,                    -- lunes de la semana; null = solo se sabe el mes
  semana_txt text,                -- "Primer semana", ... (como en la planilla)
  selector text not null,
  enviados int not null default 0,
  total int not null default 0,
  creado timestamptz not null default now()
);
alter table public.cumplimiento_planilla enable row level security;
drop policy if exists cumplimiento_planilla_leer on public.cumplimiento_planilla;
create policy cumplimiento_planilla_leer on public.cumplimiento_planilla for select to anon, authenticated using (true);
grant select on public.cumplimiento_planilla to anon, authenticated;

insert into public.cumplimiento_planilla (mes, semana, semana_txt, selector, enviados, total) values
('2026-01',null,'Primer semana','Emiliano',39,112),
('2026-01',null,'Primer semana','Agustina',13,13),
('2026-01',null,'Primer semana','Agustin',47,123),
('2026-01',null,'Primer semana','Facundo',36,45),
('2026-01',null,'Segunda semana','Emiliano',98,118),
('2026-01',null,'Segunda semana','Agustina',28,30),
('2026-01',null,'Segunda semana','Agustin',81,99),
('2026-01',null,'Segunda semana','Facundo',51,57),
('2026-01',null,'Tercer semana','Agustina',61,66),
('2026-01',null,'Tercer semana','Agustin',45,50),
('2026-01',null,'Tercer semana','Facundo',39,47),
('2026-02',null,'Primer semana','Emiliano',90,112),
('2026-02',null,'Primer semana','Facundo',90,112),
('2026-02',null,'Primer semana','Agustin',29,30),
('2026-02',null,'Primer semana','Agustina',29,30),
('2026-02',null,'Segunda semana','Emiliano',78,101),
('2026-02',null,'Segunda semana','Facundo',43,46),
('2026-02',null,'Segunda semana','Agustin',75,76),
('2026-02',null,'Segunda semana','Agustina',50,51),
('2026-02',null,'Tercer semana','Emiliano',25,25),
('2026-02',null,'Tercer semana','Agustina',12,13),
('2026-02',null,'Tercer semana','Agustin',73,75),
('2026-02',null,'Tercer semana','Facundo',35,36),
('2026-02',null,'Cuarta semana','Agustina',39,42),
('2026-02',null,'Cuarta semana','Agustin',83,102),
('2026-02',null,'Cuarta semana','Facundo',41,47),
('2026-03',null,'Primer semana','Emiliano',36,45),
('2026-03',null,'Primer semana','Agustina',11,11),
('2026-03',null,'Primer semana','Agustin',56,73),
('2026-03',null,'Primer semana','Facundo',55,63),
('2026-03',null,'Segunda semana','Emiliano',65,87),
('2026-03',null,'Segunda semana','Agustin',91,113),
('2026-03',null,'Tercer semana','Emiliano',65,101),
('2026-03',null,'Tercer semana','Agustina',22,24),
('2026-03',null,'Tercer semana','Agustin',75,91),
('2026-03',null,'Tercer semana','Facundo',8,10),
('2026-03',null,'Cuarta semana','Emiliano',22,59),
('2026-03',null,'Cuarta semana','Agustina',55,56),
('2026-03',null,'Cuarta semana','Agustin',51,73),
('2026-03',null,'Cuarta semana','Facundo',52,62),
('2026-04',null,'Primer semana','Agustina',66,79),
('2026-04',null,'Primer semana','Agustin',86,101),
('2026-04',null,'Primer semana','Facundo',94,110),
('2026-04',null,'Segunda semana','Agustina',26,26),
('2026-04',null,'Segunda semana','Agustin',42,52),
('2026-04',null,'Segunda semana','Facundo',44,62),
('2026-04',null,'Segunda semana','Mariano',45,51),
('2026-04',null,'Tercer semana','Agustina',46,53),
('2026-04',null,'Tercer semana','Agustin',44,51),
('2026-04',null,'Tercer semana','Mariano',41,45),
('2026-05',null,'Primer semana','Agustina',67,81),
('2026-05',null,'Primer semana','Agustin',60,73),
('2026-05',null,'Primer semana','Mariano',60,70),
('2026-05',null,'Segunda semana','Agustin',144,161),
('2026-05',null,'Segunda semana','Agustina',146,152),
('2026-05',null,'Tercer semana','Agustin',88,104),
('2026-05',null,'Tercer semana','Agustina',96,110),
('2026-06',null,'Primer semana','Mariano',72,102),
('2026-06',null,'Primer semana','Agustin',41,50),
('2026-06',null,'Primer semana','Agustina',53,53),
('2026-06',null,'Segunda semana','Agustin',63,93),
('2026-06',null,'Segunda semana','Agustina',70,88),
('2026-06',null,'Segunda semana','Mariano',64,79),
('2026-06',null,'Tercer semana','Mariano',20,42),
('2026-06',null,'Tercer semana','Agustina',25,40),
('2026-06',null,'Tercer semana','Agustin',40,53),
('2026-07',null,'Segunda semana','Agustin',129,174),
('2026-07',null,'Segunda semana','Agustina',81,99),
('2026-07',null,'Primer semana','Agustin',30,35),
('2026-07',null,'Primer semana','Agustina',42,42),
('2026-08',null,'Segunda semana','Agustina',32,40),
('2026-08',null,'Segunda semana','Agustin',30,36),
('2026-08',null,'Segunda semana','Gustavo',15,18),
('2026-08',null,'Segunda semana','Rafael',8,9),
('2026-08',null,'Primer semana','Agustina',48,63),
('2026-08',null,'Primer semana','Gustavo',30,37),
('2026-08',null,'Primer semana','Rafael',19,21),
('2026-08',null,'Tercer semana','Emiliano',81,129),
('2026-08',null,'Tercer semana','Agustin',123,166),
('2026-09',null,'Segunda semana','Gustavo',32,53),
('2026-09',null,'Segunda semana','Agustin',10,15),
('2026-09',null,'Segunda semana','Rafael',18,20),
('2026-09',null,'Segunda semana','Agustina',16,18),
('2026-09',null,'Tercer semana','Gustavo',27,33),
('2026-09',null,'Tercer semana','Rafael',21,23),
('2026-09',null,'Tercer semana','Agustin',4,4),
('2026-09',null,'Tercer semana','Agustina',28,28),
('2026-09',null,'Primer semana','Gustavo',24,31),
('2026-09',null,'Primer semana','Rafael',19,20),
('2026-09',null,'Primer semana','Agustin',24,31),
('2026-09',null,'Primer semana','Agustina',18,18),
('2026-10',null,'Primer semana','Rafael',26,32),
('2026-10',null,'Primer semana','Gustavo',30,35),
('2026-10',null,'Primer semana','Agustina',35,35),
('2026-10',null,'Primer semana','Albana',5,5),
('2026-10',null,'Segunda semana','Albana',35,42),
('2026-10',null,'Segunda semana','Gustavo',28,29),
('2026-10',null,'Segunda semana','Agustina',7,10),
('2026-10',null,'Segunda semana','Rafael',52,52),
('2026-10',null,'Tercer semana','Albana',30,34),
('2026-10',null,'Tercer semana','Rafael',27,28),
('2026-10',null,'Tercer semana','Agustina',1,1),
('2026-10',null,'Tercer semana','Gustavo',21,21),
('2026-11','2026-11-23','Cuarta semana','Albana',13,13),
('2026-11','2026-11-23','Cuarta semana','Rafael',14,14),
('2026-11','2026-11-23','Cuarta semana','Agustina',15,15),
('2026-11','2026-11-23','Cuarta semana','Gustavo',15,15),
-- Ajuste de nov: ingresos sin vacante en el portal (16), 4 y 4 entre los que suman vacantes (Agustín no).
-- Noviembre cierra en 387/390 = 99% (antes era una fila "Seleccion" 7/7).
('2026-11','2026-11-02','Primer semana','Agustina',4,4),
('2026-11','2026-11-02','Primer semana','Rafael',4,4),
('2026-11','2026-11-02','Primer semana','Gustavo',4,4),
('2026-11','2026-11-02','Primer semana','Albana',4,4);

-- Cumplimiento unificado desde un mes (por defecto nov 2026, cuando arrancó el portal):
-- vacantes del portal por semana de carga y selector (completadas = COMUNICADO o Cerrada/Finalizada,
-- sin Canceladas ni locales EXCEDIDO, igual que la batería) + las semanas cargadas en la planilla (se suman, p. ej. la cuarta semana de nov del Excel).
create or replace function public.cumplimiento_vivo(desde text default '2026-11')
returns jsonb language sql stable security definer set search_path = public as $$
  with b as (
    select (creado at time zone 'America/Argentina/Buenos_Aires')::date d, initcap(trim(selector)) sel,
           (estado = 'COMUNICADO' or status in ('Cerrada', 'Finalizada')) hecha
    from seleccion_busquedas
    where creado is not null and coalesce(status, '') <> 'Cancelada' and coalesce(estado_nomina, '') <> 'EXCEDIDO'
  ), bp as (
    select to_char(d, 'YYYY-MM') mes, date_trunc('week', d)::date semana, sel,
           count(*) filter (where hecha)::int env, count(*)::int tot
    from b group by 1, 2, 3
  ), pl as (
    select p.mes, p.semana, p.semana_txt, initcap(trim(p.selector)) sel, p.enviados env, p.total tot
    from cumplimiento_planilla p
    where p.semana is not null
  ), todo as (
    select mes, semana, null::text semana_txt, sel, env, tot, 'portal' fuente from bp
    union all
    select mes, semana, semana_txt, sel, env, tot, 'planilla' from pl
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'mes', mes,
      'semana', coalesce(semana_txt, (array['Primer semana','Segunda semana','Tercer semana','Cuarta semana','Quinta semana'])[
          case when to_char(semana, 'YYYY-MM') = mes then least(5, (extract(day from semana)::int - 1) / 7 + 1) else 1 end]),
      'lunes', semana, 'selector', sel, 'enviados', env, 'total', tot, 'restantes', tot - env,
      'cumplimiento', round(env::numeric / nullif(tot, 0), 3), 'fuente', fuente)
    order by mes, semana, sel), '[]'::jsonb)
  from todo where mes >= desde;
$$;
revoke all on function public.cumplimiento_vivo(text) from public;
grant execute on function public.cumplimiento_vivo(text) to anon, authenticated;
