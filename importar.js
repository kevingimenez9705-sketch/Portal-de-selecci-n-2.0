// ══════════════════════════════════════════════
//  CARGA MASIVA desde la hoja "SOLICITUDES DE PERSONAL"
//  Se copian las filas de la planilla y se pegan acá: por cada local, cada número
//  en PERFILES A SOLICITAR (GT, ET, ENT, FULL, PART) se vuelve esa cantidad de vacantes.
// ══════════════════════════════════════════════
let importLineas = [];

function openImportar() {
    document.getElementById('imp-marca').innerHTML = optionsHtml(MARCAS, marcaActiva || MARCAS[1]);
    document.getElementById('imp-jornada').innerHTML = optionsHtml(JORNADAS, 'ROTATIVO', '— Sin jornada —');
    document.getElementById('imp-inicio').value = today();
    document.getElementById('imp-texto').value = '';
    document.getElementById('imp-preview').innerHTML = '';
    document.getElementById('imp-resumen').textContent = '';
    document.getElementById('btn-crear-importadas').disabled = true;
    importLineas = [];
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

const normTxt = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase().replace(/\s+/g, ' ');

// Si se copió el encabezado se usan sus posiciones; si no, las de la hoja original
function columnasSolicitud(rows) {
    for (const r of rows) {
        const n = r.map(normTxt);
        const local = n.indexOf('LOCAL'), obs = n.findIndex(x => x.startsWith('OBSERVACION'));
        if (local !== -1 && obs !== -1) {
            const perfiles = {};
            // GT, ET… aparecen tres veces (estructura ideal, real y perfiles a solicitar): se usan las últimas antes de OBSERVACION
            PERFILES_SOLICITUD.forEach(p => { perfiles[p.col] = n.lastIndexOf(p.col, obs); });
            return { gr: n.indexOf('GR'), gz: n.indexOf('GZ'), local, estado: n.indexOf('ESTADO'), obs, perfiles, conEncabezado: true };
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
    if (!rows.length) { resumen.textContent = 'Pegá primero las filas copiadas de la planilla.'; preview.innerHTML = ''; actualizarBotonImportar(); return; }
    const pos = columnasSolicitud(rows);
    const marcaDefecto = document.getElementById('imp-marca').value;
    const celda = (r, i) => (i >= 0 && i < r.length ? String(r[i]).trim() : '');
    let inactivos = 0, cortas = 0;

    rows.forEach(r => {
        const local = celda(r, pos.local);
        const nLocal = normTxt(local);
        if (!local || nLocal === 'LOCAL' || nLocal === 'DATOS DEL LOCAL') return; // encabezados
        if (!pos.conEncabezado && r.length <= pos.perfiles.PART) { cortas++; return; }
        const estadoLocal = normTxt(celda(r, pos.estado));
        if (estadoLocal && estadoLocal !== 'ACTIVO') { inactivos++; return; }
        const gr = celda(r, pos.gr), gz = celda(r, pos.gz), obs = celda(r, pos.obs);
        const previos = datosPrevios(local, gz);
        PERFILES_SOLICITUD.forEach(p => {
            const pedidas = parseInt(celda(r, pos.perfiles[p.col])) || 0;
            if (pedidas <= 0) return;
            const abiertas = busquedas.filter(b => vacanteAbierta(b) && normTxt(b.local) === nLocal && b.puesto === p.puesto).length;
            importLineas.push({
                usar: true, local, regional: gr, zonal: gz, notas: obs, puesto: p.puesto, perfil: p.col,
                marca: marcaDeLocal(local, marcaDefecto), selector: previos.selector, zona: previos.zona,
                pedidas, abiertas, crear: Math.max(0, pedidas - abiertas)
            });
        });
    });

    if (!importLineas.length) {
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
                <thead><tr><th></th><th>Local</th><th>Marca</th><th>Puesto</th><th>Pedidas</th><th>Ya abiertas</th><th>A crear</th><th>Regional</th><th>Zonal</th><th>Selector</th><th>Observación</th></tr></thead>
                <tbody>${importLineas.map((l, i) => `<tr class="${l.usar && l.crear ? '' : 'row-locked'}">
                    <td><input type="checkbox" ${l.usar ? 'checked' : ''} onchange="importLineas[${i}].usar=this.checked;renderImportPreview()"></td>
                    <td><strong>${esc(l.local)}</strong></td>
                    <td><span class="marca-mini ${marcaClass(l.marca)}">${l.marca === 'Sabores Express' ? 'SAB' : 'EXT'}</span></td>
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
    const btn = document.getElementById('btn-crear-importadas');
    btn.disabled = total === 0;
    btn.innerHTML = `<i class="fas fa-check"></i> Crear ${total} vacante${total === 1 ? '' : 's'}`;
    if (importLineas.length) document.getElementById('imp-resumen').textContent = `${total} vacante${total === 1 ? '' : 's'} en ${locales} local${locales === 1 ? '' : 'es'}. "Ya abiertas" cuenta las que siguen abiertas en el portal para ese local y puesto, y se descuentan de "A crear".`;
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
            zona: l.zona || null, puesto: l.puesto, jornada, notas: l.notas || null, motivo: 'Rotación', inicio, status: 'Proceso'
        });
    });
    if (!filas.length) return;
    if (!(await confirmar(`Se van a crear ${filas.length} vacantes. ¿Seguimos?`))) return;
    _importando = true;
    const btn = document.getElementById('btn-crear-importadas');
    btn.disabled = true;
    try {
        const creadas = [];
        for (let i = 0; i < filas.length; i += 200) {
            const { data, error } = await sb.from('seleccion_busquedas').insert(filas.slice(i, i + 200)).select(BUSQUEDA_SELECT);
            if (error) { toast(`Error al crear (se crearon ${creadas.length}): ` + msgError(error), true); break; }
            creadas.push(...(data || []));
        }
        busquedas = [...creadas.map(mapBusqueda).reverse(), ...busquedas];
        if (creadas.length) { closeModal('modal-importar'); refreshView(); toast(`${creadas.length} vacantes creadas ✓`); }
    } finally { _importando = false; btn.disabled = false; }
}
