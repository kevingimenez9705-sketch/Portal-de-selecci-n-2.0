// ══════════════════════════════════════════════
//  AUTH + CARGA DE DATOS
// ══════════════════════════════════════════════
async function login() {
    const email = document.getElementById('login-email').value.trim();
    const pass  = document.getElementById('login-pass').value;
    showLoginError('');
    const { error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (error) { showLoginError('Email o contraseña incorrectos'); return; }
    await arrancar();
}

async function logout() { await sb.auth.signOut(); location.reload(); }

function showLoginError(msg) {
    const el = document.getElementById('login-error');
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
}

// Muestra una sola de las pantallas grandes: login, loading, landing o app.
function mostrarPantalla(cual) {
    ['login-screen', 'loading-screen', 'landing-screen', 'app'].forEach(id =>
        document.getElementById(id).classList.toggle('hidden', id !== cual));
}

// Traduce los errores de Supabase a algo que se entienda en pantalla.
function msgError(error) {
    const code = error?.code || '';
    const m = error?.message || code || 'error desconocido';
    if (code === '42P01' || code === 'PGRST205' || /does not exist|Could not find the table/i.test(m)) return 'faltan crear las tablas del portal en Supabase (sql/portal_seleccion.sql)';
    if (code === '42501' || /row-level security/i.test(m)) return 'tu usuario no tiene permiso para esto';
    if (code === '23505') return 'ya existe un registro igual (DNI o postulante repetido)';
    if (/abort|timeout|57014/i.test(m + code)) return 'la consulta tardó demasiado';
    return m;
}

async function loadEquipo() {
    const { data, error } = await sb.from('seleccion_equipo').select('*').order('orden').order('nombre');
    if (error) throw error;
    equipo = data || [];
}

const BUSQUEDA_SELECT = '*, candidatos:seleccion_candidatos(*), comentarios:seleccion_comentarios(*)';
const PAGINA = 1000; // Supabase devuelve como máximo 1000 filas por pedido

async function fetchTodo(tabla, select = '*') {
    const out = [];
    for (let from = 0; ; from += PAGINA) {
        const { data, error } = await sb.from(tabla).select(select).order('id', { ascending: false }).range(from, from + PAGINA - 1);
        if (error) throw error;
        out.push(...(data || []));
        if (!data || data.length < PAGINA) break;
    }
    return out;
}

function mapBusqueda(b) {
    return {
        ...b,
        candidatos:  (b.candidatos  || []).sort((a, x) => a.id - x.id),
        comentarios: (b.comentarios || []).sort((a, x) => a.id - x.id),
    };
}

let postulantesById = new Map();
function indexarPostulantes() { postulantesById = new Map(postulantes.map(p => [p.id, p])); }

async function loadData() {
    const [bs, ps] = await Promise.all([fetchTodo('seleccion_busquedas', BUSQUEDA_SELECT), fetchTodo('seleccion_postulantes')]);
    busquedas = bs.map(mapBusqueda);
    postulantes = ps;
    indexarPostulantes();
}

// Después de guardar algo de UNA búsqueda (o de sus candidatos/comentarios) se vuelve
// a pedir solo esa búsqueda, no todo.
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

// Arranque después del login (o al volver con la sesión abierta).
async function arrancar() {
    mostrarPantalla('loading-screen');
    document.getElementById('loading-txt').textContent = 'Cargando datos...';
    try {
        const { data: { user } } = await sb.auth.getUser();
        if (!user) { mostrarPantalla('login-screen'); return; }
        await loadEquipo();
        const email = (user.email || '').toLowerCase();
        currentProfile = equipo.find(e => e.activo && (e.email || '').toLowerCase() === email) || null;
        if (!currentProfile) {
            await sb.auth.signOut();
            mostrarPantalla('login-screen');
            showLoginError(`El usuario ${user.email} no está habilitado en el portal. Pedile a un administrador que lo agregue en "Equipo".`);
            return;
        }
        await loadData();
        await checkAndFinalizeSearches();
        datosCargados = true;
        prepararApp();
        showHome();
    } catch (e) {
        console.error('Error al arrancar:', e);
        document.getElementById('loading-txt').innerHTML = `No se pudieron cargar los datos: <strong>${esc(msgError(e))}</strong><br><br>
            <button class="btn-sm" onclick="arrancar()">Reintentar</button> <button class="btn-sm" onclick="logout()">Salir</button>`;
    }
}

async function initApp() {
    const { data: { session } } = await sb.auth.getSession();
    if (session) await arrancar();
    else mostrarPantalla('login-screen');
}

// Botón "Actualizar": vuelve a traer todo.
async function recargarDatos() {
    try {
        await Promise.all([loadEquipo(), loadData()]);
        await checkAndFinalizeSearches();
        renderSelectorChips();
        refreshView();
        toast('Datos actualizados ✓');
    } catch (e) { toast('Error al actualizar: ' + msgError(e), true); }
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
//  BÚSQUEDAS
// ══════════════════════════════════════════════
const CAMPOS_OBLIGATORIOS = ['marca', 'local', 'puesto'];

async function updateField(id, field, val) {
    if (typeof val === 'string') val = val.trim();
    if (!fechaValida(val)) { toast('Fecha inválida (año fuera de rango) — no se guardó', true); refreshBusqueda(id); return; }
    if (CAMPOS_OBLIGATORIOS.includes(field) && !val) { toast('Ese dato no puede quedar vacío', true); refreshBusqueda(id); return; }
    const update = { [field]: val === '' ? null : val };
    if (field === 'ingreso' && val) {
        const msg = 'Vas a cargar la fecha de ingreso: la búsqueda pasa a "Cerrada"'
            + (isAdmin() ? '.' : ' y, al no ser admin, ya no la vas a poder editar.') + ' ¿Confirmás?';
        if (!(await confirmar(msg))) { refreshBusqueda(id); return; }
        update.status = 'Cerrada';
    }
    const { data, error } = await sb.from('seleccion_busquedas').update(update).eq('id', id).select();
    if (error) { toast('Error al guardar: ' + msgError(error), true); return; }
    if (!data || data.length === 0) { toast('No se guardó (sin permiso para editar)', true); return; }
    aplicarCambiosBusqueda(data[0]);
    if (field === 'ingreso') await checkAndFinalizeSearches();
    refreshBusqueda(id);
    const cerrandoSinIngreso = field === 'status' && (val === 'Cerrada' || val === 'Finalizada') && !data[0].ingreso;
    toast(cerrandoSinIngreso ? 'Guardado — ojo: se cerró sin cargar la fecha de ingreso' : 'Guardado ✓');
}

async function addEstadoEntry(id) {
    const input = document.getElementById('estado-input-' + id);
    const texto = input?.value.trim();
    if (!texto) return;
    const { error } = await sb.from('seleccion_comentarios').insert({ busqueda_id: id, texto, fecha: today() });
    if (error) { toast('Error al guardar: ' + msgError(error), true); return; }
    await recargarBusqueda(id); refreshBusqueda(id); toast('Comentario agregado ✓');
}

async function removeEstadoEntry(busquedaId, entryId) {
    if (!isAdmin()) { toast('Solo un administrador puede eliminar comentarios', true); return; }
    if (!(await confirmar('¿Eliminar este comentario? Esta acción no se puede deshacer.'))) return;
    const { error } = await sb.from('seleccion_comentarios').delete().eq('id', entryId);
    if (error) { toast('Error al eliminar: ' + msgError(error), true); return; }
    await recargarBusqueda(busquedaId); refreshBusqueda(busquedaId); toast('Eliminado');
}

async function addNew() {
    const val = id => document.getElementById(id).value.trim();
    const local = val('n-local'), puesto = val('n-puesto');
    if (!local)  { toast('Ingresá el local', true); return; }
    if (!puesto) { toast('Ingresá el puesto', true); return; }
    if (!fechaValida(val('n-inicio'))) { toast('Fecha de apertura inválida', true); return; }
    // En Tareas grupales un local suele pedir varias vacantes iguales (una fila por persona):
    // "Cantidad" crea esa misma cantidad de búsquedas de una vez.
    const cantidad = Math.min(20, Math.max(1, parseInt(val('n-cantidad')) || 1));
    const row = {
        marca: val('n-marca'), local, puesto,
        local_entrenamiento: val('n-local-ent') || null,
        zona: val('n-zona') || null,
        regional: val('n-regional') || null,
        zonal: val('n-zonal') || null,
        selector: val('n-selector') || null,
        jornada: val('n-jornada') || null,
        nivel: val('n-nivel') || 'Operativo',
        motivo: val('n-motivo') || 'Rotación',
        notas: val('n-notas') || null,
        inicio: val('n-inicio') || today(),
        status: 'Proceso'
    };
    const { data, error } = await sb.from('seleccion_busquedas').insert(Array.from({ length: cantidad }, () => ({ ...row }))).select(BUSQUEDA_SELECT);
    if (error) { toast('Error al crear la búsqueda: ' + msgError(error), true); return; }
    busquedas = [...(data || []).map(mapBusqueda).reverse(), ...busquedas];
    closeModal('modal-nueva');
    refreshView();
    toast(cantidad > 1 ? `${cantidad} búsquedas creadas ✓` : `Búsqueda ${data[0].numero} creada ✓`);
}

async function reabrir(id) {
    const orig = busquedas.find(x => x.id === id);
    if (!orig) { toast('No se encontró la búsqueda', true); return; }
    if (!(await confirmar(`¿Reabrir "${orig.puesto}" en ${orig.local}? Se crea una búsqueda nueva en Proceso.`))) return;
    const nuevaRow = {
        marca: orig.marca, local: orig.local, local_entrenamiento: orig.local_entrenamiento, zona: orig.zona,
        regional: orig.regional, zonal: orig.zonal, selector: orig.selector, puesto: orig.puesto,
        jornada: orig.jornada, nivel: orig.nivel, motivo: orig.motivo,
        inicio: today(), status: 'Proceso', reopened_from: orig.numero
    };
    const { data: nueva, error } = await sb.from('seleccion_busquedas').insert(nuevaRow).select().single();
    if (error) { toast('Error al reabrir: ' + msgError(error), true); return; }
    const texto = `Reapertura de ${orig.numero} — "${orig.puesto}" en ${orig.local}. Anterior ingresado: ${orig.ingreso_nombre || 'N/D'} (${orig.ingreso ? fmtFecha(orig.ingreso) : 'sin fecha'})`;
    await sb.from('seleccion_comentarios').insert({ busqueda_id: nueva.id, texto, fecha: today() });
    if (orig.ingreso && !orig.fecha_baja) {
        const f = await pedirTexto('Fecha de baja del que había ingresado (AAAA-MM-DD). Dejá vacío si no corresponde:', today());
        if (f && f.trim()) {
            if (/^\d{4}-\d{2}-\d{2}$/.test(f.trim()) && fechaValida(f.trim())) await sb.from('seleccion_busquedas').update({ fecha_baja: f.trim() }).eq('id', id);
            else toast('Fecha de baja inválida — se reabrió igual, sin guardar esa fecha', true);
        }
    }
    await recargarBusqueda(id); await recargarBusqueda(nueva.id); refreshView();
    toast('Búsqueda reabierta como ' + nueva.numero + ' ✓');
}

async function eliminar(id) {
    if (!isAdmin()) { toast('Solo un administrador puede eliminar búsquedas', true); return; }
    const b = busquedas.find(x => x.id === id);
    const n = b?.candidatos.length || 0;
    if (!(await confirmar(`¿Eliminar la búsqueda ${b?.numero || ''}?${n ? ` Se quitan también sus ${n} candidato(s) (siguen en la base de postulantes).` : ''} Esta acción no se puede deshacer.`))) return;
    const { data, error } = await sb.from('seleccion_busquedas').delete().eq('id', id).select('id');
    if (error) { toast('Error al eliminar: ' + msgError(error), true); return; }
    if (!data || data.length === 0) { toast('No se eliminó (sin permiso)', true); return; }
    busquedas = busquedas.filter(x => x.id !== id);
    refreshView(); toast('Búsqueda eliminada');
}

// ══════════════════════════════════════════════
//  CANDIDATOS (postulante colocado en una vacante)
// ══════════════════════════════════════════════
function buscarCand(candId) {
    for (const b of busquedas) {
        const c = b.candidatos.find(x => x.id === candId);
        if (c) return { c, b };
    }
    return null;
}

async function colocarEnVacante(postulanteId, busquedaId) {
    const p = postulantesById.get(postulanteId);
    const b = busquedas.find(x => x.id === busquedaId);
    if (!p || !b) { toast('Elegí un postulante y una vacante', true); return false; }
    if (p.estado === 'Bloqueado' || p.estado === 'Descartado') { toast(`${nombrePostulante(p)} está "${p.estado}" en la base: cambiá su estado antes de colocarlo`, true); return false; }
    const activa = candidaturasDe(postulanteId).find(x => CAND_ACTIVOS.includes(x.c.estado) && vacanteAbierta(x.b));
    if (activa && !(await confirmar(`${nombrePostulante(p)} ya está en ${activa.b.numero} (${activa.b.local}) como "${activa.c.estado}". ¿Colocarlo igual en ${b.numero}?`))) return false;
    const { error } = await sb.from('seleccion_candidatos').insert({ busqueda_id: busquedaId, postulante_id: postulanteId, estado: 'Asignado', fecha_asignacion: today() });
    if (error) { toast(error.code === '23505' ? 'Ese postulante ya está en esta vacante' : 'Error al colocar: ' + msgError(error), true); return false; }
    await recargarBusqueda(busquedaId);
    refreshView();
    toast(`${nombrePostulante(p)} colocado en ${b.numero} ✓`);
    return true;
}

async function updateCandEstado(candId, estado) {
    const found = buscarCand(candId);
    if (!found) return;
    const { c, b } = found;
    const nombre = nombrePostulante(postulantesById.get(c.postulante_id));
    const hoy = today();
    const upd = { estado };
    switch (estado) {
        case 'Asignado':       Object.assign(upd, { fecha_envio: null, fecha_decision: null, fecha_ingreso: null, fecha_salida: null }); break;
        case 'Enviado':        Object.assign(upd, { fecha_envio: c.fecha_envio || hoy, fecha_decision: null, fecha_ingreso: null, fecha_salida: null }); break;
        case 'Aprobado':       Object.assign(upd, { fecha_envio: c.fecha_envio || hoy, fecha_decision: c.fecha_decision || hoy, fecha_ingreso: null, fecha_salida: null }); break;
        case 'Rechazado':      Object.assign(upd, { fecha_envio: c.fecha_envio || hoy, fecha_decision: c.fecha_decision || hoy, fecha_ingreso: null }); break;
        case 'Citado ONB':
        case 'Confirmó ONB':   Object.assign(upd, { fecha_onb: c.fecha_onb || hoy, fecha_ingreso: null, fecha_salida: null }); break;
        case 'Ingresó':        Object.assign(upd, { fecha_ingreso: c.fecha_ingreso || c.fecha_onb || hoy, fecha_salida: null }); break;
        case 'No se presentó':
        case 'Desistió':       Object.assign(upd, { fecha_salida: c.fecha_salida || hoy, fecha_ingreso: null }); break;
    }

    // Que ingrese alguien cierra la vacante (como cargar la fecha de ingreso en la búsqueda).
    let cerrar = false;
    if (estado === 'Ingresó' && b.status !== 'Cerrada' && b.status !== 'Finalizada') {
        cerrar = await confirmar(`${nombre} ingresó: la búsqueda ${b.numero} pasa a "Cerrada" con fecha de ingreso ${fmtFecha(upd.fecha_ingreso)}. ¿Confirmás?`);
        if (!cerrar) { refreshBusqueda(b.id); return; }
    }

    const { data, error } = await sb.from('seleccion_candidatos').update(upd).eq('id', candId).select();
    if (error) { toast('Error: ' + msgError(error), true); return; }
    if (!data || data.length === 0) { toast('No se actualizó (sin permiso)', true); return; }

    // Las fechas de la búsqueda que frenan cada tramo de demora se completan solas
    // con el primer envío al zonal y la primera aprobación (después se pueden corregir a mano).
    const updB = {};
    if (['Enviado', 'Aprobado', 'Rechazado'].includes(estado) && !b.enviado_zonal) updB.enviado_zonal = upd.fecha_envio;
    if (estado === 'Aprobado' && !b.decision_zonal) updB.decision_zonal = upd.fecha_decision;
    if (cerrar) Object.assign(updB, { ingreso: upd.fecha_ingreso, ingreso_nombre: nombre, status: 'Cerrada' });
    if (Object.keys(updB).length) {
        const { error: eB } = await sb.from('seleccion_busquedas').update(updB).eq('id', b.id);
        if (eB) toast('El candidato se guardó, pero no se pudo actualizar la búsqueda: ' + msgError(eB), true);
    }
    await recargarBusqueda(b.id);
    if (cerrar) await checkAndFinalizeSearches();
    refreshView();
    if (b.ingreso_nombre === nombre && estado !== 'Ingresó') toast('Estado actualizado — revisá "Candidato que ingresó" de la búsqueda', true);
    else toast('Estado actualizado ✓');
}

async function updateCandField(candId, field, val) {
    if (typeof val === 'string') val = val.trim();
    if (!fechaValida(val)) { toast('Fecha inválida (año fuera de rango) — no se guardó', true); refreshView(); return; }
    const found = buscarCand(candId);
    if (!found) return;
    const { c, b } = found;
    const { data, error } = await sb.from('seleccion_candidatos').update({ [field]: val || null }).eq('id', candId).select();
    if (error) { toast('Error al guardar: ' + msgError(error), true); return; }
    if (!data || data.length === 0) { toast('No se guardó (sin permiso)', true); return; }
    // Si es quien ingresó, la fecha de ingreso de la búsqueda acompaña.
    if (field === 'fecha_ingreso' && val && c.estado === 'Ingresó' && b.ingreso_nombre === nombrePostulante(postulantesById.get(c.postulante_id))) {
        await sb.from('seleccion_busquedas').update({ ingreso: val }).eq('id', b.id);
    }
    await recargarBusqueda(b.id); refreshBusqueda(b.id); toast('Guardado ✓');
}

// Descuenta días hábiles de la espera que no dependen del equipo (feriado del local, zonal de licencia…)
async function guardarJustificacion(candId) {
    const dias   = Math.max(0, parseInt(document.getElementById('justif-dias-' + candId).value) || 0);
    const motivo = document.getElementById('justif-motivo-' + candId).value.trim();
    const found = buscarCand(candId);
    if (!found) return;
    const { error } = await sb.from('seleccion_candidatos').update({ demora_descuento_dias: dias, demora_descuento_motivo: motivo || null }).eq('id', candId);
    if (error) { toast('Error al guardar: ' + msgError(error), true); return; }
    await recargarBusqueda(found.b.id); refreshBusqueda(found.b.id); toast('Demora justificada ✓');
}

async function quitarCand(candId) {
    const found = buscarCand(candId);
    if (!found) return;
    const nombre = nombrePostulante(postulantesById.get(found.c.postulante_id));
    if (!(await confirmar(`¿Quitar a ${nombre} de ${found.b.numero}? Sigue en la base de postulantes.`))) return;
    const { error } = await sb.from('seleccion_candidatos').delete().eq('id', candId);
    if (error) { toast('Error al quitar: ' + msgError(error), true); return; }
    await recargarBusqueda(found.b.id); refreshView(); toast('Quitado de la vacante');
}

// ══════════════════════════════════════════════
//  BASE DE POSTULANTES
// ══════════════════════════════════════════════
const CAMPOS_POSTULANTE = ['nombre', 'apellido', 'dni', 'telefono', 'email', 'fecha_nacimiento', 'zona', 'localidad',
    'sede_entrevista', 'fecha_entrevista', 'puesto_interes', 'horario', 'curso_manipulacion', 'antecedentes',
    'cv_url', 'observaciones', 'estado', 'id_postulante'];

async function savePostulante() {
    const id  = +document.getElementById('p-id').value || null;
    const bid = +document.getElementById('p-bid').value || null;
    const row = {};
    CAMPOS_POSTULANTE.forEach(f => {
        const v = document.getElementById('p-' + f.replace(/_/g, '-')).value.trim();
        row[f] = v || null;
    });
    row.dni = row.dni ? row.dni.replace(/\D/g, '') : null;
    if (!row.nombre) { toast('Ingresá el nombre', true); return; }
    if (!row.estado) row.estado = 'Aprobado';
    if (!fechaValida(row.fecha_nacimiento) || !fechaValida(row.fecha_entrevista)) { toast('Hay una fecha inválida', true); return; }

    const q = id ? sb.from('seleccion_postulantes').update(row).eq('id', id) : sb.from('seleccion_postulantes').insert(row);
    const { data, error } = await q.select();
    if (error) { toast(error.code === '23505' ? 'Ya hay un postulante con ese DNI en la base' : 'Error al guardar: ' + msgError(error), true); return; }
    if (!data || data.length === 0) { toast('No se guardó (sin permiso)', true); return; }
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
    if (!data || data.length === 0) { toast('No se guardó (sin permiso)', true); return; }
    postulantes = postulantes.map(x => x.id === id ? data[0] : x);
    indexarPostulantes();
    refreshView(); toast('Guardado ✓');
}

async function removePostulante(id) {
    const p = postulantesById.get(id);
    const n = candidaturasDe(id).length;
    if (!(await confirmar(`¿Eliminar a ${nombrePostulante(p)} de la base?${n ? ` También se lo quita de ${n} vacante(s).` : ''} Esta acción no se puede deshacer.`))) return;
    const { error } = await sb.from('seleccion_postulantes').delete().eq('id', id);
    if (error) { toast('Error al eliminar: ' + msgError(error), true); return; }
    postulantes = postulantes.filter(x => x.id !== id);
    indexarPostulantes();
    busquedas.forEach(b => { b.candidatos = b.candidatos.filter(c => c.postulante_id !== id); });
    refreshView(); toast('Postulante eliminado');
}

// ══════════════════════════════════════════════
//  EQUIPO (solo admin)
// ══════════════════════════════════════════════
async function saveMiembro() {
    const val = id => document.getElementById(id).value.trim();
    const row = {
        nombre: val('eq-nombre'),
        nombre_completo: val('eq-nombre-completo') || null,
        email: val('eq-email').toLowerCase() || null,
        rol: val('eq-rol') || 'selector',
        es_selector: document.getElementById('eq-es-selector').checked,
        color: val('eq-color') || null,
        orden: equipo.length
    };
    if (!row.nombre) { toast('Ingresá el nombre', true); return; }
    const { error } = await sb.from('seleccion_equipo').insert(row);
    if (error) { toast(error.code === '23505' ? 'Ese email ya está en el equipo' : 'Error al guardar: ' + msgError(error), true); return; }
    ['eq-nombre', 'eq-nombre-completo', 'eq-email'].forEach(i => document.getElementById(i).value = '');
    await despuesDeCambiarEquipo('Agregado al equipo ✓');
}

async function updateMiembro(id, field, val) {
    if (field === 'email' && typeof val === 'string') val = val.trim().toLowerCase() || null;
    if (id === currentProfile.id && ((field === 'rol' && val !== 'admin') || (field === 'activo' && !val))) {
        if (!(await confirmar('Te estás quitando el acceso de administrador a vos mismo. ¿Seguir?'))) { renderEquipoModal(); return; }
    }
    const { error } = await sb.from('seleccion_equipo').update({ [field]: val }).eq('id', id);
    if (error) { toast('Error al guardar: ' + msgError(error), true); renderEquipoModal(); return; }
    await despuesDeCambiarEquipo('Guardado ✓');
}

async function removeMiembro(id) {
    const m = equipo.find(e => e.id === id);
    if (!(await confirmar(`¿Eliminar a ${m?.nombre} del equipo? Deja de poder entrar al portal (sus búsquedas no se borran).`))) return;
    const { error } = await sb.from('seleccion_equipo').delete().eq('id', id);
    if (error) { toast('Error al eliminar: ' + msgError(error), true); return; }
    await despuesDeCambiarEquipo('Eliminado del equipo');
}

async function despuesDeCambiarEquipo(msg) {
    await loadEquipo();
    currentProfile = equipo.find(e => e.id === currentProfile.id) || currentProfile;
    renderEquipoModal();
    renderSelectorChips();
    refreshView();
    toast(msg);
}
