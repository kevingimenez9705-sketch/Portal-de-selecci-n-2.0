/* =========================================================
   BASE DE DATOS (TAREAS GRUPALES) → PORTAL DE SELECCIÓN 2.0

   El script de la planilla sigue cargando la pestaña BASE DE DATOS como
   siempre. Este proyecto la lee cada 10 minutos y manda una copia a la
   Base de postulantes del portal (Supabase). No escribe en la planilla.

   - Personas nuevas → se agregan al portal.
   - Personas que ya están (mismo DNI o email) → solo se completan datos
     vacíos; lo editado en el portal no se pisa.
   - Quien figure ACTIVO en la pestaña BLOQUEADOS llega como "Bloqueado".

   INSTALAR (una sola vez):
   1. Supabase: correr sql/sync_base_drive.sql en el SQL Editor.
   2. script.google.com → Nuevo proyecto → pegar este archivo.
   3. ⚙️ Configuración del proyecto → Propiedades de la secuencia de comandos
      → Agregar: CODIGO_EQUIPO = (el código del equipo del portal).
   4. Elegir la función activarSincronizacion → Ejecutar → aceptar permisos.
   Listo: corre sola cada 10 minutos. Para frenarla: desactivarSincronizacion.
   ========================================================= */

const SYNC = {
  SUPABASE_URL: 'https://gkotckcvookkbbtbctyp.supabase.co',
  SUPABASE_KEY: 'sb_publishable_iu66s54UVbg5AsF-AoekPA_6qKUevVH',   // clave pública; los datos los protege el código del equipo
  PLANILLA_ID: '1BeSkjch_rEdZx7QTRcJK0XV9fGcHcFpXWQX-vlFrT98',       // TAREAS GRUPALES
  HOJA_BASE: 'BASE DE DATOS',
  HOJA_BLOQUEADOS: 'BLOQUEADOS',
  MINUTOS: 10,
  LOTE: 200,
  ZONA_HORARIA: 'America/Argentina/Buenos_Aires'
};

// Campo del portal → cómo empieza el encabezado en BASE DE DATOS (sin tildes ni signos).
// Se busca por nombre, así no importa si alguien mueve columnas.
const COLUMNAS_BASE = {
  nombre:             'solo nombre',
  apellido:           'solo apellido',
  email:              'e mail',
  telefono:           'numero de whatsapp',
  fecha_nacimiento:   'fecha de nacimiento',
  zona:               'zona de residencia',
  localidad:          'localidad',
  sede_entrevista:    'sede donde',
  estado:             'estado',
  puesto_interes:     'puesto',
  cv_url:             'tu cv',
  curso_manipulacion: 'tengo curso',
  antecedentes:       'tengo certif',
  dni:                'dni',
  cuil:               'cuil',
  nacionalidad:       'nacionalidad',
  tel_emergencia:     'tel emergencia',
  horario:            'horario',
  observaciones:      'observaciones',
  sugerido_para:      'sugerido para'
};

const ZONAS_PORTAL = ['CABA', 'Norte', 'Oeste', 'Sur', 'Lejanos', 'Interior'];


/* =========================================================
   FUNCIONES PARA EJECUTAR
   ========================================================= */

// La que corre el activador. También se puede ejecutar a mano.
function sincronizarBase() {
  const codigo = codigoEquipo_();
  const libro = SpreadsheetApp.openById(SYNC.PLANILLA_ID);
  const hoja = libro.getSheetByName(SYNC.HOJA_BASE);
  if (!hoja) throw new Error('No encontré la pestaña "' + SYNC.HOJA_BASE + '" en TAREAS GRUPALES.');

  const filas = filasDeLaBase_(hoja.getDataRange().getValues(), bloqueados_(libro));
  const total = { nuevos: 0, completados: 0, sin_cambios: 0, omitidas: 0 };

  for (let i = 0; i < filas.length; i += SYNC.LOTE) {
    const r = llamarPortal_('seleccion_sync_postulantes', { filas: filas.slice(i, i + SYNC.LOTE) }, codigo);
    Object.keys(total).forEach(function (k) { total[k] += r[k] || 0; });
  }

  const resumen = 'Base → portal: ' + total.nuevos + ' nuevos, ' + total.completados + ' completados, ' +
    total.sin_cambios + ' sin cambios, ' + total.omitidas + ' omitidas (sin nombre o sin DNI/email).';
  console.log(resumen);
  return resumen;
}

function activarSincronizacion() {
  desactivarSincronizacion();
  ScriptApp.newTrigger('sincronizarBase').timeBased().everyMinutes(SYNC.MINUTOS).create();
  console.log('Sincronización activada cada ' + SYNC.MINUTOS + ' minutos. Primera corrida:');
  return sincronizarBase();
}

function desactivarSincronizacion() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sincronizarBase') ScriptApp.deleteTrigger(t);
  });
}

function probarConexion() {
  const ok = llamarPortal_('seleccion_codigo_ok', {}, codigoEquipo_());
  console.log(ok === true ? '✅ Conectado al portal: el código del equipo es correcto.' : '❌ El portal rechazó el código del equipo.');
  return ok;
}


/* =========================================================
   LECTURA DE LA PLANILLA
   ========================================================= */

function filasDeLaBase_(valores, bloq) {
  if (valores.length < 2) return [];
  const idx = indicesColumnas_(valores[0]);
  if (idx.nombre === -1) throw new Error('No encontré la columna "Solo Nombre/s" en ' + SYNC.HOJA_BASE + '.');

  const salida = [];
  for (let i = 1; i < valores.length; i++) {
    const v = valores[i];
    const dato = function (campo) { return idx[campo] === -1 ? '' : v[idx[campo]]; };
    const nombre = texto_(dato('nombre'));
    if (!nombre) continue;

    const dni = soloDigitos_(dato('dni'));
    const email = texto_(dato('email')).toLowerCase();
    const horarioOriginal = texto_(dato('horario'));
    let estado = estado_(dato('estado'));
    if ((dni && bloq.dnis[dni]) || (email && bloq.emails[email])) estado = 'Bloqueado';

    salida.push({
      nombre: nombre,
      apellido: texto_(dato('apellido')),
      email: email,
      telefono: telefono_(dato('telefono')),
      fecha_nacimiento: fecha_(dato('fecha_nacimiento')),
      zona: zona_(dato('zona')),
      localidad: texto_(dato('localidad')),
      sede_entrevista: texto_(dato('sede_entrevista')),
      estado: estado,
      puesto_interes: texto_(dato('puesto_interes')),
      cv_url: texto_(dato('cv_url')),
      curso_manipulacion: siNo_(dato('curso_manipulacion')),
      antecedentes: siNo_(dato('antecedentes')),
      dni: dni,
      cuil: soloDigitos_(dato('cuil')),
      nacionalidad: texto_(dato('nacionalidad')),
      tel_emergencia: telefono_(dato('tel_emergencia')),
      horario: horario_(horarioOriginal),
      // El horario del formulario trae días y modalidad: queda completo en observaciones
      observaciones: [texto_(dato('observaciones')), horarioOriginal ? 'Disponibilidad: ' + horarioOriginal : '']
        .filter(String).join(' · '),
      sugerido_para: texto_(dato('sugerido_para'))
    });
  }
  return salida;
}

function indicesColumnas_(encabezados) {
  const enc = encabezados.map(normalizar_);
  const idx = {};
  Object.keys(COLUMNAS_BASE).forEach(function (campo) {
    const buscado = COLUMNAS_BASE[campo];
    let i = enc.indexOf(buscado);                       // primero exacto ("estado" ≠ "estado envio")
    if (i === -1) i = enc.findIndex(function (h) { return h.indexOf(buscado) === 0; });
    idx[campo] = i;
  });
  return idx;
}

// DNIs y mails de la pestaña BLOQUEADOS con ACTIVO = SÍ
function bloqueados_(libro) {
  const res = { dnis: {}, emails: {} };
  const hoja = libro.getSheetByName(SYNC.HOJA_BLOQUEADOS);
  if (!hoja) return res;
  const valores = hoja.getDataRange().getValues();
  if (valores.length < 2) return res;
  const enc = valores[0].map(normalizar_);
  const cDni = enc.indexOf('dni'), cMail = enc.indexOf('mail'), cActivo = enc.indexOf('activo');
  for (let i = 1; i < valores.length; i++) {
    const v = valores[i];
    if (cActivo !== -1 && normalizar_(v[cActivo]).indexOf('s') !== 0) continue;
    const dni = cDni === -1 ? '' : soloDigitos_(v[cDni]);
    const mail = cMail === -1 ? '' : texto_(v[cMail]).toLowerCase();
    if (dni) res.dnis[dni] = true;
    if (mail) res.emails[mail] = true;
  }
  return res;
}


/* =========================================================
   LIMPIEZA DE DATOS
   ========================================================= */

function normalizar_(v) {
  return String(v == null ? '' : v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function texto_(v) {
  if (v == null || v instanceof Date) return '';
  const t = String(v).replace(/\s+/g, ' ').trim();
  return /^s\/?d$/i.test(t) ? '' : t;                  // "S/D" = sin dato
}

function soloDigitos_(v) {
  if (typeof v === 'number') return String(Math.round(v));
  return texto_(v).replace(/\D/g, '');
}

function telefono_(v) {
  return typeof v === 'number' ? String(Math.round(v)) : texto_(v);
}

// Fecha → "aaaa-mm-dd". Acepta fechas de la hoja o texto dd/mm/aaaa.
function fecha_(v) {
  let d = null;
  if (v instanceof Date) d = v;
  else {
    const m = texto_(v).match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (m) {
      d = new Date(+m[3], +m[2] - 1, +m[1], 12);
      if (d.getDate() !== +m[1] || d.getMonth() !== +m[2] - 1) d = null;   // 31/02 → sin fecha
    }
  }
  if (!d || isNaN(d.getTime())) return '';
  const anio = +Utilities.formatDate(d, SYNC.ZONA_HORARIA, 'yyyy');
  if (anio < 1930 || anio > new Date().getFullYear()) return '';
  return Utilities.formatDate(d, SYNC.ZONA_HORARIA, 'yyyy-MM-dd');
}

function siNo_(v) {
  const t = normalizar_(v);
  if (t === 'si') return 'Sí';
  if (t === 'no') return 'No';
  if (t.indexOf('tramite') !== -1) return 'En trámite';
  return '';
}

function estado_(v) {
  const t = normalizar_(v);
  if (t.indexOf('bloq') !== -1) return 'Bloqueado';
  if (/descart|desaprob|rechaz|no apto/.test(t)) return 'Descartado';
  if (t.indexOf('aprob') !== -1) return 'Aprobado';
  return 'En espera';
}

function zona_(v) {
  const t = texto_(v);
  const z = ZONAS_PORTAL.find(function (x) { return normalizar_(x) === normalizar_(t); });
  return z || t;
}

// "Lun, Mar… · Mañana, Tarde, Noche · Part-time" → categoría del portal
function horario_(original) {
  const partes = original.split('·');
  const turnos = normalizar_(partes.length > 1 ? partes[1] : original);
  const m = turnos.indexOf('manana') !== -1, t = turnos.indexOf('tarde') !== -1, n = turnos.indexOf('noche') !== -1;
  if (m && n) return 'Cualquiera';
  if (m && t) return 'Mañana y tarde';
  if (t && n) return 'Tarde y noche';
  if (m) return 'Mañana';
  if (t) return 'Tarde';
  if (n) return 'Noche';
  return '';
}


/* =========================================================
   CONEXIÓN CON EL PORTAL
   ========================================================= */

function codigoEquipo_() {
  const c = PropertiesService.getScriptProperties().getProperty('CODIGO_EQUIPO');
  if (!c) throw new Error('Falta el código: ⚙️ Configuración del proyecto → Propiedades de la secuencia de comandos → CODIGO_EQUIPO.');
  return c.trim();
}

function llamarPortal_(funcion, cuerpo, codigo) {
  const r = UrlFetchApp.fetch(SYNC.SUPABASE_URL + '/rest/v1/rpc/' + funcion, {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: SYNC.SUPABASE_KEY, 'x-codigo-equipo': codigo },
    payload: JSON.stringify(cuerpo),
    muteHttpExceptions: true
  });
  const status = r.getResponseCode();
  const texto = r.getContentText();
  if (status >= 200 && status < 300) return texto ? JSON.parse(texto) : null;
  if (status === 404) throw new Error('Falta correr sql/sync_base_drive.sql en Supabase.');
  if (status === 401 || status === 403 || texto.indexOf('42501') !== -1) throw new Error('El portal rechazó el código del equipo (revisá CODIGO_EQUIPO).');
  throw new Error('El portal respondió ' + status + ': ' + texto.substring(0, 200));
}
