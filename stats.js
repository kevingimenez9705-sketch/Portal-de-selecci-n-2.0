// ══════════════════════════════════════════════
//  ESTADÍSTICAS
// ══════════════════════════════════════════════
let statsTab = 'general';
function switchStatsTab(tab, btn) {
    statsTab = tab;
    document.querySelectorAll('#view-stats .page-tab').forEach(b => b.classList.toggle('active', b === btn));
    renderStats(tab);
}

// Cumplimiento = cubiertas (Cerrada/Finalizada) sobre el total, sin contar las Canceladas
function metricas(lista) {
    const validas = lista.filter(b => b.status !== 'Cancelada' && cuentaComoActiva(b));
    const cub = validas.filter(cubierta).length;
    return { total: validas.length, cubiertas: cub, pendientes: validas.length - cub, pct: validas.length ? Math.round(cub / validas.length * 100) : 0 };
}
function agrupar(lista, key) {
    const m = {};
    lista.forEach(b => { const k = (typeof key === 'function' ? key(b) : b[key]) || 'Sin dato'; (m[k] = m[k] || []).push(b); });
    return m;
}
function barrasCumplimiento(grupos, claseFill = '', conFoto = false) {
    const filas = Object.entries(grupos).map(([k, l]) => ({ k, ...metricas(l) })).filter(f => f.total)
        .sort((a, b) => b.pendientes - a.pendientes || a.k.localeCompare(b.k));
    return filas.length ? filas.map(f => `
        <div class="bar-row"><div class="bar-row-top"><span>${conFoto && equipo.some(e => e.nombre === f.k) ? avatarHtml(f.k, 'avatar-barra') : ''}${esc(f.k)}</span>
            <span>${f.cubiertas}/${f.total} · ${f.pct}%${f.pendientes ? ` · <span style="color:var(--red)">${f.pendientes} pend.</span>` : ''}</span></div>
            <div class="bar-track"><div class="bar-fill ${claseFill}" style="width:${f.pct}%"></div></div></div>`).join('')
        : '<span class="tip">Sin datos</span>';
}

// ── Batería por marca: completadas, por ingresar, aperturas y pendientes ──
const SEGMENTOS_BATERIA = [
    { k: 'completadas', lbl: 'Completadas', clase: 'seg-ok' },
    { k: 'ingresar', lbl: 'Pendientes de ingresar', clase: 'seg-ingresar' },
    { k: 'apertura', lbl: 'Pendientes de apertura', clase: 'seg-apertura' },
    { k: 'pendientes', lbl: 'Pendientes', clase: 'seg-pend' }
];
function partesBateria(lista) {
    const v = lista.filter(b => b.status !== 'Cancelada' && cuentaComoActiva(b));
    const r = { total: v.length, completadas: 0, ingresar: 0, apertura: 0, pendientes: 0 };
    v.forEach(b => {
        if (cubierta(b)) r.completadas++;
        else if (tienePersona(b)) r.ingresar++;            // alguien en proceso: zonal, onboarding, huella…
        else if (b.motivo === 'Apertura') r.apertura++;
        else r.pendientes++;
    });
    r.pct = r.total ? Math.round(r.completadas / r.total * 100) : 0;
    return r;
}
const pctDe = (n, t) => t ? Math.round(n / t * 100) : 0;

function bateriaHtml(marca, lista) {
    const r = partesBateria(lista);
    return `<div class="bat-card">
        <div class="bat-card-titulo">${esc(marca)}</div>
        <div class="bateria" role="img" aria-label="${esc(marca)}: ${r.completadas} de ${r.total} completadas">
            <div class="bateria-cuerpo">${SEGMENTOS_BATERIA.filter(s => r[s.k]).map(s =>
                `<div class="bat-seg ${s.clase}" data-ancho="${pctDe(r[s.k], r.total)}" style="width:0" title="${s.lbl}: ${r[s.k]}"></div>`).join('')}
                <div class="bateria-brillo"></div></div>
            <div class="bateria-polo"></div>
        </div>
        <div class="bat-ref">${SEGMENTOS_BATERIA.map(s => `<div class="bat-ref-fila"><span><i class="bat-punto ${s.clase}"></i>${s.lbl}</span>
            <strong>${r[s.k]} · ${pctDe(r[s.k], r.total)}%</strong></div>`).join('')}</div>
        <div class="bat-pie"><strong>${r.completadas} / ${r.total}</strong> vacantes completadas</div>
    </div>`;
}

// Las barras "cargan" de cero hasta su valor
function cargarBaterias(box) {
    requestAnimationFrame(() => requestAnimationFrame(() =>
        box.querySelectorAll('.bat-seg').forEach(s => { s.style.width = s.dataset.ancho + '%'; })));
}

function renderStats(tab) {
    const csvSel = document.getElementById('stats-csv-selector');
    if (csvSel) csvSel.innerHTML = optionsHtml(selectores(), csvSel.value, 'CSV de todos los selectores');
    // Incluye lo que sacó "Limpiar semana": las estadísticas cuentan todo
    const todas = todasLasBusquedas();
    const subset = tab === 'general' ? todas : todas.filter(b => b.marca === tab);
    const r = partesBateria(subset);
    const marcas = tab === 'general' ? MARCAS : [tab];
    const ahora = new Date();
    const corte = `${String(ahora.getDate()).padStart(2, '0')}/${String(ahora.getMonth() + 1).padStart(2, '0')}/${ahora.getFullYear()} ${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;

    // Locales más críticos: más vacantes pendientes (como el Resumen de Tareas grupales)
    const porLocal = Object.entries(agrupar(subset.filter(cuentaComoActiva), 'local')).map(([k, l]) => ({ k, marca: l[0].marca, ...metricas(l) }))
        .filter(x => x.pendientes > 0).sort((a, b) => b.pendientes - a.pendientes).slice(0, 8);

    const box = document.getElementById('stats-content');
    box.innerHTML = `
        <div class="cob-card">
            <div class="cob-titulo">Nivel de cobertura</div>
            <div class="cob-sub">Cada batería representa el total de vacantes de la marca (sin locales excedidos).</div>
            <div class="cob-kpis">
                ${kpiHtml(r.total, 'Total', 'violeta', 'Vacantes activas')}
                ${kpiHtml(r.completadas, 'Cubiertas', 'violeta', `${r.pct}% de cobertura`)}
                ${kpiHtml(r.ingresar, 'Onboarding', 'violeta', 'Ingresos en curso')}
                ${kpiHtml(r.apertura + r.pendientes, 'Pendientes', 'violeta', 'Requieren acción')}
            </div>
            <div class="bat-grid ${marcas.length === 1 ? 'bat-grid-una' : ''}">${marcas.map(m => bateriaHtml(m, subset.filter(b => b.marca === m))).join('')}</div>
            <div class="cob-resumen">
                <div><div class="cob-resumen-tag">Resumen semanal · ${marcas.length === 1 ? esc(marcas[0]) : 'Sabores + Extremas'}</div>
                    <div class="cob-resumen-tit">Estado consolidado del equipo</div>
                    <div class="tip" style="font-style:normal">Corte actualizado: ${corte}</div></div>
                <div class="cob-resumen-num"><strong>${r.completadas} / ${r.total}</strong><span>${r.pct}% de cobertura</span></div>
            </div>
        </div>
        <div class="stats-grid">
            <div class="stat-card"><div class="stat-card-title">Cumplimiento por zona</div>${barrasCumplimiento(agrupar(subset, 'zona'))}</div>
            <div class="stat-card"><div class="stat-card-title">Cumplimiento por selector</div>${barrasCumplimiento(agrupar(subset, 'selector'), '', true)}</div>
            <div class="stat-card"><div class="stat-card-title">Cumplimiento por regional</div>${barrasCumplimiento(agrupar(subset, 'regional'))}</div>
            <div class="stat-card"><div class="stat-card-title">Aperturas vs resto</div>${barrasCumplimiento(agrupar(subset, b => b.motivo === 'Apertura' ? 'Locales en apertura' : 'Locales sin apertura'))}</div>
            <div class="stat-card"><div class="stat-card-title">Locales más críticos</div>
                ${porLocal.length ? porLocal.map(x => `<div class="rank-row"><span class="rank-name">${esc(x.k)} <span style="font-size:11px;color:var(--muted)">· ${esc(x.marca)}</span></span><span class="rank-stat">${x.pendientes} pend.</span><span style="font-size:11px;color:var(--muted);margin-left:6px">${x.pct}%</span></div>`).join('') : '<span class="tip">Sin vacantes pendientes</span>'}
            </div>
        </div>`;
    cargarBaterias(box);
}

// Mismas columnas que la hoja Solicitudes (para pegar en la planilla) + datos del portal
function descargarInformeCSV() {
    const selector = document.getElementById('stats-csv-selector').value;
    const base = todasLasBusquedas().filter(b => !selector || b.selector === selector);
    const headers = ['N°', 'Marca', ...COLUMNAS.map(c => c.t.toUpperCase()), 'Zona', 'Motivo', 'Estado de la vacante', 'Apertura',
        'Enviado al zonal', 'Aprobado por el zonal', 'Fecha de baja', 'Tramo Selección (hd)', 'Tramo Zonal (hd)', 'Espera inicio (hd)', 'Total (hd)',
        'Alerta 72hs zonal', 'Fuera de plazo', 'Reapertura de', 'Nómina del local', 'Detalle de nómina'];
    const rows = base.map(b => {
        const t = tramosDemora(b);
        return [b.numero, b.marca, ...COLUMNAS.map(c => b[c.f]), b.zona, b.motivo, b.status, b.inicio,
            b.enviado_zonal, b.decision_zonal, b.fecha_baja, t.t1, t.t2NA ? '' : t.t2, t.t3NA ? '' : t.t3, t.total,
            alertaZonalVencida(b) ? 'Sí' : 'No', fueraDePlazo(b) ? 'Sí' : 'No', b.reopened_from, b.estado_nomina, b.nomina_detalle];
    });
    descargarCSV(`vacantes${selector ? '_' + selector.toLowerCase().replace(/\s+/g, '-') : ''}_${today()}.csv`, headers, rows);
    toast('CSV descargado ✓');
}

function descargarBaseCSV() {
    const headers = ['Nombre', 'Apellido', 'DNI', 'Teléfono', 'Email', 'Fecha nacimiento', 'Zona', 'Localidad', 'Sede entrevista', 'Fecha entrevista',
        'Puesto de interés', 'Horario', 'Curso manipulación', 'Antecedentes', 'Estado', 'Disponibilidad', 'Vacantes', 'Observaciones', 'ID postulante',
        'CUIL', 'Nacionalidad', 'Tel. emergencia', 'Sugerido para', 'Origen'];
    const rows = postulantes.map(p => [p.nombre, p.apellido, p.dni, p.telefono, p.email, p.fecha_nacimiento, p.zona, p.localidad, p.sede_entrevista, p.fecha_entrevista,
        p.puesto_interes, p.horario, p.curso_manipulacion, p.antecedentes, p.estado, disponibilidad(p),
        vacantesDe(p.id).map(b => `${b.numero} ${b.local} (${b.estado || 'sin estado'})`).join(' | '), p.observaciones, p.id_postulante,
        p.cuil, p.nacionalidad, p.tel_emergencia, p.sugerido_para, p.origen]);
    descargarCSV(`base_postulantes_${today()}.csv`, headers, rows);
    toast('Base descargada ✓');
}
