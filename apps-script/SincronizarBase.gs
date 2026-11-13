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
      - Queda "Bloqueado" quien NO está interesado en la propuesta o figura ACTIVO
        en BLOQUEADOS (los bloqueos por documentación incompleta ya no cuentan).
      - Rechazados por el zonal (ACTIVO en BLOQUEADOS con motivo RECHAZADO ZONAL,
        lo agrega el portal solo): sus filas se sacan de BASE DE DATOS.
   3. BLOQUEADOS → portal (la página los usa para no dejar pasar a nadie bloqueado).
   4. Proceso de Ingreso → portal (botón "Datos de ingreso" de Vacantes).
   5. Zonales (como Zonales.gs): las vacantes de Extremas que en el portal están en
      ENVIADO A ZONAL se agregan a "Base de Candidatos" de la hoja del regional
      (pestaña HOJAS ZONALES: REGIONAL | LINK). Cuando el zonal pone APROBADO o
      DESAPROBADO, la vacante pasa a APROBADO ZONAL / RECHAZADO ZONAL; si cambió
      PUESTO u HORARIO se copian, y sus OBSERVACIONES quedan en el historial.
      El RECHAZADO ZONAL deja a la persona Bloqueada (sql/rechazado_zonal.sql): en
      la próxima vuelta pasa a BLOQUEADOS y sale de BASE DE DATOS.
   6. Onboarding (como Onboarding.gs): las citaciones que se piden en el portal
      (panel "Zonal y onboarding") salen con el mismo mail de bienvenida y el
      botón "Confirmo asistencia"; la vacante pasa a CITADO. Si algo falta
      (dirección, primer día…) no sale y el motivo queda en el panel.
   7. Asignaciones (como el Contador de Vacantes): las hojas de asignaciones de
      cada marca (A selector, B regional, C zonal, D local, V estado del local)
      cargan el Mapa de equipos del portal. Un dato se actualiza solo cuando
      cambia en la hoja: lo reasignado a mano en el portal se respeta.
   8. Solicitudes Extremas / Sabores → Vacantes del portal: cada fila es una
      vacante. Una fila nueva crea la vacante; lo que se cambia en la hoja
      (estado, persona, fechas…) se pasa al portal. Un dato se actualiza solo
      cuando cambia en la hoja: lo editado a mano en el portal se respeta.
      El N° de vacante queda guardado en la fila como dato oculto (no agrega
      columnas). Borrar una fila de la hoja no borra la vacante del portal.
      Para empezar de cero una fila conviene borrarla (no solo vaciarla).

   Todo queda dentro de PortalSync: se puede pegar como un archivo más del
   proyecto de TAREAS GRUPALES sin chocar con Codigo.gs, Onboarding.gs, etc.

   INSTALAR (una sola vez):
   1. TAREAS GRUPALES → Extensiones → Apps Script → ＋ Archivo → Secuencia de
      comandos → nombre: SincronizarPortal → pegar este archivo → Guardar.
      (También funciona como proyecto aparte en script.google.com.)
   2. Más abajo, en CODIGO_PORTAL_PARA_GUARDAR, escribir el código del equipo
      entre las comillas → Guardar → elegir guardarCodigoPortal → Ejecutar →
      aceptar permisos → tiene que decir ✅. Después BORRAR el código de esa
      línea (dejar '') y Guardar: ya quedó guardado aparte, sin estar a la vista.
   3. Elegir activarSincronizacionPortal → Ejecutar.
   Listo. Para frenarla: desactivarSincronizacionPortal. A mano: sincronizarPortal.
   4. (Botón Actualizar del portal) Implementar → Gestionar implementaciones → la
      Aplicación web que ya existe → editar (lápiz) → Versión: Nueva versión →
      Ejecutar como: Yo · Acceso: Cualquier usuario → Implementar. Si no hay
      ninguna: Implementar → Nueva implementación → Aplicación web. El link
      (termina en /exec) va en SYNC_DRIVE_URL de config.js del portal.
   ========================================================= */

function sincronizarPortal() { return PortalSync.sincronizar(true); }
function sincronizarPortalProgramado_() { return PortalSync.sincronizar(false); }
function activarSincronizacionPortal() { return PortalSync.activar(); }
function desactivarSincronizacionPortal() { return PortalSync.desactivar(); }
function probarConexionPortal() { return PortalSync.probarConexion(); }

// Botón "Actualizar" del portal: sincroniza con Drive en el momento, sin entrar al Apps Script.
// Necesita que el proyecto esté implementado como Aplicación web (Ejecutar como: yo · Acceso: cualquier usuario).
// Usa doPost: el doGet de Codigo.gs (Elegí tu vacante / confirmación de onboarding) sigue igual.
function doPost(e) { return PortalSync.desdeElPortal(e); }

// PASO 2 de INSTALAR: el código va acá solo un momento. Después de ejecutar guardarCodigoPortal, dejalo vacío ('').
var CODIGO_PORTAL_PARA_GUARDAR = '';

function guardarCodigoPortal() {
  const c = String(CODIGO_PORTAL_PARA_GUARDAR || '').trim();
  if (!c) {
    const ya = PropertiesService.getScriptProperties().getProperty('CODIGO_EQUIPO');
    throw new Error(ya ? 'El código ya está guardado. Para cambiarlo, escribilo en CODIGO_PORTAL_PARA_GUARDAR y volvé a ejecutar.'
                       : 'Escribí el código del equipo en CODIGO_PORTAL_PARA_GUARDAR (entre las comillas), guardá y volvé a ejecutar.');
  }
  PropertiesService.getScriptProperties().setProperty('CODIGO_EQUIPO', c);
  if (PortalSync.probarConexion() !== true) throw new Error('❌ Quedó guardado, pero el portal no lo reconoce: revisá que sea el mismo código del portal.');
  console.log('✅ Código guardado. Ahora borrá el código de CODIGO_PORTAL_PARA_GUARDAR (dejá \'\'), guardá y seguí con activarSincronizacionPortal.');
}

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
    FUNCION_ACTIVADOR: 'sincronizarPortalProgramado_',
    // Hojas de asignaciones (pestaña por gid, así no importa si le cambian el nombre)
    ASIGNACIONES: [
      { marca: 'Sabores Express', id: '1z8_8ijE9A7ADztRwqmGnFKOubnX8a9wzWK05aC-yv-w', gid: 1681270762 },
      { marca: 'Hamburguesas Extremas', id: '1OWN-mp67qcvq3l7DgufHlvXnuPfl2zmtZk6EEHAydos', gid: 69709546 }
    ]
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
    sugerido_para:      'sugerido para',
    // Lo que lleva la vacante: la página Elegí tu vacante lo pide y estas columnas se crean solas si faltan
    sexo:               'sexo',
    domicilio:          'domicilio',
    domicilio_numero:   'numero domicilio',
    codigo_postal:      'codigo postal',
    provincia:          'provincia',
    pais:               'pais'
  };
  const COLUMNAS_NUEVAS_BASE = ['SEXO', 'DOMICILIO', 'NUMERO DOMICILIO', 'CODIGO POSTAL', 'PROVINCIA', 'PAIS'];

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
        ingresoAlPortal_(libro, codigo),
        solicitudesAlPortal_(libro, codigo),  // antes de zonales y onboarding: así lo nuevo de la hoja sigue el circuito
        zonalesAlPortal_(libro, codigo),
        citacionesDelPortal_(codigo),
        asignacionesAlPortal_(codigo)
      ].filter(String).join('\n');
      console.log(resumen);
      return resumen;
    } finally {
      lock.releaseLock();
    }
  }

  // Pedido del botón Actualizar: solo con el código del equipo; si corrió hace menos de un minuto, no repite
  function desdeElPortal(e) {
    const salida = function (o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); };
    let pedido = {};
    try { pedido = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { /* cuerpo inválido */ }
    const guardado = PropertiesService.getScriptProperties().getProperty('CODIGO_EQUIPO');
    if (!guardado || String(pedido.codigo || '').trim() !== guardado.trim()) {
      Utilities.sleep(1500);   // frena a quien pruebe códigos
      return salida({ ok: false, error: 'Código del equipo incorrecto.' });
    }
    const cache = CacheService.getScriptCache();
    const reciente = cache.get('portal_sync_resumen');
    if (reciente != null) return salida({ ok: true, reciente: true, resumen: reciente });
    try {
      const resumen = sincronizar(true);
      cache.put('portal_sync_resumen', String(resumen || ''), 60);
      return salida({ ok: true, resumen: resumen });
    } catch (err) {
      return salida({ ok: false, error: err.message });
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
          nombre: seguro_(b.nombre), apellido: seguro_(b.apellido), mail: seguro_(b.mail), tel: comoTexto_(b.tel),
          localidad: seguro_(b.localidad), motivo: b.motivo || '', activo: b.activo || 'SÍ'
        };
      }));
      SpreadsheetApp.flush();
      llamarPortal_('seleccion_web_en_planilla', { tabla: 'bloqueados', ids: bloq.map(function (b) { return b.id; }) }, codigo);
    }
    if (base.length) {
      asegurarColumnas_(libro.getSheetByName(SYNC.HOJA_BASE), COLUMNAS_NUEVAS_BASE);
      agregarFilas_(libro, SYNC.HOJA_BASE, COLUMNAS_BASE, base.map(function (x) {
        return {
          nombre: seguro_(x.nombre), apellido: seguro_(x.apellido), email: seguro_(x.mail), telefono: comoTexto_(x.tel),
          fecha_nacimiento: fechaDeTexto_(x.fecha_nacimiento, tz), zona: x.zona || '', localidad: seguro_(x.localidad),
          sede_entrevista: x.sede || '', estado: 'EN ESPERA', puesto_interes: x.puesto || '', horario: x.horario || '',
          observaciones: seguro_(x.observaciones), curso_manipulacion: x.manipulacion || '', antecedentes: x.antecedentes || '',
          interesado: x.interesado || '', dni: comoTexto_(x.dni), cuil: comoTexto_(x.cuil),
          nacionalidad: seguro_(x.nacionalidad), tel_emergencia: comoTexto_(x.tel_emergencia),
          sexo: x.sexo || '', domicilio: seguro_(x.domicilio), domicilio_numero: comoTexto_(x.domicilio_numero),
          codigo_postal: comoTexto_(x.codigo_postal), provincia: x.provincia || '', pais: seguro_(x.pais)
        };
      }));
      SpreadsheetApp.flush();
      llamarPortal_('seleccion_web_en_planilla', { tabla: 'base', ids: base.map(function (x) { return x.id; }) }, codigo);
    }
    return 'Página → planilla: ' + base.length + ' en ' + SYNC.HOJA_BASE + ', ' + bloq.length + ' en ' + SYNC.HOJA_BLOQUEADOS + '.';
  }

  // Suma al final del encabezado las columnas que falten (como bloquear_ de Codigo.gs)
  function asegurarColumnas_(hoja, nombres) {
    if (!hoja) return;
    const enc = hoja.getRange(1, 1, 1, Math.max(hoja.getLastColumn(), 1)).getValues()[0];
    const hay = enc.map(normalizar_);
    const faltan = nombres.filter(function (n) { return hay.indexOf(normalizar_(n)) === -1; });
    if (!faltan.length) return;
    let desde = enc.length;
    while (desde > 0 && String(enc[desde - 1]).trim() === '') desde--;   // pegadas a la última columna con encabezado
    hoja.getRange(1, desde + 1, 1, faltan.length).setValues([faltan]);
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
    const bloq = bloqueados_(libro);
    let valores = hoja.getDataRange().getValues();
    const quitar = filasRechazadasZonal_(valores, bloq);
    let aviso = '';
    if (quitar.length) {
      try {
        borrarFilas_(hoja, quitar);
        const fuera = {};
        quitar.forEach(function (i) { fuera[i] = true; });
        valores = valores.filter(function (_, i) { return !fuera[i]; });
        aviso = 'Rechazados por el zonal: ' + quitar.length + ' filas fuera de ' + SYNC.HOJA_BASE + ' (quedan en ' + SYNC.HOJA_BLOQUEADOS + ').\n';
      } catch (err) {
        // Si no se pueden borrar (hoja protegida, filtro…), igual viajan como Bloqueado
        aviso = 'Rechazados por el zonal: no pude sacar ' + quitar.length + ' filas de ' + SYNC.HOJA_BASE + ': ' + String((err && err.message) || err).slice(0, 120) + '\n';
      }
    }
    const filas = filasDeLaBase_(valores, bloq);
    const total = { nuevos: 0, completados: 0, sin_cambios: 0, omitidas: 0 };
    for (let i = 0; i < filas.length; i += SYNC.LOTE) {
      const r = llamarPortal_('seleccion_sync_postulantes', { filas: filas.slice(i, i + SYNC.LOTE) }, codigo);
      Object.keys(total).forEach(function (k) { total[k] += r[k] || 0; });
    }
    return aviso + 'Base → portal: ' + total.nuevos + ' nuevos, ' + total.completados + ' completados, ' +
      total.sin_cambios + ' sin cambios, ' + total.omitidas + ' omitidas (sin nombre o sin DNI/email).';
  }

  // Índices (de valores) de las filas de BASE DE DATOS cuya persona fue rechazada por el zonal
  // (figura ACTIVA en BLOQUEADOS con motivo RECHAZADO ZONAL, por DNI o mail)
  function filasRechazadasZonal_(valores, bloq) {
    const r = bloq.rechazadosZonal;
    if (valores.length < 2 || (!Object.keys(r.dnis).length && !Object.keys(r.emails).length)) return [];
    const idx = indicesColumnas_(valores[0], { dni: COLUMNAS_BASE.dni, email: COLUMNAS_BASE.email });
    const salida = [];
    for (let i = 1; i < valores.length; i++) {
      const dni = idx.dni === -1 ? '' : soloDigitos_(valores[i][idx.dni]).replace(/^0+/, '');
      const email = idx.email === -1 ? '' : texto_(valores[i][idx.email]).toLowerCase();
      if ((dni && r.dnis[dni]) || (email && r.emails[email])) salida.push(i);
    }
    return salida;
  }

  // Borra filas (índices de valores, 0 = encabezado) de abajo hacia arriba, de a bloques seguidos
  function borrarFilas_(hoja, indices) {
    const filas = indices.map(function (i) { return i + 1; }).sort(function (a, b) { return a - b; });
    let k = filas.length - 1;
    while (k >= 0) {
      let desde = filas[k], n = 1;
      while (k - n >= 0 && filas[k - n] === desde - 1) { desde--; n++; }
      hoja.deleteRows(desde, n);
      k -= n;
    }
    SpreadsheetApp.flush();
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
      const interesado = siNo_(dato('interesado'));
      let estado = estado_(dato('estado'));
      if (interesado === 'No' || (dni && bloq.dnis[dni]) || (email && bloq.emails[email])) estado = 'Bloqueado';

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
        sugerido_para: texto_(dato('sugerido_para')),
        interesado: interesado,
        sexo: sexo_(dato('sexo')),
        domicilio: texto_(dato('domicilio')),
        domicilio_numero: telefono_(dato('domicilio_numero')),
        codigo_postal: telefono_(dato('codigo_postal')),
        provincia: texto_(dato('provincia')),
        pais: texto_(dato('pais'))
      });
    }
    return salida;
  }

  // DNIs y mails de la pestaña BLOQUEADOS con ACTIVO = SÍ (menos los bloqueos por documentación incompleta).
  // rechazadosZonal: los que además tienen motivo RECHAZADO ZONAL (se sacan de BASE DE DATOS).
  function bloqueados_(libro) {
    const res = { dnis: {}, emails: {}, rechazadosZonal: { dnis: {}, emails: {} } };
    const hoja = libro.getSheetByName(SYNC.HOJA_BLOQUEADOS);
    if (!hoja) return res;
    const valores = hoja.getDataRange().getValues();
    if (valores.length < 2) return res;
    const enc = valores[0].map(normalizar_);
    const cDni = enc.indexOf('dni'), cMail = enc.indexOf('mail'), cActivo = enc.indexOf('activo'), cMotivo = enc.indexOf('motivo');
    for (let i = 1; i < valores.length; i++) {
      const v = valores[i];
      if (cActivo !== -1 && normalizar_(v[cActivo]).indexOf('s') !== 0) continue;
      if (cMotivo !== -1 && normalizar_(v[cMotivo]).indexOf('documentacion incompleta') !== -1) continue;
      const dni = cDni === -1 ? '' : soloDigitos_(v[cDni]);
      const mail = cMail === -1 ? '' : texto_(v[cMail]).toLowerCase();
      if (dni) res.dnis[dni] = true;
      if (mail) res.emails[mail] = true;
      const motivo = cMotivo === -1 ? '' : normalizar_(v[cMotivo]);
      if (motivo.indexOf('rechaz') !== -1 && motivo.indexOf('zonal') !== -1) {
        if (dni) res.rechazadosZonal.dnis[dni.replace(/^0+/, '')] = true;
        if (mail) res.rechazadosZonal.emails[mail] = true;
      }
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
     5. ZONALES: hoja de cada regional ⇄ portal
     ========================================================= */

  const ZONALES = {
    pestanaConfig: 'HOJAS ZONALES',          // REGIONAL | LINK (la misma que usa Zonales.gs)
    pestanaZonal: 'Base de Candidatos',
    columnaId: 'ID POSTULANTE',
    // Columna de la hoja del zonal ← dato de la vacante del portal
    ida: [
      ['Solo Nombre', 'nombre'], ['Solo Apellido', 'apellido'], ['E-mail de contacto', 'email'],
      ['Número de WhatsApp', 'tel'], ['Fecha de nacimiento', 'fecha_nacimiento'], ['Zona de Residencia', 'zona'],
      ['Localidad de Residencia', 'localidad'], ['Vacante para la que fue considerado', 'local'],
      ['PUESTO', 'puesto'], ['HORARIO', 'jornada']
    ]
  };

  /* =========================================================
     7. ASIGNACIONES → MAPA DE EQUIPOS
     ========================================================= */

  function asignacionesAlPortal_(codigo) {
    const lineas = [];
    let filas = [];
    SYNC.ASIGNACIONES.forEach(function (fuente) {
      try {
        filas = filas.concat(filasDeAsignaciones_(fuente));
      } catch (e) {
        lineas.push('Asignaciones ' + fuente.marca + ': no se pudo leer la hoja (' + e.message + ').');
      }
    });
    if (!filas.length) return lineas.join('\n');
    const total = { actualizados: 0, sin_local: [], sin_selector: [] };
    for (let i = 0; i < filas.length; i += SYNC.LOTE) {
      const r = llamarPortal_('seleccion_asignaciones_sync', { filas: filas.slice(i, i + SYNC.LOTE) }, codigo) || {};
      total.actualizados += r.actualizados || 0;
      total.sin_local = total.sin_local.concat(r.sin_local || []);
      total.sin_selector = total.sin_selector.concat(r.sin_selector || []);
    }
    if (total.actualizados) lineas.push('Asignaciones → portal: ' + total.actualizados + ' locales actualizados.');
    if (total.sin_local.length) lineas.push('Asignaciones: ' + total.sin_local.length + ' locales de la hoja no están en el portal: ' + total.sin_local.join(', ') + '.');
    if (total.sin_selector.length) lineas.push('Asignaciones: selector sin coincidencia en Equipo: ' + total.sin_selector.slice(0, 5).join(', ') + '.');
    return lineas.join('\n');
  }

  function filasDeAsignaciones_(fuente) {
    const libro = SpreadsheetApp.openById(fuente.id);
    const hoja = libro.getSheets().filter(function (h) { return h.getSheetId() === Number(fuente.gid); })[0];
    if (!hoja) throw new Error('no está la pestaña gid ' + fuente.gid);
    const ultima = hoja.getLastRow();
    if (!ultima) return [];
    const valores = hoja.getRange(1, 1, ultima, Math.min(22, Math.max(4, hoja.getLastColumn()))).getDisplayValues();
    const vistos = {};
    return valores.map(function (f) {
      return { marca: fuente.marca, selector: texto_(f[0]), regional: texto_(f[1]), zonal: texto_(f[2]), local: texto_(f[3]), estado: texto_(f[21]) };
    }).filter(function (a) {
      if (!a.local || (!a.selector && !a.regional && !a.zonal)) return false;
      const n = normalizar_(a.local);
      if (n === 'local' || (normalizar_(a.selector).indexOf('selector') !== -1 && n.indexOf('local') !== -1)) return false;   // encabezado
      if (vistos[n]) return false;
      vistos[n] = true;
      return true;
    });
  }

  function zonalesAlPortal_(libro, codigo) {
    const vacantes = llamarPortal_('seleccion_zonal_pendientes', {}, codigo) || [];
    if (!vacantes.length) return '';
    const hojas = hojasZonales_(libro);
    const res = { enviados: 0, vinculados: 0, sinHoja: {}, errores: [] };
    const marcar = [], respuestas = [];

    const porRegional = {};
    vacantes.forEach(function (v) { (porRegional[normalizar_(v.regional)] = porRegional[normalizar_(v.regional)] || []).push(v); });

    Object.keys(porRegional).forEach(function (regional) {
      const grupo = porRegional[regional];
      const id = hojas[regional];
      if (!id) { res.sinHoja[grupo[0].regional || '(sin regional)'] = true; return; }
      try {
        const libroZonal = SpreadsheetApp.openById(id);
        const indice = indiceZonal_(libroZonal);
        // VUELTA primero: respuestas de los que ya estaban en su hoja
        grupo.forEach(function (v) {
          const r = indice.respPorId[v.id_postulante] || (v.email && indice.respPorEmail[v.email]);
          if (!r) return;
          const est = normalizar_(r.estado);
          if (est === 'aprobado' || est === 'desaprobado') {
            respuestas.push({ id: v.id, resultado: est.toUpperCase(), puesto: r.puesto, horario: r.horario, obs: r.obs });
          }
        });
        // IDA: los que todavía no se copiaron
        const nuevas = [];
        grupo.filter(function (v) { return !v.copiado; }).forEach(function (v) {
          if (indice.porId[v.id_postulante]) { marcar.push({ id: v.id, id_postulante: v.id_postulante }); return; }
          const donde = v.email && indice.porEmail[v.email];
          if (donde) {                                    // estaba copiada a mano: solo se completa el Id
            const col = donde.hoja.getSheetId() === indice.base.getSheetId() ? columnaIdZonal_(indice) : donde.idCol;
            if (col !== -1) donde.hoja.getRange(donde.fila, col + 1).setValue(v.id_postulante);
            marcar.push({ id: v.id, id_postulante: v.id_postulante });
            res.vinculados++;
            return;
          }
          nuevas.push(v);
        });
        if (nuevas.length) {
          const base = indice.base;
          const tz = libroZonal.getSpreadsheetTimeZone();
          const mapa = ZONALES.ida.map(function (m) { return { col: columnaZonal_(indice.encabezados, m[0]), campo: m[1] }; })
            .filter(function (m) { return m.col !== -1; });
          if (!mapa.length) throw new Error('"' + ZONALES.pestanaZonal + '" no tiene las columnas de siempre (Solo Nombre, E-mail…)');
          const colId = columnaIdZonal_(indice);
          const desde = Math.min.apply(null, mapa.map(function (m) { return m.col; }));
          const hasta = Math.max.apply(null, mapa.map(function (m) { return m.col; }));
          const destino = Math.max(base.getLastRow(), 1) + 1;
          const filas = nuevas.map(function (v) {
            const fila = new Array(hasta - desde + 1).fill('');
            mapa.forEach(function (m) { fila[m.col - desde] = valorParaZonal_(v, m.campo, tz); });
            return fila;
          });
          base.getRange(destino, desde + 1, filas.length, filas[0].length).setValues(filas);
          base.getRange(destino, colId + 1, nuevas.length, 1).setValues(nuevas.map(function (v) { return [v.id_postulante]; }));
          nuevas.forEach(function (v) { marcar.push({ id: v.id, id_postulante: v.id_postulante }); });
          res.enviados += nuevas.length;
        }
      } catch (err) {
        const msg = String((err && err.message) || err);
        res.errores.push(grupo[0].regional + ': ' + (/proteg/i.test(msg)
          ? 'su hoja tiene celdas protegidas y la cuenta que corre el script no puede editarlas.' : msg.slice(0, 120)));
      }
    });

    if (marcar.length) { SpreadsheetApp.flush(); llamarPortal_('seleccion_zonal_marcar', { filas: marcar }, codigo); }
    const r = respuestas.length ? llamarPortal_('seleccion_zonal_respuestas', { filas: respuestas }, codigo) || {} : {};
    let txt = 'Zonales: ' + res.enviados + ' enviados' + (res.vinculados ? ' (+' + res.vinculados + ' que ya estaban)' : '') +
      ', ' + (r.aprobados || 0) + ' aprobados, ' + (r.rechazados || 0) + ' rechazados.';
    if (Object.keys(res.sinHoja).length) txt += ' Sin hoja en ' + ZONALES.pestanaConfig + ': ' + Object.keys(res.sinHoja).join(', ') + '.';
    if (res.errores.length) txt += ' Avisos: ' + res.errores.join(' | ');
    return txt;
  }

  // { REGIONAL normalizado: id de su hoja } desde la pestaña HOJAS ZONALES de TAREAS GRUPALES
  function hojasZonales_(libro) {
    const hoja = libro.getSheetByName(ZONALES.pestanaConfig);
    const mapa = {};
    if (!hoja || hoja.getLastRow() < 2) return mapa;
    hoja.getRange(2, 1, hoja.getLastRow() - 1, 2).getDisplayValues().forEach(function (f) {
      const m = String(f[1] || '').trim().match(/\/d\/([-\w]{25,})/) || String(f[1] || '').trim().match(/^([-\w]{25,})$/);
      if (normalizar_(f[0]) && m) mapa[normalizar_(f[0])] = m[1];
    });
    return mapa;
  }

  // Columna del zonal: igual al nombre o que empiece con él (sin tildes ni signos)
  function columnaZonal_(encabezados, nombre) {
    const enc = encabezados.map(normalizar_), n = normalizar_(nombre);
    let i = enc.indexOf(n);
    if (i === -1) i = enc.findIndex(function (h) { return h && h.indexOf(n) === 0; });
    return i;
  }

  // Columnas de una pestaña del zonal (0-based)
  function columnasDeZonal_(enc) {
    const c = function (n) { return columnaZonal_(enc, n); };
    const email = [c('E-mail de contacto'), c('Email'), c('Mail')].filter(function (i) { return i !== -1; })[0];
    return { email: email === undefined ? -1 : email, estado: c('ESTADO'), puesto: c('PUESTO'), horario: c('HORARIO'),
      obs: c('OBSERVACIONES'), id: c(ZONALES.columnaId) };
  }

  // ID POSTULANTE en "Base de Candidatos": si no existe la columna, se crea al final
  function columnaIdZonal_(indice) {
    if (indice.cols.id !== -1) return indice.cols.id;
    const base = indice.base, enc = indice.encabezados;
    let ultima = enc.length;
    while (ultima > 0 && !String(enc[ultima - 1]).trim()) ultima--;
    if (ultima >= base.getMaxColumns()) base.insertColumnAfter(ultima);
    base.getRange(1, ultima + 1).setValue(ZONALES.columnaId);
    enc[ultima] = ZONALES.columnaId;
    indice.cols.id = ultima;
    return ultima;
  }

  // Dónde está cada persona y qué respondió el zonal, en "Base de Candidatos" y en las demás pestañas
  function indiceZonal_(libroZonal) {
    const base = libroZonal.getSheetByName(ZONALES.pestanaZonal);
    if (!base) throw new Error('su hoja no tiene la pestaña "' + ZONALES.pestanaZonal + '"');
    const encabezados = base.getRange(1, 1, 1, Math.max(base.getLastColumn(), 1)).getDisplayValues()[0];
    const indice = { base: base, encabezados: encabezados, cols: columnasDeZonal_(encabezados), porId: {}, porEmail: {}, respPorId: {}, respPorEmail: {} };
    const pestanas = [base].concat(libroZonal.getSheets().filter(function (s) { return s.getSheetId() !== base.getSheetId(); }));
    pestanas.forEach(function (pestana) {
      if (pestana.getLastRow() < 2 || pestana.getLastColumn() < 3) return;
      const datos = pestana.getRange(1, 1, pestana.getLastRow(), pestana.getLastColumn()).getDisplayValues();
      const c = pestana.getSheetId() === base.getSheetId() ? indice.cols : columnasDeZonal_(datos[0]);
      if (c.email === -1 && c.id === -1) return;
      for (let k = 1; k < datos.length; k++) {
        const f = datos[k];
        const email = c.email !== -1 ? String(f[c.email] || '').trim().toLowerCase() : '';
        const id = c.id !== -1 ? String(f[c.id] || '').trim() : '';
        if (!email && !id) continue;
        const donde = { hoja: pestana, fila: k + 1, idCol: c.id };
        if (id && !indice.porId[id]) indice.porId[id] = donde;
        if (email && !indice.porEmail[email]) indice.porEmail[email] = donde;
        const resp = {
          estado: c.estado !== -1 ? String(f[c.estado] || '').trim() : '',
          puesto: c.puesto !== -1 ? String(f[c.puesto] || '').trim() : '',
          horario: c.horario !== -1 ? String(f[c.horario] || '').trim() : '',
          obs: c.obs !== -1 ? String(f[c.obs] || '').trim() : ''
        };
        if (!resp.estado) continue;
        // Gana la primera respuesta (Base de Candidatos y después las demás pestañas)
        if (id && !indice.respPorId[id]) indice.respPorId[id] = resp;
        if (email && !indice.respPorEmail[email]) indice.respPorEmail[email] = resp;
      }
    });
    return indice;
  }

  function valorParaZonal_(v, campo, tz) {
    if (campo === 'puesto') {                       // "PART TIME (5HS)" → "PART TIME": el zonal lo ve y puede cambiarlo
      const n = normalizar_(v.puesto);
      return n.indexOf('part') !== -1 ? 'PART TIME' : n.indexOf('full') !== -1 ? 'FULL TIME' : (v.puesto || '');
    }
    if (campo === 'fecha_nacimiento') return fechaDeTexto_(v.fecha_nacimiento, tz);
    if (campo === 'tel') return comoTexto_(v.tel);
    return seguro_(v[campo] == null ? '' : v[campo]);
  }


  /* =========================================================
     6. ONBOARDING: citaciones pedidas en el portal → mail de bienvenida
     ========================================================= */

  // Lo mismo que ONBOARDING_CONFIG de Onboarding.gs (vive solo dentro de PortalSync)
  const ONBOARDING_CONFIG = {
    // color: encabezado y números de los pasos del mail · logo: va en el encabezado (si no carga, queda el nombre)
    marcas: {
      'Hamburguesas Extremas': { brand: 'EXTREMAS', subject: 'BIENVENIDA E INGRESO: HAMBURGUESAS EXTREMAS', signature: 'Hamburguesas Extremas',
        color: '#d71920', logo: 'https://kevingimenez9705-sketch.github.io/Portal-de-selecci-n-2.0/assets/logo-extremas.png' },
      'Sabores Express': { brand: 'SABORES', subject: 'BIENVENIDA E INGRESO: SABORES EXPRESS', signature: 'Sabores Express',
        color: '#b45309', logo: 'https://kevingimenez9705-sketch.github.io/Portal-de-selecci-n-2.0/assets/logo-sabores.png' }
    },
    // Empanada Mania va dentro de Sabores en el portal, pero el mail lleva su propio nombre
    mania: { brand: 'EMPANADA MANIA', subject: 'BIENVENIDA E INGRESO: EMPANADA MANIA', signature: 'Empanada Mania', color: '#0f766e', logo: '' },
    senderName: 'Equipo de Selección',
    officeAddress: 'Florida 428, CABA',
    // Código de Ética: paso 2 del mail, junto con la documentación obligatoria
    codigoEticaUrl: 'https://c-digo-de-etica.vercel.app/',
    scheduleText: 'Los horarios del puesto son rotativos.',
    firstDaySchedules: { partTime: '15:00 a 20:00 hs', fullTime: '11:00 a 20:00 hs' },
    // Página del portal que registra el "Confirmo asistencia"
    confirmarUrl: 'https://kevingimenez9705-sketch.github.io/Portal-de-selecci-n-2.0/confirmar.html',
    intervaloEntreCorreosMs: 1500,
    esperaReintentoMs: 2000
  };

  function citacionesDelPortal_(codigo) {
    const pendientes = llamarPortal_('seleccion_onb_pendientes', {}, codigo) || [];
    if (!pendientes.length) return '';
    let enviados = 0;
    const errores = [];
    pendientes.forEach(function (v, i) {
      let resultado;
      try {
        const data = datosCitacion_(v);
        if (MailApp.getRemainingDailyQuota() < 1) throw new Error('Se terminó el cupo diario de mails de Google: sale mañana.');
        if (i) Utilities.sleep(ONBOARDING_CONFIG.intervaloEntreCorreosMs);
        enviarConReintento_({
          to: v.email, subject: data.subject, body: crearTextoPlanoOnboarding_(data), htmlBody: crearEmailOnboarding_(data),
          name: ONBOARDING_CONFIG.senderName
        });
        resultado = { id: v.id, ok: true };
        enviados++;
      } catch (e) {
        resultado = { id: v.id, ok: false, error: String((e && e.message) || e) };
        errores.push((v.numero || v.id) + ': ' + resultado.error);
      }
      // Uno por uno: si algo corta a mitad de camino, lo ya enviado no se vuelve a mandar
      llamarPortal_('seleccion_onb_resultado', { filas: [resultado] }, codigo);
    });
    return 'Onboarding: ' + enviados + ' citaciones enviadas' + (errores.length ? ', ' + errores.length + ' sin enviar (' + errores.join(' | ') + ')' : '') + '.';
  }

  // Mismas reglas que procesarFilaOnboarding_ de Onboarding.gs
  function datosCitacion_(v) {
    const esMania = v.marca === 'Sabores Express' && /\bMANIA\b/.test(normalizarTextoOnboarding_(v.local));
    const marca = esMania ? ONBOARDING_CONFIG.mania : ONBOARDING_CONFIG.marcas[v.marca];
    if (!marca) throw new Error('Marca desconocida: ' + v.marca);
    const tz = SYNC.ZONA_HORARIA;
    const dia = function (iso) { return iso ? Utilities.parseDate(String(iso).slice(0, 10), tz, 'yyyy-MM-dd') : ''; };
    const local = String(v.local || '').trim();
    const trainingLocal = String(v.local_entrenamiento || '').trim();
    const position = String(v.puesto || '').trim();
    if (!local) throw new Error('Falta el LOCAL.');
    if (!position) throw new Error('Falta el PUESTO.');
    const onboardingDate = formatearFechaOnboarding_(dia(v.fecha_onboarding), tz);
    if (!onboardingDate) throw new Error('Falta la fecha de onboarding.');
    const onboardingTime = formatearHoraOnboarding_(v.hora_onboarding, tz);
    if (!onboardingTime) throw new Error('Falta la hora de onboarding.');
    const firstDayDate = formatearFechaOnboarding_(dia(v.primer_dia), tz);
    if (!firstDayDate) throw new Error('Falta el primer día.');
    if (!emailValidoOnboarding_(v.email)) throw new Error('Email inválido: ' + v.email);
    const firstDaySchedule = obtenerHorarioPrimerDiaOnboarding_(position);
    const opening = normalizarTextoOnboarding_(local).includes('APER');
    const localAddress = opening ? '' : String(v.direccion_local || '').trim();
    if (!opening && !localAddress) throw new Error('No se encontró dirección para "' + local + '" en la lista de locales.');
    if (opening && !trainingLocal) throw new Error('El LOCAL contiene APER pero no tiene LOCAL ENTRENAMIENTO.');
    const showTraining = !!trainingLocal && (opening || normalizarTextoOnboarding_(trainingLocal) !== normalizarTextoOnboarding_(local));
    const trainingAddress = showTraining ? String(v.direccion_entrenamiento || '').trim() : '';
    if (showTraining && !trainingAddress) throw new Error('No se encontró dirección para LOCAL ENTRENAMIENTO "' + trainingLocal + '" en la lista de locales.');
    return {
      subject: marca.subject, name: String(v.nombre || '').trim(), brand: marca.brand, signature: marca.signature,
      color: marca.color, logo: marca.logo,
      position: position, scheduleText: ONBOARDING_CONFIG.scheduleText, onboardingDate: onboardingDate, onboardingTime: onboardingTime,
      firstDayDate: firstDayDate, local: local, localAddress: localAddress, trainingLocal: showTraining ? trainingLocal : '',
      trainingAddress: trainingAddress, opening: opening, firstDaySchedule: firstDaySchedule,
      confirmUrl: ONBOARDING_CONFIG.confirmarUrl + '?v=' + encodeURIComponent(v.id) + '&k=' + encodeURIComponent(v.token)
    };
  }

  // Un reintento si Gmail falla por algo técnico (como enviarEmailOnboardingConReintento_)
  function enviarConReintento_(mail) {
    try { MailApp.sendEmail(mail); }
    catch (e) { Utilities.sleep(ONBOARDING_CONFIG.esperaReintentoMs); MailApp.sendEmail(mail); }
  }

  // ── Mail de bienvenida (HTML y texto plano). Si se cambia, copiar las dos funciones también a
  //    Onboarding.gs de TAREAS GRUPALES para que salga igual desde la planilla. ──

/*
 * Orden del mail:
 *   1. Presentarse en la Oficina de Selección (dirección, fecha y horario de la Bienvenida)
 *   2. Código de Ética + documentación obligatoria
 *   3. Sede asignada (después de la Bienvenida): local, entrenamiento y primer día
 *   y al final, el botón para confirmar la asistencia.
 * Diseño con tablas y estilos en línea para que se vea bien en Gmail, Outlook y el celular.
 */
function crearEmailOnboarding_(data) {
  const e = escaparHtmlOnboarding_;
  const color = data.color || '#42158b';
  const fuente = 'font-family:Arial,Helvetica,sans-serif;';
  const saludo = data.name ? '¡Hola ' + e(data.name) + '! ¿Cómo estás?' : '¡Hola! ¿Cómo estás?';

  // Número del paso (círculo con el color de la marca) + título
  const paso = function (n, titulo, sub) {
    return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:30px 0 12px 0;">
        <tr>
          <td width="40" valign="top">
            <div style="width:32px;height:32px;line-height:32px;border-radius:16px;background:${color};color:#ffffff;
              text-align:center;font-weight:bold;font-size:16px;${fuente}">${n}</div>
          </td>
          <td valign="middle" style="${fuente}">
            <div style="font-size:17px;font-weight:bold;color:#1f2937;line-height:1.3;">${titulo}</div>
            ${sub ? `<div style="font-size:14px;color:#6b7280;margin-top:2px;">${sub}</div>` : ''}
          </td>
        </tr>
      </table>`;
  };

  // Renglón "ícono  Etiqueta: valor"
  const dato = function (icono, etiqueta, valor) {
    return `
      <tr>
        <td width="30" valign="top" style="padding:5px 0;font-size:16px;">${icono}</td>
        <td style="padding:5px 0;${fuente}font-size:15px;color:#1f2937;"><strong>${etiqueta}:</strong> ${valor}</td>
      </tr>`;
  };

  const tarjeta = function (contenido, fondo, borde) {
    return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
        style="background:${fondo};border:1px solid ${borde};border-radius:12px;">
        <tr><td style="padding:16px 18px;${fuente}">${contenido}</td></tr>
      </table>`;
  };

  // ── 1. Oficina de Selección
  const paso1 = paso('1', 'Presentate en nuestra Oficina de Selección', 'para realizar tu Bienvenida e Ingreso.') +
    tarjeta(`
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${dato('📍', 'Dirección', e(ONBOARDING_CONFIG.officeAddress))}
        ${dato('📅', 'Fecha', e(data.onboardingDate))}
        ${dato('🕘', 'Horario', e(data.onboardingTime))}
      </table>
      <div style="margin-top:10px;padding-top:10px;border-top:1px solid #e5e7eb;font-size:14px;color:#1f2937;">
        ⏰ <strong>Presentate 15 minutos antes del horario pactado.</strong>
      </div>`, '#f8fafc', '#e2e8f0');

  // ── 2. Código de Ética y documentación
  const paso2 = paso('2', 'Código de Ética y documentación obligatoria', '') +
    tarjeta(`
      <div style="text-align:center;">
        <div style="font-size:15px;font-weight:bold;color:#0f2a44;margin-bottom:12px;">Completá el Código de Ética 📋</div>
        <a href="${e(ONBOARDING_CONFIG.codigoEticaUrl)}"
          style="display:inline-block;background:#0f2a44;color:#ffffff;padding:13px 26px;border-radius:8px;
            text-decoration:none;font-weight:bold;font-size:15px;${fuente}">Completar Código de Ética</a>
        <div style="font-size:13px;color:#0f2a44;margin-top:12px;">
          ⚠️ <strong>Importante:</strong> formulario obligatorio para poder avanzar con la propuesta.
        </div>
      </div>`, '#eef3f9', '#c9d6e6') +
    `<div style="height:12px;line-height:12px;">&nbsp;</div>` +
    tarjeta(`
      <div style="font-size:15px;font-weight:bold;color:#1f2937;margin-bottom:6px;">📄 Traé la siguiente documentación (obligatoria):</div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr><td valign="top" style="padding:3px 8px 3px 0;color:${color};font-weight:bold;">✓</td><td style="padding:3px 0;font-size:15px;color:#1f2937;${fuente}">DNI formato físico.</td></tr>
        <tr><td valign="top" style="padding:3px 8px 3px 0;color:${color};font-weight:bold;">✓</td><td style="padding:3px 0;font-size:15px;color:#1f2937;${fuente}">Carnet o constancia del Curso de Manipulación de Alimentos.</td></tr>
        <tr><td valign="top" style="padding:3px 8px 3px 0;color:${color};font-weight:bold;">✓</td><td style="padding:3px 0;font-size:15px;color:#1f2937;${fuente}">Certificado de Antecedentes Penales.</td></tr>
      </table>`, '#ffffff', '#e2e8f0');

  // ── 3. Sede asignada (después de la Bienvenida)
  const local = `
      <div style="font-size:12px;font-weight:bold;letter-spacing:1px;color:#6b7280;text-transform:uppercase;">📍 Tu local asignado</div>
      <div style="font-size:16px;font-weight:bold;color:#1f2937;margin-top:4px;">${e(data.brand)}: ${e(data.local)}</div>
      ${!data.opening && data.localAddress ? `<div style="font-size:14px;color:#4b5563;margin-top:2px;">${e(data.localAddress)}</div>` : ''}`;
  const entrenamiento = data.trainingLocal ? `
      <div style="margin-top:14px;padding-top:14px;border-top:1px solid #e5e7eb;">
        <div style="font-size:12px;font-weight:bold;letter-spacing:1px;color:#6b7280;text-transform:uppercase;">👨‍🍳 Tu entrenamiento será en</div>
        <div style="font-size:16px;font-weight:bold;color:#1f2937;margin-top:4px;">${e(data.trainingLocal)}</div>
        <div style="font-size:14px;color:#4b5563;margin-top:2px;">${e(data.trainingAddress)}</div>
      </div>` : '';
  const primerDia = `
      <div style="margin-top:14px;padding-top:14px;border-top:1px solid #e5e7eb;">
        <div style="font-size:12px;font-weight:bold;letter-spacing:1px;color:#6b7280;text-transform:uppercase;">🗓️ Comenzás tu primer día</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:4px;">
          ${dato('📅', 'Fecha', e(data.firstDayDate))}
          ${dato('🕘', 'Hora', e(data.firstDaySchedule))}
        </table>
      </div>`;
  const paso3 = paso('3', 'Tu sede asignada', 'Luego de presentarte en ' + e(ONBOARDING_CONFIG.officeAddress) + ', esta es tu sede:') +
    tarjeta(`
      <div style="font-size:14px;color:#92400e;">
        ⚠️ <strong>Recordá:</strong> primero tenés que presentarte en la Oficina de Selección (punto 1).
        No vayas directo al local.
      </div>`, '#fffbeb', '#fcd34d') +
    `<div style="height:12px;line-height:12px;">&nbsp;</div>` +
    tarjeta(local + entrenamiento + primerDia, '#ffffff', '#e2e8f0');

  // ── Confirmación de asistencia (el botón abre confirmar.html, que la registra en el portal)
  const confirmar = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:30px 0 0 0;">
      <tr><td style="padding:20px 18px;background:#eaf6ec;border:1px solid #b7dfc0;border-radius:12px;text-align:center;${fuente}">
        <div style="font-size:16px;font-weight:bold;color:#1f2937;margin-bottom:14px;">Confirmá tu asistencia a la Bienvenida</div>
        <a href="${e(data.confirmUrl)}"
          style="display:inline-block;background:#1e8e3e;color:#ffffff;padding:14px 28px;border-radius:8px;
            text-decoration:none;font-weight:bold;font-size:16px;${fuente}">✅ Confirmo asistencia</a>
        <div style="font-size:13px;color:#1b5e20;margin-top:14px;">
          ⚠️ <strong>Importante:</strong> confirmá tu asistencia únicamente presionando el botón.
        </div>
      </td></tr>
    </table>`;

  const logo = data.logo ? `
      <img src="${e(data.logo)}" width="56" height="56" alt="${e(data.signature)}"
        style="display:block;margin:0 auto 12px auto;width:56px;height:56px;border-radius:28px;background:#ffffff;border:3px solid #ffffff;">` : '';

  // Texto que se ve en la bandeja de entrada, al lado del asunto
  const vistaPrevia = 'Tu Bienvenida es el ' + e(data.onboardingDate) + ' a las ' + e(data.onboardingTime) + ' en ' + e(ONBOARDING_CONFIG.officeAddress) + '.';

  return `
  <div style="margin:0;padding:0;background:#f1f5f9;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${vistaPrevia}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9;">
      <tr><td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
          style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
          <tr><td style="background:${color};padding:28px 24px;text-align:center;${fuente}">
            ${logo}
            <div style="font-size:12px;font-weight:bold;letter-spacing:2px;color:#ffffff;opacity:.85;text-transform:uppercase;">Bienvenida e ingreso</div>
            <div style="font-size:24px;font-weight:bold;color:#ffffff;margin-top:6px;">${e(data.signature)}</div>
          </td></tr>
          <tr><td style="padding:28px 24px 32px 24px;${fuente}color:#1f2937;">
            <div style="font-size:22px;font-weight:bold;color:#1f2937;">🎉 ${saludo}</div>
            <div style="font-size:15px;line-height:1.6;color:#374151;margin-top:8px;">
              ¡Tenemos una buena noticia! 🙌 Fuiste seleccionado/a para sumarte a nuestro equipo.
              Estos son tus próximos pasos:
            </div>
            ${paso1}
            ${paso2}
            ${paso3}
            ${confirmar}
            <div style="margin-top:30px;font-size:15px;color:#1f2937;line-height:1.6;">
              🚀 <strong>¡Te esperamos!</strong><br>
              Equipo de Selección<br>
              <span style="color:${color};font-weight:bold;">${e(data.signature)}</span>
            </div>
          </td></tr>
        </table>
        <div style="max-width:600px;font-size:12px;color:#94a3b8;margin-top:14px;${fuente}">
          Recibiste este mail porque fuiste seleccionado/a para ingresar a ${e(data.signature)}.
        </div>
      </td></tr>
    </table>
  </div>`;
}

function crearTextoPlanoOnboarding_(data) {
  let text = (data.name ? '🎉 ¡Hola ' + data.name + '! ¿Cómo estás?' : '🎉 ¡Hola! ¿Cómo estás?') + '\n\n';

  text +=
`¡Tenemos una buena noticia! 🙌
Fuiste seleccionado/a para sumarte a nuestro equipo. Estos son tus próximos pasos:

1️⃣ Presentate en nuestra Oficina de Selección para realizar tu Bienvenida e Ingreso.

📍 Dirección: ${ONBOARDING_CONFIG.officeAddress}
📅 Fecha: ${data.onboardingDate}
🕘 Horario: ${data.onboardingTime}

⏰ Presentate 15 minutos antes del horario pactado.

2️⃣ Código de Ética y documentación obligatoria

Completá el Código de Ética 📋
${ONBOARDING_CONFIG.codigoEticaUrl}
⚠️ Importante: formulario obligatorio para poder avanzar con la propuesta.

📄 Traé la siguiente documentación (obligatoria):
• DNI formato físico.
• Carnet o constancia del Curso de Manipulación de Alimentos.
• Certificado de Antecedentes Penales.

3️⃣ Tu sede asignada
Luego de presentarte en ${ONBOARDING_CONFIG.officeAddress}, esta es tu sede:

⚠️ Recordá: primero tenés que presentarte en la Oficina de Selección (punto 1). No vayas directo al local.

📍 Tu local asignado: ${data.brand}: ${data.local}`;

  if (!data.opening && data.localAddress) text += '\nDir: ' + data.localAddress;

  if (data.trainingLocal) {
    text +=
`

👨‍🍳 Tu entrenamiento será en: ${data.trainingLocal}
Dir: ${data.trainingAddress}`;
  }

  text +=
`

🗓️ Comenzás tu primer día
📅 Fecha: ${data.firstDayDate}
🕘 Hora: ${data.firstDaySchedule}

✅ Confirmá tu asistencia a la Bienvenida abriendo este enlace:
${data.confirmUrl}
⚠️ Importante: confirmá tu asistencia únicamente desde ese enlace.

🚀 ¡Te esperamos!

Equipo de Selección
${data.signature}`;

  return text;
}

function escaparHtmlOnboarding_(
  text
) {

  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatearFechaOnboarding_(
  value,
  timeZone
) {

  if (!value) {
    return '';
  }


  if (
    Object.prototype.toString.call(value) ===
    '[object Date]' &&
    !isNaN(value)
  ) {

    const months = [
      'enero',
      'febrero',
      'marzo',
      'abril',
      'mayo',
      'junio',
      'julio',
      'agosto',
      'septiembre',
      'octubre',
      'noviembre',
      'diciembre'
    ];


    const day =
      Number(
        Utilities.formatDate(
          value,
          timeZone,
          'd'
        )
      );


    const month =
      Number(
        Utilities.formatDate(
          value,
          timeZone,
          'M'
        )
      );


    return (
      day +
      ' de ' +
      months[month - 1]
    );
  }


  return String(value)
    .trim();
}

function formatearHoraOnboarding_(
  value,
  timeZone
) {

  if (!value) {
    return '';
  }


  if (
    Object.prototype.toString.call(value) ===
    '[object Date]' &&
    !isNaN(value)
  ) {

    return (
      Utilities.formatDate(
        value,
        timeZone,
        'H:mm'
      ) +
      ' hs'
    );
  }


  return (
    String(value)
      .trim()
      .replace(
        /\s*hs\.?$/i,
        ''
      ) +
    ' hs'
  );
}

function normalizarTextoOnboarding_(
  value
) {

  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      ''
    );
}

function compactarTextoOnboarding_(
  value
) {

  return normalizarTextoOnboarding_(value)
    .replace(
      /[^A-Z0-9]/g,
      ''
    );
}

function emailValidoOnboarding_(
  email
) {

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    .test(email);
}

function normalizarEmailOnboarding_(
  value
) {

  return String(value || '')
    .trim()
    .toLowerCase();
}

function buscarDireccionOnboarding_(
  addresses,
  local
) {

  return (
    addresses[
      normalizarTextoOnboarding_(local)
    ] || ''
  );
}

function obtenerHorarioPrimerDiaOnboarding_(
  position
) {

  /*
   * Se toleran guiones y espacios dobles:
   * "PART-TIME", "Part  Time" y "PART TIME" son equivalentes.
   */
  const puesto =
    normalizarTextoOnboarding_(position)
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ');


  if (
    puesto.includes('FULL TIME') ||
    puesto.includes('ENCARGADO') ||
    puesto.includes('GERENTE')
  ) {

    return ONBOARDING_CONFIG.firstDaySchedules.fullTime;
  }


  if (puesto.includes('PART TIME')) {

    return ONBOARDING_CONFIG.firstDaySchedules.partTime;
  }


  throw new Error(
    'No hay horario de primer día definido para el puesto "' +
    position +
    '".'
  );
}


  /* =========================================================
     8. SOLICITUDES (Extremas / Sabores) → VACANTES DEL PORTAL
     ========================================================= */

  const SOLICITUDES = {
    hojas: [
      { nombre: 'Solicitudes Extremas', marca: 'Hamburguesas Extremas' },
      { nombre: 'Solicitudes Sabores', marca: 'Sabores Express' }
    ],
    meta: 'portal_vacante',   // N° de vacante guardado en la fila (dato oculto de la hoja)
    // Encabezado de la hoja (normalizado) → campo de la vacante
    columnas: {
      'selector': 'selector', 'regional': 'regional', 'zonal': 'zonal', 'local': 'local',
      'local entrenamiento': 'local_entrenamiento', 'puesto': 'puesto', 'jornada': 'jornada',
      'notas sobre la solicitud': 'notas', 'fecha': 'fecha_citacion', 'hora': 'hora_citacion', 'estado': 'estado',
      'primer dia': 'ingreso', 'nombre': 'nombre', 'apellido': 'apellido', 'email': 'email', 'tel': 'tel',
      'tel emergencia': 'tel_emergencia', 'fecha de nacimiento': 'fecha_nacimiento', 'nacionalidad': 'nacionalidad',
      'cuil': 'cuil', 'dni': 'dni', 'sexo': 'sexo', 'domicilio': 'domicilio', 'numero': 'domicilio_numero',
      'codigo postal': 'codigo_postal', 'localidad': 'localidad', 'provincia': 'provincia', 'pais': 'pais',
      'altas rrhh': 'altas_rrhh', 'registro datos': 'registro_datos', 'id postulante': 'id_postulante'
    },
    fechas: ['fecha_citacion', 'ingreso', 'fecha_nacimiento']
  };

  function solicitudesAlPortal_(libro, codigo) {
    const lineas = [];
    SOLICITUDES.hojas.forEach(function (h) {
      const hoja = libro.getSheetByName(h.nombre);
      if (!hoja) { lineas.push('Solicitudes: no está la pestaña "' + h.nombre + '".'); return; }
      const leido = filasDeSolicitudes_(hoja);
      // Filas vaciadas que todavía guardaban un N°: se les quita (la fila queda libre para otra vacante)
      Object.keys(leido.meta).forEach(function (fila) {
        if (!leido.conDatos[fila]) leido.meta[fila].remove();
      });
      if (!leido.filas.length) return;
      // Una pestaña entera por llamada: así se ve qué fila es cada vacante aunque se hayan movido
      const r = llamarPortal_('seleccion_solicitudes_sync', { p_hoja: h.nombre, p_marca: h.marca, p_filas: leido.filas }, codigo) || {};
      (r.vincular || []).forEach(function (v) {
        const m = leido.meta[v.fila];
        if (m && leido.conDatos[v.fila]) m.setValue(String(v.numero));
        else hoja.getRange(v.fila + ':' + v.fila).addDeveloperMetadata(SOLICITUDES.meta, String(v.numero));
      });
      if (r.creadas || r.actualizadas) {
        lineas.push(h.nombre + ' → portal: ' + (r.creadas || 0) + ' vacantes nuevas, ' + (r.actualizadas || 0) + ' actualizadas.');
      }
    });
    return lineas.join('\n');
  }

  // Filas de una pestaña Solicitudes: { filas: [{ fila, numero, datos }], meta: { fila → N° guardado }, conDatos }
  function filasDeSolicitudes_(hoja) {
    const res = { filas: [], meta: {}, conDatos: {} };
    const ultima = hoja.getLastRow(), ancho = hoja.getLastColumn();
    if (ultima < 2 || !ancho) return res;
    const rango = hoja.getRange(1, 1, ultima, ancho);
    const valores = rango.getValues(), textos = rango.getDisplayValues();
    // Encabezado: la fila que tiene SELECTOR y LOCAL (hoy la 2; la 1 está vacía)
    let enc = -1;
    for (let i = 0; i < Math.min(6, textos.length) && enc === -1; i++) {
      const n = textos[i].map(normalizar_);
      if (n.indexOf('selector') !== -1 && n.indexOf('local') !== -1) enc = i;
    }
    if (enc === -1) throw new Error('"' + hoja.getName() + '" no tiene el encabezado con SELECTOR y LOCAL.');
    const cols = {};
    textos[enc].forEach(function (t, i) {
      const campo = SOLICITUDES.columnas[normalizar_(t)];
      if (campo && !(campo in cols)) cols[campo] = i;
    });
    if (!('local' in cols)) throw new Error('"' + hoja.getName() + '" no tiene la columna LOCAL.');
    // N° de vacante guardado en cada fila
    hoja.createDeveloperMetadataFinder().withKey(SOLICITUDES.meta).find().forEach(function (m) {
      const lugar = m.getLocation();
      if (lugar.getLocationType() === SpreadsheetApp.DeveloperMetadataLocationType.ROW) res.meta[lugar.getRow().getRow()] = m;
    });
    for (let i = enc + 1; i < valores.length; i++) {
      const datos = {};
      Object.keys(cols).forEach(function (campo) {
        const c = cols[campo];
        let v = SOLICITUDES.fechas.indexOf(campo) !== -1 ? fechaSolicitud_(valores[i][c]) : texto_(textos[i][c]);
        if (v && campo === 'email') v = v.toLowerCase().replace(/\s+/g, '');
        if (v && campo === 'hora_citacion') v = v.toUpperCase().replace(/\s*HS\.?$/, ' HS');
        if (v) datos[campo] = v;
      });
      if (!datos.local || normalizar_(datos.local) === 'local') continue;
      // Sabores: la columna ID POSTULANTE a veces trae la marca temporal del registro de datos
      if (datos.id_postulante && /^\d{1,2}\/\d{1,2}\/\d{4}/.test(datos.id_postulante) && !datos.registro_datos) {
        datos.registro_datos = datos.id_postulante;
        delete datos.id_postulante;
      }
      const fila = i + 1;
      res.conDatos[fila] = true;
      res.filas.push({ fila: fila, numero: res.meta[fila] ? String(res.meta[fila].getValue() || '') : '', datos: datos });
    }
    return res;
  }

  // Fecha de la hoja → 'aaaa-mm-dd' (acepta el año que viene: un primer día de enero cargado en diciembre)
  function fechaSolicitud_(v) {
    let a, mes, d;
    if (v instanceof Date) {
      if (isNaN(v.getTime())) return '';
      a = +Utilities.formatDate(v, SYNC.ZONA_HORARIA, 'yyyy');
      mes = +Utilities.formatDate(v, SYNC.ZONA_HORARIA, 'M');
      d = +Utilities.formatDate(v, SYNC.ZONA_HORARIA, 'd');
    } else {
      const m = texto_(v).match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
      if (!m) return '';
      d = +m[1]; mes = +m[2]; a = +m[3];
      if (a < 100) a += a > 30 ? 1900 : 2000;
    }
    const f = new Date(Date.UTC(a, mes - 1, d));
    if (f.getUTCDate() !== d || f.getUTCMonth() !== mes - 1) return '';
    if (a < 1930 || a > new Date().getFullYear() + 1) return '';
    return a + '-' + ('0' + mes).slice(-2) + '-' + ('0' + d).slice(-2);
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

  // "F", "Femenino", "M - Masculino", "X" → F / M / X
  function sexo_(v) {
    const t = normalizar_(v);
    if (/^(f|femenino|mujer)\b/.test(t)) return 'F';
    if (/^(m|masculino|hombre|varon)\b/.test(t)) return 'M';
    if (/^(x|no binario)\b/.test(t)) return 'X';
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
    if (!c) throw new Error('Falta el código del equipo: escribilo en CODIGO_PORTAL_PARA_GUARDAR y ejecutá guardarCodigoPortal.');
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
    sincronizar: sincronizar, activar: activar, desactivar: desactivar, probarConexion: probarConexion, desdeElPortal: desdeElPortal,
    // Para las pruebas
    _t: {
      filasDeLaBase_: filasDeLaBase_, filasRechazadasZonal_: filasRechazadasZonal_, borrarFilas_: borrarFilas_, baseAlPortal_: baseAlPortal_, filasDeIngreso_: filasDeIngreso_, filasDeBloqueados_: filasDeBloqueados_,
      bloqueados_: bloqueados_, llamarPortal_: llamarPortal_, horario_: horario_, fecha_: fecha_, estado_: estado_,
      agregarFilas_: agregarFilas_, fechaDeTexto_: fechaDeTexto_, enHorario_: enHorario_, sexo_: sexo_,
      hojasZonales_: hojasZonales_, indiceZonal_: indiceZonal_, datosCitacion_: datosCitacion_,
      filasDeAsignaciones_: filasDeAsignaciones_, asignacionesAlPortal_: asignacionesAlPortal_,
      filasDeSolicitudes_: filasDeSolicitudes_, solicitudesAlPortal_: solicitudesAlPortal_, fechaSolicitud_: fechaSolicitud_
    }
  };
})();
