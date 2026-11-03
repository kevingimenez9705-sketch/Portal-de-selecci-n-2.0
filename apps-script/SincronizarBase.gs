/* =========================================================
   TAREAS GRUPALES ⇄ PORTAL DE SELECCIÓN 2.0  (reemplaza al flujo de n8n)

   Cada 10 minutos, de 7 a 23 h:
   1. Página "Elegí tu vacante" del portal → planilla: lo que dejó la gente en
      elegi-tu-vacante.html se agrega a BASE DE DATOS y BLOQUEADOS, con el mismo
      formato que escribía Codigo.gs.
   2. BASE DE DATOS → Base de postulantes del portal.
      - Personas nuevas → se agregan.
      - Personas que ya están (mismo DNI o email) → solo se completan datos
        vacíos; lo editado en el portal no se pisa.
      - Quien figure ACTIVO en BLOQUEADOS llega como "Bloqueado".
   3. BLOQUEADOS → portal (la página los usa para no dejar pasar a nadie bloqueado).
   4. Proceso de Ingreso → portal (botón "Datos de ingreso" de Vacantes).

   Todo queda dentro de PortalSync: se puede pegar como un archivo más del
   proyecto de TAREAS GRUPALES sin chocar con Codigo.gs, Onboarding.gs, etc.

   INSTALAR (una sola vez):
   1. TAREAS GRUPALES → Extensiones → Apps Script → ＋ Archivo → Secuencia de
      comandos → nombre: SincronizarPortal → pegar este archivo → Guardar.
      (También funciona como proyecto aparte en script.google.com.)
   2. ⚙️ Configuración del proyecto → Propiedades de la secuencia de comandos
      → Agregar: CODIGO_EQUIPO = (el código del equipo del portal).
   3. Elegir probarConexionPortal → Ejecutar → aceptar permisos → tiene que decir ✅.
   4. Elegir activarSincronizacionPortal → Ejecutar.
   Listo. Para frenarla: desactivarSincronizacionPortal. A mano: sincronizarPortal.
   ========================================================= */

function sincronizarPortal() { return PortalSync.sincronizar(true); }
function sincronizarPortalProgramado_() { return PortalSync.sincronizar(false); }
function activarSincronizacionPortal() { return PortalSync.activar(); }
function desactivarSincronizacionPortal() { return PortalSync.desactivar(); }
function probarConexionPortal() { return PortalSync.probarConexion(); }

var PortalSync = (function () {

  const SYNC = {
    SUPABASE_URL: 'https://gkotckcvookkbbtbctyp.supabase.co',
    SUPABASE_KEY: 'sb_publishable_iu66s54UVbg5AsF-AoekPA_6qKUevVH',   // clave pública; los datos los protege el código del equipo
    PLANILLA_ID: '1BeSkjch_rEdZx7QTRcJK0XV9fGcHcFpXWQX-vlFrT98',       // TAREAS GRUPALES
    HOJA_BASE: 'BASE DE DATOS',
    HOJA_BLOQUEADOS: 'BLOQUEADOS',
    HOJA_INGRESO: 'Proceso de Ingreso',
    MINUTOS: 10,
    HORA_DESDE: 7,     // el activador corre siempre; fuera de 7 a 23 h no hace nada
    HORA_HASTA: 23,
    LOTE: 200,
    ZONA_HORARIA: 'America/Argentina/Buenos_Aires',
    FUNCION_ACTIVADOR: 'sincronizarPortalProgramado_'
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
    interesado:         'estas interesado',
    dni:                'dni',
    cuil:               'cuil',
    nacionalidad:       'nacionalidad',
    tel_emergencia:     'tel emergencia',
    horario:            'horario',
    observaciones:      'observaciones',
    sugerido_para:      'sugerido para'
  };

  const COLUMNAS_BLOQUEADOS = {
    fecha: 'fecha', dni: 'dni', cuil: 'cuil', nombre: 'nombre', apellido: 'apellido',
    mail: 'mail', tel: 'tel', localidad: 'localidad', motivo: 'motivo', activo: 'activo'
  };

  // Campo del portal → encabezado en Proceso de Ingreso (respuestas del formulario de ingreso)
  const COLUMNAS_INGRESO = {
    email:            'email',
    marca_temporal:   'marca temporal',
    nombre:           'nombre',
    apellido:         'apellido',
    tel:              'telefono',
    tel_emergencia:   'tel emergencia',
    fecha_nacimiento: 'fecha de nacimiento',
    nacionalidad:     'nacionalidad',
    cuil:             'cuil',
    dni:              'dni',
    sexo:             'sexo',
    domicilio:        'domicilio',
    domicilio_numero: 'numero',
    codigo_postal:    'codigo postal',
    localidad:        'localidad',
    provincia:        'provincia',
    pais:             'pais'
  };

  const ZONAS_PORTAL = ['CABA', 'Norte', 'Oeste', 'Sur', 'Lejanos', 'Interior'];


  /* =========================================================
     LO QUE CORRE CADA 10 MINUTOS
     ========================================================= */

  // forzar = true: corre aunque sea fuera de horario (ejecución a mano)
  function sincronizar(forzar) {
    if (!forzar && !enHorario_()) return 'Fuera de horario: no se sincroniza.';
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) return 'Ya hay una sincronización corriendo.';
    try {
      const codigo = codigoEquipo_();
      const libro = SpreadsheetApp.openById(SYNC.PLANILLA_ID);
      const resumen = [
        paginaAPlanilla_(libro, codigo),     // primero: así lo nuevo ya viaja en los pasos siguientes
        baseAlPortal_(libro, codigo),
        bloqueadosAlPortal_(libro, codigo),
        ingresoAlPortal_(libro, codigo)
      ].filter(String).join('\n');
      console.log(resumen);
      return resumen;
    } finally {
      lock.releaseLock();
    }
  }

  function activar() {
    desactivar();
    ScriptApp.newTrigger(SYNC.FUNCION_ACTIVADOR).timeBased().everyMinutes(SYNC.MINUTOS).create();
    console.log('Sincronización activada cada ' + SYNC.MINUTOS + ' minutos (' + SYNC.HORA_DESDE + ' a ' + SYNC.HORA_HASTA + ' h). Primera corrida:');
    return sincronizar(true);
  }

  function desactivar() {
    ScriptApp.getProjectTriggers().forEach(function (t) {
      // También borra el activador de la versión anterior de este archivo (sincronizarBase)
      if ([SYNC.FUNCION_ACTIVADOR, 'sincronizarBase'].indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
    });
  }

  function probarConexion() {
    const ok = llamarPortal_('seleccion_codigo_ok', {}, codigoEquipo_());
    console.log(ok === true ? '✅ Conectado al portal: el código del equipo es correcto.' : '❌ El portal rechazó el código del equipo.');
    return ok;
  }

  function enHorario_() {
    const h = +Utilities.formatDate(new Date(), SYNC.ZONA_HORARIA, 'H');
    return h >= SYNC.HORA_DESDE && h <= SYNC.HORA_HASTA;
  }


  /* =========================================================
     1. PÁGINA "ELEGÍ TU VACANTE" → PLANILLA
     ========================================================= */

  function paginaAPlanilla_(libro, codigo) {
    const p = llamarPortal_('seleccion_web_pendientes', {}, codigo) || {};
    const base = p.base || [], bloq = p.bloqueados || [];
    if (!base.length && !bloq.length) return '';
    const tz = libro.getSpreadsheetTimeZone();

    // Se escribe y después se marca como copiado: si algo falla en el medio, en la próxima vuelta
    // se reintenta (a lo sumo queda una fila repetida, nunca una perdida).
    if (bloq.length) {
      agregarFilas_(libro, SYNC.HOJA_BLOQUEADOS, COLUMNAS_BLOQUEADOS, bloq.map(function (b) {
        return {
          fecha: fechaDeTexto_(b.fecha, SYNC.ZONA_HORARIA), dni: comoTexto_(b.dni), cuil: comoTexto_(b.cuil),
          nombre: seguro_(b.nombre), apellido: seguro_(b.apellido), mail: b.mail || '', tel: comoTexto_(b.tel),
          localidad: seguro_(b.localidad), motivo: b.motivo || '', activo: b.activo || 'SÍ'
        };
      }));
      SpreadsheetApp.flush();
      llamarPortal_('seleccion_web_en_planilla', { tabla: 'bloqueados', ids: bloq.map(function (b) { return b.id; }) }, codigo);
    }
    if (base.length) {
      agregarFilas_(libro, SYNC.HOJA_BASE, COLUMNAS_BASE, base.map(function (x) {
        return {
          nombre: seguro_(x.nombre), apellido: seguro_(x.apellido), email: x.mail || '', telefono: comoTexto_(x.tel),
          fecha_nacimiento: fechaDeTexto_(x.fecha_nacimiento, tz), zona: x.zona || '', localidad: seguro_(x.localidad),
          sede_entrevista: x.sede || '', estado: 'EN ESPERA', puesto_interes: x.puesto || '', horario: x.horario || '',
          observaciones: seguro_(x.observaciones), curso_manipulacion: x.manipulacion || '', antecedentes: x.antecedentes || '',
          interesado: x.interesado || '', dni: comoTexto_(x.dni), cuil: comoTexto_(x.cuil),
          nacionalidad: seguro_(x.nacionalidad), tel_emergencia: comoTexto_(x.tel_emergencia)
        };
      }));
      SpreadsheetApp.flush();
      llamarPortal_('seleccion_web_en_planilla', { tabla: 'base', ids: base.map(function (x) { return x.id; }) }, codigo);
    }
    return 'Página → planilla: ' + base.length + ' en ' + SYNC.HOJA_BASE + ', ' + bloq.length + ' en ' + SYNC.HOJA_BLOQUEADOS + '.';
  }

  // Agrega filas al final ubicando cada dato por el nombre de su columna (como escribirFilaBase_ de Codigo.gs)
  function agregarFilas_(libro, nombreHoja, columnas, filas) {
    const hoja = libro.getSheetByName(nombreHoja);
    if (!hoja) throw new Error('No encontré la pestaña "' + nombreHoja + '" en TAREAS GRUPALES.');
    const encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
    const idx = indicesColumnas_(encabezados, columnas);
    const matriz = filas.map(function (f) {
      const fila = encabezados.map(function () { return ''; });
      Object.keys(f).forEach(function (campo) { if (idx[campo] !== -1 && idx[campo] != null) fila[idx[campo]] = f[campo]; });
      return fila;
    });
    hoja.getRange(Math.max(hoja.getLastRow(), 1) + 1, 1, matriz.length, encabezados.length).setValues(matriz);
  }

  // WhatsApp, emergencia, DNI y CUIL como texto: el apóstrofo no se ve en la hoja
  function comoTexto_(v) {
    const s = String(v == null ? '' : v).trim();
    return s ? "'" + s : '';
  }

  // Evita que un texto se tome como fórmula
  function seguro_(v) {
    const s = String(v == null ? '' : v);
    return /^[=+\-@]/.test(s) ? "'" + s : s;
  }

  // "10/5/2000" o "3/11/2026 10:15:00" → fecha de la hoja ('' si no se entiende)
  function fechaDeTexto_(s, tz) {
    const m = String(s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: (\d{1,2}):(\d{2}):(\d{2}))?$/);
    if (!m) return '';
    const p = function (n) { return ('0' + (n || 0)).slice(-2); };
    return Utilities.parseDate(m[3] + '-' + p(m[2]) + '-' + p(m[1]) + ' ' + p(m[4]) + ':' + p(m[5]) + ':' + p(m[6]), tz, 'yyyy-MM-dd HH:mm:ss');
  }


  /* =========================================================
     2. BASE DE DATOS → PORTAL
     ========================================================= */

  function baseAlPortal_(libro, codigo) {
    const hoja = libro.getSheetByName(SYNC.HOJA_BASE);
    if (!hoja) throw new Error('No encontré la pestaña "' + SYNC.HOJA_BASE + '" en TAREAS GRUPALES.');
    const filas = filasDeLaBase_(hoja.getDataRange().getValues(), bloqueados_(libro));
    const total = { nuevos: 0, completados: 0, sin_cambios: 0, omitidas: 0 };
    for (let i = 0; i < filas.length; i += SYNC.LOTE) {
      const r = llamarPortal_('seleccion_sync_postulantes', { filas: filas.slice(i, i + SYNC.LOTE) }, codigo);
      Object.keys(total).forEach(function (k) { total[k] += r[k] || 0; });
    }
    return 'Base → portal: ' + total.nuevos + ' nuevos, ' + total.completados + ' completados, ' +
      total.sin_cambios + ' sin cambios, ' + total.omitidas + ' omitidas (sin nombre o sin DNI/email).';
  }

  function filasDeLaBase_(valores, bloq) {
    if (valores.length < 2) return [];
    const idx = indicesColumnas_(valores[0], COLUMNAS_BASE);
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
     3. BLOQUEADOS → PORTAL
     ========================================================= */

  function bloqueadosAlPortal_(libro, codigo) {
    const hoja = libro.getSheetByName(SYNC.HOJA_BLOQUEADOS);
    if (!hoja) return '';
    const filas = filasDeBloqueados_(hoja.getDataRange().getValues());
    const r = llamarPortal_('seleccion_sync_bloqueados', { filas: filas }, codigo) || {};
    return 'Bloqueados → portal: ' + (r.bloqueados || 0) + '.';
  }

  function filasDeBloqueados_(valores) {
    if (valores.length < 2) return [];
    const idx = indicesColumnas_(valores[0], COLUMNAS_BLOQUEADOS);
    if (idx.dni === -1 && idx.mail === -1) throw new Error('En ' + SYNC.HOJA_BLOQUEADOS + ' faltan las columnas DNI y MAIL.');
    const salida = [];
    for (let i = 1; i < valores.length; i++) {
      const v = valores[i];
      const dato = function (campo) { return idx[campo] === -1 ? '' : v[idx[campo]]; };
      const f = dato('fecha');
      const fila = {
        fecha: f instanceof Date && !isNaN(f.getTime()) ? Utilities.formatDate(f, SYNC.ZONA_HORARIA, "yyyy-MM-dd'T'HH:mm:ssXXX") : '',
        dni: soloDigitos_(dato('dni')),
        cuil: soloDigitos_(dato('cuil')),
        nombre: texto_(dato('nombre')),
        apellido: texto_(dato('apellido')),
        mail: texto_(dato('mail')).toLowerCase(),
        tel: telefono_(dato('tel')),
        localidad: texto_(dato('localidad')),
        motivo: texto_(dato('motivo')),
        activo: texto_(dato('activo'))
      };
      if (fila.dni || fila.cuil || fila.mail || fila.tel) salida.push(fila);
    }
    return salida;
  }


  /* =========================================================
     4. PROCESO DE INGRESO → PORTAL
     ========================================================= */

  function ingresoAlPortal_(libro, codigo) {
    const hoja = libro.getSheetByName(SYNC.HOJA_INGRESO);
    if (!hoja) return '';
    const ingresos = filasDeIngreso_(hoja.getDataRange().getValues());
    const t = { nuevas: 0, actualizadas: 0, omitidas: 0 };
    for (let i = 0; i < ingresos.length; i += SYNC.LOTE) {
      const r = llamarPortal_('seleccion_sync_ingresos', { filas: ingresos.slice(i, i + SYNC.LOTE) }, codigo);
      Object.keys(t).forEach(function (k) { t[k] += r[k] || 0; });
    }
    return 'Ingreso → portal: ' + t.nuevas + ' nuevas, ' + t.actualizadas + ' actualizadas, ' + t.omitidas + ' omitidas (sin email o sin marca temporal).';
  }

  // Formulario de ingreso: una fila por respuesta (email + marca temporal)
  function filasDeIngreso_(valores) {
    if (valores.length < 2) return [];
    const idx = indicesColumnas_(valores[0], COLUMNAS_INGRESO);
    if (idx.email === -1 || idx.marca_temporal === -1) throw new Error('En ' + SYNC.HOJA_INGRESO + ' faltan las columnas EMAIL o Marca temporal.');

    const salida = [];
    for (let i = 1; i < valores.length; i++) {
      const v = valores[i];
      const dato = function (campo) { return idx[campo] === -1 ? '' : v[idx[campo]]; };
      const email = texto_(dato('email')).toLowerCase().replace(/\s+/g, '');
      const marca = dato('marca_temporal');
      if (!email || !(marca instanceof Date)) continue;
      salida.push({
        email: email,
        marca_temporal: Utilities.formatDate(marca, SYNC.ZONA_HORARIA, "yyyy-MM-dd'T'HH:mm:ssXXX"),
        nombre: texto_(dato('nombre')),
        apellido: texto_(dato('apellido')),
        tel: telefono_(dato('tel')),
        tel_emergencia: telefono_(dato('tel_emergencia')),
        fecha_nacimiento: fecha_(dato('fecha_nacimiento')),
        nacionalidad: texto_(dato('nacionalidad')),
        cuil: soloDigitos_(dato('cuil')),
        dni: soloDigitos_(dato('dni')),
        sexo: texto_(dato('sexo')),
        domicilio: texto_(dato('domicilio')),
        domicilio_numero: soloDigitos_(dato('domicilio_numero')) || texto_(dato('domicilio_numero')),
        codigo_postal: telefono_(dato('codigo_postal')),
        localidad: texto_(dato('localidad')),
        provincia: texto_(dato('provincia')),
        pais: texto_(dato('pais'))
      });
    }
    return salida;
  }


  /* =========================================================
     LIMPIEZA DE DATOS
     ========================================================= */

  function indicesColumnas_(encabezados, columnas) {
    const enc = encabezados.map(normalizar_);
    const idx = {};
    Object.keys(columnas).forEach(function (campo) {
      const buscado = columnas[campo];
      let i = enc.indexOf(buscado);                       // primero exacto ("estado" ≠ "estado envio")
      if (i === -1) i = enc.findIndex(function (h) { return h.indexOf(buscado) === 0; });
      idx[campo] = i;
    });
    return idx;
  }

  function normalizar_(v) {
    return String(v == null ? '' : v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
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
  // Un año de dos cifras ("12/1/96", que la hoja guarda como año 0096) se toma como 1996.
  function fecha_(v) {
    let a, mes, d;
    if (v instanceof Date) {
      if (isNaN(v.getTime())) return '';
      a = +Utilities.formatDate(v, SYNC.ZONA_HORARIA, 'yyyy');
      mes = +Utilities.formatDate(v, SYNC.ZONA_HORARIA, 'M');
      d = +Utilities.formatDate(v, SYNC.ZONA_HORARIA, 'd');
    } else {
      const m = texto_(v).match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
      if (!m) return '';
      d = +m[1]; mes = +m[2]; a = +m[3];
    }
    if (a < 100) a += a > 30 ? 1900 : 2000;
    const f = new Date(Date.UTC(a, mes - 1, d));
    if (f.getUTCDate() !== d || f.getUTCMonth() !== mes - 1) return '';   // 31/02 → sin fecha
    if (a < 1930 || a > new Date().getFullYear()) return '';
    return a + '-' + ('0' + mes).slice(-2) + '-' + ('0' + d).slice(-2);
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
    if (status === 404) throw new Error('Falta en Supabase la función ' + funcion + ' (correr los SQL de la carpeta sql/).');
    if (status === 401 || status === 403 || texto.indexOf('42501') !== -1) throw new Error('El portal rechazó el código del equipo (revisá CODIGO_EQUIPO).');
    throw new Error('El portal respondió ' + status + ': ' + texto.substring(0, 200));
  }

  return {
    sincronizar: sincronizar, activar: activar, desactivar: desactivar, probarConexion: probarConexion,
    // Para las pruebas
    _t: {
      filasDeLaBase_: filasDeLaBase_, filasDeIngreso_: filasDeIngreso_, filasDeBloqueados_: filasDeBloqueados_,
      bloqueados_: bloqueados_, llamarPortal_: llamarPortal_, horario_: horario_, fecha_: fecha_, estado_: estado_,
      agregarFilas_: agregarFilas_, fechaDeTexto_: fechaDeTexto_, enHorario_: enHorario_
    }
  };
})();
