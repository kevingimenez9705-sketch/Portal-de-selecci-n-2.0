// ══════════════════════════════════════════════
//  GRÁFICOS
// ══════════════════════════════════════════════
let chartInstances = {};
function destroyCharts() { Object.values(chartInstances).forEach(c => { try { c.destroy(); } catch (e) {} }); chartInstances = {}; }
function switchChartsTab(tab, btn) { document.querySelectorAll('#view-charts .page-tab').forEach(b => b.classList.remove('active')); btn.classList.add('active'); renderCharts(tab); }
function renderCharts(tab) { destroyCharts(); if (tab === 'general') renderChartsGeneral(); else if (tab === 'tiempo') renderChartsTiempo(); else if (tab === 'selectores') renderChartsSelectores(); }

function renderChartsGeneral() {
    const cerradas    = busquedas.filter(b => b.status === 'Cerrada' || b.status === 'Finalizada').length;
    const proceso     = busquedas.filter(b => b.status === 'Proceso').length;
    const pausadas    = busquedas.filter(b => b.status === 'Pausada').length;
    const finalizadas = busquedas.filter(b => b.status === 'Finalizada').length;
    const tasaCierre  = Math.round((cerradas / Math.max(busquedas.length, 1)) * 100);
    const totalCands  = busquedas.reduce((a, b) => a + b.candidatos.length, 0);
    const byStatus    = {}; busquedas.forEach(b => { byStatus[b.status] = (byStatus[b.status] || 0) + 1; });
    const staff       = busquedas.filter(b => b.tipo === 'Staff').length;
    const fabrica     = busquedas.filter(b => b.tipo === 'Fábrica').length;
    const byMotivo    = {}; busquedas.forEach(b => { byMotivo[b.motivo] = (byMotivo[b.motivo] || 0) + 1; });
    const byDepto     = {}; busquedas.forEach(b => { byDepto[b.depto]   = (byDepto[b.depto]   || 0) + 1; });
    const byNivel     = {}; busquedas.forEach(b => { byNivel[b.nivel]   = (byNivel[b.nivel]   || 0) + 1; });
    const permData    = busquedas.filter(b => b.ingreso).map(b => ({
        nombre: (b.ingreso_nombre && b.ingreso_nombre.trim()) ? b.ingreso_nombre : (b.puesto || '(sin nombre)'),
        dias: daysDiff(b.ingreso, b.fecha_baja || null), puesto: b.puesto
    })).sort((a, b) => b.dias - a.dias);

    document.getElementById('charts-content').innerHTML = `
    <div class="mini-kpi-row">
        <div class="mini-kpi"><div class="mini-kpi-num">${busquedas.length}</div><div class="mini-kpi-lbl">Total</div><div class="mini-kpi-sub">${proceso} en curso · ${pausadas} pausadas</div></div>
        <div class="mini-kpi"><div class="mini-kpi-num" style="color:var(--green)">${tasaCierre}%</div><div class="mini-kpi-lbl">Tasa de Cierre</div><div class="mini-kpi-sub">${cerradas} de ${busquedas.length}</div></div>
        <div class="mini-kpi"><div class="mini-kpi-num" style="color:var(--orange)">${totalCands}</div><div class="mini-kpi-lbl">Candidatos</div><div class="mini-kpi-sub">⌀ ${(totalCands / Math.max(busquedas.length, 1)).toFixed(1)} por búsqueda</div></div>
        <div class="mini-kpi"><div class="mini-kpi-num" style="color:#92400e">${finalizadas}</div><div class="mini-kpi-lbl">Finalizadas</div><div class="mini-kpi-sub">≥ 90 días háb. en empresa</div></div>
    </div>
    <div class="charts-grid">
        <div class="chart-card"><div class="chart-card-title"><i class="fas fa-circle-half-stroke"></i> Estado del Pipeline</div><div class="chart-wrap"><canvas id="ch-status"></canvas></div></div>
        <div class="chart-card"><div class="chart-card-title"><i class="fas fa-industry"></i> Staff vs Fábrica</div><div class="chart-wrap"><canvas id="ch-tipo"></canvas></div></div>
        <div class="chart-card full"><div class="chart-card-title"><i class="fas fa-building"></i> Por Departamento</div><div class="chart-wrap-lg"><canvas id="ch-depto"></canvas></div></div>
    </div>
    <div class="charts-grid-2">
        <div class="chart-card"><div class="chart-card-title"><i class="fas fa-tag"></i> Por Motivo</div><div class="chart-wrap-sm"><canvas id="ch-motivo"></canvas></div></div>
        <div class="chart-card"><div class="chart-card-title"><i class="fas fa-layer-group"></i> Por Nivel</div><div class="chart-wrap-sm"><canvas id="ch-nivel"></canvas></div></div>
    </div>
    <div style="margin-top:20px">
        <div class="chart-card">
            <div class="chart-card-title"><i class="fas fa-user-clock"></i> Permanencia por Persona (días hábiles en empresa) · ${permData.length} ingresos</div>
            ${permData.length > 0
                ? `<div style="position:relative;height:${Math.max(180, permData.length * 28)}px"><canvas id="ch-perm"></canvas></div>`
                : `<div style="padding:20px;text-align:center;color:var(--muted);font-size:12px">Sin ingresos registrados aún</div>`}
        </div>
    </div>`;

    const palette = ['#1a1714','#005f73','#2d6a4f','#ca6702','#9b2226','#b5a300','#4a1272','#0a367a'];
    const cd = { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { font: { family: 'DM Sans', size: 11 }, color: '#1a1714' } } } };
    chartInstances['status'] = new Chart(document.getElementById('ch-status'), { type: 'doughnut', data: { labels: Object.keys(byStatus), datasets: [{ data: Object.values(byStatus), backgroundColor: ['#cfe2ff','#d1e7dd','#fff3cd','#fef3c7','#f0d9ff'], borderColor: ['#0a367a','#0a3622','#664d03','#92400e','#4a1272'], borderWidth: 2 }] }, options: { ...cd, cutout: '65%' } });
    chartInstances['tipo']   = new Chart(document.getElementById('ch-tipo'),   { type: 'pie',       data: { labels: ['Staff','Fábrica'],    datasets: [{ data: [staff, fabrica], backgroundColor: ['#005f73','#2d6a4f'], borderColor: ['#fff','#fff'], borderWidth: 3 }] }, options: { ...cd } });
    const dl = Object.keys(byDepto).sort((a, b) => byDepto[b] - byDepto[a]);
    chartInstances['depto']  = new Chart(document.getElementById('ch-depto'),  { type: 'bar', data: { labels: dl, datasets: [{ label: 'Búsquedas', data: dl.map(d => byDepto[d]), backgroundColor: dl.map((_, i) => palette[i % palette.length] + 'cc'), borderColor: dl.map((_, i) => palette[i % palette.length]), borderWidth: 2, borderRadius: 6 }] }, options: { ...cd, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } } } });
    chartInstances['motivo'] = new Chart(document.getElementById('ch-motivo'), { type: 'doughnut', data: { labels: Object.keys(byMotivo), datasets: [{ data: Object.values(byMotivo), backgroundColor: ['#cfe2ff','#ffd6a5','#d8f3dc'], borderWidth: 2 }] }, options: { ...cd, cutout: '55%' } });
    chartInstances['nivel']  = new Chart(document.getElementById('ch-nivel'),  { type: 'bar', data: { labels: Object.keys(byNivel), datasets: [{ label: 'Cantidad', data: Object.values(byNivel), backgroundColor: ['#ca6702cc','#005f73cc','#9b2226cc'], borderRadius: 6 }] }, options: { ...cd, plugins: { legend: { display: false } }, indexAxis: 'y', scales: { x: { beginAtZero: true, ticks: { precision: 0 } }, y: { grid: { display: false } } } } });
    if (permData.length > 0) {
        const permColors = permData.map(p => p.dias >= 130 ? '#2d6a4f' : p.dias >= 65 ? '#005f73' : p.dias >= 22 ? '#ca6702' : '#9b2226');
        chartInstances['perm'] = new Chart(document.getElementById('ch-perm'), { type: 'bar', data: { labels: permData.map(p => p.nombre), datasets: [{ label: 'Días hábiles en empresa', data: permData.map(p => p.dias), backgroundColor: permColors.map(c => c + 'cc'), borderColor: permColors, borderWidth: 2, borderRadius: 5 }] }, options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => { const p = permData[ctx.dataIndex]; const m = p.dias >= 130 ? ' 🏆 6m+' : p.dias >= 65 ? ' ✓ 3m+' : p.dias >= 22 ? ' 1m+' : ''; return ` ${p.dias} días háb. en empresa${m}`; }, afterLabel: ctx => ` Puesto: ${permData[ctx.dataIndex].puesto}` } } }, scales: { x: { beginAtZero: true, ticks: { precision: 0, font: { family: 'DM Mono', size: 10 } }, grid: { color: '#e5e0d8' } }, y: { ticks: { font: { family: 'DM Sans', size: 11 } }, grid: { display: false } } } } });
    }
}

function renderChartsTiempo() {
    const cerradas = busquedas.filter(b => (b.status === 'Cerrada' || b.status === 'Finalizada') && b.ingreso);
    const diasList = cerradas.map(b => daysDiff(b.inicio, b.ingreso));
    const avgDias  = diasList.length ? Math.round(diasList.reduce((a, c) => a + c, 0) / diasList.length) : 0;
    const minDias  = diasList.length ? Math.min(...diasList) : 0;
    const maxDias  = diasList.length ? Math.max(...diasList) : 0;
    const rangos   = { '0–7hd': 0, '8–14hd': 0, '15–22hd': 0, '23–30hd': 0, '+30hd': 0 };
    diasList.forEach(d => { if (d <= 7) rangos['0–7hd']++; else if (d <= 14) rangos['8–14hd']++; else if (d <= 22) rangos['15–22hd']++; else if (d <= 30) rangos['23–30hd']++; else rangos['+30hd']++; });
    const bySel = {};
    cerradas.forEach(b => { if (!bySel[b.selector]) bySel[b.selector] = []; bySel[b.selector].push(daysDiff(b.inicio, b.ingreso)); });
    const selAvg = Object.entries(bySel).map(([s, d]) => ({ sel: s, avg: Math.round(d.reduce((a, c) => a + c, 0) / d.length) })).sort((a, b) => a.avg - b.avg);
    const byNivel = {};
    cerradas.forEach(b => { if (!byNivel[b.nivel]) byNivel[b.nivel] = []; byNivel[b.nivel].push(daysDiff(b.inicio, b.ingreso)); });
    const nivelAvg = Object.entries(byNivel).map(([n, d]) => ({ nivel: n, avg: Math.round(d.reduce((a, c) => a + c, 0) / d.length), limite: DEMORA_LIMITE[n] || 15 }));
    document.getElementById('charts-content').innerHTML = `
    <div class="mini-kpi-row">
        <div class="mini-kpi"><div class="mini-kpi-num">${avgDias}hd</div><div class="mini-kpi-lbl">Tiempo promedio</div><div class="mini-kpi-sub">${cerradas.length} búsquedas cerradas</div></div>
        <div class="mini-kpi"><div class="mini-kpi-num" style="color:var(--green)">${minDias}hd</div><div class="mini-kpi-lbl">Más rápida</div></div>
        <div class="mini-kpi"><div class="mini-kpi-num" style="color:var(--red)">${maxDias}hd</div><div class="mini-kpi-lbl">Más lenta</div></div>
        <div class="mini-kpi"><div class="mini-kpi-num" style="color:var(--orange)">${busquedas.filter(b => { const d = daysDiff(b.inicio); return d > (DEMORA_LIMITE[b.nivel] || 15) && b.status === 'Proceso'; }).length}</div><div class="mini-kpi-lbl">Fuera de plazo</div></div>
    </div>
    <div style="font-size:11px;color:var(--muted);margin-bottom:12px;padding:6px 12px;background:var(--surface);border:1px solid var(--border);border-radius:6px;display:inline-block">
        <i class="fas fa-info-circle"></i> Todos los tiempos expresados en <strong>días hábiles (hd)</strong> — lunes a viernes
    </div>
    <div class="charts-grid">
        <div class="chart-card"><div class="chart-card-title"><i class="fas fa-clock"></i> Distribución de Tiempos de Cierre (días hábiles)</div><div class="chart-wrap"><canvas id="ch-dist"></canvas></div></div>
        <div class="chart-card"><div class="chart-card-title"><i class="fas fa-user-clock"></i> Tiempo Prom. por Selector (días hábiles)</div><div class="chart-wrap"><canvas id="ch-seltime"></canvas></div></div>
        <div class="chart-card full"><div class="chart-card-title"><i class="fas fa-layer-group"></i> Tiempo Real vs Límite por Nivel (días hábiles)</div><div class="chart-wrap"><canvas id="ch-nivellib"></canvas></div></div>
    </div>
    <div style="margin-top:20px"><div class="chart-card"><div class="chart-card-title"><i class="fas fa-list-ol"></i> Ranking más rápidas</div>
    <div>${cerradas.sort((a, b) => daysDiff(a.inicio, a.ingreso) - daysDiff(b.inicio, b.ingreso)).slice(0, 6).map((b, i) => { const d = daysDiff(b.inicio, b.ingreso); const lim = DEMORA_LIMITE[b.nivel] || 15; return `<div class="rank-row"><span class="rank-pos">#${i + 1}</span><span class="rank-name">${b.puesto} <span style="font-size:11px;color:var(--muted)">· ${b.selector}</span></span><span class="rank-stat" style="color:${d <= lim ? 'var(--green)' : 'var(--red)'}">${d}hd</span><span style="font-size:11px;color:var(--muted);margin-left:6px">lim. ${lim}hd</span></div>`; }).join('')}</div>
    </div></div>`;
    chartInstances['dist']     = new Chart(document.getElementById('ch-dist'),     { type: 'bar', data: { labels: Object.keys(rangos), datasets: [{ label: 'Búsquedas', data: Object.values(rangos), backgroundColor: ['#d1e7dd','#cfe2ff','#fff3cd','#ffd6a5','#f8d7da'], borderColor: ['#0a3622','#0a367a','#664d03','#7c3d00','#721c24'], borderWidth: 2, borderRadius: 6 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } } } });
    chartInstances['seltime']  = new Chart(document.getElementById('ch-seltime'),  { type: 'bar', data: { labels: selAvg.map(s => s.sel), datasets: [{ label: 'Días háb. promedio', data: selAvg.map(s => s.avg), backgroundColor: selAvg.map(s => s.avg > 14 ? '#f8d7da' : '#d1e7dd'), borderColor: selAvg.map(s => s.avg > 14 ? '#721c24' : '#0a3622'), borderWidth: 2, borderRadius: 6 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } } } });
    chartInstances['nivellib'] = new Chart(document.getElementById('ch-nivellib'), { type: 'bar', data: { labels: nivelAvg.map(n => n.nivel), datasets: [{ label: 'Tiempo real (hd)', data: nivelAvg.map(n => n.avg), backgroundColor: '#005f73cc', borderRadius: 4 }, { label: 'Límite establecido (hd)', data: nivelAvg.map(n => n.limite), backgroundColor: '#9b222633', borderColor: '#9b2226', borderWidth: 2, borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } } } });
}

function renderChartsSelectores() {
    const data = {};
    SELECTORES.forEach(s => { data[s] = { total: 0, cerradas: 0, proceso: 0, candidatos: 0, psico: 0, psico_realizado: 0, dias: [] }; });
    busquedas.forEach(b => {
        if (!data[b.selector]) return;
        data[b.selector].total++;
        if (b.status === 'Cerrada' || b.status === 'Finalizada') { data[b.selector].cerradas++; if (b.ingreso) data[b.selector].dias.push(daysDiff(b.inicio, b.ingreso)); }
        if (b.status === 'Proceso') data[b.selector].proceso++;
        data[b.selector].candidatos += b.candidatos.length;
        data[b.selector].psico += b.psicotecnicos.length;
        b.psicotecnicos.forEach(p => { if (p.selector_psico && data[p.selector_psico]) data[p.selector_psico].psico_realizado++; });
    });
    const activos      = SELECTORES.filter(s => data[s].total > 0);
    const avgDiasPerSel = activos.map(s => data[s].dias.length ? Math.round(data[s].dias.reduce((a, c) => a + c, 0) / data[s].dias.length) : 0);
    document.getElementById('charts-content').innerHTML = `
    <div class="mini-kpi-row">${activos.map(s => `<div class="mini-kpi"><div class="mini-kpi-num">${data[s].total}</div><div class="mini-kpi-lbl">${s}</div><div class="mini-kpi-sub">${data[s].cerradas} cerradas · ${data[s].proceso} en curso</div></div>`).join('')}</div>
    <div class="charts-grid">
        <div class="chart-card"><div class="chart-card-title"><i class="fas fa-briefcase"></i> Búsquedas por Selector</div><div class="chart-wrap"><canvas id="ch-seltotal"></canvas></div></div>
        <div class="chart-card"><div class="chart-card-title"><i class="fas fa-check-circle"></i> Tasa de Cierre</div><div class="chart-wrap"><canvas id="ch-seltasa"></canvas></div></div>
        <div class="chart-card"><div class="chart-card-title"><i class="fas fa-users"></i> Candidatos enviados</div><div class="chart-wrap"><canvas id="ch-selcand"></canvas></div></div>
        <div class="chart-card"><div class="chart-card-title"><i class="fas fa-brain"></i> Psicotécnicos realizados</div><div class="chart-wrap"><canvas id="ch-selpsico"></canvas></div></div>
    </div>
    <div style="margin-top:20px"><div class="chart-card full"><div class="chart-card-title"><i class="fas fa-table"></i> Panel comparativo</div>
        <div style="overflow-x:auto"><table style="width:100%;min-width:700px;border-collapse:collapse">
            <thead><tr>${['Selector','Total','Cerradas','En proceso','Candidatos','Psico en búsqueda','Psico realizados','⌀ días háb. cierre'].map(h => `<th style="padding:10px 14px;font-family:'DM Mono',monospace;font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:1px;color:var(--muted);border-bottom:1px solid var(--border);text-align:left">${h}</th>`).join('')}</tr></thead>
            <tbody>${activos.map((s, i) => `<tr style="background:${i % 2 === 0 ? 'var(--bg)' : 'transparent'}">
                <td style="padding:10px 14px;font-weight:700">${s}</td>
                <td style="padding:10px 14px;font-family:'DM Mono',monospace">${data[s].total}</td>
                <td style="padding:10px 14px;font-family:'DM Mono',monospace;color:var(--green);font-weight:700">${data[s].cerradas}</td>
                <td style="padding:10px 14px;font-family:'DM Mono',monospace;color:var(--blue)">${data[s].proceso}</td>
                <td style="padding:10px 14px;font-family:'DM Mono',monospace;color:var(--orange)">${data[s].candidatos}</td>
                <td style="padding:10px 14px;font-family:'DM Mono',monospace;color:var(--blue)">${data[s].psico}</td>
                <td style="padding:10px 14px;font-family:'DM Mono',monospace;color:var(--blue);font-weight:700">${data[s].psico_realizado || '—'}</td>
                <td style="padding:10px 14px;font-family:'DM Mono',monospace;color:${avgDiasPerSel[i] > 20 ? 'var(--red)' : 'var(--green)'};font-weight:700">${avgDiasPerSel[i] || '—'}hd</td>
            </tr>`).join('')}</tbody>
        </table></div>
    </div></div>`;
    const colors = ['#1a1714','#005f73','#2d6a4f','#ca6702','#9b2226'];
    const cOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0, font: { family: 'DM Mono', size: 10 } }, grid: { color: '#e5e0d8' } }, x: { ticks: { font: { family: 'DM Sans', size: 11 } }, grid: { display: false } } } };
    chartInstances['seltotal'] = new Chart(document.getElementById('ch-seltotal'), { type: 'bar', data: { labels: activos, datasets: [{ label: 'Total',          data: activos.map(s => data[s].total),          backgroundColor: colors.map(c => c + 'cc'), borderColor: colors, borderWidth: 2, borderRadius: 6 }] }, options: cOpts });
    chartInstances['seltasa']  = new Chart(document.getElementById('ch-seltasa'),  { type: 'bar', data: { labels: activos, datasets: [{ label: 'Tasa %',         data: activos.map(s => Math.round((data[s].cerradas / Math.max(data[s].total, 1)) * 100)), backgroundColor: activos.map(s => Math.round((data[s].cerradas / Math.max(data[s].total, 1)) * 100) > 50 ? '#d1e7ddcc' : '#fff3cdcc'), borderColor: activos.map(s => Math.round((data[s].cerradas / Math.max(data[s].total, 1)) * 100) > 50 ? '#0a3622' : '#664d03'), borderWidth: 2, borderRadius: 6 }] }, options: { ...cOpts, scales: { ...cOpts.scales, y: { ...cOpts.scales.y, max: 100 } } } });
    chartInstances['selcand']  = new Chart(document.getElementById('ch-selcand'),  { type: 'bar', data: { labels: activos, datasets: [{ label: 'Candidatos',     data: activos.map(s => data[s].candidatos),     backgroundColor: '#ca6702cc', borderColor: '#ca6702', borderWidth: 2, borderRadius: 6 }] }, options: cOpts });
    chartInstances['selpsico'] = new Chart(document.getElementById('ch-selpsico'), { type: 'bar', data: { labels: activos, datasets: [{ label: 'Psico realizados', data: activos.map(s => data[s].psico_realizado), backgroundColor: '#005f73cc', borderColor: '#005f73', borderWidth: 2, borderRadius: 6 }] }, options: cOpts });
}
