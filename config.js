// ══════════════════════════════════════════════
//  CONFIGURACIÓN Y DATOS GLOBALES
// ══════════════════════════════════════════════
// Proyecto Supabase: ats-gastronomico (tablas seleccion_*, ver sql/portal_seleccion.sql)
const SUPABASE_URL = 'https://gkotckcvookkbbtbctyp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_iu66s54UVbg5AsF-AoekPA_6qKUevVH';

// Si el script de Supabase no cargó (red lenta, bloqueador, CDN caído) la página
// quedaba muerta sin aviso: mejor mostrar el motivo y frenar acá.
if (!window.supabase) {
    document.body.innerHTML = `
        <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;font-family:sans-serif;background:#1a1714;color:#fff">
            <div>
                <h2 style="margin-bottom:10px">No se pudo cargar la página</h2>
                <p style="opacity:.8;max-width:420px;margin:0 auto 18px">Falló la conexión con Supabase. Revisá tu internet o un bloqueador de contenido y volvé a intentar.</p>
                <button onclick="location.reload()" style="padding:10px 22px;border:none;border-radius:8px;background:#fff;color:#1a1714;font-weight:700;cursor:pointer">Reintentar</button>
            </div>
        </div>`;
    throw new Error('window.supabase no está disponible');
}
// No hay usuarios: cada consulta lleva el código del equipo y la base solo responde
// si es el correcto (ver sql/codigo_equipo.sql). El cliente se arma al ingresarlo.
const CODIGO_KEY = 'portalSeleccion.codigoEquipo';
let sb = null;
function crearCliente(codigo) {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        global: { headers: { 'x-codigo-equipo': codigo } },
        auth: { persistSession: false, autoRefreshToken: false }
    });
}

// ── Listas fijas (las mismas que usa Tareas grupales) ──
// Los nombres de los selectores NO van acá: salen de la tabla seleccion_equipo.
const MARCAS   = ['Hamburguesas Extremas', 'Sabores Express'];
const ZONAS    = ['CABA', 'Norte', 'Oeste', 'Sur', 'Lejanos', 'Interior'];
const MOTIVOS  = ['Rotación', 'Apertura', 'Expansión', 'Reemplazo'];
const ESTADOS_BUSQUEDA   = ['Proceso', 'Pausada', 'Cerrada', 'Finalizada', 'Cancelada'];
const ESTADOS_POSTULANTE = ['Aprobado', 'En espera', 'Bloqueado', 'Descartado'];
const SEDES_ENTREVISTA   = ['Florida', 'Merlo', 'Adrogué', 'Pilar', 'Virtual'];
const HORARIOS           = ['Cualquiera', 'Mañana', 'Mañana y tarde', 'Tarde', 'Tarde y noche', 'Noche'];
const DOC_OPCIONES       = ['Sí', 'No', 'En trámite'];

// Desplegables de la hoja "Solicitudes Sabores / Extremas"
const PUESTOS          = ['PART TIME (5HS)', 'FULL TIME (9HS)', 'ENCARGADO', 'GERENTE', 'ENTRENADOR'];
const JORNADAS         = ['ROTATIVO', 'ROTATIVO MAÑANA', 'ROTATIVO MEDIO', 'ROTATIVO NOCHE'];
const HORAS_CITACION   = ['09:30 HS', '11:30 HS', '14:30 HS', '16:00 HS'];
const ESTADOS_SOLICITUD = ['ENVIADO A ZONAL', 'APROBADO ZONAL', 'RECHAZADO ZONAL', 'CITADO', 'HUELLA', 'COMUNICADO'];
const SEXOS            = ['M', 'F', 'X'];
const SUGERENCIAS = {
    nacionalidad: ['ARGENTINA', 'PARAGUAYA', 'BOLIVIANA', 'PERUANA', 'VENEZOLANA', 'COLOMBIANA', 'ECUATORIANA', 'URUGUAYA'],
    provincia: ['BUENOS AIRES', 'CABA'],
    pais: ['ARGENTINA'],
    altas: ['CONFIRMA ONB']
};

// Columnas de la grilla de Vacantes, en el mismo orden que la hoja Solicitudes.
// f = campo en seleccion_busquedas · tipo = cómo se edita · dl = sugerencias (datalist)
const COLUMNAS = [
    { g: 'Solicitud',  f: 'selector',            t: 'Selector',                tipo: 'selector', w: 110 },
    { g: 'Solicitud',  f: 'regional',            t: 'Regional',                tipo: 'texto', dl: 'dl-regional', w: 150 },
    { g: 'Solicitud',  f: 'zonal',               t: 'Zonal',                   tipo: 'texto', dl: 'dl-zonal', w: 150 },
    { g: 'Solicitud',  f: 'local',               t: 'Local',                   tipo: 'texto', dl: 'dl-local', w: 180 },
    { g: 'Solicitud',  f: 'local_entrenamiento', t: 'Local entrenamiento',     tipo: 'texto', dl: 'dl-local', w: 170 },
    { g: 'Solicitud',  f: 'puesto',              t: 'Puesto',                  tipo: 'select', ops: PUESTOS, w: 140 },
    { g: 'Solicitud',  f: 'jornada',             t: 'Jornada',                 tipo: 'select', ops: JORNADAS, w: 150 },
    { g: 'Solicitud',  f: 'notas',               t: 'Notas sobre la solicitud', tipo: 'texto', w: 230 },
    { g: 'Proceso',    f: 'fecha_citacion',      t: 'Fecha',                   tipo: 'fecha', w: 130 },
    { g: 'Proceso',    f: 'hora_citacion',       t: 'Hora',                    tipo: 'select', ops: HORAS_CITACION, w: 105 },
    { g: 'Proceso',    f: 'estado',              t: 'Estado',                  tipo: 'estado', w: 160 },
    { g: 'Proceso',    f: 'ingreso',             t: 'Primer día',              tipo: 'fecha', w: 130 },
    { g: 'Ingresante', f: 'nombre',              t: 'Nombre',                  tipo: 'persona', w: 160 },
    { g: 'Ingresante', f: 'apellido',            t: 'Apellido',                tipo: 'texto', w: 150 },
    { g: 'Ingresante', f: 'email',               t: 'Email',                   tipo: 'texto', w: 200 },
    { g: 'Ingresante', f: 'tel',                 t: 'Tel',                     tipo: 'tel', w: 135 },
    { g: 'Ingresante', f: 'tel_emergencia',      t: 'Tel emergencia',          tipo: 'texto', w: 125 },
    { g: 'Ingresante', f: 'fecha_nacimiento',    t: 'Fecha de nacimiento',     tipo: 'fecha', w: 130 },
    { g: 'Ingresante', f: 'nacionalidad',        t: 'Nacionalidad',            tipo: 'texto', dl: 'dl-nacionalidad', w: 125 },
    { g: 'Ingresante', f: 'cuil',                t: 'CUIL',                    tipo: 'numero', w: 125 },
    { g: 'Ingresante', f: 'dni',                 t: 'DNI',                     tipo: 'numero', w: 105 },
    { g: 'Ingresante', f: 'sexo',                t: 'Sexo',                    tipo: 'select', ops: SEXOS, w: 70 },
    { g: 'Ingresante', f: 'domicilio',           t: 'Domicilio',               tipo: 'texto', w: 180 },
    { g: 'Ingresante', f: 'domicilio_numero',    t: 'Número',                  tipo: 'texto', w: 75 },
    { g: 'Ingresante', f: 'codigo_postal',       t: 'Código postal',           tipo: 'texto', w: 90 },
    { g: 'Ingresante', f: 'localidad',           t: 'Localidad',               tipo: 'texto', w: 140 },
    { g: 'Ingresante', f: 'provincia',           t: 'Provincia',               tipo: 'texto', dl: 'dl-provincia', w: 130 },
    { g: 'Ingresante', f: 'pais',                t: 'País',                    tipo: 'texto', dl: 'dl-pais', w: 110 },
    { g: 'Altas',      f: 'altas_rrhh',          t: 'Altas RRHH',              tipo: 'texto', dl: 'dl-altas', w: 135 },
    { g: 'Altas',      f: 'registro_datos',      t: 'Registro datos',          tipo: 'texto', w: 155 },
    { g: 'Altas',      f: 'id_postulante',       t: 'ID postulante',           tipo: 'texto', w: 160 },
];
// Hoja "SOLICITUDES DE PERSONAL": columnas de PERFILES A SOLICITAR → puesto de la vacante
const PERFILES_SOLICITUD = [
    { col: 'GT',   puesto: 'GERENTE' },
    { col: 'ET',   puesto: 'ENCARGADO' },
    { col: 'ENT',  puesto: 'ENTRENADOR' },
    { col: 'FULL', puesto: 'FULL TIME (9HS)' },
    { col: 'PART', puesto: 'PART TIME (5HS)' },
];
// Posición de cada columna cuando se pegan filas sin el encabezado (A = 0)
const SOLICITUD_POSICIONES = { gr: 0, gz: 1, local: 2, estado: 4, obs: 25, perfiles: { GT: 20, ET: 21, ENT: 22, FULL: 23, PART: 24 } };

// Datos de la persona: se vacían al liberar la vacante
const CAMPOS_PERSONA = ['nombre', 'apellido', 'email', 'tel', 'tel_emergencia', 'fecha_nacimiento', 'nacionalidad', 'cuil', 'dni', 'sexo',
    'domicilio', 'domicilio_numero', 'codigo_postal', 'localidad', 'provincia', 'pais', 'altas_rrhh', 'registro_datos', 'id_postulante'];

// Días hábiles normales para cubrir la vacante, según el puesto
const DEMORA_LIMITE = { 'GERENTE': 45, 'ENCARGADO': 30 };
const DEMORA_LIMITE_OTROS = 15;
// 72hs hábiles en "ENVIADO A ZONAL" sin respuesta → alerta
const ALERTA_ZONAL_LIMITE_HD = 3;

// Colores de respaldo para selectores sin color cargado en seleccion_equipo
const COLORES_EQUIPO = ['#6a4c93', '#9b2226', '#ca6702', '#005f73', '#2d6a4f', '#b5a300', '#be185d', '#2b4c86'];

// ── Estado global de la app ──
let busquedas = [];        // vacantes (cada una con .comentarios)
let postulantes = [];      // base de postulantes
let equipo = [];           // seleccion_equipo (lista de selectores)
let filteredIds = null;
let selectorFiltroActivo = '';
let marcaActiva = '';      // pestaña de marca en Vacantes ('' = todas)
let datosCargados = false;
