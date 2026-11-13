// ══════════════════════════════════════════════
//  ACCESO CON CÓDIGO DEL EQUIPO + CARGA DE DATOS
// ══════════════════════════════════════════════
// El código queda guardado en el navegador: se pide una sola vez por computadora.
function codigoGuardado() { try { return localStorage.getItem(CODIGO_KEY) || ''; } catch (e) { return ''; } }
function guardarCodigo(codigo) { try { codigo ? localStorage.setItem(CODIGO_KEY, codigo) : localStorage.removeItem(CODIGO_KEY); } catch (e) { /* modo incógnito: se pide en cada visita */ } }

// Pregunta a la base si el código es el del equipo. Devuelve true/false, o lanza si falla la conexión.
async function codigoValido(codigo) {
    crearCliente(codigo);
    const { data, error } = await sb.rpc('seleccion_codigo_ok');
    if (error) throw error;
    return data === true;
}

async function login() {
    const codigo = document.getElementById('login-codigo').value.trim();
    showLoginError('');
    if (!codigo) { showLoginError('Ingresá el código del equipo'); return; }
    try {
        if (!(await codigoValido(codigo))) { showLoginError('Código incorrecto'); return; }
    } catch (e) { showLoginError('No se pudo verificar el código: ' + msgError(e)); return; }
    guardarCodigo(codigo);
    await arrancar();
}

function logout() { guardarCodigo(''); location.reload(); }

function showLoginError(msg) {
    const el = document.getElementById('login-error');
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
}

// Muestra una sola de las pantallas grandes: login, loading o app.
function mostrarPantalla(cual) {
    ['login-screen', 'loading-screen', 'app'].forEach(id =>
        document.getElementById(id).classList.toggle('hidden', id !== cual));
}

// Traduce los errores de Supabase a algo que se entienda en pantalla.
function msgError(error) {
    const code = error?.code || '';
    const m = error?.message || code || 'error desconocido';
    if (code === '42P01' || code === 'PGRST205' || /does not exist|Could not find the table/i.test(m)) return 'faltan crear las tablas del portal en Supabase (sql/portal_seleccion.sql)';
    if (code === 'PGRST202' || /seleccion_codigo_ok/.test(m)) return 'falta configurar el código del equipo en Supabase (sql/codigo_equipo.sql)';
    if (code === '42501' || /row-level security/i.test(m)) return 'el código del equipo no es válido (¿lo cambiaron?). Tocá Salir y volvé a ingresarlo';
    if (code === '23505') return 'ya existe un registro igual (DNI o postulante repetido)';
    if (code === 'PGRST204' || /column .* (does not exist|of .* in the schema cache)/i.test(m)) return `faltan columnas nuevas en Supabase (correr sql/${/estado_nomina|nomina_detalle|foto_url/.test(m) ? 'nomina_y_fotos' : /seleccion_postulantes/.test(m) ? 'sync_base_drive' : 'solicitud_tal_cual'}.sql)`;
    if (/abort|timeout|57014/i.test(m + code)) return 'la consulta tardó demasiado';
    return m;
}

async function loadEquipo() {
    const { data, error } = await sb.from('seleccion_equipo').select('*').order('orden').order('nombre');
    if (error) throw error;
    equipo = data || [];
}

const BUSQUEDA_SELECT = '*, comentarios:seleccion_comentarios(*)';
const PAGINA = 1000; // Supabase devuelve como máximo 1000 filas por pedido

async function fetchTodo(tabla, select = '*', orden = 'id') {
    const out = [];
    for (let from = 0; ; from += PAGINA) {
        const { data, error } = await sb.from(tabla).select(select).order(orden, { ascending: false }).range(from, from + PAGINA - 1);
        if (error) throw error;
        out.push(...(data || []));
        if (!data || data.length < PAGINA) break;
    }
    return out;
}

function mapBusqueda(b) {
    return { ...b, comentarios: (b.comentarios || []).sort((a, x) => a.id - x.id) };
}

let postulantesById = new Map();
function indexarPostulantes() { postulantesById = new Map(postulantes.map(p => [p.id, p])); }

// Trae de nuevo la Base (p. ej. después de un RECHAZADO ZONAL, que bloquea a la persona en Supabase)
async function recargarPostulantes() {
    try { postulantes = await fetchTodo('seleccion_postulantes'); indexarPostulantes(); }
    catch (e) { console.warn('Recargar base:', msgError(e)); }
}

async function loadData() {
    // Locales y zonas son de consulta: si todavía no existen las tablas, el portal funciona igual
    const opcional = p => p.catch(e => { console.warn('Sin locales/zonas:', msgError(e)); return []; });
    const [bs, ps, ls, zs] = await Promise.all([fetchTodo('seleccion_busquedas', BUSQUEDA_SELECT), fetchTodo('seleccion_postulantes'),
        opcional(fetchTodo('seleccion_locales')), opcional(fetchTodo('seleccion_zonas', '*', 'localidad'))]);
    _firmaDatos = JSON.stringify([bs, ps]);   // para la actualización sola: qué es lo que ya se ve
    repartirBusquedas(bs);
    postulantes = ps;
    locales = ls.filter(l => l.activo !== false);
    zonasLocalidad = zs;
    indexarPostulantes();
    indexarLocales();
}

// Tablero = las que no se archivaron con "Limpiar semana"; las archivadas quedan para Estadísticas
function repartirBusquedas(bs) {
    const todas = bs.map(mapBusqueda);
    busquedas = todas.filter(b => !b.archivada);
    busquedasArchivadas = todas.filter(b => b.archivada);
}
function todasLasBusquedas() { return busquedas.concat(busquedasArchivadas); }

// "Limpiar semana": todas las vacantes del tablero pasan a archivadas (no se borra nada)
async function limpiarSemana() {
    const n = busquedas.length;
    if (!n) { toast('El tablero ya está vacío'); return; }
    const enProceso = busquedas.filter(b => vacanteAbierta(b) && tienePersona(b)).length;
    if (!(await confirmar(`¿Limpiar el tablero? Se sacan las ${n} vacantes${enProceso ? ` (${enProceso} con una persona en proceso)` : ''} y se descarga una copia en Excel. No se borran: siguen contando en Estadísticas.`, 'Limpiar semana'))) return;
    // Primero la copia en Excel: si no se puede bajar, no se limpia nada
    try { await descargarExcelSemana(busquedas.slice()); }
    catch (e) { toast('No se pudo generar el Excel: ' + (e.message || e) + '. No se limpió nada.', true); return; }
    // De a tandas: muchos ids juntos no entran en un solo pedido
    const cuando = new Date().toISOString(), todosIds = busquedas.map(b => b.id), data = [];
    let error = null;
    for (let i = 0; i < todosIds.length && !error; i += 150) {
        const r = await sb.from('seleccion_busquedas').update({ archivada: cuando }).in('id', todosIds.slice(i, i + 150)).select('id, archivada');
        error = r.error; data.push(...(r.data || []));
    }
    if (error && !data.length) { toast('Error al limpiar: ' + msgError(error), true); return; }
    const ids = new Set((data || []).map(r => r.id));
    busquedas.filter(b => ids.has(b.id)).forEach(b => { b.archivada = data.find(r => r.id === b.id).archivada; busquedasArchivadas.push(b); });
    busquedas = busquedas.filter(b => !ids.has(b.id));
    refreshView();
    toast(`Tablero limpio ✓ ${ids.size} vacante${ids.size === 1 ? '' : 's'} en el Excel descargado y en Estadísticas`);
}

// Después de guardar algo de UNA vacante (o sus comentarios) se vuelve a pedir solo esa, no todo.
async function recargarBusqueda(id) {
    const { data, error } = await sb.from('seleccion_busquedas').select(BUSQUEDA_SELECT).eq('id', id).maybeSingle();
    if (error) { toast('Error al recargar: ' + msgError(error), true); return; }
    const i = busquedas.findIndex(b => b.id === id);
    if (!data) { if (i !== -1) busquedas.splice(i, 1); return; }
    if (i === -1) busquedas.unshift(mapBusqueda(data)); else busquedas[i] = mapBusqueda(data);
}

function aplicarCambiosBusqueda(row) {
    const b = busquedas.find(x => x.id === row.id);
    if (b) Object.assign(b, row);
}

// Arranque con el código ya verificado.
async function arrancar() {
    mostrarPantalla('loading-screen');
    document.getElementById('loading-txt').textContent = 'Cargando datos...';
    try {
        await loadEquipo();
        await loadData();
        await checkAndFinalizeSearches();
        datosCargados = true;
        prepararApp();
        mostrarPantalla('app');
        showView('vacantes');
        iniciarActualizacionSola();
    } catch (e) {
        console.error('Error al arrancar:', e);
        document.getElementById('loading-txt').innerHTML = `No se pudieron cargar los datos: <strong>${esc(msgError(e))}</strong><br><br>
            <button class="btn-sm" onclick="arrancar()">Reintentar</button> <button class="btn-sm" onclick="logout()">Salir</button>`;
    }
}

async function initApp() {
    const codigo = codigoGuardado();
    if (!codigo) { mostrarPantalla('login-screen'); return; }
    try {
        if (await codigoValido(codigo)) { await arrancar(); return; }
        // Cambiaron el código: hay que volver a ingresarlo
        guardarCodigo('');
        mostrarPantalla('login-screen');
        showLoginError('El código del equipo cambió: ingresá el nuevo');
    } catch (e) {
        mostrarPantalla('login-screen');
        showLoginError('No se pudo conectar: ' + msgError(e));
    }
}

// Botón "Actualizar": vuelve a traer todo.
// Botón Actualizar: primero el Apps Script cruza Drive ↔ portal (si está publicado), después se recargan los datos
let _sincronizando = false;
async function actualizarTodo() {
    if (!SYNC_DRIVE_URL) return recargarDatos();
    if (_sincronizando) return;
    _sincronizando = true;
    const btn = document.getElementById('btn-actualizar');
    const html = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Sincronizando con Drive…';
    let aviso = '';
    try {
        const ctl = new AbortController();
        const corte = setTimeout(() => ctl.abort(), 150 * 1000);
        // text/plain: pedido simple, sin preflight (Apps Script no responde OPTIONS)
        const r = await fetch(SYNC_DRIVE_URL, { method: 'POST', body: JSON.stringify({ codigo: codigoEquipo, accion: 'sincronizar' }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }, signal: ctl.signal });
        clearTimeout(corte);
        const res = await r.json();
        if (!res.ok) aviso = 'Drive: ' + (res.error || 'no se pudo sincronizar');
        else console.log('Sincronización con Drive:\n' + (res.resumen || 'sin novedades'));
    } catch (e) {
        aviso = e.name === 'AbortError' ? 'Drive tardó demasiado: se recargó solo el portal' : 'No se pudo conectar con Drive: se recargó solo el portal';
    } finally {
        btn.disabled = false;
        btn.innerHTML = html;
        _sincronizando = false;
    }
    await recargarDatos(aviso ? '' : 'Sincronizado con Drive ✓');
    if (aviso) toast(aviso, true);
}

async function recargarDatos(mensaje = 'Datos actualizados ✓') {
    try {
        await Promise.all([loadEquipo(), loadData()]);
        await checkAndFinalizeSearches();
        renderSelectorChips();
        refreshView();
        if (mensaje) toast(mensaje);
    } catch (e) { toast('Error al actualizar: ' + msgError(e), true); }
}

// Lo que cambia sin que nadie toque el portal (respuestas de los zonales, altas de Elegí tu vacante,
// lo que carga el resto del equipo) aparece solo: cada minuto, con la pestaña a la vista y sin nada a medio editar.
const ACTUALIZAR_CADA_MS = 60 * 1000;
let _actualizacionSola = null, _firmaDatos = '';
function iniciarActualizacionSola() {
    if (_actualizacionSola) return;
    _actualizacionSola = setInterval(actualizarSolo, ACTUALIZAR_CADA_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) actualizarSolo(); });
}
async function actualizarSolo() {
    if (document.hidden || !sb || !datosCargados) return;
    if (document.querySelector('.modal-bg:not(.hidden), [role="dialog"]')) return;     // hay algo abierto
    const foco = document.activeElement;
    if (foco && /^(INPUT|SELECT|TEXTAREA)$/.test(foco.tagName)) return;                // está escribiendo
    try {
        const [bs, ps] = await Promise.all([fetchTodo('seleccion_busquedas', BUSQUEDA_SELECT), fetchTodo('seleccion_postulantes')]);
        const firma = JSON.stringify([bs, ps]);
        if (firma === _firmaDatos) return;
        if (document.querySelector('.modal-bg:not(.hidden), [role="dialog"]') || /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName || '')) return;
        _firmaDatos = firma;
        repartirBusquedas(bs);
        postulantes = ps;
        indexarPostulantes();
        refreshView();
    } catch (e) { console.warn('Actualización automática:', msgError(e)); }
}

// Cerrada + 90 días hábiles trabajados (hasta la baja, si la hubo) → Finalizada
async function checkAndFinalizeSearches() {
    const toFinalize = busquedas.filter(b => b.status === 'Cerrada' && b.ingreso && daysDiff(b.ingreso, b.fecha_baja || null) >= 90);
    await Promise.all(toFinalize.map(async b => {
        const { error } = await sb.from('seleccion_busquedas').update({ status: 'Finalizada' }).eq('id', b.id);
        if (!error) b.status = 'Finalizada';
    }));
}

// ══════════════════════════════════════════════
//  VACANTES (una fila = una fila de la hoja Solicitudes)
// ══════════════════════════════════════════════
const CAMPOS_OBLIGATORIOS = ['marca', 'local', 'puesto'];
const nombreCompleto = b => [b.nombre, b.apellido].filter(Boolean).join(' ');
const tienePersona = b => !!(b.postulante_id || b.nombre || b.apellido || b.dni);

async function guardarBusqueda(id, update) {
    const { data, error } = await sb.from('seleccion_busquedas').update(update).eq('id', id).select();
    if (error) { toast('Error al guardar: ' + msgError(error), true); refreshBusqueda(id); return null; }
    if (!data || data.length === 0) { toast('No se guardó (código del equipo inválido)', true); return null; }
    aplicarCambiosBusqueda(data[0]);
    return data[0];
}

async function updateField(id, field, val) {
    if (typeof val === 'string') val = val.trim();
    const b = busquedas.find(x => x.id === id);
    if (!b) return;
    if (!fechaValida(val)) { toast('Fecha inválida (año fuera de rango) — no se guardó', true); refreshBusqueda(id); return; }
    if (CAMPOS_OBLIGATORIOS.includes(field) && !val) { toast('Ese dato no puede quedar vacío', true); refreshBusqueda(id); return; }
    if ((field === 'dni' || field === 'cuil') && val) val = val.replace(/\D/g, '');
    if (field === 'estado') return cambiarEstado(b, val || null);
    val = mayus(field, val);
    const update = { [field]: val === '' ? null : val };
    // Con el local se completa la zona (lista de locales), si la vacante no tenía
    if (field === 'local' && val && !b.zona) {
        const info = infoLocal(val);
        if (info?.zona) update.zona = info.zona;
    }
    // Si ya ingresó, el nombre de quien ingresó acompaña los cambios de nombre/apellido
    if ((field === 'nombre' || field === 'apellido') && b.estado === 'COMUNICADO') {
        update.ingreso_nombre = nombreCompleto({ ...b, ...update }) || null;
    }
    const row = await guardarBusqueda(id, update);
    if (!row) return;
    if (field === 'ingreso' || field === 'fecha_baja') await checkAndFinalizeSearches();
    refreshBusqueda(id);
    if (document.getElementById('modal-detalle') && !document.getElementById('modal-detalle').classList.contains('hidden')) renderDetalle(id);
    toast('Guardado ✓');
}

// ESTADO de la planilla: además de guardarlo, mueve las fechas que miden la demora
// y abre o cierra la vacante.
async function cambiarEstado(b, estado) {
    const hoy = today();
    const update = { estado, fecha_estado: estado ? hoy : null };
    if (estado && !tienePersona(b) && !(await confirmar(`La vacante ${b.numero} todavía no tiene a nadie cargado. ¿Poner "${estado}" igual?`))) { refreshBusqueda(b.id); return; }
    // La citación a onboarding pedida todavía no salió: con otro ESTADO el mail no se manda
    if (enColaOnb(b) && !saleElMailOnb({ ...b, estado }) && !(await confirmar(`El mail de onboarding de ${nombreCompleto(b) || b.numero} todavía no salió. Si la pasás a "${estado || 'sin estado'}", no se manda. ¿Cambiar igual?`, 'Cambiar igual'))) { refreshBusqueda(b.id); return; }
    if (['ENVIADO A ZONAL', 'APROBADO ZONAL', 'RECHAZADO ZONAL'].includes(estado) && !b.enviado_zonal) update.enviado_zonal = hoy;
    if (estado === 'APROBADO ZONAL' && !b.decision_zonal) update.decision_zonal = hoy;

    if (estado === 'COMUNICADO') {
        // Comunicado = ingresó: la vacante queda cubierta
        const primerDia = b.ingreso || hoy;
        if (!(await confirmar(`${nombreCompleto(b) || 'La persona'} ingresó: la vacante ${b.numero} queda cubierta con primer día ${fmtFecha(primerDia)}. ¿Confirmás?`))) { refreshBusqueda(b.id); return; }
        Object.assign(update, { ingreso: primerDia, ingreso_nombre: nombreCompleto(b) || null, status: b.status === 'Finalizada' ? 'Finalizada' : 'Cerrada' });
    } else if (b.estado === 'COMUNICADO' && b.status === 'Cerrada') {
        // Se corrigió un COMUNICADO: la vacante vuelve a estar abierta
        Object.assign(update, { status: 'Proceso', ingreso_nombre: null });
    }

    const row = await guardarBusqueda(b.id, update);
    if (!row) return;
    if (estado === 'COMUNICADO') await checkAndFinalizeSearches();
    refreshView();
    // ENVIADO A ZONAL (Extremas): el Apps Script de TAREAS GRUPALES la copia a la hoja del regional
    if (estado === 'ENVIADO A ZONAL' && row.marca === 'Hamburguesas Extremas') {
        if (row.regional) toast(`Enviado ✓ En los próximos 10 minutos aparece en "Base de Candidatos" de ${row.regional}. Cuando el zonal responda, el estado cambia solo.`);
        else toast('Falta el REGIONAL de la vacante: completalo para que se copie a su hoja', true);
    } else toast('Estado: ' + (estado || 'sin estado') + ' ✓');

    // Rechazado por el zonal. Extremas: la persona queda Bloqueada sola (Supabase la pasa a BLOQUEADOS
    // y la saca de BASE DE DATOS). Sabores: se pregunta si se la manda a BLOQUEADOS.
    // Después se trae su estado nuevo y se ofrece liberar la vacante para colocar a otro.
    if (estado === 'RECHAZADO ZONAL' && tienePersona(row)) {
        const nombre = nombreCompleto(row) || 'La persona';
        let bloqueado = !esSabores(row);
        if (!bloqueado && await confirmar(`¿Enviar a ${nombre} a BLOQUEADOS? Queda bloqueado y sale de la base. Si no, sigue disponible para otra vacante.`, 'Enviar a BLOQUEADOS', 'No, sigue disponible')) {
            bloqueado = await bloquearRechazoZonal(row.id, false);
        }
        await recargarPostulantes();
        refreshView();
        const queda = bloqueado ? 'queda bloqueado (pasa a BLOQUEADOS y sale de la base)' : 'sigue disponible en la base';
        if (await confirmar(`${nombre} ${queda}. ¿Liberar la vacante ${b.numero} para colocar a otra persona? Queda en el historial.`, 'Liberar')) {
            await liberarVacante(b.id, true);
        }
    }
}

const esSabores = b => b.marca === 'Sabores Express';
// ¿La persona de la vacante figura Bloqueada en la Base? (null si no está vinculada a la Base)
const personaBloqueada = b => b.postulante_id && postulantesById.has(b.postulante_id) ? postulantesById.get(b.postulante_id).estado === 'Bloqueado' : null;

// Sabores en RECHAZADO ZONAL: manda a la persona a BLOQUEADOS (sql/rechazado_zonal.sql).
// Desde el detalle (avisar = true) recarga la Base y avisa; true si quedó bloqueada.
async function bloquearRechazoZonal(id, avisar = true) {
    const b = busquedas.find(x => x.id === id);
    if (avisar && !(await confirmar(`¿Enviar a ${nombreCompleto(b) || 'la persona'} a BLOQUEADOS? Queda bloqueado y sale de la base.`, 'Enviar a BLOQUEADOS'))) return false;
    const { data, error } = await sb.rpc('seleccion_rechazo_zonal_bloquear', { p_id: id });
    if (error) { toast('No se pudo bloquear: ' + msgError(error), true); return false; }
    if (!data?.ok) {
        toast({ no_rechazada: 'La vacante ya no está en RECHAZADO ZONAL', sin_datos: 'Faltan DNI, CUIL, mail o teléfono para bloquearla' }[data?.motivo] || 'No se pudo bloquear', true);
        return false;
    }
    if (avisar) {
        await recargarPostulantes();
        refreshView();
        if (!document.getElementById('modal-detalle').classList.contains('hidden')) renderDetalle(id);
    }
    toast('Enviado a BLOQUEADOS ✓');
    return true;
}

async function addEstadoEntry(id) {
    const input = document.getElementById('estado-input-' + id);
    const texto = input?.value.trim();
    if (!texto) return;
    const { error } = await sb.from('seleccion_comentarios').insert({ busqueda_id: id, texto, fecha: today(), autor: null });
    if (error) { toast('Error al guardar: ' + msgError(error), true); return; }
    await recargarBusqueda(id); refreshBusqueda(id); renderDetalle(id); toast('Comentario agregado ✓');
}

async function removeEstadoEntry(busquedaId, entryId) {
    if (!(await confirmar('¿Eliminar este comentario? Esta acción no se puede deshacer.'))) return;
    const { error } = await sb.from('seleccion_comentarios').delete().eq('id', entryId);
    if (error) { toast('Error al eliminar: ' + msgError(error), true); return; }
    await recargarBusqueda(busquedaId); refreshBusqueda(busquedaId); renderDetalle(busquedaId); toast('Eliminado');
}

let _guardandoNueva = false; // evita crear la misma vacante dos veces con doble clic
async function addNew() {
    if (_guardandoNueva) return;
    const val = id => document.getElementById(id).value.trim();
    const local = val('n-local');
    if (!local) { toast('Ingresá el local', true); return; }
    if (!fechaValida(val('n-inicio'))) { toast('Fecha de apertura inválida', true); return; }
    // En Tareas grupales un local pide varias vacantes iguales (una fila por persona):
    // "Cantidad" crea esa misma cantidad de filas de una vez.
    const cantidad = Math.min(20, Math.max(1, parseInt(val('n-cantidad')) || 1));
    const row = {
        marca: val('n-marca'), local: local.toUpperCase(),
        puesto: val('n-puesto') || PUESTOS[0],
        jornada: val('n-jornada') || null,
        local_entrenamiento: val('n-local-ent').toUpperCase() || null,
        zona: val('n-zona') || infoLocal(local)?.zona || null,
        regional: val('n-regional').toUpperCase() || null,
        zonal: val('n-zonal').toUpperCase() || null,
        selector: val('n-selector') || null,
        motivo: val('n-motivo') || 'Rotación',
        notas: val('n-notas').toUpperCase() || null,
        inicio: val('n-inicio') || today(),
        status: 'Proceso'
    };
    _guardandoNueva = true;
    try {
        const { data, error } = await sb.from('seleccion_busquedas').insert(Array.from({ length: cantidad }, () => ({ ...row }))).select(BUSQUEDA_SELECT);
        if (error) { toast('Error al crear: ' + msgError(error), true); return; }
        busquedas = [...(data || []).map(mapBusqueda).reverse(), ...busquedas];
        closeModal('modal-nueva');
        if (marcaActiva && marcaActiva !== row.marca) marcaActiva = '';
        refreshView();
        toast(cantidad > 1 ? `${cantidad} vacantes creadas ✓` : `Vacante ${data[0].numero} creada ✓`);
    } finally { _guardandoNueva = false; }
}

async function reabrir(id) {
    const orig = busquedas.find(x => x.id === id);
    if (!orig) return;
    if (!(await confirmar(`¿Reabrir ${orig.puesto} en ${orig.local}? Se crea una vacante nueva, vacía, con los mismos datos de la solicitud.`))) return;
    const nuevaRow = {
        marca: orig.marca, local: orig.local, local_entrenamiento: orig.local_entrenamiento, zona: orig.zona,
        regional: orig.regional, zonal: orig.zonal, selector: orig.selector, puesto: orig.puesto,
        jornada: orig.jornada, motivo: orig.motivo, inicio: today(), status: 'Proceso', reopened_from: orig.numero
    };
    const { data: nueva, error } = await sb.from('seleccion_busquedas').insert(nuevaRow).select().single();
    if (error) { toast('Error al reabrir: ' + msgError(error), true); return; }
    const texto = `Reapertura de ${orig.numero}. Anterior ingresado: ${orig.ingreso_nombre || nombreCompleto(orig) || 'N/D'} (${orig.ingreso ? fmtFecha(orig.ingreso) : 'sin fecha'})`;
    await sb.from('seleccion_comentarios').insert({ busqueda_id: nueva.id, texto, fecha: today(), autor: null });
    if (orig.ingreso && !orig.fecha_baja) {
        const f = await pedirTexto('Fecha de baja del que había ingresado (AAAA-MM-DD). Dejá vacío si no corresponde:', today());
        if (f && f.trim()) {
            if (/^\d{4}-\d{2}-\d{2}$/.test(f.trim()) && fechaValida(f.trim())) await sb.from('seleccion_busquedas').update({ fecha_baja: f.trim() }).eq('id', id);
            else toast('Fecha de baja inválida — se reabrió igual, sin guardar esa fecha', true);
        }
    }
    await recargarBusqueda(id); await recargarBusqueda(nueva.id);
    closeModal('modal-detalle'); refreshView();
    toast('Vacante reabierta como ' + nueva.numero + ' ✓');
}

async function eliminar(id) {
    const b = busquedas.find(x => x.id === id);
    if (!(await confirmar(`¿Eliminar la vacante ${b?.numero || ''} (${b?.local || ''})? Esta acción no se puede deshacer.`))) return;
    const { data, error } = await sb.from('seleccion_busquedas').delete().eq('id', id).select('id');
    if (error) { toast('Error al eliminar: ' + msgError(error), true); return; }
    if (!data || data.length === 0) { toast('No se eliminó (código del equipo inválido)', true); return; }
    busquedas = busquedas.filter(x => x.id !== id);
    closeModal('modal-detalle'); refreshView(); toast('Vacante eliminada');
}

// ══════════════════════════════════════════════
//  COLOCAR / LIBERAR una persona en la vacante
// ══════════════════════════════════════════════
// Copia a la vacante los datos que ya están en la base; el resto (CUIL, domicilio,
// sexo…) se completa en la fila a medida que avanza el proceso.
async function colocarEnVacante(postulanteId, busquedaId) {
    const p = postulantesById.get(postulanteId);
    const b = busquedas.find(x => x.id === busquedaId);
    if (!p || !b) { toast('Elegí un postulante y una vacante', true); return false; }
    if (p.estado === 'Bloqueado' || p.estado === 'Descartado') { toast(`${nombrePostulante(p)} está "${p.estado}" en la base: cambiá su estado antes de colocarlo`, true); return false; }
    if (tienePersona(b) && !(await confirmar(`La vacante ${b.numero} ya tiene a ${nombreCompleto(b) || 'alguien'} cargado. ¿Reemplazarlo por ${nombrePostulante(p)}? El anterior queda en el historial.`, 'Reemplazar'))) return false;
    const otra = vacanteDe(postulanteId);
    if (otra && otra.id !== busquedaId && !(await confirmar(`${nombrePostulante(p)} ya está en ${otra.numero} (${otra.local}). ¿Colocarlo igual en ${b.numero}?`))) return false;
    if (tienePersona(b)) await registrarSalida(b, 'Reemplazado');
    const update = {
        postulante_id: p.id, nombre: p.nombre, apellido: p.apellido || null, email: p.email || null, tel: p.telefono || null,
        fecha_nacimiento: p.fecha_nacimiento || null, dni: p.dni || null, localidad: p.localidad || null,
        cuil: p.cuil || null, nacionalidad: p.nacionalidad || null, tel_emergencia: p.tel_emergencia || null,
        // Lo que pide la vacante (y iCheck): sexo y domicilio, si la persona lo dejó en Elegí tu vacante
        sexo: p.sexo || null, domicilio: p.domicilio || null, domicilio_numero: p.domicilio_numero || null,
        codigo_postal: p.codigo_postal || null, provincia: p.provincia || null, pais: p.pais || null,
        id_postulante: p.id_postulante || null, estado: null, fecha_estado: null, fecha_citacion: null, hora_citacion: null
    };
    Object.keys(update).forEach(k => { update[k] = mayus(k, update[k]); });
    const row = await guardarBusqueda(busquedaId, update);
    if (!row) return false;
    refreshView();
    toast(`${nombrePostulante(p)} colocado en ${b.numero} ✓`);
    return true;
}

// Deja constancia en el historial de quién estaba y en qué estado quedó
async function registrarSalida(b, motivo) {
    const quien = nombreCompleto(b) || 'Sin nombre';
    const texto = `${motivo}: ${quien}${b.dni ? ' (DNI ' + b.dni + ')' : ''}${b.estado ? ' · estado ' + b.estado : ''}`;
    await sb.from('seleccion_comentarios').insert({ busqueda_id: b.id, texto, fecha: today(), autor: null });
}

async function liberarVacante(id, sinPreguntar = false) {
    const b = busquedas.find(x => x.id === id);
    if (!b || !tienePersona(b)) return;
    const vuelve = b.estado === 'RECHAZADO ZONAL' && (!esSabores(b) || personaBloqueada(b)) ? 'queda bloqueado por el rechazo del zonal' : 'vuelve a la base como disponible';
    if (!sinPreguntar && !(await confirmar(`¿Sacar a ${nombreCompleto(b) || 'la persona'} de la vacante ${b.numero}? Queda en el historial y ${vuelve}.`, 'Liberar'))) return;
    await registrarSalida(b, b.estado === 'RECHAZADO ZONAL' ? 'Rechazado por el zonal' : 'Liberado');
    const update = { postulante_id: null, estado: null, fecha_estado: null, fecha_citacion: null, hora_citacion: null };
    CAMPOS_PERSONA.forEach(f => update[f] = null);
    if (b.status === 'Cerrada') Object.assign(update, { status: 'Proceso', ingreso: null, ingreso_nombre: null });
    const row = await guardarBusqueda(id, update);
    if (!row) return;
    await recargarBusqueda(id);
    refreshView();
    if (!document.getElementById('modal-detalle').classList.contains('hidden')) renderDetalle(id);
    toast(`Vacante ${b.numero} liberada ✓`);
}

// ══════════════════════════════════════════════
//  BASE DE POSTULANTES
// ══════════════════════════════════════════════
const CAMPOS_POSTULANTE = ['nombre', 'apellido', 'dni', 'telefono', 'email', 'fecha_nacimiento', 'zona', 'localidad',
    'sede_entrevista', 'fecha_entrevista', 'puesto_interes', 'horario', 'curso_manipulacion', 'antecedentes',
    'cv_url', 'observaciones', 'estado', 'id_postulante', 'cuil', 'nacionalidad', 'tel_emergencia', 'sugerido_para',
    'interesado', 'sexo', 'domicilio', 'domicilio_numero', 'codigo_postal', 'provincia', 'pais'];

async function savePostulante() {
    const id  = +document.getElementById('p-id').value || null;
    const bid = +document.getElementById('p-bid').value || null;
    const row = {};
    CAMPOS_POSTULANTE.forEach(f => {
        const v = document.getElementById('p-' + f.replace(/_/g, '-')).value.trim();
        row[f] = v || null;
    });
    row.dni = row.dni ? row.dni.replace(/\D/g, '') : null;
    row.cuil = row.cuil ? row.cuil.replace(/\D/g, '') : null;
    if (!row.nombre) { toast('Ingresá el nombre', true); return; }
    if (!row.estado) row.estado = 'Aprobado';
    if (!fechaValida(row.fecha_nacimiento) || !fechaValida(row.fecha_entrevista)) { toast('Hay una fecha inválida', true); return; }

    const q = id ? sb.from('seleccion_postulantes').update(row).eq('id', id) : sb.from('seleccion_postulantes').insert(row);
    const { data, error } = await q.select();
    if (error) { toast(error.code === '23505' ? 'Ya hay un postulante con ese DNI en la base' : 'Error al guardar: ' + msgError(error), true); return; }
    if (!data || data.length === 0) { toast('No se guardó (código del equipo inválido)', true); return; }
    const p = data[0];
    if (id) postulantes = postulantes.map(x => x.id === id ? p : x);
    else postulantes = [p, ...postulantes];
    indexarPostulantes();
    closeModal('modal-postulante');
    if (bid && !id) await colocarEnVacante(p.id, bid);
    else { refreshView(); toast(id ? 'Postulante actualizado ✓' : 'Postulante agregado a la base ✓'); }
}

async function updatePostulanteField(id, field, val) {
    if (typeof val === 'string') val = val.trim();
    const { data, error } = await sb.from('seleccion_postulantes').update({ [field]: val || null }).eq('id', id).select();
    if (error) { toast('Error al guardar: ' + msgError(error), true); return; }
    if (!data || data.length === 0) { toast('No se guardó (código del equipo inválido)', true); return; }
    postulantes = postulantes.map(x => x.id === id ? data[0] : x);
    indexarPostulantes();
    refreshView(); toast('Guardado ✓');
}

async function removePostulante(id) {
    const p = postulantesById.get(id);
    const v = vacanteDe(id);
    if (!(await confirmar(`¿Eliminar a ${nombrePostulante(p)} de la base?${v ? ` En ${v.numero} quedan cargados sus datos (sin vínculo a la base).` : ''} Esta acción no se puede deshacer.`))) return;
    const { error } = await sb.from('seleccion_postulantes').delete().eq('id', id);
    if (error) { toast('Error al eliminar: ' + msgError(error), true); return; }
    postulantes = postulantes.filter(x => x.id !== id);
    indexarPostulantes();
    busquedas.forEach(b => { if (b.postulante_id === id) b.postulante_id = null; });
    refreshView(); toast('Postulante eliminado');
}

// ══════════════════════════════════════════════
//  EQUIPO (lista de selectores)
// ══════════════════════════════════════════════
let _guardandoMiembro = false; // un doble clic en "Agregar" creaba a la misma persona varias veces
async function saveMiembro() {
    if (_guardandoMiembro) return;
    const val = id => document.getElementById(id).value.trim();
    const row = {
        nombre: val('eq-nombre'),
        nombre_completo: val('eq-nombre-completo') || null,
        es_selector: document.getElementById('eq-es-selector').checked,
        color: val('eq-color') || null,
        foto_url: val('eq-foto-url') || null,
        orden: equipo.length
    };
    if (!row.nombre) { toast('Escribí el nombre', true); document.getElementById('eq-nombre').focus(); return; }
    if (row.foto_url && !/^https:\/\//i.test(row.foto_url)) { toast('La foto tiene que ser un link que empiece con https://', true); return; }
    if (equipo.some(e => e.nombre.toLowerCase() === row.nombre.toLowerCase())) { toast(`Ya hay alguien cargado como "${row.nombre}"`, true); return; }
    const btn = document.getElementById('btn-agregar-miembro');
    _guardandoMiembro = true; btn.disabled = true;
    try {
        const { error } = await sb.from('seleccion_equipo').insert(row);
        if (error) { toast('Error al guardar: ' + msgError(error), true); return; }
        ['eq-nombre', 'eq-nombre-completo', 'eq-foto-url'].forEach(i => document.getElementById(i).value = '');
        await despuesDeCambiarEquipo(`${row.nombre} agregado ✓${row.es_selector ? '' : ' (no toma búsquedas: no aparece como selector)'}`);
        document.getElementById('eq-nombre').focus();
    } finally { _guardandoMiembro = false; btn.disabled = false; }
}

async function updateMiembro(id, field, val) {
    if (field === 'nombre' && !val) { toast('El nombre no puede quedar vacío', true); renderEquipoModal(); return; }
    if (field === 'foto_url' && val && !/^https:\/\//i.test(val)) { toast('La foto tiene que ser un link que empiece con https://', true); renderEquipoModal(); return; }
    const { error } = await sb.from('seleccion_equipo').update({ [field]: val }).eq('id', id);
    if (error) { toast('Error al guardar: ' + msgError(error), true); renderEquipoModal(); return; }
    await despuesDeCambiarEquipo('Guardado ✓');
}

async function removeMiembro(id) {
    const m = equipo.find(e => e.id === id);
    if (!(await confirmar(`¿Eliminar a ${m?.nombre} del equipo? Deja de aparecer como selector (sus vacantes no se borran).`))) return;
    const { error } = await sb.from('seleccion_equipo').delete().eq('id', id);
    if (error) { toast('Error al eliminar: ' + msgError(error), true); return; }
    await despuesDeCambiarEquipo('Eliminado del equipo');
}

async function despuesDeCambiarEquipo(msg) {
    await loadEquipo();
    renderEquipoModal();
    renderSelectorChips();
    refreshView();
    toast(msg);
}
