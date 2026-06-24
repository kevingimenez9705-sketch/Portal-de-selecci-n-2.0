// ══════════════════════════════════════════════
//  RENDER TABLE
// ══════════════════════════════════════════════
function renderTable() {
    const body = document.getElementById('table-body');
    const list = filteredIds ? busquedas.filter(b => filteredIds.includes(b.id)) : busquedas;
    const locked = (b) => (b.status === 'Cerrada' || b.status === 'Finalizada') && !isAdmin();

    body.innerHTML = list.map(b => {
        const dias = b.cp
            ? daysDiff(b.inicio, b.cp)
            : (b.ingreso ? daysDiff(b.inicio, b.ingreso) : daysDiff(b.inicio));

        const dClass = demoraClass(dias, b.nivel);
        const limite = DEMORA_LIMITE[b.nivel] || 15;
        const isLocked = locked(b);
        const diasEnEmpresa = b.ingreso ? daysDiff(b.ingreso, b.fecha_baja || null) : 0;
        const cantComentarios = (b.estado_busqueda || []).length;

        const frozenBadge = (!b.cp && b.ingreso)
            ? `<span class="cp-frozen"><i class="fas fa-lock" style="font-size:8px"></i> congelado al ingresar</span>`
            : '';

        // PSICO
        const psicoHtml = b.psicotecnicos.length > 0
            ? b.psicotecnicos.map(p => `
                <div class="psico-item">
                    <span class="psico-nombre">${p.nombre}</span>
                    <span>
                        <span class="psico-result ${psicoClass(p.resultado)}">${p.resultado}</span>
                        ${p.selector_psico ? `<span class="psico-quien"><i class="fas fa-user" style="font-size:8px"></i> Realizó: <strong>${p.selector_psico}</strong></span>` : ''}
                        ${p.realizado_por ? `<span class="psico-quien">Evaluador: ${p.realizado_por}</span>` : ''}
                        ${p.auth ? `<span class="psico-quien">Auth: ${p.auth}</span>` : ''}
                        ${!isLocked ? `<button onclick="removePsico(${p.id})" style="background:none;border:none;color:#ccc;cursor:pointer;font-size:9px">✕</button>` : ''}
                    </span>
                </div>`).join('')
            : `<span class="tip">Sin psicotécnicos</span>`;

        // VERIFICACIONES
        const verifHtml = b.verificaciones.length > 0
            ? b.verificaciones.map(v => {
                const enCurso = verifEnCurso(v.resultado);
                let counterHtml = '';
                if (v.fecha_inicio) {
                    const d = enCurso ? daysDiff(v.fecha_inicio) : daysDiff(v.fecha_inicio, v.fecha_fin || null);
                    counterHtml = `<span class="verif-counter ${enCurso ? 'verif-counter-run' : 'verif-counter-done'}" title="${enCurso ? 'En curso desde ' + v.fecha_inicio : 'Resuelto en ' + d + ' días háb. (' + v.fecha_inicio + ' → ' + (v.fecha_fin || '—') + ')'}">
                        <i class="fas fa-${enCurso ? 'hourglass-half' : 'flag-checkered'}" style="font-size:8px"></i> ${d}hd
                    </span>`;
                }
                return `
                <div class="psico-item">
                    <span class="psico-nombre">${v.tipo}</span>
                    <span style="text-align:right">
                        ${isLocked
                            ? `<span class="psico-result ${verifClass(v.resultado)}">${v.resultado}</span>`
                            : `<select class="inline-select" style="font-size:11px" onchange="updateVerifEstado(${v.id},this.value)">
                                ${['Pendiente','En proceso','OK','Observado','No Apto'].map(o => `<option value="${o}" ${v.resultado === o ? 'selected' : ''}>${o === 'OK' ? 'OK / Apto' : o}</option>`).join('')}
                               </select>`}
                        ${counterHtml ? `<span style="display:block">${counterHtml}</span>` : ''}
                        ${v.selector_verif ? `<span class="psico-quien"><i class="fas fa-user" style="font-size:8px"></i> Realizó: <strong>${v.selector_verif}</strong></span>` : ''}
                        ${v.observaciones ? `<span class="psico-quien">Obs: ${v.observaciones}</span>` : ''}
                        ${!isLocked ? `<button onclick="removeVerif(${v.id})" style="background:none;border:none;color:#ccc;cursor:pointer;font-size:9px">✕</button>` : ''}
                    </span>
                </div>`;
            }).join('')
            : `<span class="tip">Sin verificaciones</span>`;

        // CANDIDATOS
        const candHtml = b.candidatos.length > 0
            ? b.candidatos.map(c => {
                let tlHtml = '';
                if (c.fecha_envio) {
                    if (c.estado === 'Enviado') {
                        const d = daysDiff(c.fecha_envio);
                        tlHtml = `<div class="cand-timeline">
                            <span class="cand-tl-dot cand-tl-dot-blue"></span>
                            <div class="cand-tl-line"></div>
                            <span class="cand-tl-badge cand-tl-badge-wait">⏳ ${d === 0 ? 'Hoy' : d + 'hd esperando'}</span>
                            <div class="cand-tl-line"></div>
                            <span class="cand-tl-dot cand-tl-dot-green" style="opacity:.3"></span>
                        </div>`;
                    } else if (c.estado === 'Entrevista' && c.fecha_entrevista) {
                        const d = daysDiff(c.fecha_envio, c.fecha_entrevista);
                        tlHtml = `<div class="cand-timeline">
                            <span class="cand-tl-dot cand-tl-dot-blue"></span>
                            <div class="cand-tl-line"></div>
                            <span class="cand-tl-badge cand-tl-badge-done">✓ ${d === 0 ? 'mismo día' : d + 'hd hasta entrevista'}</span>
                            <div class="cand-tl-line"></div>
                            <span class="cand-tl-dot cand-tl-dot-green"></span>
                        </div>`;
                    } else if (c.estado === 'Rechazado' && c.fecha_rechazo) {
                        const d = daysDiff(c.fecha_envio, c.fecha_rechazo);
                        tlHtml = `<div class="cand-timeline">
                            <span class="cand-tl-dot cand-tl-dot-blue"></span>
                            <div class="cand-tl-line"></div>
                            <span class="cand-tl-badge cand-tl-badge-rejected">✗ ${d === 0 ? 'mismo día' : d + 'hd hasta rechazo'}</span>
                            <div class="cand-tl-line"></div>
                            <span class="cand-tl-dot cand-tl-dot-red"></span>
                        </div>`;
                    }
                }

                let fechasHtml = '';
                if (!isLocked) {
                    fechasHtml = `
                    <div class="cand-fecha-row">
                        <span class="cand-fecha-lbl">Enviado</span>
                        <input type="date" class="inline-input" style="font-size:11px" value="${c.fecha_envio || ''}" onchange="updateCandFecha(${c.id},'fecha_envio',this.value)">
                    </div>`;
                    if (c.estado === 'Entrevista') {
                        fechasHtml += `
                        <div class="cand-fecha-row">
                            <span class="cand-fecha-lbl">Entrevistado</span>
                            <input type="date" class="inline-input" style="font-size:11px" value="${c.fecha_entrevista || ''}" onchange="updateCandFecha(${c.id},'fecha_entrevista',this.value)">
                        </div>`;
                    }
                    if (c.estado === 'Rechazado') {
                        fechasHtml += `
                        <div class="cand-fecha-row">
                            <span class="cand-fecha-lbl">Rechazado</span>
                            <input type="date" class="inline-input" style="font-size:11px" value="${c.fecha_rechazo || ''}" onchange="updateCandFecha(${c.id},'fecha_rechazo',this.value)">
                        </div>`;
                    }
                }

                return `<div class="cand-item">
                    <div class="cand-nombre">${c.nombre}</div>
                    ${isLocked ? `<div style="font-size:11px;color:var(--muted)">${c.estado}</div>` : `
                    <select class="inline-select" style="margin-top:3px;font-size:12px" onchange="updateCandEstado(${c.id},this.value)">
                        <option value="Enviado" ${c.estado === 'Enviado' ? 'selected' : ''}>✉ Enviado al área</option>
                        <option value="Entrevista" ${c.estado === 'Entrevista' ? 'selected' : ''}>🤝 En entrevista</option>
                        <option value="Oferta" ${c.estado === 'Oferta' ? 'selected' : ''}>📄 Con oferta</option>
                        <option value="Rechazado" ${c.estado === 'Rechazado' ? 'selected' : ''}>✗ Rechazado</option>
                    </select>
                    <button onclick="removeCand(${c.id})" style="position:absolute;top:4px;right:6px;background:none;border:none;cursor:pointer;color:#bbb;font-size:11px">✕</button>`}
                    ${fechasHtml}
                    ${tlHtml}
                </div>`;
            }).join('')
            : `<span class="tip">Sin candidatos enviados</span>`;

        // ARCHIVOS
        const archivosHtml = b.archivos.length > 0
            ? b.archivos.map(a => `
                <div class="pdf-item">
                    <span class="pdf-item-name" onclick="abrirPDF('${a.url}')"><i class="fas fa-file-pdf" style="font-size:10px"></i> ${a.nombre}</span>
                    ${!isLocked ? `<button onclick="eliminarPDF(${a.id},'${a.url}')" style="background:none;border:none;color:#ccc;cursor:pointer;font-size:10px">✕</button>` : ''}
                </div>`).join('')
            : `<span class="tip">Sin archivos</span>`;

        // PERMANENCIA
        let permHtml = '';
        if (b.ingreso) {
            const milestone = diasEnEmpresa >= 130 ? '🏆 6 meses' : diasEnEmpresa >= 65 ? '✓ 3 meses' : diasEnEmpresa >= 22 ? '📌 1 mes' : '';
            permHtml = `<div class="perm-box">
                <div class="perm-box-num">${diasEnEmpresa}</div>
                <div class="perm-box-lbl">${b.fecha_baja ? 'Días háb. hasta la baja' : 'Días háb. trabajando en empresa'}</div>
                ${milestone ? `<div class="perm-box-milestone">${milestone}</div>` : ''}
            </div>`;
        }

        // ESTADO DE BÚSQUEDA
        const estadoEntriesHtml = (b.estado_busqueda || []).length === 0
            ? `<span class="tip">Sin comentarios</span>`
            : b.estado_busqueda.map((e, idx) => `
                <div class="estado-entry">
                    <span class="d-badge">D${idx + 1}</span>
                    <div class="estado-entry-body">
                        <div class="estado-entry-text">${e.texto}</div>
                        <div class="estado-entry-meta">
                            <i class="fas fa-clock" style="font-size:9px"></i>
                            ${daysDiff(e.fecha) === 0 ? 'Hoy' : 'hace ' + daysDiff(e.fecha) + 'hd'} · ${e.fecha}
                            ${isAdmin() ? `<button onclick="removeEstadoEntry(${e.id})" style="background:none;border:none;color:#ccc;cursor:pointer;font-size:10px;margin-left:4px" title="Solo admin">✕</button>` : ''}
                        </div>
                    </div>
                </div>`).join('');

        const estadoHtml = `
            <div class="section-hdr">Estado de búsqueda</div>
            ${cantComentarios > 0 ? `
            <button class="estado-toggle" onclick="toggleComentarios(${b.id}, this)">
                <i class="fas fa-chevron-right" id="est-icon-${b.id}" style="font-size:8px;transition:transform .2s"></i>
                ${cantComentarios} comentario${cantComentarios !== 1 ? 's' : ''}
            </button>
            <div class="estado-log cell-scroll" id="est-log-${b.id}" style="max-height:130px;display:none;margin-top:5px">
                ${estadoEntriesHtml}
            </div>` : `<span class="tip" style="font-size:11px">Sin comentarios aún</span>`}
            ${!isLocked ? `
            <div class="estado-add-row">
                <input class="estado-add-input" id="estado-input-${b.id}" placeholder="Agregar comentario…" onkeydown="if(event.key==='Enter')addEstadoEntry(${b.id})">
                <button class="estado-add-btn" onclick="addEstadoEntry(${b.id})"><i class="fas fa-plus" style="font-size:10px"></i></button>
            </div>` : ''}`;

        const reopenedTag = b.reopened_from
            ? `<div style="margin-top:3px;font-size:10px;color:var(--blue);font-weight:600"><i class="fas fa-redo" style="font-size:8px"></i> Reapertura de ${b.reopened_from}</div>`
            : '';

        return `
        <tr id="row-${b.id}" class="${isLocked ? 'row-locked' : ''}">
            <td>
                <div style="font-family:'DM Mono',monospace;font-size:11px;font-weight:500;color:var(--muted)">${b.numero}</div>
                <span class="motivo-chip ${motivoClass(b.motivo)}">${b.motivo}</span>
                <div style="margin-top:5px;display:flex;align-items:center;gap:5px;flex-wrap:wrap">
                    <span class="tag ${tagClass(b.status)}">${b.status}</span>
                    <span class="demora-badge ${dClass}" title="Límite: ${limite}hd (días hábiles)">${dias}hd</span>
                </div>
                ${frozenBadge}
                <div style="margin-top:4px;font-size:11px;color:var(--muted)">Inicio: ${b.inicio}</div>
                <div style="margin-top:3px;font-size:11px;color:var(--muted);display:flex;align-items:center;gap:4px">
                    <span style="font-weight:700">CP:</span>
                    ${isLocked
                        ? `<strong>${b.cp || '—'}</strong>`
                        : `<input type="date" class="inline-input" value="${b.cp || ''}" onchange="updateField(${b.id},'cp',this.value)" style="font-size:11px;width:auto">`}
                </div>
                ${reopenedTag}
            </td>
            <td>
                ${isLocked
                    ? `<div style="font-weight:700;font-size:13px">${b.puesto}</div>`
                    : `<input class="inline-input" value="${b.puesto || ''}" placeholder="Puesto/Cargo" onchange="updateField(${b.id},'puesto',this.value)" style="font-weight:700;font-size:13px;width:100%">`}
                <div style="font-size:11px;color:var(--muted);margin-top:2px">${b.depto} · <span style="padding:1px 5px;border-radius:3px;background:${b.tipo === 'Staff' ? '#cfe2ff' : '#d1e7dd'};color:${b.tipo === 'Staff' ? '#0a367a' : '#0a3622'};font-weight:700">${b.tipo}</span></div>
                <div style="margin-top:6px;font-size:12px">
                    Selector:
                    ${isLocked ? `<strong>${b.selector}</strong>` : `<select class="inline-select" onchange="updateField(${b.id},'selector',this.value)">${SELECTORES.map(s => `<option ${b.selector === s ? 'selected' : ''}>${s}</option>`).join('')}</select>`}
                </div>
                <div style="margin-top:4px;font-size:12px;display:flex;align-items:center;gap:4px">
                    <span style="color:var(--muted)">Nivel:</span>
                    ${isLocked
                        ? `<strong>${b.nivel}</strong>`
                        : `<input class="inline-input" value="${b.nivel || ''}" placeholder="Nivel del cargo…" list="nivel-datalist-inline" onchange="updateField(${b.id},'nivel',this.value)" style="font-size:12px;font-weight:600;flex:1">
                           <datalist id="nivel-datalist-inline"><option>Otros</option><option>Jefe/Encargado</option><option>Gerente/Director</option></datalist>`}
                </div>
            </td>
            <td>
                ${isLocked
                    ? `<div style="font-weight:700;font-size:13px;color:var(--green)">${fmtMoney(b.sueldo)}</div>`
                    : `<div style="display:flex;align-items:center;gap:3px;margin-bottom:2px">
                           <span style="font-weight:700;font-size:13px;color:var(--green);flex-shrink:0">$</span>
                           <input class="inline-input" type="number" value="${b.sueldo || ''}" placeholder="Monto ARS…" onchange="updateField(${b.id},'sueldo',parseFloat(this.value)||0)" style="font-weight:700;font-size:13px;color:var(--green);width:100%">
                       </div>`}
                ${isLocked
                    ? `<div style="font-size:11px;font-weight:700;background:#ece9e3;border-radius:4px;padding:2px 6px;display:inline-block;margin-top:2px">${b.jornada || '—'}</div>`
                    : `<input class="inline-input" value="${b.jornada || ''}" placeholder="Jornada…" onchange="updateField(${b.id},'jornada',this.value)" style="font-size:12px;font-weight:700;background:#ece9e3;border-radius:4px;padding:2px 6px;width:100%;margin-top:2px">`}
                <div><span class="ubic-pill">📍 ${b.ubicacion}</span></div>
            </td>
            <td>
                ${estadoHtml}
                <div class="sep"></div>
                <details>
                    <summary><i class="fas fa-chevron-right"></i> Psicotécnicos (${b.psicotecnicos.length})</summary>
                    <div style="padding-top:5px" class="cell-scroll">
                        ${psicoHtml}
                        ${!isLocked ? `<button class="btn-sm" style="margin-top:5px" onclick="openPsicoModal(${b.id})"><i class="fas fa-plus" style="font-size:8px"></i> Agregar</button>` : ''}
                    </div>
                </details>
                <details>
                    <summary><i class="fas fa-chevron-right"></i> Verificaciones (${b.verificaciones.length})</summary>
                    <div style="padding-top:5px" class="cell-scroll">
                        ${verifHtml}
                        ${!isLocked ? `<button class="btn-sm" style="margin-top:5px" onclick="openVerifModal(${b.id})"><i class="fas fa-plus" style="font-size:8px"></i> Agregar</button>` : ''}
                    </div>
                </details>
            </td>
            <td>
                <div class="section-hdr">Candidatos enviados al área</div>
                <div class="cand-count" style="margin-bottom:5px">Total: <strong>${b.candidatos.length}</strong></div>
                <div class="cell-scroll">${candHtml}</div>
                ${!isLocked ? `<button class="btn-sm" style="margin-top:6px" onclick="openCandModal(${b.id})"><i class="fas fa-user-plus" style="font-size:8px"></i> Agregar</button>` : ''}
            </td>
            <td>
                <div class="section-hdr">Archivos PDF</div>
                <div class="cell-scroll" style="max-height:120px">${archivosHtml}</div>
                ${!isLocked ? `
                <label class="pdf-upload-btn">
                    <i class="fas fa-upload" style="font-size:10px"></i> Subir PDF
                    <input type="file" accept=".pdf,.doc,.docx" class="pdf-file-input" onchange="subirPDF(${b.id},this)">
                </label>` : ''}
            </td>
            <td>
                <div class="section-hdr">Candidato que ingresó</div>
                ${isLocked
                    ? `<div style="font-weight:700;color:var(--green)">${b.ingreso_nombre || '—'}</div><div style="font-size:11px;color:var(--muted)">${b.ingreso || ''}</div>`
                    : `<input class="inline-input" value="${b.ingreso_nombre || ''}" placeholder="Nombre del ingresado" onchange="updateField(${b.id},'ingreso_nombre',this.value)" style="font-weight:700;color:var(--green)">
                    <div style="margin-top:5px">
                        <label style="font-size:11px;color:var(--muted)">Fecha de ingreso</label>
                        <input type="date" class="inline-input" value="${b.ingreso || ''}" onchange="updateField(${b.id},'ingreso',this.value)">
                    </div>
                    <div style="margin-top:5px">
                        <label style="font-size:11px;color:var(--muted)">Fecha de baja <span style="font-style:italic">(si dejó la empresa)</span></label>
                        <input type="date" class="inline-input" value="${b.fecha_baja || ''}" onchange="updateField(${b.id},'fecha_baja',this.value)">
                    </div>`}
                ${permHtml}
            </td>
            <td style="vertical-align:middle">
                <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">
                    ${isLocked
                        ? `<span class="tag ${tagClass(b.status)}">${b.status}</span>`
                        : `<select class="inline-select" onchange="updateField(${b.id},'status',this.value)">
                            ${['Proceso', 'Cerrada', 'Pausada', 'Finalizada'].map(s => `<option ${b.status === s ? 'selected' : ''}>${s}</option>`).join('')}
                           </select>`}
                    ${(b.status === 'Cerrada' || b.status === 'Finalizada') ? `<button class="btn-sm" style="font-size:11px" onclick="reabrir(${b.id})"><i class="fas fa-redo" style="font-size:8px"></i> Reabrir</button>` : ''}
                    ${isAdmin() ? `<button class="btn-sm btn-danger" onclick="eliminar(${b.id})"><i class="fas fa-trash" style="font-size:8px"></i></button>` : ''}
                </div>
            </td>
        </tr>`;
    }).join('');
    renderKPIs();
    updateDeptoFilter();
}

function toggleComentarios(id, btn) {
    const log = document.getElementById('est-log-' + id);
    const icon = document.getElementById('est-icon-' + id);
    const isVisible = log.style.display !== 'none';
    log.style.display = isVisible ? 'none' : 'flex';
    log.style.flexDirection = 'column';
    icon.style.transform = isVisible ? '' : 'rotate(90deg)';
}

function renderKPIs() {
    const total       = busquedas.length;
    const proceso     = busquedas.filter(b => b.status === 'Proceso').length;
    const cerradas    = busquedas.filter(b => b.status === 'Cerrada').length;
    const finalizadas = busquedas.filter(b => b.status === 'Finalizada').length;
    const vencidas    = busquedas.filter(b => { const d = daysDiff(b.inicio); return d > (DEMORA_LIMITE[b.nivel] || 15) && b.status === 'Proceso'; }).length;
    document.getElementById('kpi-row').innerHTML = `
        <div class="kpi"><div class="kpi-num">${total}</div><div class="kpi-lbl">Total búsquedas</div></div>
        <div class="kpi"><div class="kpi-num" style="color:var(--blue)">${proceso}</div><div class="kpi-lbl">En proceso</div></div>
        <div class="kpi"><div class="kpi-num" style="color:var(--green)">${cerradas}</div><div class="kpi-lbl">Cerradas</div></div>
        <div class="kpi"><div class="kpi-num" style="color:#92400e">${finalizadas}</div><div class="kpi-lbl">Finalizadas</div></div>
        <div class="kpi"><div class="kpi-num" style="color:var(--red)">${vencidas}</div><div class="kpi-lbl">Fuera de plazo</div></div>`;
}

function applyFilters() {
    const sel    = document.getElementById('f-selector').value;
    const tipo   = document.getElementById('f-tipo').value;
    const depto  = document.getElementById('f-depto').value;
    const status = document.getElementById('f-status').value;
    const search = document.getElementById('f-search').value.toLowerCase();
    filteredIds = busquedas.filter(b => {
        if (sel    && b.selector !== sel)    return false;
        if (tipo   && b.tipo !== tipo)       return false;
        if (depto  && b.depto !== depto)     return false;
        if (status && b.status !== status)   return false;
        if (search && !b.puesto.toLowerCase().includes(search) && !b.depto.toLowerCase().includes(search)) return false;
        return true;
    }).map(b => b.id);
    renderTable();
}

function updateDeptoFilter() {
    const deptos = [...new Set(busquedas.map(b => b.depto))];
    const sel = document.getElementById('f-depto');
    const cur = sel.value;
    sel.innerHTML = '<option value="">Todos los dptos.</option>' + deptos.map(d => `<option ${d === cur ? 'selected' : ''}>${d}</option>`).join('');
}

// ══════════════════════════════════════════════
//  APERTURA DE MODALES
// ══════════════════════════════════════════════
function toggleCandModalFechas() {
    const estado = document.getElementById('cand-estado').value;
    document.getElementById('cand-grp-entrevista').classList.toggle('hidden', estado !== 'Entrevista');
    document.getElementById('cand-grp-rechazo').classList.toggle('hidden', estado !== 'Rechazado');
}

function openCandModal(id) {
    document.getElementById('cand-bid').value = id;
    document.getElementById('cand-nombre').value = '';
    document.getElementById('cand-estado').value = 'Enviado';
    document.getElementById('cand-fecha-envio').value = today();
    document.getElementById('cand-fecha-entrevista').value = '';
    document.getElementById('cand-fecha-rechazo').value = '';
    toggleCandModalFechas();
    openModal('modal-cand');
}

function openPsicoModal(id) {
    document.getElementById('psico-bid').value = id;
    ['psico-nombre', 'psico-realizado', 'psico-auth'].forEach(i => document.getElementById(i).value = '');
    document.getElementById('psico-selector').value = '';
    openModal('modal-psico');
}

function openVerifModal(id) {
    document.getElementById('verif-bid').value = id;
    document.getElementById('verif-tipo').value     = 'Nosis';
    document.getElementById('verif-resultado').value = 'Pendiente';
    document.getElementById('verif-selector').value  = '';
    document.getElementById('verif-obs').value       = '';
    openModal('modal-verif');
}

// ══════════════════════════════════════════════
//  NAVEGACIÓN DE VISTAS
// ══════════════════════════════════════════════
function showView(v, btn) {
    if ((v === 'stats' || v === 'charts') && !isAdmin()) { toast('Acceso restringido a administradores', true); return; }
    ['pipeline', 'stats', 'charts'].forEach(id => document.getElementById('view-' + id).classList.toggle('hidden', id !== v));
    document.querySelectorAll('.inline-nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const titles = {
        pipeline: ['Pipeline de Selección', 'Control de búsquedas, seguimiento y feedback'],
        stats:    ['Estadísticas', 'Análisis de rendimiento y métricas'],
        charts:   ['Gráficos', 'Visualizaciones interactivas del pipeline']
    };
    document.getElementById('main-title').textContent = titles[v][0];
    document.getElementById('main-sub').textContent   = titles[v][1];
    if (v === 'stats')  renderStats('general');
    if (v === 'charts') { destroyCharts(); renderCharts('general'); }
}

// Cerrar modales al hacer click en el fondo
document.querySelectorAll('.modal-bg').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.add('hidden'); }));
