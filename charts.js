// ══════════════════════════════════════════════
//  GRÁFICOS (solo admin)
// ══════════════════════════════════════════════
let chartInstances = {};
let chartsTab = 'general';
function destroyCharts() { Object.values(chartInstances).forEach(c => { try { c.destroy(); } catch (e) {} }); chartInstances = {}; }
function switchChartsTab(tab, btn) {
    chartsTab = tab;
    document.querySelectorAll('#view-charts .page-tab').forEach(b => b.classList.toggle('active', b === btn));
    renderCharts(tab);
}
function renderCharts(tab) {
    if (typeof Chart === 'undefined') { document.getElementById('charts-content').innerHTML = '<span class="tip">No se pudo cargar la librería de gráficos (Chart.js). Revisá la conexión y recargá.</span>'; return; }
    destroyCharts();
    if (tab === 'tiempo') renderChartsTiempo();
    else if (tab === 'selectores') renderChartsSelectores();
    else renderChartsGeneral();
}

const C_OK = '#2d6a4f', C_PEND = '#9b2226', C_BLUE = '#005f73', C_ORANGE = '#ca6702', C_MUTED = '#7a7166';
const promedio = l => l.length ? Math.round(l.reduce((a, c) => a + c, 0) / l.length) : 0;
const optsBase = { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { font: { family: 'DM Sans', size: 11 } } } } };
const optsBar = (extra = {}) => ({ ...optsBase, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } }, ...extra });
const optsBarApilado = () => ({ ...optsBase, scales: { y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } }, x: { stacked: true, grid: { display: false } } } });
function nuevoChart(id, config) { chartInstances[id] = new Chart(document.getElementById(id), config); }

function renderChartsGeneral() {
    const validas = busquedas.filter(b => b.status !== 'Cancelada');
    const m = metricas(busquedas);
    const cands = busquedas.flatMap(b => b.candidatos);
    const ingresos = busquedas.filter(b => b.ingreso);
    const retenidos = ingresos.filter(b => daysDiff(b.ingreso, b.fecha_baja || null) >= 90).length;

    const porGrupo = key => {
        const g = agrupar(validas, key);
        const labels = Object.keys(g).sort();
        return { labels, cub: labels.map(k => g[k].filter(cubierta).length), pend: labels.map(k => g[k].filter(b => !cubierta(b)).length) };
    };
    const marca = porGrupo('marca'), zona = porGrupo('zona');
    const byMotivo = {}; validas.forEach(b => { byMotivo[b.motivo] = (byMotivo[b.motivo] || 0) + 1; });

    // Últimos 12 meses: vacantes abiertas vs ingresos
    const hoy = new Date(), meses = [];
    for (let i = 11; i >= 0; i--) {
        const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
        meses.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' }) });
    }
    const contarMes = campo => meses.map(mm => busquedas.filter(b => (b[campo] || '').slice(0, 7) === mm.key).length);

    const permRangos = { '0–21hd': 0, '22–64hd': 0, '65–89hd': 0, '90hd+ (cumplió)': 0 };
    ingresos.forEach(b => {
        const d = daysDiff(b.ingreso, b.fecha_baja || null);
        if (d < 22) permRangos['0–21hd']++; else if (d < 65) permRangos['22–64hd']++; else if (d < 90) permRangos['65–89hd']++; else permRangos['90hd+ (cumplió)']++;
    });

    document.getElementById('charts-content').innerHTML = `
    <div class="mini-kpi-row">
        <div class="mini-kpi"><div class="mini-kpi-num">${m.total}</div><div class="mini-kpi-lbl">Vacantes</div><div class="mini-kpi-sub">${busquedas.filter(b => b.status === 'Proceso').length} en proceso</div></div>
        <div class="mini-kpi"><div class="mini-kpi-num" style="color:var(--green)">${m.pct}%</div><div class="mini-kpi-lbl">Cumplimiento</div><div class="mini-kpi-sub">${m.cubiertas} de ${m.total}</div></div>
        <div class="mini-kpi"><div class="mini-kpi-num" style="color:var(--orange)">${cands.length}</div><div class="mini-kpi-lbl">Candidatos colocados</div><div class="mini-kpi-sub">⌀ ${(cands.length / Math.max(m.total, 1)).toFixed(1)} por vacante</div></div>
        <div class="mini-kpi"><div class="mini-kpi-num" style="color:var(--blue)">${ingresos.length ? Math.round(retenidos / ingresos.length * 100) : 0}%</div><div class="mini-kpi-lbl">Permanencia 90hd</div><div class="mini-kpi-sub">${retenidos} de ${ingresos.length} ingresos</div></div>
    </div>
    <div class="charts-grid">
        <div class="chart-card"><div class="chart-card-title"><i class="fas fa-tags"></i> Cubiertas vs pendientes por marca</div><div class="chart-wrap"><canvas id="ch-marca"></canvas></div></div>
        <div class="chart-card"><div class="chart-card-title"><i class="fas fa-map-marker-alt"></i> Cubiertas vs pendientes por zona</div><div class="chart-wrap"><canvas id="ch-zona"></canvas></div></div>
        <div class="chart-card"><div class="chart-card-title"><i class="fas fa-tag"></i> Por motivo</div><div class="chart-wrap"><canvas id="ch-motivo"></canvas></div></div>
        <div class="chart-card"><div class="chart-card-title"><i class="fas fa-filter"></i> Candidatos por etapa</div><div class="chart-wrap"><canvas id="ch-embudo"></canvas></div></div>
        <div class="chart-card full"><div class="chart-card-title"><i class="fas fa-chart-line"></i> Evolución mensual — vacantes abiertas vs ingresos (12 meses)</div><div class="chart-wrap"><canvas id="ch-evolucion"></canvas></div></div>
        <div class="chart-card full"><div class="chart-card-title"><i class="fas fa-user-clock"></i> Permanencia de los ingresos (días hábiles) · ${ingresos.length}</div>
            ${ingresos.length ? '<div class="chart-wrap"><canvas id="ch-perm"></canvas></div>' : '<span class="tip">Sin ingresos todavía</span>'}</div>
    </div>`;

    const apilado = (id, g) => nuevoChart(id, { type: 'bar', data: { labels: g.labels, datasets: [
        { label: 'Cubiertas', data: g.cub, backgroundColor: C_OK + 'cc', borderRadius: 4 },
        { label: 'Pendientes', data: g.pend, backgroundColor: C_PEND + 'cc', borderRadius: 4 }] }, options: optsBarApilado() });
    apilado('ch-marca', marca);
    apilado('ch-zona', zona);
    nuevoChart('ch-motivo', { type: 'doughnut', data: { labels: Object.keys(byMotivo), datasets: [{ data: Object.values(byMotivo), backgroundColor: ['#ffd6a5', '#e2d6f5', '#cfe2ff', '#d8f3dc'], borderWidth: 2 }] }, options: { ...optsBase, cutout: '55%' } });
    nuevoChart('ch-embudo', { type: 'bar', data: { labels: CAND_ESTADOS.map(e => e.v), datasets: [{ label: 'Candidatos', data: CAND_ESTADOS.map(e => cands.filter(c => c.estado === e.v).length),
        backgroundColor: CAND_ESTADOS.map(e => CAND_SALIDA.includes(e.v) ? C_PEND + 'cc' : e.v === 'Ingresó' ? C_OK + 'cc' : C_BLUE + 'cc'), borderRadius: 4 }] },
        options: { ...optsBar(), indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } }, y: { grid: { display: false } } } } });
    nuevoChart('ch-evolucion', { type: 'line', data: { labels: meses.map(mm => mm.label), datasets: [
        { label: 'Vacantes abiertas', data: contarMes('inicio'), borderColor: C_BLUE, backgroundColor: C_BLUE + '33', borderWidth: 2, tension: .3, fill: true },
        { label: 'Ingresos', data: contarMes('ingreso'), borderColor: C_OK, backgroundColor: C_OK + '33', borderWidth: 2, tension: .3, fill: true }] }, options: optsBar() });
    if (ingresos.length) nuevoChart('ch-perm', { type: 'bar', data: { labels: Object.keys(permRangos), datasets: [{ label: 'Personas', data: Object.values(permRangos), backgroundColor: ['#f8d7dacc', '#ffe1b3cc', '#fff3cdcc', '#d1e7ddcc'], borderRadius: 6 }] }, options: { ...optsBar(), plugins: { legend: { display: false } } } });
}

function renderChartsTiempo() {
    const cerradas = busquedas.filter(b => cubierta(b) && b.ingreso);
    const diasCierre = cerradas.map(b => daysDiff(b.inicio, b.ingreso));
    const enTiempo = cerradas.filter(b => daysDiff(b.inicio, b.ingreso) <= (DEMORA_LIMITE[b.nivel] || 15)).length;
    const rangos = { '0–5hd': 0, '6–10hd': 0, '11–15hd': 0, '16–30hd': 0, '+30hd': 0 };
    diasCierre.forEach(d => { if (d <= 5) rangos['0–5hd']++; else if (d <= 10) rangos['6–10hd']++; else if (d <= 15) rangos['11–15hd']++; else if (d <= 30) rangos['16–30hd']++; else rangos['+30hd']++; });

    // Cuánto de la demora es del equipo (envío al zonal), del zonal (decisión) y de la espera de inicio
    const porTramo = key => {
        const g = agrupar(busquedas, key);
        const labels = Object.keys(g).sort();
        const prom = (l, f) => promedio(l.map(tramosDemora).filter(f.ok).map(f.val));
        return {
            labels,
            t1: labels.map(k => prom(g[k], { ok: t => !t.t1Run, val: t => t.t1 })),
            t2: labels.map(k => prom(g[k], { ok: t => !t.t2NA && !t.t2Run, val: t => t.t2 })),
            t3: labels.map(k => prom(g[k], { ok: t => !t.t3NA && !t.t3Run, val: t => t.t3 }))
        };
    };
    const sel = porTramo('selector'), zona = porTramo('zona');
    const ranking = [...cerradas].sort((a, b) => daysDiff(b.inicio, b.ingreso) - daysDiff(a.inicio, a.ingreso)).slice(0, 6);

    document.getElementById('charts-content').innerHTML = `
    <div class="mini-kpi-row">
        <div class="mini-kpi"><div class="mini-kpi-num">${promedio(diasCierre)}hd</div><div class="mini-kpi-lbl">Tiempo promedio de cierre</div><div class="mini-kpi-sub">${cerradas.length} vacantes cubiertas</div></div>
        <div class="mini-kpi"><div class="mini-kpi-num" style="color:var(--green)">${diasCierre.length ? Math.min(...diasCierre) : 0}hd</div><div class="mini-kpi-lbl">Más rápida</div></div>
        <div class="mini-kpi"><div class="mini-kpi-num" style="color:var(--red)">${diasCierre.length ? Math.max(...diasCierre) : 0}hd</div><div class="mini-kpi-lbl">Más lenta</div></div>
        <div class="mini-kpi"><div class="mini-kpi-num" style="color:var(--green)">${cerradas.length ? Math.round(enTiempo / cerradas.length * 100) : 0}%</div><div class="mini-kpi-lbl">Cubiertas en plazo</div><div class="mini-kpi-sub">${enTiempo} en plazo · ${cerradas.length - enTiempo} excedidas</div></div>
    </div>
    <div class="tip-box"><i class="fas fa-info-circle"></i> Todo en <strong>días hábiles (hd)</strong>, lunes a viernes.</div>
    <div class="charts-grid">
        <div class="chart-card full"><div class="chart-card-title"><i class="fas fa-people-arrows"></i> Demora promedio por tramo y selector: Selección · Zonal · Inicio</div><div class="chart-wrap"><canvas id="ch-tramos-sel"></canvas></div></div>
        <div class="chart-card full"><div class="chart-card-title"><i class="fas fa-map-marker-alt"></i> Demora promedio por tramo y zona</div><div class="chart-wrap"><canvas id="ch-tramos-zona"></canvas></div></div>
        <div class="chart-card"><div class="chart-card-title"><i class="fas fa-clock"></i> Distribución de tiempos de cierre</div><div class="chart-wrap"><canvas id="ch-dist"></canvas></div></div>
        <div class="chart-card"><div class="chart-card-title"><i class="fas fa-triangle-exclamation"></i> Cierres más lentos</div>
            ${ranking.length ? ranking.map((b, i) => `<div class="rank-row"><span class="rank-pos">#${i + 1}</span><span class="rank-name">${esc(b.local)} <span style="font-size:11px;color:var(--muted)">· ${esc(b.puesto)} · ${esc(b.selector || '—')}</span></span><span class="rank-stat">${daysDiff(b.inicio, b.ingreso)}hd</span></div>`).join('') : '<span class="tip">Sin vacantes cubiertas todavía</span>'}
        </div>
    </div>`;

    const tramos = (id, g) => nuevoChart(id, { type: 'bar', data: { labels: g.labels, datasets: [
        { label: 'Selección (envío al zonal)', data: g.t1, backgroundColor: C_BLUE + 'cc', borderRadius: 4 },
        { label: 'Zonal (decisión)', data: g.t2, backgroundColor: C_ORANGE + 'cc', borderRadius: 4 },
        { label: 'Espera de inicio', data: g.t3, backgroundColor: C_OK + 'cc', borderRadius: 4 }] }, options: optsBar() });
    tramos('ch-tramos-sel', sel);
    tramos('ch-tramos-zona', zona);
    nuevoChart('ch-dist', { type: 'bar', data: { labels: Object.keys(rangos), datasets: [{ label: 'Vacantes', data: Object.values(rangos), backgroundColor: ['#d1e7dd', '#cfe2ff', '#fff3cd', '#ffd6a5', '#f8d7da'], borderRadius: 6 }] }, options: { ...optsBar(), plugins: { legend: { display: false } } } });
}

function renderChartsSelectores() {
    const nombres = [...new Set([...selectores(), ...busquedas.map(b => b.selector).filter(Boolean)])];
    const data = nombres.map(s => {
        const l = busquedas.filter(b => b.selector === s);
        const mm = metricas(l);
        const cands = l.flatMap(b => b.candidatos);
        return {
            s, ...mm,
            proceso: l.filter(b => b.status === 'Proceso').length,
            cands: cands.length,
            ingresos: cands.filter(c => c.estado === 'Ingresó').length,
            rechazados: cands.filter(c => c.estado === 'Rechazado').length,
            alertas: l.filter(alertaZonalVencida).length,
            fuera: l.filter(fueraDePlazo).length,
            cierre: promedio(l.filter(b => cubierta(b) && b.ingreso).map(b => daysDiff(b.inicio, b.ingreso)))
        };
    }).filter(d => d.total || d.cands);

    document.getElementById('charts-content').innerHTML = `
    <div class="mini-kpi-row">${data.map(d => `<div class="mini-kpi" style="border-top:3px solid ${colorDe(d.s)}"><div class="mini-kpi-num">${d.total}</div><div class="mini-kpi-lbl">${esc(d.s)}</div><div class="mini-kpi-sub">${d.cubiertas} cubiertas · ${d.proceso} en proceso</div></div>`).join('') || '<span class="tip">Sin datos por selector</span>'}</div>
    <div class="charts-grid">
        <div class="chart-card"><div class="chart-card-title"><i class="fas fa-check-circle"></i> Cumplimiento %</div><div class="chart-wrap"><canvas id="ch-sel-pct"></canvas></div></div>
        <div class="chart-card"><div class="chart-card-title"><i class="fas fa-users"></i> Candidatos colocados vs ingresos</div><div class="chart-wrap"><canvas id="ch-sel-cand"></canvas></div></div>
    </div>
    <div class="chart-card" style="margin-top:20px"><div class="chart-card-title"><i class="fas fa-table"></i> Panel comparativo</div>
        ${tablaInforme(['Selector', 'Vacantes', 'Cubiertas', 'En proceso', 'Cumplimiento', 'Candidatos', 'Ingresos', 'Rechazados zonal', 'Alertas 72hs', 'Fuera de plazo', '⌀ cierre'],
            data.map(d => `<tr><td><strong>${esc(d.s)}</strong></td><td class="mono">${d.total}</td><td class="mono" style="color:var(--green);font-weight:700">${d.cubiertas}</td><td class="mono">${d.proceso}</td>
                <td class="mono" style="font-weight:700;color:${d.pct >= 70 ? 'var(--green)' : 'var(--red)'}">${d.pct}%</td><td class="mono">${d.cands}</td><td class="mono">${d.ingresos}</td><td class="mono">${d.rechazados}</td>
                <td class="mono" style="color:${d.alertas ? 'var(--red)' : 'var(--muted)'}">${d.alertas}</td><td class="mono" style="color:${d.fuera ? 'var(--red)' : 'var(--muted)'}">${d.fuera}</td><td class="mono">${d.cierre ? d.cierre + 'hd' : '—'}</td></tr>`))}
    </div>`;

    if (!data.length) return;
    nuevoChart('ch-sel-pct', { type: 'bar', data: { labels: data.map(d => d.s), datasets: [{ label: '%', data: data.map(d => d.pct), backgroundColor: data.map(d => colorDe(d.s) + 'cc'), borderRadius: 6 }] },
        options: { ...optsBar(), plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100 }, x: { grid: { display: false } } } } });
    nuevoChart('ch-sel-cand', { type: 'bar', data: { labels: data.map(d => d.s), datasets: [
        { label: 'Colocados', data: data.map(d => d.cands), backgroundColor: C_ORANGE + 'cc', borderRadius: 4 },
        { label: 'Ingresaron', data: data.map(d => d.ingresos), backgroundColor: C_OK + 'cc', borderRadius: 4 }] }, options: optsBar() });
}
