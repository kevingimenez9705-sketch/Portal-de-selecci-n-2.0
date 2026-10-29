// ══════════════════════════════════════════════
//  CARGA MASIVA desde la hoja "SOLICITUDES DE PERSONAL"
//  Se copian las filas de la planilla y se pegan acá: por cada local, cada número
//  en PERFILES A SOLICITAR (GT, ET, ENT, FULL, PART) se vuelve esa cantidad de vacantes.
//  El ESTADO DE NÓMINA del local (excedido / debe completar / completo) queda en cada
//  vacante, y también se actualiza en las vacantes que ya estaban abiertas de ese local.
// ══════════════════════════════════════════════
let importLineas = [];
let importNomina = [];   // vacantes abiertas cuya nómina cambia: { id, estado_nomina, nomina_detalle }

function openImportar() {
    document.getElementById('imp-marca').innerHTML = optionsHtml(MARCAS, marcaActiva || MARCAS[1]);
    document.getElementById('imp-jornada').innerHTML = optionsHtml(JORNADAS, 'ROTATIVO', '— Sin jornada —');
    document.getElementById('imp-inicio').value = today();
    document.getElementById('imp-texto').value = '';
    document.getElementById('imp-preview').innerHTML = '';
    document.getElementById('imp-resumen').textContent = '';
    document.getElementById('btn-crear-importadas').disabled = true;
    importLineas = [];
    importNomina = [];
    openModal('modal-importar');
    setTimeout(() => document.getElementById('imp-texto').focus(), 50);
}

// Google Sheets copia con tabulaciones; una celda con saltos de línea viene entre comillas.
function parseTSV(text) {
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (q) {
            if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
            else cell += ch;
        } else if (ch === '"' && cell === '') q = true;
        else if (ch === '\t') { row.push(cell); cell = ''; }
        else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && text[i + 1] === '\n') i++;
            row.push(cell); rows.push(row); row = []; cell = '';
        } else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(c => c.trim() !== ''));
}

const normTxt = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase().replace(/\s+/g, ' ');

// Si se copió el encabezado se usan sus posiciones; si no, las de la hoja original
function columnasSolicitud(rows) {
    for (const r of rows) {
        const n = r.map(normTxt);
        const local = n.indexOf('LOCAL'), obs = n.findIndex(x => x.startsWith('OBSERVACION'));
        if (local !== -1 && obs !== -1) {
            const perfiles = {}, ideal = {}, real = {};
            // GT, ET… aparecen tres veces: estructura ideal, real y perfiles a solicitar (las últimas antes de OBSERVACION)
            PERFILES_SOLICITUD.forEach(p => {
                perfiles[p.col] = n.lastIndexOf(p.col, obs);
                ideal[p.col] = n.indexOf(p.col);
                real[p.col] = ideal[p.col] === -1 ? -1 : n.indexOf(p.col, ideal[p.col] + 1);
                if (ideal[p.col] === perfiles[p.col]) ideal[p.col] = -1;
                if (real[p.col] >= perfiles[p.col]) real[p.col] = -1;
            });
            return { gr: n.indexOf('GR'), gz: n.indexOf('GZ'), local, estado: n.indexOf('ESTADO'),
                nomina: n.findIndex(x => x.startsWith('ESTADO DE NOMINA')), obs, perfiles, ideal, real, conEncabezado: true };
        }
    }
    return { ...SOLICITUD_POSICIONES, conEncabezado: false };
}

function marcaDeLocal(local, porDefecto) {
    const n = normTxt(local);
    if (n.includes('EXTREMAS')) return 'Hamburguesas Extremas';
    if (n.includes('SABORES') || n.includes('EMPANADA')) return 'Sabores Express';
    return porDefecto;
}

// Selector y zona: los de la última vacante del mismo local o, si no hay, del mismo zonal
function datosPrevios(local, zonal) {
    const mismoLocal = busquedas.filter(b => normTxt(b.local) === normTxt(local)).sort((a, b) => b.id - a.id);
    const mismoZonal = busquedas.filter(b => zonal && normTxt(b.zonal) === normTxt(zonal)).sort((a, b) => b.id - a.id);
    return {
        selector: mismoLocal.find(b => b.selector)?.selector || mismoZonal.find(b => b.selector)?.selector || '',
        zona: mismoLocal.find(b => b.zona)?.zona || ''
    };
}

function revisarImportacion() {
    const rows = parseTSV(document.getElementById('imp-texto').value);
    const preview = document.getElementById('imp-preview');
    const resumen = document.getElementById('imp-resumen');
    importLineas = [];
    importNomina = [];
    if (!rows.length) { resumen.textContent = 'Pegá primero las filas copiadas de la planilla.'; preview.innerHTML = ''; actualizarBotonImportar(); return; }
    const pos = columnasSolicitud(rows);
    const marcaDefecto = document.getElementById('imp-marca').value;
    const celda = (r, i) => (i >= 0 && i < r.length ? String(r[i]).trim() : '');
    let inactivos = 0, cortas = 0;
    const nominaLocal = new Map();   // local → { estado, detalle por perfil }
    // "PART: ideal 6 · real 5"
    const detalleDe = (r, col) => {
        const i = celda(r, pos.ideal[col]), re = celda(r, pos.real[col]);
        return i !== '' || re !== '' ? `${col}: ideal ${i || 0} · real ${re || 0}` : '';
    };

    rows.forEach(r => {
        const local = celda(r, pos.local);
        const nLocal = normTxt(local);
        if (!local || nLocal === 'LOCAL' || nLocal === 'DATOS DEL LOCAL') return; // encabezados
        if (!pos.conEncabezado && r.length <= pos.perfiles.PART) { cortas++; return; }
        const estadoLocal = normTxt(celda(r, pos.estado));
        if (estadoLocal && estadoLocal !== 'ACTIVO') { inactivos++; return; }
        const gr = celda(r, pos.gr), gz = celda(r, pos.gz), obs = celda(r, pos.obs);
        const nomina = nominaDe(celda(r, pos.nomina));
        if (nomina) nominaLocal.set(nLocal, { estado: nomina, detalle: col => detalleDe(r, col) });
        const previos = datosPrevios(local, gz);
        PERFILES_SOLICITUD.forEach(p => {
            const pedidas = parseInt(celda(r, pos.perfiles[p.col])) || 0;
            if (pedidas <= 0) return;
            const abiertas = busquedas.filter(b => vacanteAbierta(b) && normTxt(b.local) === nLocal && b.puesto === p.puesto).length;
            importLineas.push({
                usar: true, local, regional: gr, zonal: gz, notas: obs, puesto: p.puesto, perfil: p.col,
                marca: marcaDeLocal(local, marcaDefecto), selector: previos.selector, zona: previos.zona,
                estado_nomina: nomina || null, nomina_detalle: nomina ? detalleDe(r, p.col) || null : null,
                pedidas, abiertas, crear: Math.max(0, pedidas - abiertas)
            });
        });
    });

    // Vacantes abiertas de esos locales: se les actualiza la nómina si cambió
    busquedas.filter(vacanteAbierta).forEach(b => {
        const n = nominaLocal.get(normTxt(b.local));
        if (!n) return;
        const perfil = PERFILES_SOLICITUD.find(p => p.puesto === b.puesto)?.col;
        const detalle = (perfil && n.detalle(perfil)) || null;
        if (b.estado_nomina !== n.estado || (b.nomina_detalle || null) !== detalle) {
            importNomina.push({ id: b.id, estado_nomina: n.estado, nomina_detalle: detalle });
        }
    });

    if (!importLineas.length) {
        if (importNomina.length) {
            preview.innerHTML = '';
            actualizarBotonImportar();
            resumen.textContent = `No hay perfiles pedidos. Se puede actualizar la nómina (excedido / debe completar / completo) de ${importNomina.length} vacante${importNomina.length === 1 ? '' : 's'} abierta${importNomina.length === 1 ? '' : 's'}.`;
            return;
        }
        resumen.textContent = cortas
            ? 'Las filas pegadas no llegan hasta la columna PART de "Perfiles a solicitar": copiá las filas completas (de GR a OBSERVACION) o incluí el encabezado.'
            : 'No se encontraron perfiles pedidos (los números de GT, ET, ENT, FULL o PART en "Perfiles a solicitar").';
        preview.innerHTML = '';
        actualizarBotonImportar();
        return;
    }
    renderImportPreview();
    if (inactivos) toast(`${inactivos} local(es) no están ACTIVOS y se salteó`);
}

function renderImportPreview() {
    const sels = selectores();
    document.getElementById('imp-preview').innerHTML = `
        <div class="table-wrap" style="margin-top:12px;max-height:46vh">
            <table class="tabla-informe imp-tabla">
                <thead><tr><th></th><th>Local</th><th>Marca</th><th>Nómina</th><th>Puesto</th><th>Pedidas</th><th>Ya abiertas</th><th>A crear</th><th>Regional</th><th>Zonal</th><th>Selector</th><th>Observación</th></tr></thead>
                <tbody>${importLineas.map((l, i) => `<tr class="${l.usar && l.crear ? '' : 'row-locked'}">
                    <td><input type="checkbox" ${l.usar ? 'checked' : ''} onchange="importLineas[${i}].usar=this.checked;renderImportPreview()"></td>
                    <td><strong>${esc(l.local)}</strong></td>
                    <td><span class="marca-mini ${marcaClass(l.marca)}">${l.marca === 'Sabores Express' ? 'SAB' : 'EXT'}</span></td>
                    <td>${nominaHtml(l) || '—'}</td>
                    <td>${esc(l.puesto)}</td>
                    <td class="mono">${l.pedidas}</td>
                    <td class="mono" title="Vacantes abiertas de este puesto en el local">${l.abiertas || '—'}</td>
                    <td><input type="number" min="0" max="20" class="inline-input inline-input-box" style="width:56px" value="${l.crear}" onchange="importLineas[${i}].crear=Math.max(0,Math.min(20,parseInt(this.value)||0));renderImportPreview()"></td>
                    <td>${esc(l.regional || '—')}</td>
                    <td>${esc(l.zonal || '—')}</td>
                    <td><select class="inline-select" onchange="importLineas[${i}].selector=this.value">${optionsHtml(sels, l.selector, '—')}</select></td>
                    <td class="imp-obs">${esc(l.notas || '')}</td>
                </tr>`).join('')}</tbody>
            </table>
        </div>`;
    actualizarBotonImportar();
}

function actualizarBotonImportar() {
    const total = importLineas.filter(l => l.usar).reduce((a, l) => a + l.crear, 0);
    const locales = new Set(importLineas.filter(l => l.usar && l.crear).map(l => normTxt(l.local))).size;
    const act = importNomina.length;
    const btn = document.getElementById('btn-crear-importadas');
    btn.disabled = total === 0 && act === 0;
    btn.innerHTML = `<i class="fas fa-check"></i> ` + (total && act ? `Crear ${total} y actualizar ${act}`
        : act && !total ? `Actualizar nómina de ${act}` : `Crear ${total} vacante${total === 1 ? '' : 's'}`);
    if (importLineas.length) document.getElementById('imp-resumen').textContent = `${total} vacante${total === 1 ? '' : 's'} en ${locales} local${locales === 1 ? '' : 'es'}. "Ya abiertas" cuenta las que siguen abiertas en el portal para ese local y puesto, y se descuentan de "A crear".`
        + (act ? ` Además se actualiza la nómina de ${act} vacante${act === 1 ? '' : 's'} abierta${act === 1 ? '' : 's'}.` : '');
}

let _importando = false;
async function crearImportadas() {
    if (_importando) return;
    const inicio = document.getElementById('imp-inicio').value || today();
    if (!fechaValida(inicio)) { toast('Fecha de apertura inválida', true); return; }
    const jornada = document.getElementById('imp-jornada').value || null;
    const filas = [];
    importLineas.filter(l => l.usar && l.crear > 0).forEach(l => {
        for (let k = 0; k < l.crear; k++) filas.push({
            marca: l.marca, local: l.local, regional: l.regional || null, zonal: l.zonal || null, selector: l.selector || null,
            zona: l.zona || null, puesto: l.puesto, jornada, notas: l.notas || null, motivo: 'Rotación', inicio, status: 'Proceso',
            estado_nomina: l.estado_nomina, nomina_detalle: l.nomina_detalle
        });
    });
    const act = importNomina.length;
    if (!filas.length && !act) return;
    const partes = [filas.length ? `crear ${filas.length} vacante${filas.length === 1 ? '' : 's'}` : '', act ? `actualizar la nómina de ${act} abierta${act === 1 ? '' : 's'}` : ''];
    if (!(await confirmar(`Se va a ${partes.filter(Boolean).join(' y ')}. ¿Seguimos?`))) return;
    _importando = true;
    const btn = document.getElementById('btn-crear-importadas');
    btn.disabled = true;
    try {
        const creadas = [];
        let error = null;
        for (let i = 0; i < filas.length && !error; i += 200) {
            const r = await sb.from('seleccion_busquedas').insert(filas.slice(i, i + 200)).select(BUSQUEDA_SELECT);
            error = r.error;
            creadas.push(...(r.data || []));
        }
        busquedas = [...creadas.map(mapBusqueda).reverse(), ...busquedas];
        // Una sola actualización por cada combinación de estado y detalle
        const grupos = new Map();
        importNomina.forEach(u => {
            const k = JSON.stringify([u.estado_nomina, u.nomina_detalle]);
            if (!grupos.has(k)) grupos.set(k, { cambios: { estado_nomina: u.estado_nomina, nomina_detalle: u.nomina_detalle }, ids: [] });
            grupos.get(k).ids.push(u.id);
        });
        let actualizadas = 0;
        for (const g of grupos.values()) {
            if (error) break;
            const r = await sb.from('seleccion_busquedas').update(g.cambios).in('id', g.ids).select('id, estado_nomina, nomina_detalle');
            error = r.error;
            (r.data || []).forEach(row => { aplicarCambiosBusqueda(row); actualizadas++; });
        }
        if (creadas.length || actualizadas) refreshView();
        const hecho = [creadas.length ? `${creadas.length} vacantes creadas` : '', actualizadas ? `nómina actualizada en ${actualizadas}` : ''].filter(Boolean).join(' · ');
        if (error) { toast(`Error: ${msgError(error)}${hecho ? ' (' + hecho + ')' : ''}`, true); return; }
        closeModal('modal-importar');
        toast(hecho + ' ✓');
    } finally { _importando = false; btn.disabled = false; }
}
