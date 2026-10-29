-- ══════════════════════════════════════════════════════════════════════════
--  Portal de Selección 2.0 — Tortuguitas (proyecto Supabase: ats-gastronomico)
-- ──────────────────────────────────────────────────────────────────────────
--  Mismo esquema que el panel de Staff, adaptado al circuito de Tareas grupales:
--    seleccion_busquedas   → cada vacante de un local (lo que hoy es una fila
--                            de "Solicitudes Sabores / Extremas")
--    seleccion_postulantes → base de postulantes (lo que hoy es "Proceso de
--                            Selección" / "BASE DE DATOS")
--    seleccion_candidatos  → un postulante colocado en una vacante, con su
--                            estado (asignado → enviado al zonal → onboarding → ingreso)
--    seleccion_comentarios → "Estado de búsqueda" (comentarios con fecha)
--    seleccion_equipo      → quién puede entrar y con qué rol; también arma la
--                            lista de selectores (no hay nombres en el código)
--
--  Acceso: solo usuarios logueados cuyo email esté activo en seleccion_equipo.
--  Se puede volver a correr sin romper nada.
-- ══════════════════════════════════════════════════════════════════════════

-- ── Equipo (acceso + lista de selectores) ──
create table if not exists public.seleccion_equipo (
    id              bigint generated always as identity primary key,
    nombre          text not null,                 -- nombre corto, el que se ve como "Selector"
    nombre_completo text,
    email           text,                          -- el mismo email del usuario de Authentication
    rol             text not null default 'selector' check (rol in ('admin', 'selector')),
    es_selector     boolean not null default true, -- false = entra al panel pero no toma búsquedas
    color           text,
    activo          boolean not null default true,
    orden           int not null default 0,
    creado          timestamptz not null default now()
);
create unique index if not exists seleccion_equipo_email_idx on public.seleccion_equipo (lower(email));

create or replace function public.seleccion_es_miembro()
returns boolean language sql stable security definer set search_path = public as $$
    select exists (
        select 1 from seleccion_equipo e
        where e.activo and lower(e.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    );
$$;

create or replace function public.seleccion_es_admin()
returns boolean language sql stable security definer set search_path = public as $$
    select exists (
        select 1 from seleccion_equipo e
        where e.activo and e.rol = 'admin' and lower(e.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    );
$$;

revoke execute on function public.seleccion_es_miembro() from public, anon;
revoke execute on function public.seleccion_es_admin()   from public, anon;
grant  execute on function public.seleccion_es_miembro() to authenticated;
grant  execute on function public.seleccion_es_admin()   to authenticated;

-- ── Búsquedas (vacantes por local) ──
create sequence if not exists public.seleccion_busquedas_numero_seq;

create table if not exists public.seleccion_busquedas (
    id                  bigint generated always as identity primary key,
    numero              text not null unique default ('SEL-' || lpad(nextval('public.seleccion_busquedas_numero_seq')::text, 3, '0')),
    marca               text not null,
    local               text not null,
    local_entrenamiento text,
    zona                text,
    regional            text,
    zonal               text,
    selector            text,
    puesto              text not null,
    jornada             text,
    nivel               text not null default 'Operativo',
    motivo              text not null default 'Rotación',
    notas               text,                       -- "Notas sobre la solicitud"
    inicio              date not null default current_date,
    enviado_zonal       date,                       -- frena el tramo de Selección
    decision_zonal      date,                       -- frena el tramo del Zonal
    ingreso             date,
    ingreso_nombre      text,
    fecha_baja          date,
    status              text not null default 'Proceso' check (status in ('Proceso', 'Pausada', 'Cerrada', 'Finalizada', 'Cancelada')),
    reopened_from       text,
    creado              timestamptz not null default now(),
    creado_por          text default (auth.jwt() ->> 'email')
);
create index if not exists seleccion_busquedas_status_idx on public.seleccion_busquedas (status);

-- ── Base de postulantes ──
create table if not exists public.seleccion_postulantes (
    id                 bigint generated always as identity primary key,
    nombre             text not null,
    apellido           text,
    dni                text,
    telefono           text,
    email              text,
    fecha_nacimiento   date,
    zona               text,
    localidad          text,
    sede_entrevista    text,
    fecha_entrevista   date,
    puesto_interes     text,
    horario            text,
    curso_manipulacion text,                        -- Sí / No / En trámite
    antecedentes       text,                        -- Sí / No / En trámite
    cv_url             text,
    observaciones      text,
    estado             text not null default 'Aprobado' check (estado in ('Aprobado', 'En espera', 'Bloqueado', 'Descartado')),
    id_postulante      text,                        -- Id del ATS / formulario, si lo tiene
    creado             timestamptz not null default now(),
    creado_por         text default (auth.jwt() ->> 'email')
);
-- Un DNI = una persona en la base (evita cargar dos veces al mismo postulante)
create unique index if not exists seleccion_postulantes_dni_idx on public.seleccion_postulantes (dni) where dni is not null and dni <> '';

-- ── Candidatos: un postulante colocado en una vacante ──
create table if not exists public.seleccion_candidatos (
    id                      bigint generated always as identity primary key,
    busqueda_id             bigint not null references public.seleccion_busquedas(id) on delete cascade,
    postulante_id           bigint not null references public.seleccion_postulantes(id) on delete cascade,
    estado                  text not null default 'Asignado' check (estado in (
                                'Asignado', 'Enviado', 'Aprobado', 'Citado ONB', 'Confirmó ONB', 'Ingresó',
                                'Rechazado', 'No se presentó', 'Desistió')),
    fecha_asignacion        date not null default current_date,
    fecha_envio             date,                   -- enviado al zonal
    fecha_decision          date,                   -- el zonal aprobó / rechazó
    fecha_onb               date,
    hora_onb                text,
    fecha_ingreso           date,                   -- primer día
    fecha_salida            date,                   -- no se presentó / desistió
    motivo                  text,
    demora_descuento_dias   int not null default 0,
    demora_descuento_motivo text,
    creado                  timestamptz not null default now(),
    unique (busqueda_id, postulante_id)
);
create index if not exists seleccion_candidatos_busqueda_idx   on public.seleccion_candidatos (busqueda_id);
create index if not exists seleccion_candidatos_postulante_idx on public.seleccion_candidatos (postulante_id);

-- ── Comentarios ("Estado de búsqueda") ──
create table if not exists public.seleccion_comentarios (
    id          bigint generated always as identity primary key,
    busqueda_id bigint not null references public.seleccion_busquedas(id) on delete cascade,
    texto       text not null,
    fecha       date not null default current_date,
    autor       text default (auth.jwt() ->> 'email'),
    creado      timestamptz not null default now()
);
create index if not exists seleccion_comentarios_busqueda_idx on public.seleccion_comentarios (busqueda_id);

-- ── Permisos (RLS) ──
alter table public.seleccion_equipo      enable row level security;
alter table public.seleccion_busquedas   enable row level security;
alter table public.seleccion_postulantes enable row level security;
alter table public.seleccion_candidatos  enable row level security;
alter table public.seleccion_comentarios enable row level security;

drop policy if exists "Equipo: ver"        on public.seleccion_equipo;
drop policy if exists "Equipo: admin edita" on public.seleccion_equipo;
create policy "Equipo: ver"         on public.seleccion_equipo for select to authenticated using (public.seleccion_es_miembro());
create policy "Equipo: admin edita" on public.seleccion_equipo for all    to authenticated using (public.seleccion_es_admin()) with check (public.seleccion_es_admin());

drop policy if exists "Búsquedas: ver"           on public.seleccion_busquedas;
drop policy if exists "Búsquedas: crear"         on public.seleccion_busquedas;
drop policy if exists "Búsquedas: editar"        on public.seleccion_busquedas;
drop policy if exists "Búsquedas: borrar (admin)" on public.seleccion_busquedas;
create policy "Búsquedas: ver"            on public.seleccion_busquedas for select to authenticated using (public.seleccion_es_miembro());
create policy "Búsquedas: crear"          on public.seleccion_busquedas for insert to authenticated with check (public.seleccion_es_miembro());
create policy "Búsquedas: editar"         on public.seleccion_busquedas for update to authenticated using (public.seleccion_es_miembro()) with check (public.seleccion_es_miembro());
create policy "Búsquedas: borrar (admin)" on public.seleccion_busquedas for delete to authenticated using (public.seleccion_es_admin());

drop policy if exists "Postulantes: equipo" on public.seleccion_postulantes;
create policy "Postulantes: equipo" on public.seleccion_postulantes for all to authenticated using (public.seleccion_es_miembro()) with check (public.seleccion_es_miembro());

drop policy if exists "Candidatos: equipo" on public.seleccion_candidatos;
create policy "Candidatos: equipo" on public.seleccion_candidatos for all to authenticated using (public.seleccion_es_miembro()) with check (public.seleccion_es_miembro());

drop policy if exists "Comentarios: ver"            on public.seleccion_comentarios;
drop policy if exists "Comentarios: crear"          on public.seleccion_comentarios;
drop policy if exists "Comentarios: borrar (admin)" on public.seleccion_comentarios;
create policy "Comentarios: ver"            on public.seleccion_comentarios for select to authenticated using (public.seleccion_es_miembro());
create policy "Comentarios: crear"          on public.seleccion_comentarios for insert to authenticated with check (public.seleccion_es_miembro());
create policy "Comentarios: borrar (admin)" on public.seleccion_comentarios for delete to authenticated using (public.seleccion_es_admin());

-- ══════════════════════════════════════════════════════════════════════════
--  PRIMER ADMIN (correr una sola vez, después de crear el usuario en
--  Authentication → Users → Add user). Los demás se agregan desde el panel
--  (botón "Equipo", solo admin).
--
--  insert into public.seleccion_equipo (nombre, nombre_completo, email, rol, es_selector)
--  values ('Nombre', 'Nombre Apellido', 'email@empresa.com', 'admin', false);
-- ══════════════════════════════════════════════════════════════════════════
