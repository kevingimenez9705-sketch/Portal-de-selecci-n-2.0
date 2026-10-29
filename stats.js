// ══════════════════════════════════════════════
//  ESTADÍSTICAS + INFORME
// ══════════════════════════════════════════════
let statsTab = 'general';
function switchStatsTab(tab, btn) {
    statsTab = tab;
    document.querySelectorAll('#view-stats .page-tab').forEach(b => b.classList.toggle('active', b === btn));
    renderStats(tab);
}

// Cumplimiento = cubiertas (Cerrada/Finalizada) sobre el total, sin contar las Canceladas
function metricas(lista) {
    const validas = lista.filter(b => b.status !== 'Cancelada');
    const cub = validas.filter(cubierta).length;
    return { total: validas.length, cubiertas: cub, pendientes: validas.length - cub, pct: validas.length ? Math.round(cub / validas.length * 100) : 0 };
}
function agrupar(lista, key) {
    const m = {};
    lista.forEach(b => { const k = (typeof key === 'function' ? key(b) : b[key]) || 'Sin dato'; (m[k] = m[k] || []).push(b); });
    return m;
}
function barrasCumplimiento(grupos, claseFill = '') {
    const filas = Object.entries(grupos).map(([k, l]) => ({ k, ...metricas(l) })).filter(f => f.total)
        .sort((a, b) => b.pendientes - a.pendientes || a.k.localeCompare(b.k));
    return filas.length ? filas.map(f => `
        <div class="bar-row"><div class="bar-row-top"><span>${esc(f.k)}</span>
            <span>${f.cubiertas}/${f.total} · ${f.pct}%${f.pendientes ? ` · <span style="color:var(--red)">${f.pendientes} pend.</span>` : ''}</span></div>
            <div class="bar-track"><div class="bar-fill ${claseFill}" style="width:${f.pct}%"></div></div></div>`).join('')
        : '<span class="tip">Sin datos</span>';
}
const miniNum = (n, lbl, color = '') => `<div class="stat-mini"><div class="stat-mini-num" style="${color ? 'color:' + color : ''}">${n}</div><div class="stat-mini-lbl">${lbl}</div></div>`;

function renderStats(tab) {
    const subset = tab === 'general' ? busquedas : busquedas.filter(b => b.marca === tab);
    const m = metricas(subset);
    const abiertas = subset.filter(vacanteAbierta);
    // Vacantes abiertas por ESTADO de la planilla (dónde está trabado el circuito)
    const porEstado = [{ e: 'Sin persona', n: abiertas.filter(b => !tienePersona(b)).length, c: 'bar-fill-gris' },
        { e: 'Sin estado (con persona)', n: abiertas.filter(b => tienePersona(b) && !b.estado).length, c: 'bar-fill-gris' },
        ...ESTADOS_SOLICITUD.map(e => ({ e, n: abiertas.filter(b => b.estado === e).length, c: e === 'RECHAZADO ZONAL' ? 'bar-fill-red' : e === 'COMUNICADO' ? 'bar-fill-green' : 'bar-fill-blue' }))];
    const maxEstado = Math.max(1, ...porEstado.map(x => x.n));

    // Locales más críticos: más vacantes pendientes (como el Resumen de Tareas grupales)
    const porLocal = Object.entries(agrupar(subset, 'local')).map(([k, l]) => ({ k, marca: l[0].marca, ...metricas(l) }))
        .filter(x => x.pendientes > 0).sort((a, b) => b.pendientes - a.pendientes).slice(0, 8);

    document.getElementById('stats-content').innerHTML = `
        <div class="stats-grid">
            <div class="stat-card"><div class="stat-card-title">Resumen</div>
                <div class="stat-mini-grid">
                    ${miniNum(m.total, 'Vacantes')}
                    ${miniNum(m.cubiertas, 'Cubiertas', 'var(--green)')}
                    ${miniNum(m.pendientes, 'Pendientes', 'var(--red)')}
                    ${miniNum(m.pct + '%', 'Cumplimiento', 'var(--blue)')}
                    ${miniNum(subset.filter(b => b.motivo === 'Apertura').length, 'De aperturas', 'var(--orange)')}
                    ${miniNum(abiertas.filter(b => !tienePersona(b)).length, 'Sin persona')}
                </div>
            </div>
            ${tab === 'general' ? `<div class="stat-card"><div class="stat-card-title">Cumplimiento por marca</div>${barrasCumplimiento(agrupar(subset, 'marca'))}</div>` : ''}
            <div class="stat-card"><div class="stat-card-title">Cumplimiento por zona</div>${barrasCumplimiento(agrupar(subset, 'zona'), 'bar-fill-blue')}</div>
            <div class="stat-card"><div class="stat-card-title">Cumplimiento por selector</div>${barrasCumplimiento(agrupar(subset, 'selector'), 'bar-fill-green')}</div>
            <div class="stat-card"><div class="stat-card-title">Cumplimiento por regional</div>${barrasCumplimiento(agrupar(subset, 'regional'))}</div>
            <div class="stat-card"><div class="stat-card-title">Aperturas vs resto</div>${barrasCumplimiento(agrupar(subset, b => b.motivo === 'Apertura' ? 'Locales en apertura' : 'Locales sin apertura'), 'bar-fill-orange')}</div>
            <div class="stat-card"><div class="stat-card-title"><i class="fas fa-fire" style="color:var(--red);margin-right:5px"></i>Locales más críticos</div>
                ${porLocal.length ? porLocal.map(x => `<div class="rank-row"><span class="rank-name">${esc(x.k)} <span style="font-size:11px;color:var(--muted)">· ${esc(x.marca)}</span></span><span class="rank-stat" style="color:var(--red)">${x.pendientes} pend.</span><span style="font-size:11px;color:var(--muted);margin-left:6px">${x.pct}%</span></div>`).join('') : '<span class="tip">Sin vacantes pendientes</span>'}
            </div>
            <div class="stat-card"><div class="stat-card-title">Vacantes abiertas por estado</div>
                ${porEstado.map(x => `<div class="bar-row"><div class="bar-row-top"><span>${esc(x.e)}</span><span>${x.n}</span></div><div class="bar-track"><div class="bar-fill ${x.c}" style="width:${Math.round(x.n / maxEstado * 100)}%"></div></div></div>`).join('')}
            </div>
        </div>`;
}

// ══════════════════════════════════════════════
//  INFORME — lo que hay que mover hoy + CSV
// ══════════════════════════════════════════════
function tablaInforme(headers, filas) {
    return `<div style="overflow-x:auto"><table class="tabla-informe">
        <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${filas.join('')}</tbody></table></div>`;
}

function renderInforme() {
    const sel = document.getElementById('informe-selector-filter');
    const cur = sel.value;
    sel.innerHTML = optionsHtml(selectores(), cur, 'Todos los selectores');

    const hoy = today();
    const abiertas = busquedas.filter(vacanteAbierta);
    const esperandoZonal = abiertas.filter(b => b.estado === 'ENVIADO A ZONAL')
        .map(b => ({ b, dias: b.fecha_estado ? daysDiff(b.fecha_estado) : 0 })).sort((a, c) => c.dias - a.dias);
    const aprobadosSinCitar = abiertas.filter(b => b.estado === 'APROBADO ZONAL');
    const citados = abiertas.filter(b => b.estado === 'CITADO' && b.fecha_citacion).sort((a, c) => a.fecha_citacion.localeCompare(c.fecha_citacion));
    const citadosVencidos = citados.filter(b => b.fecha_citacion < hoy);
    const sinPersona = abiertas.filter(b => !tienePersona(b)).map(b => ({ b, dias: daysDiff(b.inicio) })).sort((a, c) => c.dias - a.dias);
    const conIngreso = busquedas.filter(b => b.ingreso && cubierta(b));
    const retenidos = conIngreso.filter(b => daysDiff(b.ingreso, b.fecha_baja || null) >= 90).length;

    const seccion = (titulo, sub) => `<div style="margin:26px 0 12px"><div class="section-hdr" style="font-size:12px;letter-spacing:1px">${titulo}</div><div class="tip" style="font-style:normal">${sub}</div></div>`;
    const tdP = b => `<td><strong>${esc(nombreCompleto(b) || '—')}</strong>${b.tel ? `<div class="cand-meta">${esc(b.tel)} ${waLink(b.tel) ? `<a href="${waLink(b.tel)}" target="_blank" rel="noopener" class="wa-link"><i class="fab fa-whatsapp"></i></a>` : ''}</div>` : ''}</td>`;
    const tdB = b => `<td><button class="link-btn" data-num="${esc(b.numero)}" onclick="verEnPipeline(this.dataset.num)">${esc(b.numero)}</button><div class="cand-meta">${esc(b.local)} · ${esc(b.puesto)}</div></td>`;

    document.getElementById('informe-content').innerHTML = `
    ${seccion('Para hoy', 'Lo que conviene mover primero.')}
    <div class="kpi-row">
        ${kpiHtml(busquedas.filter(alertaZonalVencida).length, 'Alertas 72hs zonal', 'rosa', 'enviados sin respuesta')}
        ${kpiHtml(aprobadosSinCitar.length, 'Aprobados sin citar', 'ambar', 'falta citarlos a onboarding')}
        ${kpiHtml(citados.length - citadosVencidos.length, 'Citados', 'azul', 'onboarding agendado')}
        ${kpiHtml(citadosVencidos.length, 'Citados sin actualizar', 'rosa', 'ya pasó la fecha')}
        ${kpiHtml(sinPersona.length, 'Vacantes sin persona', 'gris')}
        ${kpiHtml((conIngreso.length ? Math.round(retenidos / conIngreso.length * 100) : 0) + '%', 'Permanencia 90hd', 'verde', `${retenidos} de ${conIngreso.length} ingresos`)}
    </div>

    <div class="charts-grid" style="margin-top:8px">
        <div class="chart-card">
            <div class="chart-card-title"><i class="fas fa-calendar-check"></i> Citados a onboarding · ${citados.length}</div>
            ${citados.length ? tablaInforme(['Fecha', 'Hora', 'Persona', 'Vacante', 'Primer día', 'Selector'], citados.map(b => `<tr class="${b.fecha_citacion < hoy ? 'fila-alerta' : ''}">
                <td class="mono">${fmtFecha(b.fecha_citacion)}${b.fecha_citacion === hoy ? ' <strong>(hoy)</strong>' : ''}</td><td class="mono">${esc(b.hora_citacion || '—')}</td>${tdP(b)}${tdB(b)}<td class="mono">${fmtFecha(b.ingreso) || '—'}</td><td>${esc(b.selector || '—')}</td></tr>`))
            : '<span class="tip">No hay nadie citado</span>'}
        </div>
        <div class="chart-card">
            <div class="chart-card-title"><i class="fas fa-store"></i> Enviados al zonal, esperando respuesta · ${esperandoZonal.length}</div>
            ${esperandoZonal.length ? tablaInforme(['Días háb.', 'Persona', 'Vacante', 'Zonal', 'Selector'], esperandoZonal.map(({ b, dias }) => `<tr class="${dias >= ALERTA_ZONAL_LIMITE_HD ? 'fila-alerta' : ''}">
                <td class="mono"><strong>${dias}hd</strong></td>${tdP(b)}${tdB(b)}<td>${esc(b.zonal || '—')}</td><td>${esc(b.selector || '—')}</td></tr>`))
            : '<span class="tip">Nadie esperando respuesta del zonal</span>'}
        </div>
        <div class="chart-card">
            <div class="chart-card-title"><i class="fas fa-user-check"></i> Aprobados por el zonal, sin citar · ${aprobadosSinCitar.length}</div>
            ${aprobadosSinCitar.length ? tablaInforme(['Aprobado', 'Persona', 'Vacante', 'Selector'], aprobadosSinCitar.map(b => `<tr>
                <td class="mono">${fmtFecha(b.fecha_estado) || '—'}</td>${tdP(b)}${tdB(b)}<td>${esc(b.selector || '—')}</td></tr>`))
            : '<span class="tip">Sin aprobados pendientes de citar</span>'}
        </div>
        <div class="chart-card">
            <div class="chart-card-title"><i class="fas fa-hourglass-half"></i> Vacantes sin persona, de la más vieja a la más nueva · ${sinPersona.length}</div>
            ${sinPersona.length ? tablaInforme(['N°', 'Local', 'Puesto', 'Selector', 'Días háb.', 'Límite'], sinPersona.slice(0, 15).map(({ b, dias }) => `<tr>
                <td><button class="link-btn" data-num="${esc(b.numero)}" onclick="verEnPipeline(this.dataset.num)">${esc(b.numero)}</button></td><td>${esc(b.local)}</td><td>${esc(b.puesto)}</td><td>${esc(b.selector || '—')}</td>
                <td class="mono" style="font-weight:700;color:${dias > limiteDe(b) ? 'var(--red)' : 'var(--ink)'}">${dias}hd</td><td class="mono">${limiteDe(b)}hd</td></tr>`))
                + (sinPersona.length > 15 ? `<div class="tip" style="margin-top:8px">+ ${sinPersona.length - 15} más — están todas en el CSV</div>` : '')
            : '<span class="tip">Todas las vacantes abiertas tienen a alguien</span>'}
        </div>
    </div>`;
}

// Mismas columnas que la hoja Solicitudes (para pegar en la planilla) + datos del portal
function descargarInformeCSV() {
    const selector = document.getElementById('informe-selector-filter').value;
    const base = selector ? busquedas.filter(b => b.selector === selector) : busquedas;
    const headers = ['N°', 'Marca', ...COLUMNAS.map(c => c.t.toUpperCase()), 'Zona', 'Motivo', 'Estado de la vacante', 'Apertura',
        'Enviado al zonal', 'Aprobado por el zonal', 'Fecha de baja', 'Tramo Selección (hd)', 'Tramo Zonal (hd)', 'Espera inicio (hd)', 'Total (hd)',
        'Alerta 72hs zonal', 'Fuera de plazo', 'Reapertura de'];
    const rows = base.map(b => {
        const t = tramosDemora(b);
        return [b.numero, b.marca, ...COLUMNAS.map(c => b[c.f]), b.zona, b.motivo, b.status, b.inicio,
            b.enviado_zonal, b.decision_zonal, b.fecha_baja, t.t1, t.t2NA ? '' : t.t2, t.t3NA ? '' : t.t3, t.total,
            alertaZonalVencida(b) ? 'Sí' : 'No', fueraDePlazo(b) ? 'Sí' : 'No', b.reopened_from];
    });
    descargarCSV(`vacantes${selector ? '_' + selector.toLowerCase().replace(/\s+/g, '-') : ''}_${today()}.csv`, headers, rows);
    toast('Informe descargado ✓');
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
