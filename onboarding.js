// ══════════════════════════════════════════════
//  ZONAL Y ONBOARDING
//  · Alertas: vacantes en ENVIADO A ZONAL hace 3+ días hábiles sin respuesta.
//  · Citar a onboarding (Onboarding.gs): Extremas con APROBADO ZONAL y Sabores con
//    la persona cargada y ESTADO vacío. Se completan fecha, hora y primer día (de a uno
//    o para todos los marcados) y "Citar" las deja en cola: el Apps Script de TAREAS
//    GRUPALES manda el mail de bienvenida de siempre y la vacante pasa a CITADO.
//    Cuando la persona toca "Confirmo asistencia", ALTAS RRHH = CONFIRMA ONB.
//    Si antes del envío la vacante pasa a otro ESTADO (HUELLA, COMUNICADO…), el mail no
//    sale y el motivo queda en el panel (por eso cambiarEstado avisa antes).
// ══════════════════════════════════════════════

let onbMarcados = new Set();

const enColaOnb = b => !!b.onb_pedido && (!b.onb_enviado || String(b.onb_enviado) < String(b.onb_pedido));

// Con una citación pedida, el mail sale solo si la vacante sigue así (= seleccion_onb_citable_ de sql/onboarding.sql)
function saleElMailOnb(b) {
    if (!vacanteAbierta(b)) return false;
    if (b.marca === 'Hamburguesas Extremas') return ['APROBADO ZONAL', 'CITADO'].includes(b.estado);
    return b.marca === 'Sabores Express' && (!b.estado || b.estado === 'CITADO');
}

function citableOnb(b) {
    if (!vacanteAbierta(b) || !tienePersona(b) || enColaOnb(b)) return false;
    return (b.marca === 'Hamburguesas Extremas' && b.estado === 'APROBADO ZONAL') || (b.marca === 'Sabores Express' && !b.estado);
}

// Lo que necesita el mail (mismas reglas que Onboarding.gs)
function faltaParaCitar(b) {
    const f = [];
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(b.email || '').trim())) f.push('email');
    if (!b.fecha_citacion) f.push('fecha de onboarding');
    if (!b.hora_citacion) f.push('hora');
    if (!b.ingreso) f.push('primer día');
    if (!/FULL TIME|ENCARGADO|GERENTE|ENTRENADOR|PART TIME/.test(normTxt(b.puesto).replace(/[-_]+/g, ' '))) f.push('puesto con horario de primer día');
    const apertura = normTxt(b.local).includes('APER');
    if (apertura && !b.local_entrenamiento) f.push('local de entrenamiento');
    if (!apertura && !infoLocal(b.local)?.direccion) f.push('dirección del local');
    if (b.local_entrenamiento && (apertura || normTxt(b.local_entrenamiento) !== normTxt(b.local)) && !infoLocal(b.local_entrenamiento)?.direccion) f.push('dirección del entrenamiento');
    return f;
}

function openOnboarding() {
    onbMarcados = new Set(busquedas.filter(b => citableOnb(b) && !faltaParaCitar(b).length).map(b => b.id));
    ['onb-fecha', 'onb-primer-dia'].forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('onb-hora').innerHTML = optionsHtml(HORAS_CITACION, '', '— Hora —');
    renderOnboarding();
    openModal('modal-onb');
}

function renderOnboarding() {
    const alertas = busquedas.filter(alertaZonalVencida).sort((a, b) => String(a.fecha_estado).localeCompare(String(b.fecha_estado)));
    const listos = busquedas.filter(citableOnb).sort((a, b) => (a.marca || '').localeCompare(b.marca || '') || String(a.numero).localeCompare(String(b.numero)));
    const cola = busquedas.filter(b => enColaOnb(b) && vacanteAbierta(b));
    // No salieron y ya no se pueden citar desde la lista (la vacante cambió antes del envío)
    const noSalieron = busquedas.filter(b => b.onb_error && !enColaOnb(b) && !citableOnb(b));
    // Ya enviados (aunque después hayan pasado a HUELLA o COMUNICADO)
    const citados = busquedas.filter(b => b.onb_enviado && !enColaOnb(b))
        .sort((a, b) => String(b.onb_enviado).localeCompare(String(a.onb_enviado))).slice(0, 30);
    onbMarcados.forEach(id => { if (!listos.some(b => b.id === id)) onbMarcados.delete(id); });

    const persona = b => `<strong>${esc(nombreCompleto(b) || '—')}</strong><div class="cand-meta">${esc(b.email || 'sin email')}</div>`;
    const vacante = b => `<button class="link-btn" data-num="${esc(b.numero)}" onclick="closeModal('modal-onb');verEnPipeline(this.dataset.num)">${esc(b.numero)}</button>
        ${marcaMiniHtml(b.marca, b.local)}`;

    document.getElementById('onb-alertas').innerHTML = alertas.length ? `
        <table class="tabla-informe"><thead><tr><th>N°</th><th>Persona</th><th>Local</th><th>Regional</th><th>Sin respuesta</th></tr></thead>
        <tbody>${alertas.map(b => `<tr class="fila-alerta"><td>${vacante(b)}</td><td>${persona(b)}</td><td>${esc(b.local)}</td>
            <td>${esc(b.regional || '—')}</td><td class="mono">${daysDiff(b.fecha_estado)} días hábiles</td></tr>`).join('')}</tbody></table>`
        : '<span class="tip">Ninguna: todos los zonales respondieron a tiempo.</span>';

    document.getElementById('onb-listos').innerHTML = listos.length ? `
        <table class="tabla-informe onb-tabla"><thead><tr><th><input type="checkbox" title="Marcar todos" ${listos.every(b => onbMarcados.has(b.id)) ? 'checked' : ''} onchange="marcarTodosOnb(this.checked)"></th>
            <th>N°</th><th>Persona</th><th>Local · puesto</th><th>Onboarding</th><th>Hora</th><th>Primer día</th><th></th></tr></thead>
        <tbody>${listos.map(b => {
            const falta = faltaParaCitar(b);
            return `<tr class="${falta.length ? 'fila-alerta' : ''}">
                <td><input type="checkbox" ${onbMarcados.has(b.id) ? 'checked' : ''} onchange="marcarOnb(${b.id}, this.checked)"></td>
                <td>${vacante(b)}</td>
                <td>${persona(b)}</td>
                <td>${esc(b.local)}${b.local_entrenamiento && normTxt(b.local_entrenamiento) !== normTxt(b.local) ? `<div class="cand-meta">Entrena en ${esc(b.local_entrenamiento)}</div>` : ''}<div class="cand-meta">${esc(b.puesto || '')}</div></td>
                <td><input type="date" class="inline-input inline-input-box" value="${esc(b.fecha_citacion || '')}" onchange="guardarDatoOnb(${b.id}, 'fecha_citacion', this.value)"></td>
                <td><select class="inline-select" onchange="guardarDatoOnb(${b.id}, 'hora_citacion', this.value)">${optionsHtml(HORAS_CITACION, b.hora_citacion || '', '—')}</select></td>
                <td><input type="date" class="inline-input inline-input-box" value="${esc(b.ingreso || '')}" onchange="guardarDatoOnb(${b.id}, 'ingreso', this.value)"></td>
                <td>${falta.length ? `<span class="tip" style="color:var(--red);font-style:normal">Falta: ${esc(falta.join(', '))}</span>` : ''}
                    ${b.onb_error ? `<div><span class="tag tag-error">✕ No enviado</span> <span class="cand-meta">${esc(b.onb_error)}</span></div>` : ''}</td>
            </tr>`;
        }).join('')}</tbody></table>`
        : '<span class="tip">No hay nadie para citar: Extremas necesita APROBADO ZONAL; Sabores, la persona cargada y el ESTADO vacío.</span>';

    // Primero el resultado del mail: enviado, en cola o no enviado (con el motivo)
    const fila = (b, envio, clase = '') => `<tr class="${clase}"><td>${envio}</td><td>${vacante(b)}</td><td>${persona(b)}</td>
        <td class="mono">${fmtFecha(b.fecha_citacion)} ${esc(b.hora_citacion || '')}</td></tr>`;
    const sello = iso => { const d = new Date(iso); return isNaN(d) ? '' : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
    document.getElementById('onb-cola').innerHTML = (cola.length || citados.length || noSalieron.length) ? `
        <table class="tabla-informe"><thead><tr><th>Mail</th><th>N°</th><th>Persona</th><th>Onboarding</th></tr></thead>
        <tbody>${noSalieron.map(b => fila(b, `<span class="tag tag-error">✕ No enviado</span>
                    <div class="cand-meta">${esc(b.onb_error)}</div>
                    <button class="link-btn" onclick="guardarDatoOnb(${b.id}, 'onb_error', '')">Ocultar</button>`, 'fila-alerta')).join('')}
            ${cola.map(b => fila(b, `<span class="tag tag-proceso">⏳ En cola</span><div class="cand-meta">Sale en los próximos 10 minutos</div>`)).join('')}
            ${citados.map(b => fila(b, `<span class="tag tag-cerrada">✓ Enviado</span> <span class="cand-meta">${sello(b.onb_enviado)}</span>
                    <div class="cand-meta">${b.onb_confirmado || normTxt(b.altas_rrhh) === 'CONFIRMA ONB' ? '✓ Confirmó asistencia' : 'Sin confirmar asistencia'}</div>`)).join('')}</tbody></table>`
        : '<span class="tip">Todavía no se citó a nadie desde el portal.</span>';

    const n = listos.filter(b => onbMarcados.has(b.id)).length;
    const btn = document.getElementById('btn-onb-citar');
    btn.disabled = !n;
    btn.innerHTML = `<i class="fas fa-paper-plane"></i> Citar ${n} marcado${n === 1 ? '' : 's'}`;
    document.getElementById('onb-resumen').textContent = `${alertas.length} sin respuesta del zonal · ${listos.length} para citar · ${cola.length} en cola`
        + (citados.length ? ` · ${citados.length} enviado${citados.length === 1 ? '' : 's'}` : '') + (noSalieron.length ? ` · ${noSalieron.length} no enviado${noSalieron.length === 1 ? '' : 's'}` : '');
}

function marcarOnb(id, si) { if (si) onbMarcados.add(id); else onbMarcados.delete(id); renderOnboarding(); }
function marcarTodosOnb(si) { busquedas.filter(citableOnb).forEach(b => { if (si) onbMarcados.add(b.id); else onbMarcados.delete(b.id); }); renderOnboarding(); }

async function guardarDatoOnb(id, campo, valor) {
    const row = await guardarBusqueda(id, { [campo]: valor || null });
    if (row) { refreshBusqueda(id); renderOnboarding(); }
}

// Fecha, hora y primer día para todos los marcados (lo que quede vacío no se toca)
async function aplicarDatosOnb() {
    const cambios = {};
    const fecha = document.getElementById('onb-fecha').value, hora = document.getElementById('onb-hora').value, primer = document.getElementById('onb-primer-dia').value;
    if (fecha) cambios.fecha_citacion = fecha;
    if (hora) cambios.hora_citacion = hora;
    if (primer) cambios.ingreso = primer;
    const ids = [...onbMarcados];
    if (!Object.keys(cambios).length || !ids.length) { toast('Marcá personas y completá fecha, hora o primer día', true); return; }
    const { data, error } = await sb.from('seleccion_busquedas').update(cambios).in('id', ids).select();
    if (error) { toast('Error al guardar: ' + msgError(error), true); return; }
    (data || []).forEach(aplicarCambiosBusqueda);
    refreshView();
    renderOnboarding();
    toast(`Datos cargados en ${data.length} vacante${data.length === 1 ? '' : 's'} ✓`);
}

let _citandoOnb = false;
async function citarOnb() {
    if (_citandoOnb) return;
    const lista = busquedas.filter(b => citableOnb(b) && onbMarcados.has(b.id));
    const conFaltas = lista.filter(b => faltaParaCitar(b).length);
    if (conFaltas.length) { toast(`A ${conFaltas.length} le${conFaltas.length === 1 ? '' : 's'} falta algún dato (está en rojo): completalo o desmarcalo`, true); return; }
    if (!lista.length) return;
    if (!(await confirmar(`¿Mandar la citación a onboarding a ${lista.length} persona${lista.length === 1 ? '' : 's'}? El mail sale en los próximos 10 minutos y la vacante pasa a CITADO.`, 'Citar'))) return;
    _citandoOnb = true;
    try {
        const { data, error } = await sb.from('seleccion_busquedas').update({ onb_pedido: new Date().toISOString(), onb_error: null })
            .in('id', lista.map(b => b.id)).select();
        if (error) { toast('Error al citar: ' + msgError(error), true); return; }
        (data || []).forEach(aplicarCambiosBusqueda);
        onbMarcados.clear();
        refreshView();
        renderOnboarding();
        // Con el Apps Script publicado como Aplicación web, el mail sale en el momento (sin esperar los 10 minutos)
        if (SYNC_DRIVE_URL) { toast(`${data.length} citación${data.length === 1 ? '' : 'es'} en camino: mandando los mails…`); actualizarTodo().then(renderOnboarding); }
        else toast(`${data.length} citación${data.length === 1 ? '' : 'es'} en camino ✓ Los mails salen en los próximos 10 minutos. No cambies el ESTADO hasta que figure CITADO.`);
    } finally { _citandoOnb = false; }
}

// Contador del botón: lo que pide atención (alertas del zonal + gente para citar)
function actualizarBotonOnb() {
    const el = document.getElementById('onb-count');
    if (!el) return;
    const n = busquedas.filter(b => alertaZonalVencida(b) || citableOnb(b)).length;
    el.textContent = n || '';
    el.classList.toggle('hidden', !n);
}
