// ══════════════════════════════════════════════
//  LANDING + NAVEGACIÓN
// ══════════════════════════════════════════════
let vistaActual = 'pipeline';

function showHome() {
    mostrarPantalla('landing-screen');
    vistaAislada = false;
    selectorFiltroActivo = '';
    renderLanding();
}

function renderLanding() {
    const hora = new Date().getHours();
    const saludo = hora < 12 ? 'Buenos días' : hora < 20 ? 'Buenas tardes' : 'Buenas noches';
    document.getElementById('landing-saludo').textContent = `${saludo}, ${currentProfile?.nombre || ''} — acceso rápido a las vacantes, la base de postulantes y los números del equipo.`;
    document.getElementById('landing-btn-stats').classList.toggle('hidden', !isAdmin());
    const sels = equipo.filter(e => e.activo && e.es_selector);
    document.getElementById('landing-team-grid').innerHTML = sels.length ? sels.map(e => {
        const color = colorDe(e.nombre);
        const abiertas = busquedas.filter(b => b.selector === e.nombre && b.status === 'Proceso').length;
        return `<div class="landing-team-card" style="border-top-color:${color}">
            <div class="landing-team-avatar clickable" style="background:${color}" data-sel="${esc(e.nombre)}" onclick="goToApp(this.dataset.sel)" title="Ver las búsquedas de ${esc(e.nombre)}">${esc(iniciales(e.nombre_completo || e.nombre))}</div>
            <div class="landing-team-name">${esc(e.nombre_completo || e.nombre)}</div>
            <div class="landing-team-role">Selector${e.rol === 'admin' ? ' · Admin' : ''}</div>
            <div class="landing-team-tag" style="color:${color}">${abiertas} en proceso</div>
        </div>`;
    }).join('') : `<span class="tip">Todavía no hay selectores cargados. ${isAdmin() ? 'Agregalos desde el botón "Equipo".' : 'Pedile a un administrador que los cargue.'}</span>`;
}

// Con un nombre (clic en la tarjeta del selector) entra "aislado": solo lo de esa persona.
function goToApp(selector, vista = 'pipeline') {
    mostrarPantalla('app');
    if (selector) {
        vistaAislada = true;
        selectorFiltroActivo = selector;
    }
    aplicarVisibilidad();
    showView(vista);
}

function salirVistaAislada() { showHome(); }

// Datos de la barra superior, menús según el rol y opciones de los formularios.
function prepararApp() {
    const esAdmin = isAdmin();
    document.getElementById('topnav-nombre').textContent = (esAdmin ? '🔑 ' : '👤 ') + (currentProfile?.nombre || '');
    document.getElementById('topnav-rol').textContent = esAdmin ? 'admin' : 'selector';
    document.getElementById('btn-equipo').classList.toggle('hidden', !esAdmin);

    const fill = (id, lista, vacio = null) => { const el = document.getElementById(id); if (el) el.innerHTML = optionsHtml(lista, null, vacio); };
    fill('n-marca', MARCAS);
    fill('n-zona', ZONAS, '— Zona —');
    fill('n-motivo', MOTIVOS);
    fill('n-nivel', NIVELES);
    fill('f-marca', MARCAS, 'Todas las marcas');
    fill('f-zona', ZONAS, 'Todas las zonas');
    fill('f-status', ESTADOS_BUSQUEDA, 'Todos los estados');
    fill('f-motivo', MOTIVOS, 'Todos los motivos');
    fill('fb-zona', ZONAS, 'Todas las zonas');
    fill('fb-estado', ESTADOS_POSTULANTE, 'Todos los estados');
    fill('fb-horario', HORARIOS, 'Cualquier horario');
    fill('p-zona', ZONAS, '— Zona —');
    fill('p-estado', ESTADOS_POSTULANTE);
    fill('p-horario', HORARIOS, '— Horario —');
    fill('p-curso-manipulacion', DOC_OPCIONES, '— Sin dato —');
    fill('p-antecedentes', DOC_OPCIONES, '— Sin dato —');
    renderSelectorChips();
}

function aplicarVisibilidad() {
    const esAdmin = isAdmin();
    document.getElementById('selector-chips').classList.toggle('hidden', vistaAislada);
    document.getElementById('salir-vista-aislada').classList.toggle('hidden', !vistaAislada);
    ['nav-stats', 'nav-charts'].forEach(id => document.getElementById(id).classList.toggle('hidden', !esAdmin || vistaAislada));
    document.getElementById('nav-informe').classList.toggle('hidden', vistaAislada);
}

const TITULOS = {
    pipeline: ['Pipeline de Selección', 'Vacantes por local: candidatos, envío al zonal, onboarding e ingreso'],
    base:     ['Base de Postulantes', 'Postulantes aprobados en entrevista, listos para colocar en una vacante'],
    stats:    ['Estadísticas', 'Cumplimiento por marca, zona, regional y selector'],
    charts:   ['Gráficos', 'Visualizaciones del pipeline'],
    informe:  ['Informe', 'Alertas del día y exportación a CSV']
};

function showView(v, btn = null) {
    if ((v === 'stats' || v === 'charts') && (!isAdmin() || vistaAislada)) {
        toast('Acceso restringido a administradores', true);
        v = 'pipeline';
    }
    vistaActual = v;
    ['pipeline', 'base', 'stats', 'charts', 'informe'].forEach(id => document.getElementById('view-' + id).classList.toggle('hidden', id !== v));
    document.querySelectorAll('.inline-nav-btn[id^="nav-"]').forEach(b => b.classList.toggle('active', b.id === 'nav-' + v));
    document.getElementById('filters-pipeline').classList.toggle('hidden', v !== 'pipeline');
    document.getElementById('filters-base').classList.toggle('hidden', v !== 'base');
    document.getElementById('selector-chips').classList.toggle('hidden', vistaAislada || v !== 'pipeline');
    document.getElementById('main-title').textContent = TITULOS[v][0] + (vistaAislada && selectorFiltroActivo && v === 'pipeline' ? ' · ' + selectorFiltroActivo : '');
    document.getElementById('main-sub').textContent = TITULOS[v][1];
    window.scrollTo({ top: 0, behavior: 'smooth' });
    resetPaginado();
    if (typeof destroyCharts === 'function') destroyCharts();
    refreshView();
}

function refreshView() {
    actualizarDatalists();
    if (vistaActual === 'pipeline') { filteredIds = computeFilteredIds(); renderTable(); }
    else if (vistaActual === 'base') renderBase();
    else if (vistaActual === 'stats') renderStats(statsTab);
    else if (vistaActual === 'charts') renderCharts(chartsTab);
    else if (vistaActual === 'informe') renderInforme();
}

// Valores ya cargados como sugerencias de los campos de texto (local, regional, zonal…)
function actualizarDatalists() {
    const set = (id, lista) => { const el = document.getElementById(id); if (el) el.innerHTML = lista.map(v => `<option value="${esc(v)}">`).join(''); };
    set('dl-local', valoresUsados('local'));
    set('dl-local-ent', valoresUsados('local_entrenamiento'));
    set('dl-regional', valoresUsados('regional'));
    set('dl-zonal', valoresUsados('zonal'));
    set('dl-puesto', valoresUsados('puesto', PUESTOS_SUGERIDOS));
    set('dl-jornada', valoresUsados('jornada', JORNADAS_SUGERIDAS));
    set('dl-sede', [...new Set([...SEDES_ENTREVISTA, ...postulantes.map(p => p.sede_entrevista).filter(Boolean)])]);
    set('dl-localidad', [...new Set(postulantes.map(p => p.localidad).filter(Boolean))].sort((a, b) => a.localeCompare(b)));
    set('dl-puesto-interes', [...new Set([...PUESTOS_SUGERIDOS, ...postulantes.map(p => p.puesto_interes).filter(Boolean)])]);
}

// ══════════════════════════════════════════════
//  CHIPS DE SELECTOR — filtro de un clic
// ══════════════════════════════════════════════
function renderSelectorChips() {
    const box = document.getElementById('selector-chips');
    box.innerHTML = ['', ...selectores()].map(s => {
        const activo = s === selectorFiltroActivo;
        const color = s ? colorDe(s) : null;
        const style = color
            ? ` style="${activo ? `background:${color};border-color:${color};color:#fff;` : `background:${color}1a;border-color:${color}66;color:${color};`}"`
            : '';
        return `<button class="selector-chip${activo ? ' active' : ''}"${style} data-sel="${esc(s)}" onclick="filtrarPorSelector(this.dataset.sel)">${esc(s || 'Todos')}</button>`;
    }).join('');
}
function filtrarPorSelector(nombre) {
    if (vistaAislada) return;
    selectorFiltroActivo = nombre;
    renderSelectorChips();
    applyFilters();
}

// ══════════════════════════════════════════════
//  TRAMOS DE DEMORA (días hábiles)
//  T1 · Selección : apertura → enviado al zonal
//  T2 · Zonal     : enviado al zonal → aprobación del zonal (o ingreso si no se cargó)
//  T3 · Inicio    : aprobación del zonal → ingreso (primer día)
// ══════════════════════════════════════════════
function tramosDemora(b) {
    let t1, t1Run = false, t1To = null;
    let t2 = 0, t2Run = false, t2NA = false, t2To = null;
    let t3 = 0, t3Run = false, t3NA = false, t3To = null;
    if (b.enviado_zonal)      { t1 = daysDiff(b.inicio, b.enviado_zonal); t1To = b.enviado_zonal; }
    else if (b.ingreso)       { t1 = daysDiff(b.inicio, b.ingreso); t1To = b.ingreso; }
    else                      { t1 = daysDiff(b.inicio); t1Run = true; }
    if (b.enviado_zonal) {
        if (b.decision_zonal) { t2 = daysDiff(b.enviado_zonal, b.decision_zonal); t2To = b.decision_zonal; }
        else if (b.ingreso)   { t2 = daysDiff(b.enviado_zonal, b.ingreso); t2To = b.ingreso; }
        else                  { t2 = daysDiff(b.enviado_zonal); t2Run = true; }
    } else t2NA = true;
    if (b.decision_zonal) {
        if (b.ingreso) { t3 = daysDiff(b.decision_zonal, b.ingreso); t3To = b.ingreso; }
        else           { t3 = daysDiff(b.decision_zonal); t3Run = true; }
    } else t3NA = true;
    return { t1, t1Run, t1To, t2, t2Run, t2NA, t2To, t3, t3Run, t3NA, t3To, total: t1 + t2 + t3 };
}

function fmtRango(from, to, running) {
    if (!from) return '';
    if (running) return `${fmtFechaCorta(from)} → hoy`;
    return to ? `${fmtFechaCorta(from)} → ${fmtFechaCorta(to)}` : fmtFechaCorta(from);
}

function descuentoJustificadoTotal(b) {
    return b.candidatos.reduce((a, c) => a + (c.demora_descuento_dias || 0), 0);
}

function renderDemoraBreakdown(b) {
    const t = tramosDemora(b);
    const live = run => run ? `<i class="fas fa-circle dm-live"></i>` : '';
    const descuento = descuentoJustificadoTotal(b);
    const t2Aprox = !b.decision_zonal && b.enviado_zonal && b.ingreso;
    const fila = (ico, color, val, run, lbl, rango, title) => `
        <div class="dm-row" title="${esc(title)}">
            <span class="dm-ico" style="color:${color}"><i class="fas fa-${ico}"></i></span>
            <div class="dm-body">
                <span class="dm-val">${val}<span class="dm-u">hd</span>${live(run)}</span>
                <span class="dm-lbl">${lbl}</span>
                ${rango ? `<span class="dm-rango">${esc(rango)}</span>` : ''}
            </div>
        </div>`;
    return `
    <div class="demora-bd">
        ${fila('paper-plane', 'var(--blue)', t.t1, t.t1Run, 'Envío al zonal', fmtRango(b.inicio, t.t1To, t.t1Run), 'Días hábiles desde la apertura hasta enviar el primer candidato al zonal')}
        ${fila('store', 'var(--orange)', t.t2NA ? '—' : t.t2, t.t2Run, 'Decisión del zonal' + (t2Aprox ? ' (aprox.)' : ''),
            t.t2NA ? 'Sin enviar al zonal todavía' : fmtRango(b.enviado_zonal, t.t2To, t.t2Run), 'Días hábiles que tardó el zonal en aprobar un candidato')}
        ${fila('hourglass-half', 'var(--green)', t.t3NA ? '—' : t.t3, t.t3Run, 'Espera de inicio',
            t.t3NA ? 'Sin aprobación del zonal todavía' : fmtRango(b.decision_zonal, t.t3To, t.t3Run), 'Días hábiles entre la aprobación del zonal y el primer día')}
        <div class="dm-row dm-total" title="Demora total del proceso (días hábiles)">
            <span class="dm-ico"><i class="fas fa-equals"></i></span>
            <div class="dm-body">
                <span class="dm-val">${t.total}<span class="dm-u">hd</span></span>
                <span class="dm-lbl">Total proceso</span>
                <span class="dm-rango">${esc(fmtRango(b.inicio, b.ingreso, !b.ingreso))}</span>
            </div>
        </div>
        ${descuento > 0 ? `
        <div class="dm-row dm-ajustado" title="Total menos los días justificados (motivos ajenos al equipo)">
            <span class="dm-ico" style="color:var(--green)"><i class="fas fa-check-double"></i></span>
            <div class="dm-body">
                <span class="dm-val">${Math.max(0, t.total - descuento)}<span class="dm-u">hd</span></span>
                <span class="dm-lbl">Total ajustado</span>
                <span class="dm-rango">${t.total}hd − ${descuento}hd justificados</span>
            </div>
        </div>` : ''}
    </div>`;
}

// Vacante en Proceso con un candidato "Enviado al zonal" hace 3+ días hábiles sin respuesta.
function alertaZonalVencida(b) {
    if (b.status !== 'Proceso') return false;
    return b.candidatos.some(c => c.estado === 'Enviado' && c.fecha_envio
        && Math.max(0, daysDiff(c.fecha_envio) - (c.demora_descuento_dias || 0)) >= ALERTA_ZONAL_LIMITE_HD);
}
function fueraDePlazo(b) { return b.status === 'Proceso' && daysDiff(b.inicio) > (DEMORA_LIMITE[b.nivel] || 15); }
function isLockedBusqueda(b) { return (b.status === 'Cerrada' || b.status === 'Finalizada' || b.status === 'Cancelada') && !isAdmin(); }
function cubierta(b) { return b.status === 'Cerrada' || b.status === 'Finalizada'; }
function vacanteAbierta(b) { return b.status === 'Proceso' || b.status === 'Pausada'; }

// ══════════════════════════════════════════════
//  PIPELINE (tabla de vacantes)
// ══════════════════════════════════════════════
const PIPELINE_PAGINA = 25;
const BASE_PAGINA     = 50;
let pipelineVisibles = PIPELINE_PAGINA;
let baseVisibles     = BASE_PAGINA;
function resetPaginado() { pipelineVisibles = PIPELINE_PAGINA; baseVisibles = BASE_PAGINA; }
function mostrarMas(cual, todas) {
    if (cual === 'base') baseVisibles = todas ? Infinity : baseVisibles + BASE_PAGINA;
    else pipelineVisibles = todas ? Infinity : pipelineVisibles + PIPELINE_PAGINA;
    refreshView();
}
function mostrarMasHtml(cual, visibles, total) {
    if (visibles >= total) return '';
    const paso = cual === 'base' ? BASE_PAGINA : PIPELINE_PAGINA;
    return `<div class="mostrar-mas">Mostrando ${visibles} de ${total}
        <button class="btn-sm" onclick="mostrarMas('${cual}')">Mostrar ${Math.min(paso, total - visibles)} más</button>
        <button class="btn-sm" onclick="mostrarMas('${cual}', true)">Mostrar todas</button></div>`;
}

function renderTable() {
    const body = document.getElementById('table-body');
    const list = busquedas.filter(b => filteredIds.has(b.id));
    const visibles = list.slice(0, pipelineVisibles);
    body.innerHTML = visibles.length
        ? visibles.map(renderRow).join('')
        : `<tr><td colspan="7"><span class="tip">${busquedas.length ? 'No hay búsquedas para estos filtros.' : 'Todavía no hay búsquedas cargadas. Usá "Nueva Búsqueda".'}</span></td></tr>`;
    const mas = mostrarMasHtml('pipeline', visibles.length, list.length);
    if (mas) body.insertAdjacentHTML('beforeend', `<tr><td colspan="7">${mas}</td></tr>`);
    renderKPIs();
    actualizarFiltroRegional();
}

// Redibuja solo la fila de una búsqueda (no toda la tabla) después de editarla.
function refreshBusqueda(id) {
    if (vistaActual !== 'pipeline') { refreshView(); return; }
    filteredIds = computeFilteredIds();
    const row = document.getElementById('row-' + id);
    const b = busquedas.find(x => x.id === id);
    if (!row || !b || !filteredIds.has(id)) { renderTable(); return; }
    const tpl = document.createElement('template');
    tpl.innerHTML = renderRow(b).trim();
    // Al sacar la fila, el input que tenía el foco dispara blur/change y puede volver a
    // redibujar esta misma fila en el medio: si pasa, se redibuja la tabla entera.
    try { row.replaceWith(tpl.content.firstElementChild); }
    catch (e) { renderTable(); return; }
    renderKPIs();
}

function renderRow(b) {
    const isLocked = isLockedBusqueda(b);
    const inp = (field, val, extra = '', style = '') => isLocked
        ? `<strong style="${style}">${esc(val || '—')}</strong>`
        : `<input class="inline-input" value="${esc(val)}" ${extra} onchange="updateField(${b.id},'${field}',this.value)" style="${style}">`;
    const sel = (field, lista, val, vacio = null) => isLocked
        ? `<strong>${esc(val || '—')}</strong>`
        : `<select class="inline-select" onchange="updateField(${b.id},'${field}',this.value)">${optionsHtml(lista, val, vacio)}</select>`;
    const fechaInp = (field, val, title = '') => isLocked
        ? `<strong>${val ? fmtFecha(val) : '—'}</strong>`
        : `<input type="date" class="inline-input" value="${val || ''}" onchange="updateField(${b.id},'${field}',this.value)" style="font-size:11px;width:auto" title="${esc(title)}">`;

    const t = tramosDemora(b);
    const limite = DEMORA_LIMITE[b.nivel] || 15;
    const listaSel = selectores().includes(b.selector) || !b.selector ? selectores() : [...selectores(), b.selector];

    // COMENTARIOS ("Estado de búsqueda")
    const cantComentarios = b.comentarios.length;
    const comentariosHtml = b.comentarios.map((e, idx) => `
        <div class="estado-entry">
            <span class="d-badge">D${idx + 1}</span>
            <div class="estado-entry-body">
                <div class="estado-entry-text">${esc(e.texto)}</div>
                <div class="estado-entry-meta">
                    <i class="fas fa-clock" style="font-size:9px"></i>
                    ${daysDiff(e.fecha) === 0 ? 'Hoy' : 'hace ' + daysDiff(e.fecha) + 'hd'} · ${fmtFecha(e.fecha)}${e.autor ? ' · ' + esc(e.autor.split('@')[0]) : ''}
                    ${isAdmin() ? `<button onclick="removeEstadoEntry(${b.id},${e.id})" class="btn-x" title="Solo admin">✕</button>` : ''}
                </div>
            </div>
        </div>`).join('');

    // PERMANENCIA
    let permHtml = '';
    if (b.ingreso) {
        const dias = daysDiff(b.ingreso, b.fecha_baja || null);
        const milestone = dias >= 130 ? '🏆 6 meses' : dias >= 65 ? '✓ 3 meses' : dias >= 22 ? '📌 1 mes' : '';
        permHtml = `<div class="perm-box">
            <div class="perm-box-num">${dias}</div>
            <div class="perm-box-lbl">${b.fecha_baja ? 'Días háb. hasta la baja' : 'Días háb. trabajando'}</div>
            ${milestone ? `<div class="perm-box-milestone">${milestone}</div>` : ''}
        </div>`;
    }

    const activos = b.candidatos.filter(c => CAND_ACTIVOS.includes(c.estado)).length;

    return `
    <tr id="row-${b.id}" class="${isLocked ? 'row-locked' : ''} ${b.reopened_from ? 'row-reabierta' : ''}">
        <td>
            <div class="numero">${esc(b.numero)}</div>
            ${isLocked ? `<span class="motivo-chip ${motivoClass(b.motivo)}">${esc(b.motivo)}</span>`
                : `<select class="inline-select motivo-chip ${motivoClass(b.motivo)}" onchange="updateField(${b.id},'motivo',this.value)">${optionsHtml(MOTIVOS, b.motivo)}</select>`}
            <div style="margin-top:5px;display:flex;align-items:center;gap:5px;flex-wrap:wrap">
                <span class="tag ${tagClass(b.status)}">${esc(b.status)}</span>
                ${b.status === 'Proceso' ? `<span class="demora-badge ${demoraClass(daysDiff(b.inicio), b.nivel)}" title="Días hábiles abierta · límite ${limite}hd">${daysDiff(b.inicio)}hd</span>` : ''}
                ${b.reopened_from ? `<span class="tag tag-reabierta" title="Reemplaza a ${esc(b.reopened_from)}"><i class="fas fa-redo" style="font-size:9px"></i> Reabierta</span>` : ''}
            </div>
            <div class="mini-campo"><span>Apertura:</span>${fechaInp('inicio', b.inicio)}</div>
            <div class="mini-campo"><span>Enviado al zonal:</span>${fechaInp('enviado_zonal', b.enviado_zonal, 'Se completa solo con el primer candidato enviado; frena el tramo de Selección')}</div>
            <div class="mini-campo"><span>Decisión del zonal:</span>${fechaInp('decision_zonal', b.decision_zonal, 'Se completa sola con el primer candidato aprobado; frena el tramo del Zonal')}</div>
            ${b.reopened_from ? `<div class="reab-de"><i class="fas fa-redo" style="font-size:8px"></i> Reapertura de ${esc(b.reopened_from)}</div>` : ''}
        </td>
        <td>
            ${inp('local', b.local, 'list="dl-local" placeholder="Local"', 'font-weight:700;font-size:13px')}
            <div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap;align-items:center">
                ${sel('marca', MARCAS, b.marca)}
                ${sel('zona', ZONAS, b.zona, '— Zona —')}
            </div>
            <div class="mini-campo"><span>Entrenamiento:</span>${inp('local_entrenamiento', b.local_entrenamiento, 'list="dl-local-ent" placeholder="Local de entrenamiento"')}</div>
            <div class="mini-campo"><span>Regional:</span>${inp('regional', b.regional, 'list="dl-regional" placeholder="Regional"')}</div>
            <div class="mini-campo"><span>Zonal:</span>${inp('zonal', b.zonal, 'list="dl-zonal" placeholder="Zonal"')}</div>
            <div class="mini-campo"><span>Selector:</span>${sel('selector', listaSel, b.selector, '— Sin asignar —')}</div>
        </td>
        <td>
            ${inp('puesto', b.puesto, 'list="dl-puesto" placeholder="Puesto"', 'font-weight:700;font-size:13px')}
            <div class="mini-campo"><span>Jornada:</span>${inp('jornada', b.jornada, 'list="dl-jornada" placeholder="Jornada / turno"')}</div>
            <div class="mini-campo"><span>Nivel:</span>${sel('nivel', NIVELES, b.nivel)}</div>
            <div class="mini-campo"><span>Notas de la solicitud:</span>${isLocked ? `<span style="font-size:12px">${esc(b.notas || '—')}</span>`
                : `<textarea class="inline-input" rows="2" placeholder="Ej: perfil con experiencia, entrevista con gerente…" onchange="updateField(${b.id},'notas',this.value)">${esc(b.notas)}</textarea>`}</div>
        </td>
        <td>
            ${cantComentarios > 0 ? `
            <button class="estado-toggle" onclick="toggleComentarios(${b.id})">
                <i class="fas fa-chevron-right" id="est-icon-${b.id}" style="font-size:8px;transition:transform .2s"></i>
                ${cantComentarios} comentario${cantComentarios !== 1 ? 's' : ''}
            </button>
            <div class="estado-log cell-scroll" id="est-log-${b.id}" style="max-height:150px;display:none;margin-top:5px">${comentariosHtml}</div>`
            : `<span class="tip">Sin comentarios aún</span>`}
            ${!isLocked ? `
            <div class="estado-add-row">
                <input class="estado-add-input" id="estado-input-${b.id}" placeholder="Agregar comentario…" onkeydown="if(event.key==='Enter')addEstadoEntry(${b.id})">
                <button class="estado-add-btn" onclick="addEstadoEntry(${b.id})"><i class="fas fa-plus" style="font-size:10px"></i></button>
            </div>` : ''}
        </td>
        <td>
            <div class="cand-count" style="margin-bottom:5px">Total: <strong>${b.candidatos.length}</strong>${activos ? ` · ${activos} en curso` : ''}</div>
            <div class="cell-scroll" style="max-height:320px">${b.candidatos.length ? b.candidatos.map(c => renderCandItem(c, b, isLocked)).join('') : '<span class="tip">Sin candidatos todavía</span>'}</div>
            ${!isLocked ? `
            <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px">
                <button class="btn-sm" onclick="openColocarModal(${b.id})"><i class="fas fa-database" style="font-size:9px"></i> Colocar de la base</button>
                <button class="btn-sm" onclick="openPostulanteModal(null, ${b.id})"><i class="fas fa-user-plus" style="font-size:9px"></i> Nuevo</button>
            </div>` : ''}
        </td>
        <td>
            <div class="section-hdr">Candidato que ingresó</div>
            ${isLocked
                ? `<div style="font-weight:700;color:var(--green)">${esc(b.ingreso_nombre || '—')}</div><div style="font-size:11px;color:var(--muted)">${b.ingreso ? fmtFecha(b.ingreso) : ''}</div>`
                : `<input class="inline-input" value="${esc(b.ingreso_nombre)}" placeholder="Se completa al marcar 'Ingresó'" onchange="updateField(${b.id},'ingreso_nombre',this.value)" style="font-weight:700;color:var(--green)">
                <div class="mini-campo"><span>Fecha de ingreso</span><input type="date" class="inline-input" value="${b.ingreso || ''}" onchange="updateField(${b.id},'ingreso',this.value)"></div>
                <div class="mini-campo"><span>Fecha de baja <i>(si dejó la empresa)</i></span><input type="date" class="inline-input" value="${b.fecha_baja || ''}" onchange="updateField(${b.id},'fecha_baja',this.value)"></div>`}
            ${permHtml}
        </td>
        <td>
            ${renderDemoraBreakdown(b)}
            <div class="sep" style="margin:8px 0"></div>
            <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">
                ${isLocked ? `<span class="tag ${tagClass(b.status)}">${esc(b.status)}</span>`
                    : `<select class="inline-select" onchange="updateField(${b.id},'status',this.value)">${optionsHtml(ESTADOS_BUSQUEDA, b.status)}</select>`}
                ${cubierta(b) ? `<button class="btn-sm" onclick="reabrir(${b.id})"><i class="fas fa-redo" style="font-size:8px"></i> Reabrir</button>` : ''}
                ${isAdmin() ? `<button class="btn-sm btn-danger" onclick="eliminar(${b.id})" title="Eliminar búsqueda"><i class="fas fa-trash" style="font-size:9px"></i></button>` : ''}
            </div>
        </td>
    </tr>`;
}

function docBadges(p) {
    const b = (lbl, v) => `<span class="doc-badge ${docClass(v)}" title="${lbl}: ${esc(v || 'sin dato')}">${lbl} ${v === 'Sí' ? '✓' : v === 'En trámite' ? '…' : '✗'}</span>`;
    return b('Manip.', p.curso_manipulacion) + b('Antec.', p.antecedentes);
}

// Un postulante dentro de la vacante: estado del circuito + las fechas que van con ese estado.
function renderCandItem(c, b, isLocked) {
    const p = postulantesById.get(c.postulante_id);
    const wa = waLink(p?.telefono);
    const e = c.estado;
    const fecha = (lbl, field, val) => isLocked
        ? (val ? `<div class="cand-fecha-row"><span class="cand-fecha-lbl">${lbl}</span><span style="font-size:11px">${fmtFecha(val)}</span></div>` : '')
        : `<div class="cand-fecha-row"><span class="cand-fecha-lbl">${lbl}</span><input type="date" class="inline-input" style="font-size:11px" value="${val || ''}" onchange="updateCandField(${c.id},'${field}',this.value)"></div>`;
    const texto = (lbl, field, val, ph) => isLocked
        ? (val ? `<div class="cand-fecha-row"><span class="cand-fecha-lbl">${lbl}</span><span style="font-size:11px">${esc(val)}</span></div>` : '')
        : `<div class="cand-fecha-row"><span class="cand-fecha-lbl">${lbl}</span><input class="inline-input" style="font-size:11px" value="${esc(val)}" placeholder="${ph}" onchange="updateCandField(${c.id},'${field}',this.value)"></div>`;

    let fechas = '';
    if (e === 'Asignado') fechas += fecha('Asignado', 'fecha_asignacion', c.fecha_asignacion);
    if (['Enviado', 'Aprobado', 'Rechazado'].includes(e)) fechas += fecha('Enviado al zonal', 'fecha_envio', c.fecha_envio);
    if (e === 'Aprobado') fechas += fecha('Aprobado por el zonal', 'fecha_decision', c.fecha_decision);
    if (e === 'Rechazado') fechas += fecha('Rechazado', 'fecha_decision', c.fecha_decision) + texto('Motivo', 'motivo', c.motivo, 'Motivo del rechazo');
    if (['Citado ONB', 'Confirmó ONB', 'Ingresó'].includes(e)) fechas += fecha('Onboarding', 'fecha_onb', c.fecha_onb) + texto('Hora ONB', 'hora_onb', c.hora_onb, 'Ej: 9:30');
    if (e === 'Ingresó') fechas += fecha('Primer día', 'fecha_ingreso', c.fecha_ingreso);
    if (e === 'No se presentó' || e === 'Desistió') fechas += fecha(e, 'fecha_salida', c.fecha_salida) + texto('Motivo', 'motivo', c.motivo, 'Motivo');

    // Línea de tiempo: espera del zonal (con alerta de 72hs) o resultado
    let tl = '';
    if (e === 'Enviado' && c.fecha_envio && vacanteAbierta(b)) { // en una vacante ya cerrada no corre la espera
        const descuento = c.demora_descuento_dias || 0;
        const d = Math.max(0, daysDiff(c.fecha_envio) - descuento);
        const vencido = d >= ALERTA_ZONAL_LIMITE_HD;
        tl = `<div class="cand-timeline">
            <span class="cand-tl-dot cand-tl-dot-blue"></span><div class="cand-tl-line"></div>
            <span class="cand-tl-badge ${vencido ? 'cand-tl-badge-alerta' : 'cand-tl-badge-wait'}">${vencido ? '⚠' : '⏳'} ${d === 0 ? 'Hoy' : d + 'hd esperando al zonal'}${descuento ? ` <span class="cand-tl-desc">(-${descuento}hd)</span>` : ''}</span>
            <div class="cand-tl-line"></div><span class="cand-tl-dot cand-tl-dot-green" style="opacity:.3"></span>
        </div>
        ${!isLocked ? `
        <details class="cand-justificar">
            <summary><i class="fas fa-comment-medical" style="font-size:9px"></i> ${descuento ? `Demora justificada: -${descuento}hd` : 'Justificar demora (días que no dependen del equipo)'}</summary>
            <div style="display:flex;gap:4px;align-items:center;margin-top:5px">
                <input type="number" min="0" class="inline-input inline-input-box" style="width:50px" id="justif-dias-${c.id}" value="${descuento}">
                <span style="font-size:10px;color:var(--muted)">hd a descontar</span>
            </div>
            <input class="inline-input inline-input-box" style="margin-top:4px" id="justif-motivo-${c.id}" placeholder="Motivo (ej: feriado del local)" value="${esc(c.demora_descuento_motivo)}">
            <button class="btn-sm" style="margin-top:5px" onclick="guardarJustificacion(${c.id})">Guardar</button>
        </details>` : ''}`;
    } else if ((e === 'Aprobado' || e === 'Rechazado') && c.fecha_envio && c.fecha_decision) {
        const d = daysDiff(c.fecha_envio, c.fecha_decision);
        const ok = e === 'Aprobado';
        tl = `<div class="cand-timeline">
            <span class="cand-tl-dot cand-tl-dot-blue"></span><div class="cand-tl-line"></div>
            <span class="cand-tl-badge ${ok ? 'cand-tl-badge-done' : 'cand-tl-badge-rejected'}">${ok ? '✓' : '✗'} ${d === 0 ? 'mismo día' : d + 'hd hasta ' + (ok ? 'aprobación' : 'rechazo')}</span>
            <div class="cand-tl-line"></div><span class="cand-tl-dot ${ok ? 'cand-tl-dot-green' : 'cand-tl-dot-red'}"></span>
        </div>`;
    } else if ((e === 'Citado ONB' || e === 'Confirmó ONB') && c.fecha_onb) {
        const hoy = today();
        const txt = c.fecha_onb === hoy ? 'ONB hoy' : c.fecha_onb > hoy ? `ONB en ${daysDiff(hoy, c.fecha_onb)}hd` : 'ONB ya pasó: actualizá el estado';
        tl = `<div class="cand-timeline"><span class="cand-tl-badge ${c.fecha_onb < hoy ? 'cand-tl-badge-rejected' : 'cand-tl-badge-wait'}">📅 ${txt}${c.hora_onb ? ' · ' + esc(c.hora_onb) : ''}</span></div>`;
    }

    return `<div class="cand-item ${candClass(e)}">
        <div class="cand-nombre">${esc(nombrePostulante(p))}
            ${wa ? `<a href="${wa}" target="_blank" rel="noopener" class="wa-link" title="WhatsApp ${esc(p.telefono)}"><i class="fab fa-whatsapp"></i></a>` : ''}
        </div>
        ${p ? `<div class="cand-meta">${[p.dni ? 'DNI ' + esc(p.dni) : '', esc(p.localidad || p.zona || '')].filter(Boolean).join(' · ')}</div><div style="margin-top:2px">${docBadges(p)}</div>` : ''}
        ${isLocked ? `<div style="font-size:11px;color:var(--muted);margin-top:3px">${esc(e)}</div>` : `
        <select class="inline-select" style="margin-top:4px;font-size:12px;width:100%" onchange="updateCandEstado(${c.id},this.value)">
            ${CAND_ESTADOS.map(o => `<option value="${o.v}" ${e === o.v ? 'selected' : ''}>${o.label}</option>`).join('')}
        </select>
        <button onclick="quitarCand(${c.id})" class="btn-x cand-quitar" title="Quitar de la vacante (sigue en la base)">✕</button>`}
        ${fechas}
        ${tl}
    </div>`;
}

function toggleComentarios(id) {
    const log = document.getElementById('est-log-' + id);
    const icon = document.getElementById('est-icon-' + id);
    const visible = log.style.display !== 'none';
    log.style.display = visible ? 'none' : 'flex';
    log.style.flexDirection = 'column';
    icon.style.transform = visible ? '' : 'rotate(90deg)';
}

// Los KPI respetan el selector activo pero no el resto de los filtros (se ve el total).
function renderKPIs() {
    const data = busquedas.filter(b => !selectorFiltroActivo || b.selector === selectorFiltroActivo);
    const validas = data.filter(b => b.status !== 'Cancelada');
    const cubiertas = validas.filter(cubierta).length;
    const pct = validas.length ? Math.round(cubiertas / validas.length * 100) : 0;
    const enCurso = data.filter(vacanteAbierta).reduce((a, b) => a + b.candidatos.filter(c => CAND_ACTIVOS.includes(c.estado)).length, 0);
    document.getElementById('kpi-row').innerHTML = `
        <div class="kpi"><div class="kpi-num">${validas.length}</div><div class="kpi-lbl">Vacantes</div></div>
        <div class="kpi"><div class="kpi-num" style="color:var(--blue)">${data.filter(b => b.status === 'Proceso').length}</div><div class="kpi-lbl">En proceso</div></div>
        <div class="kpi"><div class="kpi-num" style="color:var(--green)">${cubiertas}</div><div class="kpi-lbl">Cubiertas</div><div class="kpi-sub">${pct}% cumplimiento</div></div>
        <div class="kpi"><div class="kpi-num" style="color:var(--orange)">${enCurso}</div><div class="kpi-lbl">Candidatos en curso</div></div>
        <div class="kpi"><div class="kpi-num" style="color:var(--red)">${data.filter(fueraDePlazo).length}</div><div class="kpi-lbl">Fuera de plazo</div></div>
        <div class="kpi"><div class="kpi-num" style="color:var(--red)">${data.filter(alertaZonalVencida).length}</div><div class="kpi-lbl">Alertas 72hs zonal</div></div>`;
}

let _filtroTimer = null;
function applyFiltersDebounced() { clearTimeout(_filtroTimer); _filtroTimer = setTimeout(applyFilters, 200); }
function applyFilters() { resetPaginado(); refreshView(); }

function computeFilteredIds() {
    const v = id => document.getElementById(id).value;
    const marca = v('f-marca'), zona = v('f-zona'), regional = v('f-regional'), status = v('f-status'), motivo = v('f-motivo'), alerta = v('f-alerta');
    const search = v('f-search').trim().toLowerCase();
    return busquedas.filter(b => {
        if (selectorFiltroActivo && b.selector !== selectorFiltroActivo) return false;
        if (marca && b.marca !== marca) return false;
        if (zona && b.zona !== zona) return false;
        if (regional && b.regional !== regional) return false;
        if (status && b.status !== status) return false;
        if (motivo && b.motivo !== motivo) return false;
        if (alerta === '72' && !alertaZonalVencida(b)) return false;
        if (alerta === 'plazo' && !fueraDePlazo(b)) return false;
        if (search) {
            const nombres = b.candidatos.map(c => nombrePostulante(postulantesById.get(c.postulante_id))).join(' ');
            const hay = [b.numero, b.local, b.local_entrenamiento, b.puesto, b.selector, b.regional, b.zonal, nombres].join(' ').toLowerCase();
            if (!hay.includes(search)) return false;
        }
        return true;
    }).reduce((set, b) => set.add(b.id), new Set());
}

function actualizarFiltroRegional() {
    const sel = document.getElementById('f-regional');
    const cur = sel.value;
    sel.innerHTML = optionsHtml(valoresUsados('regional'), cur, 'Todos los regionales');
}

// Desde la base: ir a la vacante en el Pipeline
function verEnPipeline(numero) {
    ['f-marca', 'f-zona', 'f-regional', 'f-status', 'f-motivo', 'f-alerta'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('f-search').value = numero;
    if (!vistaAislada) { selectorFiltroActivo = ''; renderSelectorChips(); }
    showView('pipeline');
}

// ══════════════════════════════════════════════
//  BASE DE POSTULANTES
// ══════════════════════════════════════════════
function mapaCandidaturas() {
    const m = new Map();
    busquedas.forEach(b => b.candidatos.forEach(c => {
        if (!m.has(c.postulante_id)) m.set(c.postulante_id, []);
        m.get(c.postulante_id).push({ c, b });
    }));
    return m;
}
function candidaturasDe(pid) { return mapaCandidaturas().get(pid) || []; }

function disponibilidad(cands) {
    if (cands.some(x => x.c.estado === 'Ingresó')) return 'Ingresó';
    // Si la vacante ya se cerró (ingresó otro) el postulante vuelve a quedar disponible
    if (cands.some(x => CAND_ACTIVOS.includes(x.c.estado) && vacanteAbierta(x.b))) return 'En vacante';
    return 'Disponible';
}
function docCompleta(p) { return p.curso_manipulacion === 'Sí' && p.antecedentes === 'Sí'; }
function puedeColocarse(p) { return p.estado === 'Aprobado' || p.estado === 'En espera'; }
function vacantesAbiertas() { return busquedas.filter(vacanteAbierta); }

function renderBase() {
    const mapa = mapaCandidaturas();
    const v = id => document.getElementById(id).value;
    const zona = v('fb-zona'), estado = v('fb-estado'), disp = v('fb-disp'), doc = v('fb-doc'), horario = v('fb-horario');
    const search = v('fb-search').trim().toLowerCase();

    const conDisp = postulantes.map(p => ({ p, cands: mapa.get(p.id) || [] })).map(x => ({ ...x, disp: disponibilidad(x.cands) }));
    const list = conDisp.filter(({ p, disp: d }) => {
        if (zona && p.zona !== zona) return false;
        if (estado && p.estado !== estado) return false;
        if (disp && d !== disp) return false;
        if (disp === 'Disponible' && !puedeColocarse(p)) return false; // igual que el KPI: bloqueados/descartados no cuentan
        if (doc === 'completa' && !docCompleta(p)) return false;
        if (doc === 'incompleta' && docCompleta(p)) return false;
        if (horario && p.horario !== horario) return false;
        if (search) {
            const hay = [p.nombre, p.apellido, p.dni, p.telefono, p.email, p.localidad, p.puesto_interes, p.id_postulante].join(' ').toLowerCase();
            if (!hay.includes(search)) return false;
        }
        return true;
    });

    const total = conDisp.length;
    const disponibles = conDisp.filter(x => x.disp === 'Disponible' && puedeColocarse(x.p)).length;
    document.getElementById('kpi-row-base').innerHTML = `
        <div class="kpi"><div class="kpi-num">${total}</div><div class="kpi-lbl">En la base</div></div>
        <div class="kpi"><div class="kpi-num" style="color:var(--green)">${disponibles}</div><div class="kpi-lbl">Disponibles</div></div>
        <div class="kpi"><div class="kpi-num" style="color:var(--blue)">${conDisp.filter(x => x.disp === 'En vacante').length}</div><div class="kpi-lbl">En una vacante</div></div>
        <div class="kpi"><div class="kpi-num" style="color:#92400e">${conDisp.filter(x => x.disp === 'Ingresó').length}</div><div class="kpi-lbl">Ingresaron</div></div>
        <div class="kpi"><div class="kpi-num" style="color:var(--orange)">${conDisp.filter(x => !docCompleta(x.p)).length}</div><div class="kpi-lbl">Doc. incompleta</div></div>
        <div class="kpi"><div class="kpi-num" style="color:var(--red)">${conDisp.filter(x => x.p.estado === 'Bloqueado').length}</div><div class="kpi-lbl">Bloqueados</div></div>`;

    const abiertas = vacantesAbiertas();
    const visibles = list.slice(0, baseVisibles);
    const body = document.getElementById('base-body');
    body.innerHTML = visibles.length
        ? visibles.map(x => renderPostulanteRow(x.p, x.cands, x.disp, abiertas)).join('')
        : `<tr><td colspan="7"><span class="tip">${total ? 'No hay postulantes para estos filtros.' : 'La base está vacía. Usá "Nuevo postulante" para cargar a los aprobados en entrevista.'}</span></td></tr>`;
    const mas = mostrarMasHtml('base', visibles.length, list.length);
    if (mas) body.insertAdjacentHTML('beforeend', `<tr><td colspan="7">${mas}</td></tr>`);
}

function renderPostulanteRow(p, cands, disp, abiertas) {
    const wa = waLink(p.telefono);
    const ed = edad(p.fecha_nacimiento);
    const dispClass = disp === 'Disponible' ? 'tag-cerrada' : disp === 'En vacante' ? 'tag-proceso' : 'tag-finalizada';

    // Vacantes abiertas para colocarlo: primero las de su misma zona
    let colocarHtml;
    if (!puedeColocarse(p)) colocarHtml = `<span class="tip">No se puede colocar: está "${esc(p.estado)}"</span>`;
    else {
        const yaEsta = new Set(cands.map(x => x.b.id));
        const opciones = abiertas.filter(b => !yaEsta.has(b.id))
            .sort((a, b) => (b.zona === p.zona) - (a.zona === p.zona) || a.id - b.id);
        colocarHtml = opciones.length ? `
            <select class="inline-select" id="colocar-sel-${p.id}" style="width:100%">
                ${opciones.map(b => `<option value="${b.id}">${esc(b.numero)} · ${esc(b.local)} · ${esc(b.puesto)}${b.zona ? ' · ' + esc(b.zona) : ''}</option>`).join('')}
            </select>
            <button class="btn-sm" style="margin-top:4px" onclick="colocarEnVacante(${p.id}, +document.getElementById('colocar-sel-${p.id}').value)"><i class="fas fa-link" style="font-size:9px"></i> Colocar</button>`
            : `<span class="tip">No hay vacantes abiertas</span>`;
    }

    return `<tr class="${p.estado === 'Bloqueado' || p.estado === 'Descartado' ? 'row-locked' : ''}">
        <td>
            <div style="font-weight:700;font-size:13px">${esc(nombrePostulante(p))}${ed ? ` <span class="tip" style="font-style:normal">· ${ed} años</span>` : ''}</div>
            <div class="cand-meta">${[p.dni ? 'DNI ' + esc(p.dni) : '', p.id_postulante ? 'ID ' + esc(p.id_postulante) : ''].filter(Boolean).join(' · ')}</div>
            <div class="cand-meta">${p.telefono ? `${esc(p.telefono)} ${wa ? `<a href="${wa}" target="_blank" rel="noopener" class="wa-link"><i class="fab fa-whatsapp"></i></a>` : ''}` : ''}</div>
            ${p.email ? `<div class="cand-meta">${esc(p.email)}</div>` : ''}
            <div style="margin-top:5px;display:flex;gap:4px">
                <button class="btn-sm" onclick="openPostulanteModal(${p.id})" title="Editar ficha"><i class="fas fa-pen" style="font-size:9px"></i></button>
                <button class="btn-sm btn-danger" onclick="removePostulante(${p.id})" title="Eliminar de la base"><i class="fas fa-trash" style="font-size:9px"></i></button>
            </div>
        </td>
        <td><div style="font-weight:600">${esc(p.zona || '—')}</div><div class="cand-meta">${esc(p.localidad || '')}</div></td>
        <td><div style="font-weight:600">${esc(p.puesto_interes || '—')}</div><div class="cand-meta">${esc(p.horario || '')}</div>
            <div class="cand-meta">${p.sede_entrevista ? 'Entrevista: ' + esc(p.sede_entrevista) : ''}${p.fecha_entrevista ? ' · ' + fmtFecha(p.fecha_entrevista) : ''}</div></td>
        <td>${docBadges(p)}${p.cv_url ? `<div style="margin-top:4px"><a href="${esc(p.cv_url)}" target="_blank" rel="noopener" class="cv-link"><i class="fas fa-file-alt"></i> CV</a></div>` : ''}</td>
        <td>
            <select class="inline-select" onchange="updatePostulanteField(${p.id},'estado',this.value)">${optionsHtml(ESTADOS_POSTULANTE, p.estado)}</select>
            <div style="margin-top:4px"><span class="tag ${dispClass}">${disp}</span></div>
            <textarea class="inline-input" rows="2" style="margin-top:4px" placeholder="Observaciones…" onchange="updatePostulanteField(${p.id},'observaciones',this.value)">${esc(p.observaciones)}</textarea>
        </td>
        <td>${cands.length ? cands.map(({ c, b }) => `
            <button class="vac-chip ${candClass(c.estado)}" data-num="${esc(b.numero)}" onclick="verEnPipeline(this.dataset.num)" title="Ver en el Pipeline">
                <strong>${esc(b.numero)}</strong> · ${esc(b.local)}<br><span>${esc(c.estado)}</span>
            </button>`).join('') : '<span class="tip">Sin vacantes</span>'}</td>
        <td>${colocarHtml}</td>
    </tr>`;
}

// ══════════════════════════════════════════════
//  MODALES
// ══════════════════════════════════════════════
function openNuevaBusqueda() {
    ['n-local', 'n-local-ent', 'n-regional', 'n-zonal', 'n-puesto', 'n-jornada', 'n-notas'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('n-marca').value = MARCAS[0];
    document.getElementById('n-zona').value = '';
    document.getElementById('n-motivo').value = 'Rotación';
    document.getElementById('n-nivel').value = 'Operativo';
    document.getElementById('n-inicio').value = today();
    document.getElementById('n-cantidad').value = 1;
    const selDefault = selectorFiltroActivo || (currentProfile?.es_selector ? currentProfile.nombre : '');
    document.getElementById('n-selector').innerHTML = optionsHtml(selectores(), selDefault, '— Sin asignar —');
    openModal('modal-nueva');
}

// id = editar un postulante; bid = crearlo y colocarlo directo en esa vacante
function openPostulanteModal(id = null, bid = null) {
    const p = id ? postulantesById.get(id) : null;
    document.getElementById('p-id').value = id || '';
    document.getElementById('p-bid').value = bid || '';
    CAMPOS_POSTULANTE.forEach(f => {
        const el = document.getElementById('p-' + f.replace(/_/g, '-'));
        el.value = p ? (p[f] || '') : '';
    });
    if (!p) {
        document.getElementById('p-estado').value = 'Aprobado';
        const b = bid ? busquedas.find(x => x.id === bid) : null;
        if (b?.zona) document.getElementById('p-zona').value = b.zona;
    }
    const b = bid ? busquedas.find(x => x.id === bid) : null;
    document.getElementById('modal-postulante-title').textContent = p ? 'Ficha del postulante' : (b ? `Nuevo postulante para ${b.numero} · ${b.local}` : 'Nuevo postulante');
    openModal('modal-postulante');
}

let colocarBid = null;
function openColocarModal(bid) {
    colocarBid = bid;
    const b = busquedas.find(x => x.id === bid);
    document.getElementById('colocar-title').textContent = `Colocar en ${b.numero} · ${b.local} · ${b.puesto}`;
    document.getElementById('colocar-search').value = '';
    document.getElementById('colocar-solo-zona').checked = !!b.zona;
    document.getElementById('colocar-solo-zona-lbl').textContent = b.zona ? `Solo zona ${b.zona}` : 'Solo misma zona';
    renderColocarLista();
    openModal('modal-colocar');
    setTimeout(() => document.getElementById('colocar-search').focus(), 50);
}

function renderColocarLista() {
    const b = busquedas.find(x => x.id === colocarBid);
    if (!b) return;
    const mapa = mapaCandidaturas();
    const search = document.getElementById('colocar-search').value.trim().toLowerCase();
    const soloZona = document.getElementById('colocar-solo-zona').checked && b.zona;
    const yaEnEsta = new Set(b.candidatos.map(c => c.postulante_id));
    const lista = postulantes
        .filter(p => p.estado !== 'Descartado' && !yaEnEsta.has(p.id))
        .filter(p => !soloZona || p.zona === b.zona)
        .filter(p => !search || [p.nombre, p.apellido, p.dni, p.localidad, p.telefono].join(' ').toLowerCase().includes(search))
        .map(p => ({ p, disp: disponibilidad(mapa.get(p.id) || []) }))
        .sort((x, y) => (x.disp === 'Disponible' ? 0 : 1) - (y.disp === 'Disponible' ? 0 : 1)
            || (docCompleta(y.p) - docCompleta(x.p))
            || String(y.p.fecha_entrevista || '').localeCompare(String(x.p.fecha_entrevista || '')));
    const box = document.getElementById('colocar-lista');
    box.innerHTML = lista.length ? lista.slice(0, 60).map(({ p, disp }) => `
        <div class="colocar-item ${p.estado === 'Bloqueado' ? 'colocar-bloq' : ''}">
            <div style="flex:1;min-width:0">
                <div style="font-weight:700">${esc(nombrePostulante(p))} <span class="tag ${disp === 'Disponible' ? 'tag-cerrada' : disp === 'En vacante' ? 'tag-proceso' : 'tag-finalizada'}">${disp}</span></div>
                <div class="cand-meta">${[esc(p.zona || ''), esc(p.localidad || ''), esc(p.puesto_interes || ''), esc(p.horario || '')].filter(Boolean).join(' · ')}</div>
                <div style="margin-top:2px">${docBadges(p)}</div>
            </div>
            ${p.estado === 'Bloqueado'
                ? `<span class="tip">Bloqueado</span>`
                : `<button class="btn-sm" onclick="colocarDesdeModal(${p.id})"><i class="fas fa-link" style="font-size:9px"></i> Colocar</button>`}
        </div>`).join('') + (lista.length > 60 ? `<div class="tip" style="padding:8px">+ ${lista.length - 60} más: afiná la búsqueda</div>` : '')
        : `<span class="tip">No hay postulantes ${soloZona ? 'de esa zona ' : ''}para colocar. ${soloZona ? 'Destildá "solo zona" o ' : ''}cargá uno nuevo.</span>`;
}

async function colocarDesdeModal(pid) {
    const ok = await colocarEnVacante(pid, colocarBid);
    if (ok) closeModal('modal-colocar');
}

function openEquipoModal() { renderEquipoModal(); openModal('modal-equipo'); }

function renderEquipoModal() {
    const box = document.getElementById('equipo-lista');
    if (!box) return;
    box.innerHTML = equipo.length ? `
        <table class="equipo-table"><thead><tr><th>Nombre</th><th>Nombre completo</th><th>Email (login)</th><th>Rol</th><th>Selector</th><th>Color</th><th>Activo</th><th></th></tr></thead>
        <tbody>${equipo.map(m => `<tr>
            <td><input class="inline-input inline-input-box" value="${esc(m.nombre)}" onchange="updateMiembro(${m.id},'nombre',this.value.trim())"></td>
            <td><input class="inline-input inline-input-box" value="${esc(m.nombre_completo)}" onchange="updateMiembro(${m.id},'nombre_completo',this.value.trim()||null)"></td>
            <td><input class="inline-input inline-input-box" value="${esc(m.email)}" onchange="updateMiembro(${m.id},'email',this.value)"></td>
            <td><select class="inline-select" onchange="updateMiembro(${m.id},'rol',this.value)">${optionsHtml(['selector', 'admin'], m.rol)}</select></td>
            <td style="text-align:center"><input type="checkbox" ${m.es_selector ? 'checked' : ''} onchange="updateMiembro(${m.id},'es_selector',this.checked)"></td>
            <td><input type="color" value="${esc(colorDe(m.nombre))}" onchange="updateMiembro(${m.id},'color',this.value)"></td>
            <td style="text-align:center"><input type="checkbox" ${m.activo ? 'checked' : ''} onchange="updateMiembro(${m.id},'activo',this.checked)"></td>
            <td>${m.id !== currentProfile.id ? `<button class="btn-sm btn-danger" onclick="removeMiembro(${m.id})"><i class="fas fa-trash" style="font-size:9px"></i></button>` : ''}</td>
        </tr>`).join('')}</tbody></table>` : '<span class="tip">Sin integrantes</span>';
}
