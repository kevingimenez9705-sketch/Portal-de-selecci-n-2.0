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
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Listas fijas (las mismas que usa Tareas grupales) ──
// Los nombres del equipo NO van acá: salen de la tabla seleccion_equipo.
const MARCAS   = ['Sabores Express', 'Hamburguesas Extremas'];
const ZONAS    = ['CABA', 'Norte', 'Oeste', 'Sur', 'Lejanos', 'Interior'];
const MOTIVOS  = ['Rotación', 'Apertura', 'Expansión', 'Reemplazo'];
const NIVELES  = ['Operativo', 'Encargado', 'Gerente'];
const ESTADOS_BUSQUEDA   = ['Proceso', 'Pausada', 'Cerrada', 'Finalizada', 'Cancelada'];
const ESTADOS_POSTULANTE = ['Aprobado', 'En espera', 'Bloqueado', 'Descartado'];
const PUESTOS_SUGERIDOS  = ['Part time (5hs)', 'Full time', 'Encargado de turno', 'Gerente de local', 'Entrenador'];
const JORNADAS_SUGERIDAS = ['Rotativo', 'Rota mañana', 'Rota medio', 'Rota noche'];
const SEDES_ENTREVISTA   = ['Florida', 'Merlo', 'Adrogué', 'Pilar', 'Virtual'];
const HORARIOS           = ['Cualquiera', 'Mañana', 'Tarde y noche', 'Noche'];
const DOC_OPCIONES       = ['Sí', 'No', 'En trámite'];

// Días hábiles normales para cubrir la vacante, según el nivel del puesto
const DEMORA_LIMITE = { 'Gerente': 45, 'Encargado': 30, 'Operativo': 15 };
// 72hs hábiles sin respuesta del zonal desde "Enviado al zonal" → alerta
const ALERTA_ZONAL_LIMITE_HD = 3;

// Circuito de un postulante dentro de la vacante (mismo orden que Tareas grupales)
const CAND_ESTADOS = [
    { v: 'Asignado',       label: '📌 Asignado a la vacante' },
    { v: 'Enviado',        label: '✉ Enviado al zonal' },
    { v: 'Aprobado',       label: '✓ Aprobado por el zonal' },
    { v: 'Citado ONB',     label: '📅 Citado a onboarding' },
    { v: 'Confirmó ONB',   label: '👍 Confirmó onboarding' },
    { v: 'Ingresó',        label: '🎉 Ingresó' },
    { v: 'Rechazado',      label: '✗ Rechazado por el zonal' },
    { v: 'No se presentó', label: '⊘ No se presentó' },
    { v: 'Desistió',       label: '↩ Desistió' },
];
const CAND_ACTIVOS = ['Asignado', 'Enviado', 'Aprobado', 'Citado ONB', 'Confirmó ONB'];
const CAND_SALIDA  = ['Rechazado', 'No se presentó', 'Desistió'];

// Colores de respaldo para selectores sin color cargado en seleccion_equipo
const COLORES_EQUIPO = ['#6a4c93', '#9b2226', '#ca6702', '#005f73', '#2d6a4f', '#b5a300', '#be185d', '#2b4c86'];

// ── Estado global de la app ──
let busquedas = [];        // vacantes, cada una con .candidatos y .comentarios
let postulantes = [];      // base de postulantes
let equipo = [];           // seleccion_equipo
let currentProfile = null; // fila de seleccion_equipo del usuario logueado
let filteredIds = null;
let selectorFiltroActivo = '';
let vistaAislada = false;  // entró desde la foto de un selector: solo ve lo suyo
let datosCargados = false;
