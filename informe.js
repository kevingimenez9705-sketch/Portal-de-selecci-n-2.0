// ══════════════════════════════════════════════
//  INFORME DE LA BASE (pestaña de Base de Postulantes, estética del Dojo)
//  · Cuántos hay, cuántos están disponibles, en una vacante, ingresaron o están bloqueados.
//  · Disponibles por zona vs. vacantes abiertas: cuántos postulantes hay por cada vacante.
//  · Documentación de los disponibles y motivos de bloqueo.
//  · Listado de los que salieron de la base activa (ingresaron, bloqueados, descartados): no se
//    ofrecen para colocar en vacantes. Desde "Ver ficha" se les puede cambiar el estado.
// ══════════════════════════════════════════════
let informeLista = 'ingresaron', informeVisibles = 100;
let _motivosBloqueo = null, _motivosCargando = false;   // seleccion_bloqueados activos (motivo y fecha)

// Holgura de la zona: postulantes disponibles por cada vacante abierta
const HOLGURA = [
    { hasta: 10, txt: 'Ajustada', cls: 'ajustada', ayuda: 'hasta 10 por vacante: cuesta cubrir' },
    { hasta: 30, txt: 'Equilibrada', cls: 'equilibrada', ayuda: 'de 11 a 30' },
    { hasta: Infinity, txt: 'Holgada', cls: 'holgada', ayuda: 'más de 30: sobra gente' }
];
const holgura = r => HOLGURA.find(h => r <= h.hasta);

// Zona de la lista ZONAS (sin importar mayúsculas / tildes); '' si no tiene
const zonaDe = z => ZONAS.find(x => normTxt(x) === normTxt(z)) || (normTxt(z) ? 'Otra' : '');
const zonaDeVacante = b => zonaDe(b.zona || infoLocal(b.local)?.zona);

// Motivo del bloqueo (de la pestaña BLOQUEADOS) por DNI o mail; se trae una vez al abrir el informe
const claveDni = d => String(d || '').replace(/\D/g, '').replace(/^0+/, '');
function motivoBloqueo(p) {
    if (!_motivosBloqueo) return null;
    return _motivosBloqueo.get('d' + claveDni(p.dni)) || _motivosBloqueo.get('m' + String(p.email || '').trim().toLowerCase()) || null;
}
async function cargarMotivosBloqueo() {
    if (_motivosBloqueo || _motivosCargando) return;
    _motivosCargando = true;
    try {
        const filas = await fetchTodo('seleccion_bloqueados', 'id, dni, mail, motivo, fecha, activo');
        _motivosBloqueo = new Map();
        filas.filter(f => f.activo !== false).forEach(f => {
            const m = { motivo: String(f.motivo || '').trim(), fecha: f.fecha };
            if (claveDni(f.dni)) _motivosBloqueo.set('d' + claveDni(f.dni), m);
            if (f.mail) _motivosBloqueo.set('m' + String(f.mail).trim().toLowerCase(), m);
        });
    } catch (e) { console.warn('Motivos de bloqueo:', msgError(e)); _motivosBloqueo = new Map(); }
    _motivosCargando = false;
    if (vistaActual === 'base' && baseTab === 'informe') renderBase();
}

function renderInformeBase(todos) {
    cargarMotivosBloqueo();
    const box = document.getElementById('base-informe');
    const activos = todos.filter(x => !fueraDeLaBase(x.p, x.disp));
    const disponibles = activos.filter(x => x.disp === 'Disponible' && puedeColocarse(x.p));
    const listas = listasInforme(todos);
    const pills = [
        [todos.length, 'postulantes', ''], [disponibles.length, 'disponibles', 'azul'],
        [activos.filter(x => x.disp === 'En vacante').length, 'en una vacante', 'ambar'],
        [listas.ingresaron.length, 'ingresaron', 'verde'], [listas.bloqueados.length, 'bloqueados', 'rosa']
    ].concat(listas.descartados.length ? [[listas.descartados.length, 'descartados', 'gris']] : []);
    const ahora = new Date();

    box.innerHTML = `<div class="dojo-inf">
        <div class="dojo-inf-cab">
            <div><div class="dojo-inf-kicker">El Dojo · Selección Gastro</div><h2>Informe de la base</h2>
                <div class="dojo-inf-sub">Al ${fmtFecha(today())} ${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')} · lo que hay en la Base de postulantes</div></div>
            <img class="dojo-inf-logo" src="assets/logo-dojo-blanco.png" alt="">
        </div>
        <div class="dojo-pills">${pills.map(([n, t, c]) => `<span class="dojo-pill${c ? ' dojo-pill-' + c : ''}"><b>${n.toLocaleString('es-AR')}</b> ${t}</span>`).join('')}</div>
        <div class="dojo-inf-grid">
            ${tarjetaZonas(disponibles)}
            <div class="dojo-inf-col">
                ${tarjetaDocumentacion(disponibles)}
                ${tarjetaMotivos(listas.bloqueados)}
            </div>
        </div>
        ${tarjetaListado(listas)}
    </div>`;
}

// ── Disponibles por zona vs. vacantes abiertas
function tarjetaZonas(disponibles) {
    const vac = {}, disp = {};
    busquedas.filter(b => vacanteAbierta(b) && contable(b)).forEach(b => { const z = zonaDeVacante(b) || 'Sin zona'; vac[z] = (vac[z] || 0) + 1; });
    disponibles.forEach(x => { const z = zonaDe(x.p.zona) || 'Sin zona'; disp[z] = (disp[z] || 0) + 1; });
    const zonas = [...ZONAS, 'Otra', 'Sin zona'].filter(z => disp[z] || vac[z]).sort((a, b) => (disp[b] || 0) - (disp[a] || 0));
    const max = Math.max(1, ...zonas.map(z => disp[z] || 0));
    const filas = zonas.map(z => {
        const d = disp[z] || 0, v = vac[z] || 0, r = v ? Math.round(d / v) : null, h = r === null ? null : holgura(r);
        return `<tr title="${esc(z)}: ${d} disponibles · ${v} vacantes abiertas">
            <th scope="row">${esc(z)}</th>
            <td><div class="dojo-barra-fila"><span class="dojo-barra"><i style="width:${d ? Math.max(2, d / max * 100) : 0}%"></i></span><b>${d}</b></div></td>
            <td class="num">${v}</td>
            <td>${h ? `<span class="dojo-ratio dojo-${h.cls}"><b>${r}</b> ${h.txt}</span>` : '<span class="dojo-ratio dojo-sin">Sin vacantes</span>'}</td>
        </tr>`;
    }).join('');
    return `<section class="dojo-card dojo-card-zonas">
        <h3>Disponibles por zona vs. vacantes abiertas</h3>
        <table class="dojo-tabla">
            <thead><tr><th>Zona</th><th>Postulantes disponibles</th><th class="num">Vacantes</th><th>Postulantes por vacante</th></tr></thead>
            <tbody>${filas || '<tr><td colspan="4" class="dojo-vacio">Sin datos de zona.</td></tr>'}</tbody>
        </table>
        <div class="dojo-ley">${HOLGURA.map(h => `<span><b class="dojo-${h.cls}">${h.txt}</b> ${h.ayuda}</span>`).join('')}</div>
    </section>`;
}

// ── Documentación de los disponibles (curso de manipulación y antecedentes)
function tarjetaDocumentacion(disponibles) {
    const n = disponibles.length;
    const completa = disponibles.filter(x => docCompleta(x.p)).length;
    const tramite = disponibles.filter(x => !docCompleta(x.p) && [x.p.curso_manipulacion, x.p.antecedentes].includes('En trámite')).length;
    const falta = n - completa - tramite;
    const partes = [['completa', 'Completa', completa], ['tramite', 'En trámite', tramite], ['falta', 'Falta', falta]];
    const pct = v => n ? Math.round(v / n * 100) : 0;
    return `<section class="dojo-card">
        <h3>Documentación de los disponibles</h3>
        <div class="dojo-doc-num"><b>${pct(completa)}%</b> con la documentación completa</div>
        <div class="dojo-apilada" role="img" aria-label="${partes.map(([, t, v]) => `${t} ${v}`).join(', ')}">${partes.filter(([, , v]) => v)
            .map(([k, t, v]) => `<i class="dojo-doc-${k}" style="width:${v / Math.max(1, n) * 100}%" title="${t}: ${v} (${pct(v)}%)"></i>`).join('')}</div>
        <div class="dojo-ley dojo-ley-doc">${partes.map(([k, t, v]) => `<span><i class="dojo-doc-${k}"></i>${t} <b>${v}</b></span>`).join('')}</div>
    </section>`;
}

// ── Motivos de bloqueo (de la pestaña BLOQUEADOS)
function tarjetaMotivos(bloqueados) {
    if (!bloqueados.length) return '';
    if (!_motivosBloqueo) return `<section class="dojo-card"><h3>Motivos de bloqueo</h3><div class="dojo-vacio">Cargando…</div></section>`;
    const cuenta = {};
    bloqueados.forEach(x => {
        const m = motivoBloqueo(x.p)?.motivo || '';
        const k = !m ? 'Sin motivo cargado' : /RECHAZ.*ZONAL/i.test(normTxt(m)) ? 'Rechazado por el zonal' : /NO INTERES/i.test(normTxt(m)) ? 'No le interesó la propuesta' : m.length > 40 ? m.slice(0, 40) + '…' : m;
        cuenta[k] = (cuenta[k] || 0) + 1;
    });
    const filas = Object.entries(cuenta).sort((a, b) => b[1] - a[1]);
    const top = filas.slice(0, 5), resto = filas.slice(5).reduce((s, [, n]) => s + n, 0);
    if (resto) top.push(['Otros motivos', resto]);
    const max = Math.max(1, ...top.map(([, n]) => n));
    return `<section class="dojo-card">
        <h3>Motivos de bloqueo</h3>
        <div class="dojo-motivos">${top.map(([m, n]) => `<div class="dojo-motivo"><span>${esc(m)}</span>
            <span class="dojo-barra dojo-barra-rosa"><i style="width:${Math.max(3, n / max * 100)}%"></i></span><b>${n}</b></div>`).join('')}</div>
    </section>`;
}

// ── Listado de los que salieron de la base activa (con filtros en cada columna, como la grilla de vacantes)
const INFORME_LISTAS = { ingresaron: 'Ingresaron', bloqueados: 'Bloqueados', descartados: 'Descartados' };
let informeFiltros = { ingresaron: {}, bloqueados: {}, descartados: {} };

const tituloTxt = s => String(s || '').trim().toLowerCase().replace(/(^|[\s(\/-])\S/g, c => c.toUpperCase());
// Vacante en la que ingresó (la más reciente)
const vacIngreso = p => vacantesDe(p.id).filter(v => v.estado === 'COMUNICADO' || cubierta(v))
    .sort((a, x) => String(x.ingreso || '').localeCompare(String(a.ingreso || '')))[0] || null;
const motivoTexto = p => motivoBloqueo(p)?.motivo || p.observaciones || (_motivosBloqueo ? 'Sin motivo cargado' : '');

// Columnas de cada listado: [campo, título, valor para filtrar, tipo]
const COL_PERSONA = [['nombre', 'Postulante', x => nombrePostulante(x.p)], ['zona', 'Zona', x => zonaDe(x.p.zona)],
    ['localidad', 'Localidad', x => tituloTxt(x.p.localidad)]];
const COLS_INFORME = {
    ingresaron: [...COL_PERSONA, ['vacante', 'Vacante', x => vacIngreso(x.p)?.local || ''], ['ingreso', 'Primer día', x => vacIngreso(x.p)?.ingreso || '', 'fecha']],
    bloqueados: [...COL_PERSONA, ['motivo', 'Motivo', x => motivoTexto(x.p)], ['desde', 'Desde', x => String(motivoBloqueo(x.p)?.fecha || '').slice(0, 10), 'fecha']],
    descartados: [...COL_PERSONA, ['obs', 'Observaciones', x => x.p.observaciones || '']]
};
const valorInforme = (campo, x) => String(COLS_INFORME[informeLista].find(c => c[0] === campo)?.[2](x) ?? '').trim();

function listasInforme(todos = postulantes.map(p => ({ p, disp: disponibilidad(p) }))) {
    return {
        ingresaron: todos.filter(x => x.disp === 'Ingresó'),
        bloqueados: todos.filter(x => x.disp !== 'Ingresó' && x.p.estado === 'Bloqueado'),
        descartados: todos.filter(x => x.disp !== 'Ingresó' && x.p.estado === 'Descartado')
    };
}
// ¿Pasa el buscador y los filtros de columna? (excepto = columna que no se mira, para armar su lista de valores)
function pasaInforme(x, excepto = '') {
    const q = normTxt(document.getElementById('inf-buscar')?.value || '');
    if (q && !normTxt([x.p.nombre, x.p.apellido, x.p.dni, x.p.localidad, x.p.zona].join(' ')).includes(q)) return false;
    return Object.entries(informeFiltros[informeLista]).every(([c, set]) => c === excepto || set.has(valorInforme(c, x)));
}

function tarjetaListado(listas) {
    if (!listas[informeLista]?.length && informeLista !== 'ingresaron') informeLista = 'ingresaron';
    const filas = listas[informeLista].filter(x => pasaInforme(x)).sort((a, b) => nombrePostulante(a.p).localeCompare(nombrePostulante(b.p)));
    const visibles = filas.slice(0, informeVisibles);
    const nFiltros = Object.keys(informeFiltros[informeLista]).length;
    const th = ([campo, titulo]) => {
        const activo = !!informeFiltros[informeLista][campo];
        return `<th class="${activo ? 'th-filtrado' : ''}"><div class="th-col"><span>${titulo}</span><button type="button" class="btn-filtro${activo ? ' activo' : ''}" data-filtro="inf:${campo}"
            onclick="abrirFiltroInforme('${campo}', this)" title="Filtrar ${titulo}" aria-label="Filtrar ${titulo}"><i class="fas fa-filter"></i></button></div></th>`;
    };
    return `<section class="dojo-card dojo-listado">
        <div class="dojo-listado-cab">
            <h3>Fuera de la base activa <span class="dojo-tip">no se ofrecen para las vacantes</span></h3>
            <div class="dojo-tabs" role="tablist">${Object.entries(INFORME_LISTAS).filter(([k]) => k !== 'descartados' || listas.descartados.length)
                .map(([k, t]) => `<button type="button" role="tab" class="${k === informeLista ? 'activa' : ''}" aria-selected="${k === informeLista}" onclick="elegirListaInforme('${k}')">${t} <b>${listas[k].length}</b></button>`).join('')}</div>
            <input class="dojo-buscar" id="inf-buscar" placeholder="Buscar nombre, DNI, localidad…" value="${esc(document.getElementById('inf-buscar')?.value || '')}" oninput="buscarEnInforme()">
            ${nFiltros ? `<button type="button" class="dojo-btn dojo-btn-rosa" onclick="limpiarFiltrosInforme()"><i class="fas fa-filter-circle-xmark"></i> Limpiar filtros <b>${nFiltros}</b></button>` : ''}
            <button type="button" class="dojo-btn" onclick="descargarListaInforme()" title="Lo que se ve, con los filtros"><i class="fas fa-download"></i> CSV</button>
        </div>
        <div class="dojo-tabla-wrap"><table class="dojo-tabla dojo-tabla-lista">
            <thead><tr>${COLS_INFORME[informeLista].map(th).join('')}<th></th></tr></thead>
            <tbody>${visibles.length ? visibles.map(x => filaListado(x.p)).join('')
                : `<tr><td colspan="${COLS_INFORME[informeLista].length + 1}" class="dojo-vacio">${nFiltros || document.getElementById('inf-buscar')?.value ? 'Nadie coincide con los filtros.' : 'No hay nadie en este listado.'}</td></tr>`}</tbody>
        </table></div>
        ${filas.length > visibles.length ? `<div class="dojo-mas">Mostrando ${visibles.length} de ${filas.length}
            <button type="button" class="dojo-btn" onclick="informeVisibles = Infinity; renderBase()">Mostrar todos</button></div>`
            : filas.length !== listas[informeLista].length ? `<div class="dojo-mas">${filas.length} de ${listas[informeLista].length}</div>` : ''}
    </section>`;
}

function filaListado(p) {
    const persona = `<td><b>${esc(nombrePostulante(p))}</b><div class="dojo-meta">${p.dni ? 'DNI ' + esc(p.dni) : ''}${p.telefono ? ' · ' + esc(p.telefono) : ''}</div></td>
        <td>${esc(p.zona || '—')}</td><td>${esc(p.localidad || '—')}</td>`;
    const ficha = `<td class="dojo-acc"><button type="button" class="dojo-btn" onclick="openPostulanteModal(${p.id})" title="Ver o cambiar el estado">Ver ficha</button></td>`;
    if (informeLista === 'ingresaron') {
        const b = vacIngreso(p);
        return `<tr>${persona}<td>${b ? `<button type="button" class="dojo-link" data-num="${esc(b.numero)}" onclick="verEnPipeline(this.dataset.num)">${esc(b.numero)}</button> · ${esc(b.local)}<div class="dojo-meta">${esc(b.puesto || '')}</div>` : '—'}</td>
            <td>${b?.ingreso ? fmtFecha(b.ingreso) : '—'}</td>${ficha}</tr>`;
    }
    if (informeLista === 'bloqueados') {
        const m = motivoBloqueo(p);
        return `<tr>${persona}<td>${esc(motivoTexto(p) || '…')}</td><td>${m?.fecha ? fmtFecha(String(m.fecha).slice(0, 10)) : '—'}</td>${ficha}</tr>`;
    }
    return `<tr>${persona}<td>${esc(p.observaciones || '—')}</td>${ficha}</tr>`;
}

// Filtro de una columna del listado (misma ventanita que la grilla de vacantes)
function abrirFiltroInforme(campo, btn) {
    const key = 'inf:' + campo;
    if (_filtroPop?.f === key) { cerrarFiltro(); return; }
    const col = COLS_INFORME[informeLista].find(c => c[0] === campo);
    if (!col) return;
    const cuenta = new Map();
    listasInforme()[informeLista].filter(x => pasaInforme(x, campo)).forEach(x => { const v = valorInforme(campo, x); cuenta.set(v, (cuenta.get(v) || 0) + 1); });
    (informeFiltros[informeLista][campo] || []).forEach(v => { if (!cuenta.has(v)) cuenta.set(v, 0); });
    const fecha = col[3] === 'fecha';
    const valores = [...cuenta.keys()].sort((a, b) => (!a) - (!b) || (fecha ? b.localeCompare(a) : a.localeCompare(b, 'es', { numeric: true })))
        .map(v => ({ v, n: cuenta.get(v), txt: !v ? '(Vacío)' : fecha ? fmtFecha(v) : v }));
    const set = informeFiltros[informeLista][campo];
    mostrarPop(htmlFiltroValores(col[1], valores, v => !set || set.has(v)), {
        tipo: 'col', f: key, btn,
        aplicar: elegidos => {
            if (elegidos) informeFiltros[informeLista][campo] = elegidos; else delete informeFiltros[informeLista][campo];
            informeVisibles = 100;
            renderBase();
            // El listado se redibuja: la ventanita queda pegada al botón nuevo
            if (_filtroPop?.f === key) _filtroPop.btn = document.querySelector(`.dojo-listado [data-filtro="${key}"]`) || _filtroPop.btn;
        }
    });
}
function limpiarFiltrosInforme() {
    informeFiltros[informeLista] = {};
    const s = document.getElementById('inf-buscar');
    if (s) s.value = '';
    cerrarFiltro();
    informeVisibles = 100;
    renderBase();
}

function elegirListaInforme(k) { cerrarFiltro(); informeLista = k; informeVisibles = 100; renderBase(); }
let _infTimer = null;
function buscarEnInforme() {
    clearTimeout(_infTimer);
    _infTimer = setTimeout(() => {
        const el = document.getElementById('inf-buscar'), pos = el?.selectionStart;
        informeVisibles = 100;
        renderBase();
        const nuevo = document.getElementById('inf-buscar');
        if (nuevo) { nuevo.focus(); if (pos != null) nuevo.setSelectionRange(pos, pos); }
    }, 200);
}

// CSV de lo que se ve en el listado (con el buscador y los filtros de columna)
function descargarListaInforme() {
    const lista = listasInforme()[informeLista].filter(x => pasaInforme(x)).sort((a, b) => nombrePostulante(a.p).localeCompare(nombrePostulante(b.p)));
    const headers = ['Nombre', 'Apellido', 'DNI', 'Teléfono', 'Email', 'Zona', 'Localidad', 'Estado', 'Detalle', 'Fecha'];
    const rows = lista.map(({ p }) => {
        let detalle = p.observaciones || '', fecha = '';
        if (informeLista === 'ingresaron') {
            const b = vacIngreso(p);
            if (b) { detalle = `${b.numero} · ${b.local} · ${b.puesto || ''}`; fecha = b.ingreso || ''; }
        } else if (informeLista === 'bloqueados') {
            detalle = motivoTexto(p);
            fecha = String(motivoBloqueo(p)?.fecha || '').slice(0, 10);
        }
        return [p.nombre, p.apellido, p.dni, p.telefono, p.email, p.zona, p.localidad, p.estado, detalle, fecha];
    });
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `base-${informeLista}-${today()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
