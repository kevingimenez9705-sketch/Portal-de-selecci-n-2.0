// ══════════════════════════════════════════════
//  AUTH + CARGA DE DATOS
// ══════════════════════════════════════════════
async function login() {
    const email = document.getElementById('login-email').value.trim();
    const pass  = document.getElementById('login-pass').value;
    const errEl = document.getElementById('login-error');
    errEl.style.display = 'none';
    const { error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (error) { errEl.textContent = 'Email o contraseña incorrectos'; errEl.style.display = 'block'; return; }
    await initDashboard();
}

async function logout() { await sb.auth.signOut(); location.reload(); }

async function loadProfile() {
    const { data: { user } } = await sb.auth.getUser();
    const { data, error } = await sb.from('profiles').select('*').eq('id', user.id).single();
    if (error) { console.error('Error cargando perfil:', error); return; }
    currentProfile = data;
}

async function loadData() {
    const { data, error } = await sb
        .from('busquedas')
        .select('*, historial(*), estado_log(*), candidatos(*), psicotecnicos(*), verificaciones(*), archivos(*)')
        .order('id', { ascending: false });
    if (error) { toast('Error al cargar datos', true); return; }
    busquedas = (data || []).map(mapRow);
    const nums = busquedas.map(b => parseInt((b.numero || '').replace('SEL-', '')) || 0);
    nroSeq = nums.length ? Math.max(...nums) + 1 : 1;
}

function mapRow(b) {
    return {
        ...b,
        historial:       (b.historial   || []).sort((a,x) => a.id - x.id),
        estado_busqueda: (b.estado_log  || []).sort((a,x) => a.id - x.id),
        candidatos:      (b.candidatos  || []).sort((a,x) => a.id - x.id),
        psicotecnicos:   (b.psicotecnicos || []).map(p => ({...p, auth: p.auth_por})).sort((a,x) => a.id - x.id),
        verificaciones:  (b.verificaciones || []).sort((a,x) => a.id - x.id),
        archivos:        (b.archivos    || []).sort((a,x) => a.id - x.id),
    };
}

function nextNro() { return 'SEL-' + String(nroSeq++).padStart(3, '0'); }

async function checkAndFinalizeSearches() {
    const toFinalize = busquedas.filter(b =>
        b.status === 'Cerrada' && b.ingreso && daysDiff(b.ingreso) >= 90
    );
    if (toFinalize.length === 0) return;
    for (const b of toFinalize) {
        const { error } = await sb.from('busquedas').update({ status: 'Finalizada' }).eq('id', b.id);
        if (!error) b.status = 'Finalizada';
    }
}

async function initDashboard() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('loading-screen').classList.remove('hidden');
    await loadProfile();
    await loadData();
    await checkAndFinalizeSearches();
    document.getElementById('loading-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    const esAdmin = isAdmin();
    const nombre = esAdmin ? '🔑 ' + (currentProfile?.nombre || 'Administrador') : '👤 ' + (currentProfile?.nombre || 'Selector');
    document.getElementById('topnav-nombre').textContent = nombre;
    document.getElementById('topnav-rol').textContent = esAdmin ? 'admin' : 'selector';
    if (!esAdmin) {
        document.getElementById('nav-stats').classList.add('hidden');
        document.getElementById('nav-charts').classList.add('hidden');
    }
    renderTable();
}

async function initApp() {
    const { data: { session } } = await sb.auth.getSession();
    if (session) await initDashboard();
}

// ══════════════════════════════════════════════
//  UPDATE FIELD
// ══════════════════════════════════════════════
async function updateField(id, field, val) {
    const update = { [field]: val };
    if (field === 'ingreso' && val) update.status = 'Cerrada';
    const { data, error } = await sb.from('busquedas').update(update).eq('id', id).select();
    if (error) { toast('Error al guardar: ' + (error.message || error.code), true); return; }
    if (!data || data.length === 0) { toast('No se guardó (revisar policy UPDATE en busquedas)', true); return; }
    await loadData();
    if (field === 'ingreso') await checkAndFinalizeSearches();
    renderTable();
    toast('Guardado ✓');
}

async function addEstadoEntry(id) {
    const input = document.getElementById('estado-input-' + id);
    const texto = input?.value.trim();
    if (!texto) return;
    const { error } = await sb.from('estado_log').insert({ busqueda_id: id, texto, fecha: today() });
    if (error) { toast('Error al guardar', true); return; }
    input.value = '';
    await loadData(); renderTable(); toast('Comentario agregado ✓');
}

async function removeEstadoEntry(entryId) {
    if (!isAdmin()) { toast('Solo un administrador puede eliminar comentarios', true); return; }
    if (!confirm('¿Eliminar este comentario? Esta acción no se puede deshacer.')) return;
    await sb.from('estado_log').delete().eq('id', entryId);
    await loadData(); renderTable(); toast('Eliminado');
}

// ── CANDIDATOS ──
async function saveCand() {
    const id     = +document.getElementById('cand-bid').value;
    const nombre = document.getElementById('cand-nombre').value.trim();
    const estado = document.getElementById('cand-estado').value;
    if (!nombre) return;
    const fEnvio      = document.getElementById('cand-fecha-envio').value || today();
    const fEntrevista = document.getElementById('cand-fecha-entrevista').value;
    const fRechazo    = document.getElementById('cand-fecha-rechazo').value;

    const row = { busqueda_id: id, nombre, estado, fecha_envio: fEnvio };
    if (estado === 'Entrevista' && fEntrevista) row.fecha_entrevista = fEntrevista;
    if (estado === 'Rechazado'  && fRechazo)    row.fecha_rechazo   = fRechazo;

    const { error } = await sb.from('candidatos').insert(row);
    if (error) {
        console.error('saveCand error:', error, 'ROW:', row);
        toast('Error: ' + (error.message || error.details || error.hint || error.code || 'desconocido'), true);
        return;
    }
    closeModal('modal-cand'); await loadData(); renderTable(); toast('Candidato agregado ✓');
}

async function removeCand(candId) {
    if (!confirm('¿Eliminar este candidato? Esta acción no se puede deshacer.')) return;
    await sb.from('candidatos').delete().eq('id', candId);
    await loadData(); renderTable(); toast('Candidato eliminado');
}

async function updateCandEstado(candId, estado) {
    const hoy = today();
    const update = { estado };
    const c = busquedas.flatMap(b => b.candidatos).find(x => x.id === candId) || {};

    if (estado === 'Entrevista') {
        update.fecha_entrevista = c.fecha_entrevista || hoy;
        update.fecha_rechazo = null;
    }
    if (estado === 'Rechazado') {
        update.fecha_rechazo = c.fecha_rechazo || hoy;
    }
    if (estado === 'Enviado') {
        update.fecha_entrevista = null;
        update.fecha_rechazo = null;
    }
    if (estado === 'Oferta') {
        update.fecha_rechazo = null;
    }

    const { data, error } = await sb.from('candidatos').update(update).eq('id', candId).select();
    if (error) {
        if (error.message && error.message.includes('fecha_rechazo')) {
            const updateSinRechazo = { estado };
            if (estado === 'Entrevista') updateSinRechazo.fecha_entrevista = c.fecha_entrevista || hoy;
            if (estado === 'Enviado')    updateSinRechazo.fecha_entrevista = null;
            const { data: d2, error: e2 } = await sb.from('candidatos').update(updateSinRechazo).eq('id', candId).select();
            if (e2) { toast('Error: ' + (e2.message || e2.code), true); return; }
            if (!d2 || d2.length === 0) { toast('No se actualizó (revisar policy UPDATE en candidatos)', true); return; }
            await loadData(); renderTable(); toast('Estado actualizado ✓');
            return;
        }
        toast('Error: ' + (error.message || error.code), true);
        return;
    }
    if (!data || data.length === 0) { toast('No se actualizó (revisar policy UPDATE en candidatos)', true); return; }
    await loadData(); renderTable(); toast('Estado actualizado ✓');
}

async function updateCandFecha(candId, field, val) {
    const { data, error } = await sb.from('candidatos').update({ [field]: val || null }).eq('id', candId).select();
    if (error) { toast('Error al guardar fecha: ' + (error.message || error.code), true); return; }
    if (!data || data.length === 0) { toast('No se guardó (revisar policy UPDATE en candidatos)', true); return; }
    await loadData(); renderTable(); toast('Fecha actualizada ✓');
}

// ── PSICOTÉCNICOS ──
async function savePsico() {
    const id           = +document.getElementById('psico-bid').value;
    const nombre       = document.getElementById('psico-nombre').value.trim();
    const resultado    = document.getElementById('psico-resultado').value;
    const selector_psico = document.getElementById('psico-selector').value;
    const realizado_por  = document.getElementById('psico-realizado').value.trim();
    const auth_por       = document.getElementById('psico-auth').value.trim();
    if (!nombre) return;
    const { error } = await sb.from('psicotecnicos').insert({ busqueda_id: id, nombre, resultado, selector_psico, realizado_por, auth_por });
    if (error) { toast('Error al guardar', true); return; }
    closeModal('modal-psico'); await loadData(); renderTable(); toast('Psicotécnico agregado ✓');
}
async function removePsico(psicoId) {
    if (!confirm('¿Eliminar este psicotécnico? Esta acción no se puede deshacer.')) return;
    await sb.from('psicotecnicos').delete().eq('id', psicoId);
    await loadData(); renderTable(); toast('Eliminado');
}

// ── VERIFICACIONES ──
async function saveVerif() {
    const id           = +document.getElementById('verif-bid').value;
    const tipo         = document.getElementById('verif-tipo').value;
    const resultado    = document.getElementById('verif-resultado').value;
    const selector_verif = document.getElementById('verif-selector').value;
    const observaciones  = document.getElementById('verif-obs').value.trim();

    const row = { busqueda_id: id, tipo, resultado, selector_verif, observaciones, fecha_inicio: today() };
    if (!verifEnCurso(resultado)) row.fecha_fin = today();

    let { error } = await sb.from('verificaciones').insert(row);
    if (error && error.message && /fecha_(inicio|fin)/.test(error.message)) {
        ({ error } = await sb.from('verificaciones').insert({ busqueda_id: id, tipo, resultado, selector_verif, observaciones }));
    }
    if (error) { toast('Error al guardar: ' + (error.message || error.code), true); return; }
    closeModal('modal-verif'); await loadData(); renderTable(); toast('Verificación agregada ✓');
}

async function updateVerifEstado(verifId, resultado) {
    const v = busquedas.flatMap(b => b.verificaciones).find(x => x.id === verifId) || {};
    const update = { resultado };
    if (verifEnCurso(resultado)) {
        update.fecha_fin = null;
    } else {
        update.fecha_fin = v.fecha_fin || today();
    }
    let { data, error } = await sb.from('verificaciones').update(update).eq('id', verifId).select();
    if (error && error.message && error.message.includes('fecha_fin')) {
        ({ data, error } = await sb.from('verificaciones').update({ resultado }).eq('id', verifId).select());
    }
    if (error) { toast('Error: ' + (error.message || error.code), true); return; }
    if (!data || data.length === 0) { toast('No se actualizó (revisar policy UPDATE en verificaciones)', true); return; }
    await loadData(); renderTable(); toast('Estado actualizado ✓');
}

async function removeVerif(verifId) {
    if (!confirm('¿Eliminar esta verificación? Esta acción no se puede deshacer.')) return;
    await sb.from('verificaciones').delete().eq('id', verifId);
    await loadData(); renderTable(); toast('Eliminado');
}

// ── ALTA / REAPERTURA / BAJA ──
async function addNew() {
    const puesto = document.getElementById('n-puesto').value.trim();
    if (!puesto) { toast('Ingresá el puesto', true); return; }
    const nivel = document.getElementById('n-nivel').value.trim() || 'Otros';
    const row = {
        numero: nextNro(), puesto,
        selector:  document.getElementById('n-selector').value,
        depto:     document.getElementById('n-depto').value || 'Sin definir',
        tipo:      document.getElementById('n-tipo').value,
        motivo:    document.getElementById('n-motivo').value,
        nivel,
        sueldo:    parseFloat(document.getElementById('n-sueldo').value) || 0,
        jornada:   document.getElementById('n-jornada').value,
        ubicacion: document.getElementById('n-ubicacion').value,
        inicio:    document.getElementById('n-inicio').value || today(),
        status: 'Proceso', ingreso: null, ingreso_nombre: ''
    };
    const { data, error } = await sb.from('busquedas').insert(row).select().single();
    if (error) { toast('Error al crear búsqueda', true); return; }
    await sb.from('historial').insert({ busqueda_id: data.id, texto: 'Apertura de vacante', fecha: new Date().toISOString() });
    closeModal('modal-nueva'); await loadData(); renderTable(); toast('Búsqueda creada ✓');
}

async function reabrir(id) {
    const orig = busquedas.find(x => x.id === id);
    if (!orig) { toast('No se encontró la búsqueda', true); return; }
    if (!confirm('¿Reabrir búsqueda "' + orig.puesto + '"? Se creará una nueva entrada en Proceso.')) return;
    const nuevaRow = {
        numero: nextNro(), puesto: orig.puesto, selector: orig.selector,
        depto: orig.depto, tipo: orig.tipo, motivo: orig.motivo, nivel: orig.nivel,
        sueldo: orig.sueldo, jornada: orig.jornada, ubicacion: orig.ubicacion,
        inicio: today(), status: 'Proceso', ingreso: null, ingreso_nombre: ''
    };
    const { data: nueva, error: errInsert } = await sb.from('busquedas').insert(nuevaRow).select().single();
    if (errInsert) { toast('Error al reabrir: ' + (errInsert.message || 'verificar permisos'), true); return; }
    const textoOrigen = `Reapertura de ${orig.numero} — "${orig.puesto}". Anterior ingresado: ${orig.ingreso_nombre || 'N/D'} (${orig.ingreso || 'sin fecha'})`;
    await sb.from('estado_log').insert({ busqueda_id: nueva.id, texto: textoOrigen, fecha: today() });
    try {
        const histEntries = [{ busqueda_id: nueva.id, texto: textoOrigen, fecha: new Date().toISOString() }];
        if (orig.historial && orig.historial.length > 0) {
            orig.historial.forEach(h => histEntries.push({ busqueda_id: nueva.id, texto: '[Historial copiado] ' + h.texto, fecha: new Date().toISOString() }));
        }
        await sb.from('historial').insert(histEntries);
    } catch (e) { console.warn('No se pudo copiar historial:', e); }
    let fechaBaja = prompt('Fecha de baja del que ingresó (AAAA-MM-DD). Dejá vacío si seguía hasta hoy:', today());
    const updOrig = { status: 'Cerrada' };
    if (fechaBaja && /^\d{4}-\d{2}-\d{2}$/.test(fechaBaja.trim())) updOrig.fecha_baja = fechaBaja.trim();
    await sb.from('busquedas').update(updOrig).eq('id', id);
    await loadData(); renderTable();
    toast('Búsqueda reabierta como ' + nueva.numero + ' ✓');
}

async function eliminar(id) {
    if (!isAdmin()) { toast('Solo un administrador puede eliminar búsquedas', true); return; }
    if (!confirm('¿Eliminar esta búsqueda? Esta acción no se puede deshacer.')) return;
    await sb.from('busquedas').delete().eq('id', id);
    await loadData(); renderTable(); toast('Búsqueda eliminada');
}

// ── PDFs ──
async function subirPDF(busquedaId, input) {
    const file = input.files[0];
    if (!file) return;
    toast('Subiendo archivo...');
    const path = `${busquedaId}/${Date.now()}_${file.name}`;
    const { error: upErr } = await sb.storage.from('Busquedas-pdfs').upload(path, file);
    if (upErr) { toast('Error al subir: ' + upErr.message, true); return; }
    const { data: { session } } = await sb.auth.getSession();
    await sb.from('archivos').insert({ busqueda_id: busquedaId, nombre: file.name, url: path, subido_por: session.user.id });
    await loadData(); renderTable(); toast('PDF subido ✓');
    input.value = '';
}
async function abrirPDF(storagePath) {
    const { data, error } = await sb.storage.from('Busquedas-pdfs').createSignedUrl(storagePath, 3600);
    if (error || !data) { toast('No se pudo abrir el archivo', true); return; }
    window.open(data.signedUrl, '_blank');
}
async function eliminarPDF(archivoId, storagePath) {
    if (!confirm('¿Eliminar este archivo? Esta acción no se puede deshacer.')) return;
    await sb.storage.from('Busquedas-pdfs').remove([storagePath]);
    await sb.from('archivos').delete().eq('id', archivoId);
    await loadData(); renderTable(); toast('Archivo eliminado');
}
