// ══════════════════════════════════════════════
//  NAVEGACIÓN
// ══════════════════════════════════════════════
let vistaActual = 'vacantes';

const TITULOS = {
    vacantes: ['Vacantes', 'Las mismas columnas que la hoja Solicitudes: la persona se completa a medida que avanza el proceso'],
    base:     ['Base de Postulantes', 'Postulantes aprobados en entrevista, listos para colocar en una vacante'],
    stats:    ['Estadísticas', 'Cumplimiento por marca, zona, regional y selector'],
    informe:  ['Informe', 'Lo que hay que mover hoy y exportación a CSV']
};

// Opciones de los formularios y encabezado de la grilla (una vez, al entrar)
function prepararApp() {
    const fill = (id, lista, vacio = null) => { const el = document.getElementById(id); if (el) el.innerHTML = optionsHtml(lista, null, vacio); };
    fill('n-marca', MARCAS);
    fill('n-zona', ZONAS, '— Zona —');
    fill('n-motivo', MOTIVOS);
    fill('n-puesto', PUESTOS);
    fill('n-jornada', JORNADAS, '— Jornada —');
    fill('f-estado', ESTADOS_SOLICITUD, 'Estado: todos');
    fill('f-status', ESTADOS_BUSQUEDA, 'Vacante: todas');
    fill('fb-zona', ZONAS, 'Todas las zonas');
    fill('fb-estado', ESTADOS_POSTULANTE, 'Todos los estados');
    fill('fb-horario', HORARIOS, 'Cualquier horario');
    fill('p-zona', ZONAS, '— Zona —');
    fill('p-estado', ESTADOS_POSTULANTE);
    fill('p-horario', HORARIOS, '— Horario —');
    fill('p-curso-manipulacion', DOC_OPCIONES, '— Sin dato —');
    fill('p-antecedentes', DOC_OPCIONES, '— Sin dato —');
    // "Sin estado" = vacantes que todavía no arrancaron el circuito
    document.getElementById('f-estado').insertAdjacentHTML('beforeend', '<option value="__sin">Sin estado</option>');
    renderEncabezadoGrilla();
    renderSelectorChips();
}

function showView(v) {
    vistaActual = v;
    ['vacantes', 'base', 'stats', 'informe'].forEach(id => document.getElementById('view-' + id).classList.toggle('hidden', id !== v));
    document.querySelectorAll('.inline-nav-btn[id^="nav-"]').forEach(b => b.classList.toggle('active', b.id === 'nav-' + v));
    document.getElementById('filters-vacantes').classList.toggle('hidden', v !== 'vacantes');
    document.getElementById('filters-base').classList.toggle('hidden', v !== 'base');
    document.getElementById('selector-chips').classList.toggle('hidden', v !== 'vacantes');
    document.getElementById('btn-nueva-busqueda').classList.toggle('hidden', v !== 'vacantes');
    document.getElementById('btn-nuevo-postulante').classList.toggle('hidden', v !== 'base');
    document.getElementById('main-title').textContent = TITULOS[v][0];
    document.getElementById('main-sub').textContent = TITULOS[v][1];
    window.scrollTo({ top: 0, behavior: 'smooth' });
    resetPaginado();
    refreshView();
}

function refreshView() {
    actualizarDatalists();
    if (vistaActual === 'vacantes') { filteredIds = computeFilteredIds(); renderTable(); }
    else if (vistaActual === 'base') renderBase();
    else if (vistaActual === 'stats') renderStats(statsTab);
    else if (vistaActual === 'informe') renderInforme();
}

// Valores ya cargados como sugerencias de los campos de texto (local, regional, zonal…)
function actualizarDatalists() {
    const set = (id, lista) => { const el = document.getElementById(id); if (el) el.innerHTML = lista.map(v => `<option value="${esc(v)}">`).join(''); };
    set('dl-local', valoresUsados('local', valoresUsados('local_entrenamiento')));
    set('dl-regional', valoresUsados('regional'));
    set('dl-zonal', valoresUsados('zonal'));
    set('dl-nacionalidad', valoresUsados('nacionalidad', SUGERENCIAS.nacionalidad));
    set('dl-provincia', valoresUsados('provincia', SUGERENCIAS.provincia));
    set('dl-pais', valoresUsados('pais', SUGERENCIAS.pais));
    set('dl-altas', valoresUsados('altas_rrhh', SUGERENCIAS.altas));
    set('dl-sede', [...new Set([...SEDES_ENTREVISTA, ...postulantes.map(p => p.sede_entrevista).filter(Boolean)])]);
    set('dl-localidad', [...new Set(postulantes.map(p => p.localidad).filter(Boolean))].sort((a, b) => a.localeCompare(b)));
    set('dl-puesto-interes', [...new Set([...PUESTOS, ...postulantes.map(p => p.puesto_interes).filter(Boolean)])]);
}

// ══════════════════════════════════════════════
//  CHIPS DE SELECTOR + PESTAÑAS DE MARCA
// ══════════════════════════════════════════════
function renderSelectorChips() {
    const box = document.getElementById('selector-chips');
    box.innerHTML = ['', ...selectores()].map(s => {
        const activo = s === selectorFiltroActivo;
        const color = s ? colorDe(s) : null;
        const style = color
            ? ` style="${activo ? `background:${color};border-color:${color};color:#fff;` : `background:${color}1a;border-color:${color}66;color:${color};`}"`
            : '';
        return `<button class="selector-chip${activo ? ' active' : ''}${s ? ' con-avatar' : ''}"${style} data-sel="${esc(s)}" onclick="filtrarPorSelector(this.dataset.sel)">${s ? avatarHtml(s, 'avatar-chip') : ''}${esc(s || 'Todos los selectores')}</button>`;
    }).join('');
}
function filtrarPorSelector(nombre) {
    selectorFiltroActivo = nombre;
    renderSelectorChips();
    applyFilters();
}
// Pestañas como las de la planilla: Solicitudes Extremas / Solicitudes Sabores
function cambiarMarca(marca, btn) {
    marcaActiva = marca;
    document.querySelectorAll('#marca-tabs .page-tab').forEach(b => b.classList.toggle('active', b === btn));
    applyFilters();
}

// ══════════════════════════════════════════════
//  DEMORA (días hábiles)
//  T1 · Selección : apertura → enviado al zonal
//  T2 · Zonal     : enviado al zonal → aprobado por el zonal (o primer día si no se cargó)
//  T3 · Inicio    : aprobado por el zonal → primer día
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

function renderDemoraBreakdown(b) {
    const t = tramosDemora(b);
    const live = run => run ? `<i class="fas fa-circle dm-live"></i>` : '';
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
        ${fila('paper-plane', 'var(--blue)', t.t1, t.t1Run, 'Envío al zonal', fmtRango(b.inicio, t.t1To, t.t1Run), 'Días hábiles desde la apertura hasta enviar a alguien al zonal')}
        ${fila('store', 'var(--orange)', t.t2NA ? '—' : t.t2, t.t2Run, 'Decisión del zonal',
            t.t2NA ? 'Sin enviar al zonal todavía' : fmtRango(b.enviado_zonal, t.t2To, t.t2Run), 'Días hábiles que tardó el zonal en aprobar')}
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
    </div>`;
}

// En "ENVIADO A ZONAL" hace 3+ días hábiles sin respuesta
function alertaZonalVencida(b) {
    return vacanteAbierta(b) && b.estado === 'ENVIADO A ZONAL' && b.fecha_estado && daysDiff(b.fecha_estado) >= ALERTA_ZONAL_LIMITE_HD;
}
function fueraDePlazo(b) { return b.status === 'Proceso' && daysDiff(b.inicio) > limiteDe(b); }
function cubierta(b) { return b.status === 'Cerrada' || b.status === 'Finalizada'; }
function vacanteAbierta(b) { return b.status === 'Proceso' || b.status === 'Pausada'; }
function vacantesLibres() { return busquedas.filter(b => vacanteAbierta(b) && !tienePersona(b)); }

// ══════════════════════════════════════════════
//  GRILLA DE VACANTES (columnas de la hoja Solicitudes)
// ══════════════════════════════════════════════
const PAGINA_VACANTES = 50;
const PAGINA_BASE     = 50;
let vacantesVisibles = PAGINA_VACANTES;
let baseVisibles     = PAGINA_BASE;
function resetPaginado() { vacantesVisibles = PAGINA_VACANTES; baseVisibles = PAGINA_BASE; }
function mostrarMas(cual, todas) {
    if (cual === 'base') baseVisibles = todas ? Infinity : baseVisibles + PAGINA_BASE;
    else vacantesVisibles = todas ? Infinity : vacantesVisibles + PAGINA_VACANTES;
    refreshView();
}
function mostrarMasHtml(cual, visibles, total) {
    if (visibles >= total) return '';
    const paso = cual === 'base' ? PAGINA_BASE : PAGINA_VACANTES;
    return `<div class="mostrar-mas">Mostrando ${visibles} de ${total}
        <button class="btn-sm" onclick="mostrarMas('${cual}')">Mostrar ${Math.min(paso, total - visibles)} más</button>
        <button class="btn-sm" onclick="mostrarMas('${cual}', true)">Mostrar todas</button></div>`;
}

function renderEncabezadoGrilla() {
    const grupos = [];
    COLUMNAS.forEach(c => { const g = grupos[grupos.length - 1]; if (g && g.nombre === c.g) g.n++; else grupos.push({ nombre: c.g, n: 1 }); });
    document.getElementById('grilla-head').innerHTML = `
        <tr class="fila-grupos">
            <th class="col-fija" rowspan="2">N°</th>
            ${grupos.map(g => `<th colspan="${g.n}" class="grupo grupo-${g.nombre.toLowerCase()}">${g.nombre}</th>`).join('')}
            <th rowspan="2" class="col-acciones-th"></th>
        </tr>
        <tr class="fila-columnas">${COLUMNAS.map(c => `<th class="grupo-${c.g.toLowerCase()}" style="min-width:${c.w}px">${c.t}</th>`).join('')}</tr>`;
}

function renderTable() {
    const body = document.getElementById('table-body');
    // Abiertas primero; dentro de cada grupo, las más nuevas arriba
    const list = busquedas.filter(b => filteredIds.has(b.id))
        .sort((a, b) => (vacanteAbierta(b) - vacanteAbierta(a)) || (b.id - a.id));
    const visibles = list.slice(0, vacantesVisibles);
    const cols = COLUMNAS.length + 2;
    body.innerHTML = visibles.length
        ? visibles.map(renderRow).join('')
        : `<tr><td colspan="${cols}" class="celda-vacia"><span class="tip">${busquedas.length ? 'No hay vacantes para estos filtros.' : 'Todavía no hay vacantes cargadas. Usá "Nueva vacante".'}</span></td></tr>`;
    const mas = mostrarMasHtml('vacantes', visibles.length, list.length);
    if (mas) body.insertAdjacentHTML('beforeend', `<tr><td colspan="${cols}">${mas}</td></tr>`);
    renderKPIs();
    actualizarFiltroRegional();
}

// Redibuja solo la fila de una vacante después de editarla.
function refreshBusqueda(id) {
    if (vistaActual !== 'vacantes') { refreshView(); return; }
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

function celda(b, c) {
    const v = b[c.f];
    const on = `onchange="updateField(${b.id},'${c.f}',this.value)"`;
    switch (c.tipo) {
        case 'selector': return `<select class="celda" ${on}>${optionsHtml(selectores(), v, '—')}</select>`;
        case 'select':   return `<select class="celda" ${on}>${optionsHtml(c.ops, v, '—')}</select>`;
        case 'estado':   return `<select class="celda celda-estado ${estadoClass(v)}" ${on}>${optionsHtml(ESTADOS_SOLICITUD, v, '—')}</select>`;
        case 'fecha':    return `<input type="date" class="celda" value="${esc(v || '')}" ${on}>`;
        case 'numero':   return `<input class="celda mono" inputmode="numeric" value="${esc(v)}" ${on}>`;
        case 'tel': {
            const wa = waLink(v);
            return `<div class="celda-con-boton"><input class="celda" value="${esc(v)}" ${on}>${wa ? `<a href="${wa}" target="_blank" rel="noopener" class="wa-link" title="WhatsApp"><i class="fab fa-whatsapp"></i></a>` : ''}</div>`;
        }
        case 'persona':
            // Vacía: se escribe a mano o se trae de la base de postulantes
            return `<div class="celda-con-boton">
                <input class="celda celda-nombre" value="${esc(v)}" placeholder="—" ${on}>
                <button class="btn-colocar${tienePersona(b) ? '' : ' btn-colocar-vacia'}" onclick="openColocarModal(${b.id})" title="${tienePersona(b) ? 'Reemplazar con alguien de la base' : 'Colocar a alguien de la base de postulantes'}"><i class="fas fa-user-plus"></i>${tienePersona(b) ? '' : ' Colocar'}</button>
            </div>`;
        default:
            return `<input class="celda" value="${esc(v)}" ${c.dl ? `list="${c.dl}"` : ''} ${on}>`;
    }
}

function renderRow(b) {
    const dias = daysDiff(b.inicio, b.ingreso || null);
    const alerta = alertaZonalVencida(b);
    const coment = b.comentarios.length;
    const marcaCorta = b.marca === 'Sabores Express' ? 'SAB' : b.marca === 'Hamburguesas Extremas' ? 'EXT' : '';
    return `
    <tr id="row-${b.id}" class="${cubierta(b) ? 'row-cubierta' : ''} ${b.status === 'Cancelada' ? 'row-locked' : ''} ${alerta ? 'row-alerta' : ''}">
        <td class="col-fija ${marcaClass(b.marca)}">
            <div class="num-linea">
                <button class="link-btn" onclick="openDetalle(${b.id})" title="Ver detalle, historial y demora">${esc(b.numero)}</button>
                ${marcaCorta ? `<span class="marca-mini ${marcaClass(b.marca)}">${marcaCorta}</span>` : ''}
            </div>
            <div class="num-linea">
                <span class="tag ${tagClass(b.status)}">${esc(cubierta(b) ? 'Cubierta' : b.status)}</span>
                ${vacanteAbierta(b) ? `<span class="demora-badge ${demoraClass(dias, limiteDe(b))}" title="Días hábiles abierta · límite ${limiteDe(b)}hd">${dias}hd</span>` : ''}
            </div>
            ${b.estado_nomina ? `<div class="num-linea">${nominaHtml(b)}</div>` : ''}
            ${alerta ? `<div class="alerta-72" title="En ENVIADO A ZONAL hace ${daysDiff(b.fecha_estado)} días hábiles">⚠ ${daysDiff(b.fecha_estado)}hd sin respuesta</div>` : ''}
        </td>
        ${COLUMNAS.map(c => `<td class="col-${c.g.toLowerCase()}">${celda(b, c)}</td>`).join('')}
        <td class="col-acciones">
            <button class="btn-sm" onclick="openDetalle(${b.id})" title="Detalle, historial y demora"><i class="fas fa-comment-dots"></i>${coment ? ' ' + coment : ''}</button>
            ${tienePersona(b) ? `<button class="btn-sm" onclick="liberarVacante(${b.id})" title="Sacar a la persona de la vacante (queda en el historial)"><i class="fas fa-user-minus"></i></button>` : ''}
        </td>
    </tr>`;
}

// Los KPI respetan la marca y el selector elegidos, no el resto de los filtros.
function renderKPIs() {
    const data = busquedas.filter(b => (!selectorFiltroActivo || b.selector === selectorFiltroActivo) && (!marcaActiva || b.marca === marcaActiva));
    const validas = data.filter(b => b.status !== 'Cancelada');
    const cubiertas = validas.filter(cubierta).length;
    const pct = validas.length ? Math.round(cubiertas / validas.length * 100) : 0;
    const abiertas = data.filter(vacanteAbierta);
    const cuenta = e => abiertas.filter(b => b.estado === e).length;
    document.getElementById('kpi-row').innerHTML =
        kpiHtml(validas.length, 'Vacantes', 'violeta', `${abiertas.length} abiertas`) +
        kpiHtml(abiertas.filter(b => !tienePersona(b)).length, 'Sin persona', 'gris', 'falta colocar a alguien') +
        kpiHtml(cuenta('ENVIADO A ZONAL'), 'Enviado a zonal', 'azul') +
        kpiHtml(cuenta('CITADO') + cuenta('HUELLA'), 'Citados / huella', 'ambar') +
        kpiHtml(cubiertas, 'Cubiertas', 'verde', `${pct}% cumplimiento`) +
        kpiHtml(data.filter(alertaZonalVencida).length, 'Alertas 72hs zonal', 'rosa');
    renderLeyendaNomina(abiertas);
}

// Referencia de nómina de los locales (vacantes abiertas); cada una filtra la grilla
function renderLeyendaNomina(abiertas) {
    const box = document.getElementById('nomina-leyenda');
    if (!box) return;
    const filtro = document.getElementById('f-alerta').value;
    box.innerHTML = `<span class="nomina-leyenda-tit">Nómina del local</span>` + ESTADOS_NOMINA.map(e => {
        const n = abiertas.filter(b => b.estado_nomina === e).length;
        const activo = filtro === 'nom:' + e;
        return `<button class="nomina nomina-${NOMINA_INFO[e].clase}${activo ? ' activo' : ''}" data-e="${esc(e)}" onclick="filtrarNomina(this.dataset.e)"
            title="${activo ? 'Quitar filtro' : 'Ver solo las vacantes abiertas en locales: ' + NOMINA_INFO[e].lbl}"><i></i>${NOMINA_INFO[e].lbl} <strong>${n}</strong></button>`;
    }).join('');
}
function filtrarNomina(e) {
    const sel = document.getElementById('f-alerta');
    sel.value = sel.value === 'nom:' + e ? '' : 'nom:' + e;
    applyFilters();
}

let _filtroTimer = null;
function applyFiltersDebounced() { clearTimeout(_filtroTimer); _filtroTimer = setTimeout(applyFilters, 200); }
function applyFilters() { resetPaginado(); refreshView(); }

function computeFilteredIds() {
    const v = id => document.getElementById(id).value;
    const estado = v('f-estado'), status = v('f-status'), regional = v('f-regional'), alerta = v('f-alerta');
    const search = v('f-search').trim().toLowerCase();
    return busquedas.filter(b => {
        if (marcaActiva && b.marca !== marcaActiva) return false;
        if (selectorFiltroActivo && b.selector !== selectorFiltroActivo) return false;
        if (estado === '__sin' ? !!b.estado : (estado && b.estado !== estado)) return false;
        if (status && b.status !== status) return false;
        if (regional && b.regional !== regional) return false;
        if (alerta === '72' && !alertaZonalVencida(b)) return false;
        if (alerta === 'plazo' && !fueraDePlazo(b)) return false;
        if (alerta === 'libres' && !(vacanteAbierta(b) && !tienePersona(b))) return false;
        if (alerta.startsWith('nom:') && b.estado_nomina !== alerta.slice(4)) return false;
        if (search) {
            const hay = [b.numero, b.local, b.local_entrenamiento, b.puesto, b.selector, b.regional, b.zonal, b.nombre, b.apellido, b.dni, b.notas].join(' ').toLowerCase();
            if (!hay.includes(search)) return false;
        }
        return true;
    }).reduce((set, b) => set.add(b.id), new Set());
}

function actualizarFiltroRegional() {
    const sel = document.getElementById('f-regional');
    sel.innerHTML = optionsHtml(valoresUsados('regional'), sel.value, 'Todos los regionales');
}

// Desde la base o el informe: ir a la vacante en la grilla
function verEnPipeline(numero) {
    ['f-estado', 'f-status', 'f-regional', 'f-alerta'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('f-search').value = numero;
    selectorFiltroActivo = ''; marcaActiva = '';
    document.querySelectorAll('#marca-tabs .page-tab').forEach((b, i) => b.classList.toggle('active', i === 0));
    renderSelectorChips();
    showView('vacantes');
}

// ══════════════════════════════════════════════
//  DETALLE DE UNA VACANTE (historial, demora y datos que no van en la grilla)
// ══════════════════════════════════════════════
let detalleId = null;
function openDetalle(id) { detalleId = id; renderDetalle(id); openModal('modal-detalle'); }

function renderDetalle(id) {
    const b = busquedas.find(x => x.id === id);
    const box = document.getElementById('detalle-content');
    if (!b || !box || id !== detalleId) return;
    const sel = (field, lista, vacio = null) => `<select class="form-input" onchange="updateField(${b.id},'${field}',this.value)">${optionsHtml(lista, b[field], vacio)}</select>`;
    const fecha = field => `<input type="date" class="form-input" value="${esc(b[field] || '')}" onchange="updateField(${b.id},'${field}',this.value)">`;
    let perm = '';
    if (b.ingreso) {
        const dias = daysDiff(b.ingreso, b.fecha_baja || null);
        perm = `<div class="perm-box"><div class="perm-box-num">${dias}</div><div class="perm-box-lbl">${b.fecha_baja ? 'Días háb. hasta la baja' : 'Días háb. trabajando'}${b.ingreso_nombre ? ' · ' + esc(b.ingreso_nombre) : ''}</div>
            ${dias >= 90 ? '<div class="perm-box-milestone">🏆 cumplió 90 días hábiles</div>' : ''}</div>`;
    }
    document.getElementById('detalle-title').textContent = `${b.numero} · ${b.local} · ${b.puesto}`;
    box.innerHTML = `
        <div class="detalle-grid">
            <div>
                <div class="form-row">
                    <div class="form-group"><label>Marca</label>${sel('marca', MARCAS)}</div>
                    <div class="form-group"><label>Zona</label>${sel('zona', ZONAS, '— Zona —')}</div>
                    <div class="form-group"><label>Motivo</label>${sel('motivo', MOTIVOS)}</div>
                    <div class="form-group"><label>Estado de la vacante</label>${sel('status', ESTADOS_BUSQUEDA)}</div>
                    <div class="form-group"><label>Fecha de apertura</label>${fecha('inicio')}</div>
                    <div class="form-group"><label>Enviado al zonal</label>${fecha('enviado_zonal')}</div>
                    <div class="form-group"><label>Aprobado por el zonal</label>${fecha('decision_zonal')}</div>
                    <div class="form-group"><label>Fecha de baja <span class="tip">(si dejó la empresa)</span></label>${fecha('fecha_baja')}</div>
                    <div class="form-group"><label>Nómina del local <span class="tip">(SOLICITUDES DE PERSONAL)</span></label>${sel('estado_nomina', ESTADOS_NOMINA, '— Sin dato —')}</div>
                    <div class="form-group"><label>Detalle de nómina</label><input class="form-input" value="${esc(b.nomina_detalle || '')}" placeholder="Ej: PART: ideal 6 · real 5" onchange="updateField(${b.id},'nomina_detalle',this.value)"></div>
                </div>
                ${perm}
                <div class="section-hdr" style="margin-top:16px">Historial y comentarios</div>
                <div class="estado-log">${b.comentarios.length ? b.comentarios.map((e, i) => `
                    <div class="estado-entry">
                        <span class="d-badge">${i + 1}</span>
                        <div class="estado-entry-body">
                            <div class="estado-entry-text">${esc(e.texto)}</div>
                            <div class="estado-entry-meta">${fmtFecha(e.fecha)} · ${daysDiff(e.fecha) === 0 ? 'hoy' : 'hace ' + daysDiff(e.fecha) + 'hd'}
                                <button onclick="removeEstadoEntry(${b.id},${e.id})" class="btn-x" title="Eliminar">✕</button></div>
                        </div>
                    </div>`).join('') : '<span class="tip">Sin comentarios todavía</span>'}</div>
                <div class="estado-add-row">
                    <input class="estado-add-input" id="estado-input-${b.id}" placeholder="Agregar comentario…" onkeydown="if(event.key==='Enter')addEstadoEntry(${b.id})">
                    <button class="estado-add-btn" onclick="addEstadoEntry(${b.id})"><i class="fas fa-plus" style="font-size:10px"></i></button>
                </div>
            </div>
            <div>
                <div class="section-hdr">Demora (días hábiles)</div>
                ${renderDemoraBreakdown(b)}
            </div>
        </div>
        <div class="detalle-acciones">
            ${tienePersona(b) ? `<button class="btn-sm" onclick="liberarVacante(${b.id})"><i class="fas fa-user-minus"></i> Liberar (sacar a ${esc(nombreCompleto(b) || 'la persona')})</button>` : ''}
            ${cubierta(b) ? `<button class="btn-sm" onclick="reabrir(${b.id})"><i class="fas fa-redo"></i> Reabrir</button>` : ''}
            <button class="btn-sm btn-danger" onclick="eliminar(${b.id})"><i class="fas fa-trash"></i> Eliminar vacante</button>
        </div>`;
}

// ══════════════════════════════════════════════
//  BASE DE POSTULANTES
// ══════════════════════════════════════════════
function vacantesDe(pid) { return busquedas.filter(b => b.postulante_id === pid); }
function vacanteDe(pid) { return busquedas.find(b => b.postulante_id === pid && vacanteAbierta(b)) || null; }
function disponibilidad(p) {
    const vs = vacantesDe(p.id);
    if (vs.some(b => b.estado === 'COMUNICADO' || cubierta(b))) return 'Ingresó';
    if (vs.some(vacanteAbierta)) return 'En vacante';
    return 'Disponible';
}
function docCompleta(p) { return p.curso_manipulacion === 'Sí' && p.antecedentes === 'Sí'; }
function puedeColocarse(p) { return p.estado === 'Aprobado' || p.estado === 'En espera'; }

function renderBase() {
    const v = id => document.getElementById(id).value;
    const zona = v('fb-zona'), estado = v('fb-estado'), disp = v('fb-disp'), doc = v('fb-doc'), horario = v('fb-horario');
    const search = v('fb-search').trim().toLowerCase();

    const conDisp = postulantes.map(p => ({ p, disp: disponibilidad(p) }));
    const list = conDisp.filter(({ p, disp: d }) => {
        if (zona && p.zona !== zona) return false;
        if (estado && p.estado !== estado) return false;
        if (disp && d !== disp) return false;
        if (disp === 'Disponible' && !puedeColocarse(p)) return false; // igual que el KPI: bloqueados/descartados no cuentan
        if (doc === 'completa' && !docCompleta(p)) return false;
        if (doc === 'incompleta' && docCompleta(p)) return false;
        if (horario && p.horario !== horario && p.horario !== 'Cualquiera') return false;
        if (search) {
            const hay = [p.nombre, p.apellido, p.dni, p.telefono, p.email, p.localidad, p.puesto_interes, p.id_postulante].join(' ').toLowerCase();
            if (!hay.includes(search)) return false;
        }
        return true;
    });

    document.getElementById('kpi-row-base').innerHTML =
        kpiHtml(conDisp.length, 'En la base') +
        kpiHtml(conDisp.filter(x => x.disp === 'Disponible' && puedeColocarse(x.p)).length, 'Disponibles', 'azul') +
        kpiHtml(conDisp.filter(x => x.disp === 'En vacante').length, 'En una vacante', 'ambar') +
        kpiHtml(conDisp.filter(x => x.disp === 'Ingresó').length, 'Ingresaron', 'verde') +
        kpiHtml(conDisp.filter(x => !docCompleta(x.p)).length, 'Doc. incompleta', 'gris') +
        kpiHtml(conDisp.filter(x => x.p.estado === 'Bloqueado').length, 'Bloqueados', 'rosa');

    const libres = vacantesLibres();
    const visibles = list.slice(0, baseVisibles);
    const body = document.getElementById('base-body');
    body.innerHTML = visibles.length
        ? visibles.map(x => renderPostulanteRow(x.p, x.disp, libres)).join('')
        : `<tr><td colspan="7"><span class="tip">${conDisp.length ? 'No hay postulantes para estos filtros.' : 'La base está vacía. Usá "Nuevo postulante" para cargar a los aprobados en entrevista.'}</span></td></tr>`;
    const mas = mostrarMasHtml('base', visibles.length, list.length);
    if (mas) body.insertAdjacentHTML('beforeend', `<tr><td colspan="7">${mas}</td></tr>`);
}

function renderPostulanteRow(p, disp, libres) {
    const wa = waLink(p.telefono);
    const ed = edad(p.fecha_nacimiento);
    const dispClass = disp === 'Disponible' ? 'tag-cerrada' : disp === 'En vacante' ? 'tag-proceso' : 'tag-finalizada';
    const vs = vacantesDe(p.id);

    // Vacantes sin persona para colocarlo: primero las de su zona
    let colocarHtml;
    if (!puedeColocarse(p)) colocarHtml = `<span class="tip">No se puede colocar: está "${esc(p.estado)}"</span>`;
    else if (disp !== 'Disponible') colocarHtml = `<span class="tip">Ya está en una vacante</span>`;
    else {
        const opciones = [...libres].sort((a, b) => (b.zona === p.zona) - (a.zona === p.zona) || a.id - b.id);
        colocarHtml = opciones.length ? `
            <select class="inline-select" id="colocar-sel-${p.id}" style="width:100%">
                ${opciones.map(b => `<option value="${b.id}">${esc(b.numero)} · ${esc(b.local)} · ${esc(b.puesto)}</option>`).join('')}
            </select>
            <button class="btn-sm" style="margin-top:4px" onclick="colocarEnVacante(${p.id}, +document.getElementById('colocar-sel-${p.id}').value)"><i class="fas fa-link" style="font-size:9px"></i> Colocar</button>`
            : `<span class="tip">No hay vacantes sin persona</span>`;
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
            <div class="cand-meta">${p.sede_entrevista ? 'Entrevista: ' + esc(p.sede_entrevista) : ''}${p.fecha_entrevista ? ' · ' + fmtFecha(p.fecha_entrevista) : ''}</div>
            ${p.sugerido_para ? `<div class="cand-meta" title="Lo que eligió en Elegí tu vacante"><i class="fas fa-hand-pointer" style="font-size:9px"></i> ${esc(p.sugerido_para)}</div>` : ''}</td>
        <td>${docBadges(p)}${p.cv_url ? `<div style="margin-top:4px"><a href="${esc(p.cv_url)}" target="_blank" rel="noopener" class="cv-link"><i class="fas fa-file-alt"></i> CV</a></div>` : ''}</td>
        <td>
            <select class="inline-select" onchange="updatePostulanteField(${p.id},'estado',this.value)">${optionsHtml(ESTADOS_POSTULANTE, p.estado)}</select>
            <div style="margin-top:4px"><span class="tag ${dispClass}">${disp}</span></div>
            <textarea class="inline-input" rows="2" style="margin-top:4px" placeholder="Observaciones…" onchange="updatePostulanteField(${p.id},'observaciones',this.value)">${esc(p.observaciones)}</textarea>
        </td>
        <td>${vs.length ? vs.map(b => `
            <button class="vac-chip ${cubierta(b) ? 'cand-ok' : ''}" data-num="${esc(b.numero)}" onclick="verEnPipeline(this.dataset.num)" title="Ver la vacante">
                <strong>${esc(b.numero)}</strong> · ${esc(b.local)}<br><span>${esc(b.estado || 'Sin estado')}</span>
            </button>`).join('') : '<span class="tip">Sin vacantes</span>'}</td>
        <td>${colocarHtml}</td>
    </tr>`;
}

function docBadges(p) {
    const b = (lbl, v) => `<span class="doc-badge ${docClass(v)}" title="${lbl}: ${esc(v || 'sin dato')}">${lbl} ${v === 'Sí' ? '✓' : v === 'En trámite' ? '…' : '✗'}</span>`;
    return b('Manip.', p.curso_manipulacion) + b('Antec.', p.antecedentes);
}

// ══════════════════════════════════════════════
//  MODALES
// ══════════════════════════════════════════════
function openNuevaBusqueda() {
    ['n-local', 'n-local-ent', 'n-regional', 'n-zonal', 'n-notas'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('n-marca').value = marcaActiva || MARCAS[0];
    document.getElementById('n-zona').value = '';
    document.getElementById('n-motivo').value = 'Rotación';
    document.getElementById('n-puesto').value = PUESTOS[0];
    document.getElementById('n-jornada').value = 'ROTATIVO';
    document.getElementById('n-inicio').value = today();
    document.getElementById('n-cantidad').value = 1;
    document.getElementById('n-selector').innerHTML = optionsHtml(selectores(), selectorFiltroActivo, '— Sin asignar —');
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
    const b = bid ? busquedas.find(x => x.id === bid) : null;
    if (!p) {
        document.getElementById('p-estado').value = 'Aprobado';
        if (b?.zona) document.getElementById('p-zona').value = b.zona;
    }
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
    const search = document.getElementById('colocar-search').value.trim().toLowerCase();
    const soloZona = document.getElementById('colocar-solo-zona').checked && b.zona;
    const lista = postulantes
        .filter(p => p.estado !== 'Descartado' && p.id !== b.postulante_id)
        .filter(p => !soloZona || p.zona === b.zona)
        .filter(p => !search || [p.nombre, p.apellido, p.dni, p.localidad, p.telefono].join(' ').toLowerCase().includes(search))
        .map(p => ({ p, disp: disponibilidad(p) }))
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
function nuevoDesdeColocar() { closeModal('modal-colocar'); openPostulanteModal(null, colocarBid); }

function openEquipoModal() { renderEquipoModal(); openModal('modal-equipo'); setTimeout(() => document.getElementById('eq-nombre').focus(), 50); }

function renderEquipoModal() {
    const box = document.getElementById('equipo-lista');
    if (!box) return;
    box.innerHTML = equipo.length ? `
        <table class="equipo-table"><thead><tr><th></th><th>Nombre</th><th>Nombre completo</th><th>Foto (link)</th><th>Toma búsquedas</th><th>Color</th><th>Activo</th><th></th></tr></thead>
        <tbody>${equipo.map(m => `<tr class="${m.activo ? '' : 'row-locked'}">
            <td>${avatarHtml(m.nombre, 'avatar-equipo')}</td>
            <td><input class="inline-input inline-input-box" value="${esc(m.nombre)}" onchange="updateMiembro(${m.id},'nombre',this.value.trim())"></td>
            <td><input class="inline-input inline-input-box" value="${esc(m.nombre_completo)}" onchange="updateMiembro(${m.id},'nombre_completo',this.value.trim()||null)"></td>
            <td><input class="inline-input inline-input-box" value="${esc(m.foto_url || '')}" placeholder="https://…" style="min-width:160px" onchange="updateMiembro(${m.id},'foto_url',this.value.trim()||null)"></td>
            <td style="text-align:center"><input type="checkbox" ${m.es_selector ? 'checked' : ''} onchange="updateMiembro(${m.id},'es_selector',this.checked)"></td>
            <td><input type="color" value="${esc(colorDe(m.nombre))}" onchange="updateMiembro(${m.id},'color',this.value)"></td>
            <td style="text-align:center"><input type="checkbox" ${m.activo ? 'checked' : ''} onchange="updateMiembro(${m.id},'activo',this.checked)"></td>
            <td><button class="btn-sm btn-danger" onclick="removeMiembro(${m.id})" title="Eliminar"><i class="fas fa-trash" style="font-size:9px"></i></button></td>
        </tr>`).join('')}</tbody></table>` : '<span class="tip">Todavía no hay nadie cargado</span>';
}
