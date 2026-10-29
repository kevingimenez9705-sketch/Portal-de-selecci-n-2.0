// ══════════════════════════════════════════════
//  ESTADÍSTICAS (solo admin) + INFORME
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
    const cands = subset.flatMap(b => b.candidatos);
    const embudo = CAND_ESTADOS.map(e => ({ ...e, n: cands.filter(c => c.estado === e.v).length }));
    const maxEmbudo = Math.max(1, ...embudo.map(e => e.n));

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
                    ${miniNum(cands.length, 'Candidatos colocados')}
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
            <div class="stat-card"><div class="stat-card-title">Candidatos por etapa</div>
                ${embudo.map(e => `<div class="bar-row"><div class="bar-row-top"><span>${e.label}</span><span>${e.n}</span></div><div class="bar-track"><div class="bar-fill ${CAND_SALIDA.includes(e.v) ? 'bar-fill-red' : e.v === 'Ingresó' ? 'bar-fill-green' : 'bar-fill-blue'}" style="width:${Math.round(e.n / maxEmbudo * 100)}%"></div></div></div>`).join('')}
            </div>
        </div>`;
}

// ══════════════════════════════════════════════
//  INFORME — lo que hay que mirar hoy + CSV
// ══════════════════════════════════════════════
function filasCand(estados) {
    const out = [];
    busquedas.filter(vacanteAbierta).forEach(b => b.candidatos.forEach(c => { if (estados.includes(c.estado)) out.push({ c, b, p: postulantesById.get(c.postulante_id) }); }));
    return out;
}

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
    const esperandoZonal = filasCand(['Enviado']).map(x => ({ ...x, dias: Math.max(0, daysDiff(x.c.fecha_envio) - (x.c.demora_descuento_dias || 0)) }))
        .sort((a, b) => b.dias - a.dias);
    const aprobadosSinOnb = filasCand(['Aprobado']);
    const onb = filasCand(['Citado ONB', 'Confirmó ONB']).filter(x => x.c.fecha_onb).sort((a, b) => a.c.fecha_onb.localeCompare(b.c.fecha_onb));
    const onbVencidos = onb.filter(x => x.c.fecha_onb < hoy);
    const abiertas = busquedas.filter(b => b.status === 'Proceso').map(b => ({ b, dias: daysDiff(b.inicio), lim: DEMORA_LIMITE[b.nivel] || 15 })).sort((a, c) => c.dias - a.dias);
    const conIngreso = busquedas.filter(b => b.ingreso);
    const retenidos = conIngreso.filter(b => daysDiff(b.ingreso, b.fecha_baja || null) >= 90).length;

    const seccion = (titulo, sub) => `<div style="margin:26px 0 12px"><div class="section-hdr" style="font-size:12px;letter-spacing:1px">${titulo}</div><div class="tip" style="font-style:normal">${sub}</div></div>`;
    const tdP = p => `<td><strong>${esc(nombrePostulante(p))}</strong>${p?.telefono ? `<div class="cand-meta">${esc(p.telefono)} ${waLink(p.telefono) ? `<a href="${waLink(p.telefono)}" target="_blank" rel="noopener" class="wa-link"><i class="fab fa-whatsapp"></i></a>` : ''}</div>` : ''}</td>`;
    const tdB = b => `<td><button class="link-btn" data-num="${esc(b.numero)}" onclick="verEnPipeline(this.dataset.num)">${esc(b.numero)}</button><div class="cand-meta">${esc(b.local)} · ${esc(b.puesto)}</div></td>`;

    document.getElementById('informe-content').innerHTML = `
    ${seccion('Para hoy', 'Lo que conviene mover primero.')}
    <div class="mini-kpi-row">
        <div class="mini-kpi"><div class="mini-kpi-num" style="color:var(--red)">${busquedas.filter(alertaZonalVencida).length}</div><div class="mini-kpi-lbl">Alertas 72hs zonal</div><div class="mini-kpi-sub">vacantes con candidatos sin respuesta</div></div>
        <div class="mini-kpi"><div class="mini-kpi-num" style="color:var(--orange)">${aprobadosSinOnb.length}</div><div class="mini-kpi-lbl">Aprobados sin citar</div><div class="mini-kpi-sub">falta citarlos a onboarding</div></div>
        <div class="mini-kpi"><div class="mini-kpi-num" style="color:var(--blue)">${onb.length - onbVencidos.length}</div><div class="mini-kpi-lbl">Onboardings agendados</div></div>
        <div class="mini-kpi"><div class="mini-kpi-num" style="color:var(--red)">${onbVencidos.length}</div><div class="mini-kpi-lbl">ONB sin actualizar</div><div class="mini-kpi-sub">ya pasó la fecha</div></div>
        <div class="mini-kpi"><div class="mini-kpi-num" style="color:var(--green)">${conIngreso.length ? Math.round(retenidos / conIngreso.length * 100) : 0}%</div><div class="mini-kpi-lbl">Permanencia 90hd</div><div class="mini-kpi-sub">${retenidos} de ${conIngreso.length} ingresos</div></div>
    </div>

    <div class="charts-grid" style="margin-top:8px">
        <div class="chart-card full">
            <div class="chart-card-title"><i class="fas fa-calendar-check"></i> Onboardings · ${onb.length}</div>
            ${onb.length ? tablaInforme(['Fecha', 'Hora', 'Postulante', 'Vacante', 'Estado', 'Selector'], onb.map(({ c, b, p }) => `<tr class="${c.fecha_onb < hoy ? 'fila-alerta' : ''}">
                <td class="mono">${fmtFecha(c.fecha_onb)}${c.fecha_onb === hoy ? ' <strong>(hoy)</strong>' : ''}</td><td class="mono">${esc(c.hora_onb || '—')}</td>${tdP(p)}${tdB(b)}<td>${esc(c.estado)}</td><td>${esc(b.selector || '—')}</td></tr>`))
            : '<span class="tip">No hay onboardings agendados</span>'}
        </div>
        <div class="chart-card full">
            <div class="chart-card-title"><i class="fas fa-store"></i> Esperando respuesta del zonal · ${esperandoZonal.length}</div>
            ${esperandoZonal.length ? tablaInforme(['Días háb.', 'Postulante', 'Vacante', 'Zonal', 'Selector'], esperandoZonal.map(({ c, b, p, dias }) => `<tr class="${dias >= ALERTA_ZONAL_LIMITE_HD ? 'fila-alerta' : ''}">
                <td class="mono"><strong>${dias}hd</strong></td>${tdP(p)}${tdB(b)}<td>${esc(b.zonal || '—')}</td><td>${esc(b.selector || '—')}</td></tr>`))
            : '<span class="tip">Nadie esperando respuesta del zonal</span>'}
        </div>
        <div class="chart-card full">
            <div class="chart-card-title"><i class="fas fa-user-check"></i> Aprobados por el zonal, sin citar a onboarding · ${aprobadosSinOnb.length}</div>
            ${aprobadosSinOnb.length ? tablaInforme(['Aprobado', 'Postulante', 'Vacante', 'Selector'], aprobadosSinOnb.map(({ c, b, p }) => `<tr>
                <td class="mono">${fmtFecha(c.fecha_decision) || '—'}</td>${tdP(p)}${tdB(b)}<td>${esc(b.selector || '—')}</td></tr>`))
            : '<span class="tip">Sin aprobados pendientes de citar</span>'}
        </div>
        <div class="chart-card full">
            <div class="chart-card-title"><i class="fas fa-hourglass-half"></i> Vacantes abiertas más antiguas · ${abiertas.length}</div>
            ${abiertas.length ? tablaInforme(['N°', 'Local', 'Puesto', 'Selector', 'Días háb.', 'Límite'], abiertas.slice(0, 10).map(({ b, dias, lim }) => `<tr>
                <td><button class="link-btn" data-num="${esc(b.numero)}" onclick="verEnPipeline(this.dataset.num)">${esc(b.numero)}</button></td><td>${esc(b.local)}</td><td>${esc(b.puesto)}</td><td>${esc(b.selector || '—')}</td>
                <td class="mono" style="font-weight:700;color:${dias > lim ? 'var(--red)' : 'var(--text)'}">${dias}hd</td><td class="mono">${lim}hd</td></tr>`))
                + (abiertas.length > 10 ? `<div class="tip" style="margin-top:8px">+ ${abiertas.length - 10} más — están todas en el CSV</div>` : '')
            : '<span class="tip">No hay vacantes en proceso</span>'}
        </div>
    </div>`;
}

function descargarInformeCSV() {
    const selector = document.getElementById('informe-selector-filter').value;
    const base = selector ? busquedas.filter(b => b.selector === selector) : busquedas;
    const headers = ['Número', 'Marca', 'Local', 'Local entrenamiento', 'Zona', 'Regional', 'Zonal', 'Selector', 'Puesto', 'Jornada', 'Nivel', 'Motivo', 'Estado',
        'Apertura', 'Enviado al zonal', 'Decisión del zonal', 'Ingreso', 'Ingresó', 'Fecha baja',
        'Tramo Selección (hd)', 'Tramo Zonal (hd)', 'Espera inicio (hd)', 'Total (hd)', 'Total ajustado (hd)',
        'Candidatos', 'Candidatos en curso', 'Alerta 72hs zonal', 'Fuera de plazo', 'Reapertura de', 'Notas'];
    const rows = base.map(b => {
        const t = tramosDemora(b);
        return [b.numero, b.marca, b.local, b.local_entrenamiento, b.zona, b.regional, b.zonal, b.selector, b.puesto, b.jornada, b.nivel, b.motivo, b.status,
            b.inicio, b.enviado_zonal, b.decision_zonal, b.ingreso, b.ingreso_nombre, b.fecha_baja,
            t.t1, t.t2NA ? '' : t.t2, t.t3NA ? '' : t.t3, t.total, Math.max(0, t.total - descuentoJustificadoTotal(b)),
            b.candidatos.length, b.candidatos.filter(c => CAND_ACTIVOS.includes(c.estado)).length,
            alertaZonalVencida(b) ? 'Sí' : 'No', fueraDePlazo(b) ? 'Sí' : 'No', b.reopened_from, b.notas];
    });
    descargarCSV(`informe_vacantes${selector ? '_' + selector.toLowerCase().replace(/\s+/g, '-') : ''}_${today()}.csv`, headers, rows);
    toast('Informe descargado ✓');
}

function descargarBaseCSV() {
    const mapa = mapaCandidaturas();
    const headers = ['Nombre', 'Apellido', 'DNI', 'Teléfono', 'Email', 'Fecha nacimiento', 'Zona', 'Localidad', 'Sede entrevista', 'Fecha entrevista',
        'Puesto de interés', 'Horario', 'Curso manipulación', 'Antecedentes', 'Estado', 'Disponibilidad', 'Vacantes', 'Observaciones', 'ID postulante'];
    const rows = postulantes.map(p => {
        const cands = mapa.get(p.id) || [];
        return [p.nombre, p.apellido, p.dni, p.telefono, p.email, p.fecha_nacimiento, p.zona, p.localidad, p.sede_entrevista, p.fecha_entrevista,
            p.puesto_interes, p.horario, p.curso_manipulacion, p.antecedentes, p.estado, disponibilidad(cands),
            cands.map(x => `${x.b.numero} ${x.b.local} (${x.c.estado})`).join(' | '), p.observaciones, p.id_postulante];
    });
    descargarCSV(`base_postulantes_${today()}.csv`, headers, rows);
    toast('Base descargada ✓');
}
