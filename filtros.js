// ══════════════════════════════════════════════
//  FILTROS EN LOS ENCABEZADOS DE LA GRILLA (como los de Sheets)
//  · Cada columna: botón de filtro → lista de valores (con cuántas vacantes tiene cada uno) para
//    tildar / destildar, con buscador. Los valores salen de las filas que pasan los demás filtros.
//  · Encabezado N°: buscador general y "vista" (estado de la vacante, alertas y nómina del local).
//  · Las pestañas de marca (Todas / Extremas / Sabores) siguen arriba, como las de la planilla.
// ══════════════════════════════════════════════
let filtrosColumna = {};                                     // campo → Set de valores elegidos ('' = vacío)
let filtroVista = { status: '', mostrar: '', nomina: '' };   // del encabezado N°
let _filtroPop = null;                                       // { tipo: 'col' | 'vista', f, btn }

const valorColumna = (b, f) => String(b[f] ?? '').trim();
function textoValor(f, v) {
    if (!v) return f === 'estado' ? '(Sin estado)' : f === 'selector' ? '(Sin asignar)' : '(Vacío)';
    return COLUMNAS.find(c => c.f === f)?.tipo === 'fecha' ? fmtFecha(v) : v;
}
// Selector elegido, si el filtro de la columna Selector tiene uno solo (para la nueva vacante y los conteos)
function selectorUnico() { const s = filtrosColumna.selector; return s && s.size === 1 ? [...s][0] : ''; }
const pasaSelector = b => !filtrosColumna.selector || filtrosColumna.selector.has(valorColumna(b, 'selector'));

const MOSTRAR = { libres: 'Solo sin persona', '72': 'Solo alerta 72hs zonal', plazo: 'Solo fuera de plazo' };
const NOMINA_VISTA = { ACTIVAS: 'A completar (búsquedas activas)', EXCEDIDO: 'Excedido · no cuenta' };

function pasaVista(b, excepto = '') {
    const { status, mostrar, nomina } = filtroVista;
    if (excepto !== 'status' && status && b.status !== status) return false;
    if (excepto !== 'mostrar') {
        if (mostrar === '72' && !alertaZonalVencida(b)) return false;
        if (mostrar === 'plazo' && !fueraDePlazo(b)) return false;
        if (mostrar === 'libres' && !(vacanteAbierta(b) && !tienePersona(b))) return false;
    }
    if (excepto !== 'nomina') {
        if (nomina === 'ACTIVAS' && !cuentaComoActiva(b)) return false;
        if (nomina === 'EXCEDIDO' && b.estado_nomina !== 'EXCEDIDO') return false;
    }
    return true;
}

// ¿La vacante pasa todos los filtros? (excepto = columna o parte de la vista que no se mira)
function pasaFiltros(b, excepto = '') {
    if (marcaActiva && b.marca !== marcaActiva) return false;
    for (const [f, set] of Object.entries(filtrosColumna)) if (f !== excepto && !set.has(valorColumna(b, f))) return false;
    if (!pasaVista(b, excepto)) return false;
    const search = (document.getElementById('f-search')?.value || '').trim().toLowerCase();
    if (search) {
        const hay = [b.numero, b.local, b.local_entrenamiento, b.puesto, b.selector, b.regional, b.zonal, b.nombre, b.apellido, b.dni, b.notas].join(' ').toLowerCase();
        if (!hay.includes(search)) return false;
    }
    return true;
}

function cantidadFiltros() {
    return Object.keys(filtrosColumna).length + Object.values(filtroVista).filter(Boolean).length
        + ((document.getElementById('f-search')?.value || '').trim() ? 1 : 0);
}

// Encabezados con filtro activo resaltados y el botón "Limpiar filtros"
function marcarFiltrosActivos() {
    document.querySelectorAll('#grilla-head [data-filtro]').forEach(btn => {
        const f = btn.dataset.filtro;
        const activo = f === '__vista' ? Object.values(filtroVista).some(Boolean) : !!filtrosColumna[f];
        btn.classList.toggle('activo', activo);
        btn.closest('th')?.classList.toggle('th-filtrado', activo);
    });
    const n = cantidadFiltros(), lim = document.getElementById('btn-limpiar-filtros');
    if (lim) { lim.classList.toggle('hidden', !n); lim.querySelector('span').textContent = n; }
}

function limpiarFiltros() {
    filtrosColumna = {};
    filtroVista = { status: '', mostrar: '', nomina: '' };
    const s = document.getElementById('f-search');
    if (s) s.value = '';
    cerrarFiltro();
    applyFilters();
}

// ── Ventanita del filtro (una sola, flotando sobre la grilla)
function popFiltro() {
    let pop = document.getElementById('filtro-pop');
    if (!pop) {
        pop = document.createElement('div');
        pop.id = 'filtro-pop';
        pop.className = 'filtro-pop hidden';
        pop.setAttribute('role', 'dialog');
        document.body.appendChild(pop);
        document.addEventListener('mousedown', e => { if (_filtroPop && !pop.contains(e.target) && !e.target.closest('[data-filtro]')) cerrarFiltro(); });
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && _filtroPop) cerrarFiltro(); });
        window.addEventListener('resize', cerrarFiltro);
        document.querySelector('.grilla-wrap')?.addEventListener('scroll', () => { if (_filtroPop) ubicarFiltro(); }, { passive: true });
    }
    return pop;
}
function ubicarFiltro() {
    const pop = document.getElementById('filtro-pop'), btn = _filtroPop?.btn;
    if (!pop || !btn || !btn.isConnected) { cerrarFiltro(); return; }
    const r = btn.getBoundingClientRect(), w = pop.offsetWidth;
    pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
    pop.style.top = Math.min(r.bottom + 6, window.innerHeight - 120) + 'px';
}
function cerrarFiltro() {
    _filtroPop = null;
    const pop = document.getElementById('filtro-pop');
    if (pop) pop.classList.add('hidden');
}
function mostrarPop(html, info) {
    const pop = popFiltro();
    pop.innerHTML = html;
    pop.classList.remove('hidden');
    _filtroPop = info;
    ubicarFiltro();
    pop.querySelector('.fp-buscar')?.focus();
}

// ── Filtro de una columna
function abrirFiltroColumna(f, btn) {
    if (_filtroPop?.f === f) { cerrarFiltro(); return; }
    const col = COLUMNAS.find(c => c.f === f);
    if (!col) return;
    const cuenta = new Map();
    busquedas.filter(b => pasaFiltros(b, f)).forEach(b => { const v = valorColumna(b, f); cuenta.set(v, (cuenta.get(v) || 0) + 1); });
    (filtrosColumna[f] || []).forEach(v => { if (!cuenta.has(v)) cuenta.set(v, 0); });
    const elegido = v => !filtrosColumna[f] || filtrosColumna[f].has(v);
    const orden = f === 'estado' ? (a, b) => ORDEN_PROCESO.indexOf(a) - ORDEN_PROCESO.indexOf(b)
        : col.tipo === 'fecha' ? (a, b) => (!a) - (!b) || b.localeCompare(a)
        : (a, b) => (!a) - (!b) || a.localeCompare(b, 'es', { numeric: true });
    const valores = [...cuenta.keys()].sort(orden);
    mostrarPop(`
        <div class="fp-tit">${esc(col.t)}</div>
        <input class="fp-buscar" placeholder="Buscar… (Enter: dejar solo estos)" oninput="buscarEnFiltro(this.value)" onkeydown="if(event.key==='Enter')soloVisiblesFiltro()">
        <div class="fp-acciones"><button type="button" onclick="marcarTodosFiltro(true)">Seleccionar todo</button><button type="button" onclick="marcarTodosFiltro(false)">Ninguno</button></div>
        <div class="fp-lista">${valores.length ? valores.map(v => `<label class="fp-op" data-txt="${esc(normTxt(textoValor(f, v)))}">
            <input type="checkbox" value="${esc(v)}" ${elegido(v) ? 'checked' : ''} onchange="aplicarFiltroColumna()">
            ${f === 'selector' && v ? avatarHtml(v, 'avatar-filtro') : ''}<span class="fp-op-txt${v ? '' : ' fp-vacio'}">${esc(textoValor(f, v))}</span><b>${cuenta.get(v)}</b></label>`).join('')
            : '<div class="tip">No hay valores con los demás filtros.</div>'}</div>
        <div class="fp-pie"><button type="button" class="btn-sm" onclick="borrarFiltroColumna()">Borrar filtro</button><button type="button" class="btn-sm fp-listo" onclick="cerrarFiltro()">Listo</button></div>`,
        { tipo: 'col', f, btn });
}
function buscarEnFiltro(q) {
    const n = normTxt(q);
    document.querySelectorAll('#filtro-pop .fp-op').forEach(op => op.classList.toggle('hidden', !!n && !op.dataset.txt.includes(n)));
}
// Con texto en el buscador, "Seleccionar todo" / "Ninguno" tocan solo lo que se ve
function marcarTodosFiltro(si) {
    document.querySelectorAll('#filtro-pop .fp-op:not(.hidden) input').forEach(i => { i.checked = si; });
    aplicarFiltroColumna();
}
function soloVisiblesFiltro() {
    document.querySelectorAll('#filtro-pop .fp-op input').forEach(i => { i.checked = !i.closest('.fp-op').classList.contains('hidden'); });
    aplicarFiltroColumna();
}
function aplicarFiltroColumna() {
    const f = _filtroPop?.f;
    if (!f) return;
    const inputs = [...document.querySelectorAll('#filtro-pop .fp-op input')];
    const elegidos = inputs.filter(i => i.checked).map(i => i.value);
    if (elegidos.length === inputs.length) delete filtrosColumna[f];
    else filtrosColumna[f] = new Set(elegidos);
    applyFilters();
}
function borrarFiltroColumna() {
    const f = _filtroPop?.f;
    if (f) delete filtrosColumna[f];
    cerrarFiltro();
    applyFilters();
}

// ── Encabezado N°: estado de la vacante, alertas y nómina del local
function abrirFiltroVista(btn) {
    if (_filtroPop?.tipo === 'vista') { cerrarFiltro(); return; }
    pintarFiltroVista(btn);
}
function pintarFiltroVista(btn) {
    const cuenta = (parte, fn) => busquedas.filter(b => pasaFiltros(b, parte) && fn(b)).length;
    const grupo = (parte, titulo, opciones) => `<div class="fp-sec">${titulo}</div>` + [['', 'Todas', () => true], ...opciones].map(([v, t, fn]) =>
        `<label class="fp-op"><input type="radio" name="fv-${parte}" value="${esc(v)}" ${filtroVista[parte] === v ? 'checked' : ''} onchange="cambiarFiltroVista('${parte}', this.value)">
            <span class="fp-op-txt">${esc(t)}</span><b>${cuenta(parte, fn)}</b></label>`).join('');
    mostrarPop(`
        <div class="fp-tit">Vacantes</div>
        <div class="fp-lista">
        ${grupo('status', 'Estado de la vacante', ESTADOS_BUSQUEDA.map(s => [s, s, b => b.status === s]))}
        ${grupo('mostrar', 'Mostrar', [['libres', MOSTRAR.libres, b => vacanteAbierta(b) && !tienePersona(b)], ['72', MOSTRAR['72'], alertaZonalVencida], ['plazo', MOSTRAR.plazo, fueraDePlazo]])}
        ${grupo('nomina', 'Nómina del local', [['ACTIVAS', NOMINA_VISTA.ACTIVAS, cuentaComoActiva], ['EXCEDIDO', NOMINA_VISTA.EXCEDIDO, b => b.estado_nomina === 'EXCEDIDO']])}
        </div>
        <div class="fp-pie"><button type="button" class="btn-sm" onclick="borrarFiltroVista()">Borrar</button><button type="button" class="btn-sm fp-listo" onclick="cerrarFiltro()">Listo</button></div>`,
        { tipo: 'vista', f: '__vista', btn });
}
function cambiarFiltroVista(parte, v) {
    filtroVista[parte] = v;
    applyFilters();
    if (_filtroPop?.tipo === 'vista') pintarFiltroVista(_filtroPop.btn);   // actualiza las cantidades
}
function borrarFiltroVista() {
    filtroVista = { status: '', mostrar: '', nomina: '' };
    cerrarFiltro();
    applyFilters();
}
