// ══════════════════════════════════════════════
//  ESTADÍSTICAS
// ══════════════════════════════════════════════
function switchStatsTab(tab, btn) {
    document.querySelectorAll('#view-stats .page-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active'); renderStats(tab);
}

function renderStats(tab) {
    const subset = tab === 'general' ? busquedas : busquedas.filter(b => b.tipo === (tab === 'staff' ? 'Staff' : 'Fábrica'));
    const total = subset.length || 1;
    const bySelector = {};
    subset.forEach(b => {
        if (!bySelector[b.selector]) bySelector[b.selector] = { total: 0, cerradas: 0, dias: [] };
        bySelector[b.selector].total++;
        if (b.status === 'Cerrada' || b.status === 'Finalizada') bySelector[b.selector].cerradas++;
        bySelector[b.selector].dias.push(b.cp ? daysDiff(b.inicio, b.cp) : (b.ingreso ? daysDiff(b.inicio, b.ingreso) : daysDiff(b.inicio)));
    });
    const byDepto  = {}; subset.forEach(b => { byDepto[b.depto]   = (byDepto[b.depto]   || 0) + 1; });
    const byStatus = {}; subset.forEach(b => { byStatus[b.status] = (byStatus[b.status] || 0) + 1; });
    const psicoBySelector = {};
    subset.forEach(b => b.psicotecnicos.forEach(p => {
        const k = p.selector_psico || '(sin asignar)';
        if (!psicoBySelector[k]) psicoBySelector[k] = { total: 0, apto: 0, noApto: 0 };
        psicoBySelector[k].total++;
        if (p.resultado === 'Apto') psicoBySelector[k].apto++;
        if (p.resultado === 'No Apto') psicoBySelector[k].noApto++;
    }));
    const totalPsicoSub = subset.reduce((a, b) => a + b.psicotecnicos.length, 0);
    const selectorHtml = Object.entries(bySelector).map(([name, d]) => {
        const p   = Math.round((d.cerradas / Math.max(d.total, 1)) * 100);
        const avg = d.dias.length ? Math.round(d.dias.reduce((a, b) => a + b, 0) / d.dias.length) : 0;
        return `<div class="bar-row"><div class="bar-row-top"><span>${name}</span><span>${d.cerradas}/${d.total} cerradas · ⌀ ${avg}hd</span></div><div class="bar-track"><div class="bar-fill ${tab === 'staff' ? 'bar-fill-staff' : tab === 'fabrica' ? 'bar-fill-fab' : ''}" style="width:${p}%"></div></div></div>`;
    }).join('');
    const deptoHtml = Object.entries(byDepto).map(([name, c]) => {
        const p = Math.round((c / total) * 100);
        return `<div class="bar-row"><div class="bar-row-top"><span>${name}</span><span>${c} (${p}%)</span></div><div class="bar-track"><div class="bar-fill" style="width:${p}%"></div></div></div>`;
    }).join('');
    const statusHtml = Object.entries(byStatus).map(([s, c]) => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--bg);border-radius:8px;margin-bottom:6px">
            <span class="tag ${tagClass(s)}">${s}</span>
            <span style="font-family:'DM Mono',monospace;font-weight:600;font-size:15px">${c}</span>
        </div>`).join('');
    const psicoSelHtml = Object.entries(psicoBySelector).length > 0
        ? Object.entries(psicoBySelector).sort((a, b) => b[1].total - a[1].total).map(([sel, d]) => {
            const p = Math.round((d.total / Math.max(totalPsicoSub, 1)) * 100);
            return `<div class="bar-row"><div class="bar-row-top"><span>${sel}</span><span>${d.total} psico · ${d.apto} aptos · ${d.noApto} no aptos</span></div><div class="bar-track"><div class="bar-fill bar-fill-staff" style="width:${p}%"></div></div></div>`;
        }).join('')
        : '<span class="tip">Sin datos de psicotécnicos asignados</span>';
    document.getElementById('stats-content').innerHTML = `
        <div class="stats-grid">
            <div class="stat-card"><div class="stat-card-title">Rendimiento por Selector</div>${selectorHtml || '<span class="tip">Sin datos</span>'}</div>
            <div class="stat-card"><div class="stat-card-title">Por Departamento</div>${deptoHtml || '<span class="tip">Sin datos</span>'}</div>
            <div class="stat-card"><div class="stat-card-title">Por Estado</div>${statusHtml || '<span class="tip">Sin datos</span>'}</div>
            <div class="stat-card"><div class="stat-card-title"><i class="fas fa-brain" style="margin-right:5px;color:var(--blue)"></i>Psicotécnicos por Selector</div>${psicoSelHtml}</div>
            <div class="stat-card"><div class="stat-card-title">Resumen General</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                    <div style="text-align:center;padding:14px;background:var(--bg);border-radius:8px"><div style="font-family:'Syne',sans-serif;font-size:26px;font-weight:800">${subset.length}</div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin-top:2px">Búsquedas</div></div>
                    <div style="text-align:center;padding:14px;background:var(--bg);border-radius:8px"><div style="font-family:'Syne',sans-serif;font-size:26px;font-weight:800;color:var(--green)">${subset.filter(b => b.status === 'Cerrada' || b.status === 'Finalizada').length}</div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin-top:2px">Cerradas/Fin.</div></div>
                    <div style="text-align:center;padding:14px;background:var(--bg);border-radius:8px"><div style="font-family:'Syne',sans-serif;font-size:26px;font-weight:800;color:var(--orange)">${subset.reduce((a, b) => a + b.candidatos.length, 0)}</div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin-top:2px">Candidatos</div></div>
                    <div style="text-align:center;padding:14px;background:var(--bg);border-radius:8px"><div style="font-family:'Syne',sans-serif;font-size:26px;font-weight:800;color:var(--blue)">${subset.reduce((a, b) => a + b.psicotecnicos.length, 0)}</div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin-top:2px">Psicotécnicos</div></div>
                </div>
            </div>
        </div>`;
}
