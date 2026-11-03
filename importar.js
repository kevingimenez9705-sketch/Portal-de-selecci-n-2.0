// ══════════════════════════════════════════════
//  CARGA MASIVA desde la hoja "SOLICITUDES DE PERSONAL"
//  Se sube la planilla descargada como Excel (se leen todas las filas) o se copian
//  las filas y se pegan acá: por cada local, cada número
//  en PERFILES A SOLICITAR (GT, ET, ENT, FULL, PART) se vuelve esa cantidad de vacantes.
//  El ESTADO DE NÓMINA del local (excedido / debe completar / completo) queda en cada
//  vacante, y también se actualiza en las vacantes que ya estaban abiertas de ese local.
// ══════════════════════════════════════════════
let importLineas = [];
let importNomina = [];   // vacantes abiertas cuya nómina cambia: { id, estado_nomina, nomina_detalle }
let importSalteados = [];   // locales que no generan vacantes y por qué: { local, motivo }
let importLocales = new Map();   // local → regional, zonal y nómina de la planilla (actualizan el Mapa de equipos)
const ESTADOS_LOCAL_IMPORTABLES = ['ACTIVO', 'APERTURA'];

function openImportar() {
    document.getElementById('imp-marca').innerHTML = optionsHtml(MARCAS, marcaActiva || MARCAS[1]);
    document.getElementById('imp-jornada').innerHTML = optionsHtml(JORNADAS, 'ROTATIVO', '— Sin jornada —');
    document.getElementById('imp-inicio').value = today();
    document.getElementById('imp-texto').value = '';
    document.getElementById('imp-archivo').value = '';
    document.getElementById('imp-archivo-txt').textContent = 'Subir el Excel de la planilla (.xlsx)';
    document.getElementById('imp-preview').innerHTML = '';
    document.getElementById('imp-resumen').textContent = '';
    document.getElementById('btn-crear-importadas').disabled = true;
    importLineas = [];
    importNomina = [];
    importSalteados = [];
    importLocales = new Map();
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
    if (n.includes('SABORES') || n.includes('EMPANADA') || esMania(local)) return 'Sabores Express';   // Mania va dentro de Sabores
    return porDefecto;
}

// Selector y zona: el selector asignado al local en el Mapa de equipos; si no tiene, el de la última
// vacante del mismo local o, si no hay, del mismo zonal
function datosPrevios(local, zonal) {
    const asignado = localDe(local)?.selector;
    const mismoLocal = busquedas.filter(b => normTxt(b.local) === normTxt(local)).sort((a, b) => b.id - a.id);
    const mismoZonal = busquedas.filter(b => zonal && normTxt(b.zonal) === normTxt(zonal)).sort((a, b) => b.id - a.id);
    return {
        selector: asignado || mismoLocal.find(b => b.selector)?.selector || mismoZonal.find(b => b.selector)?.selector || '',
        zona: mismoLocal.find(b => b.zona)?.zona || ''
    };
}

// Excel descargado de la planilla: se busca la pestaña con LOCAL y OBSERVACION (SOLICITUDES DE PERSONAL)
async function leerExcelSolicitudes(input) {
    const archivo = input.files && input.files[0];
    if (!archivo) return;
    const txt = document.getElementById('imp-archivo-txt');
    const resumen = document.getElementById('imp-resumen');
    txt.textContent = 'Leyendo ' + archivo.name + '…';
    try {
        const XLSX = await cargarXLSX();
        const libro = XLSX.read(await archivo.arrayBuffer(), { type: 'array', cellDates: false });
        const hojas = libro.SheetNames.map(nombre => ({
            nombre,
            filas: XLSX.utils.sheet_to_json(libro.Sheets[nombre], { header: 1, raw: false, defval: '', blankrows: false })
                .map(r => r.map(c => String(c ?? '')))
        })).filter(h => columnasSolicitud(h.filas).conEncabezado);
        if (!hojas.length) {
            txt.textContent = 'Subir el Excel de la planilla (.xlsx)';
            resumen.textContent = `En ${archivo.name} no encontré la hoja de SOLICITUDES DE PERSONAL (con las columnas LOCAL y OBSERVACION).`;
            return;
        }
        const hoja = hojas.find(h => normTxt(h.nombre).includes('SOLICITUD')) || hojas[0];
        txt.textContent = `${archivo.name} · hoja ${hoja.nombre} · ${hoja.filas.length} filas`;
        document.getElementById('imp-texto').value = '';
        revisarImportacion(hoja.filas.filter(r => r.some(c => c.trim() !== '')));
    } catch (e) {
        txt.textContent = 'Subir el Excel de la planilla (.xlsx)';
        resumen.textContent = 'No se pudo leer el archivo: ' + (e.message || e);
    }
}

function revisarImportacion(filasExcel) {
    const rows = Array.isArray(filasExcel) ? filasExcel : parseTSV(document.getElementById('imp-texto').value);
    const preview = document.getElementById('imp-preview');
    const resumen = document.getElementById('imp-resumen');
    importLineas = [];
    importNomina = [];
    importSalteados = [];
    importLocales = new Map();
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
        // La planilla admite ACTIVO y APERTURA: los dos piden gente. Se saltea cualquier otro (cerrado, baja…)
        if (estadoLocal && !ESTADOS_LOCAL_IMPORTABLES.includes(estadoLocal)) { inactivos++; importSalteados.push({ local, motivo: `Local ${celda(r, pos.estado)}` }); return; }
        const gr = celda(r, pos.gr), gz = celda(r, pos.gz), obs = celda(r, pos.obs);
        const nomina = nominaDe(celda(r, pos.nomina));
        importLocales.set(nLocal, { local, regional: gr, zonal: gz, estado_nomina: nomina || null });
        if (nomina) nominaLocal.set(nLocal, { estado: nomina, detalle: col => detalleDe(r, col) });
        const previos = datosPrevios(local, gz);
        if (!PERFILES_SOLICITUD.some(p => (parseInt(celda(r, pos.perfiles[p.col])) || 0) > 0)) importSalteados.push({ local, motivo: 'No pide perfiles' });
        PERFILES_SOLICITUD.forEach(p => {
            const pedidas = parseInt(celda(r, pos.perfiles[p.col])) || 0;
            if (pedidas <= 0) return;
            const abiertas = busquedas.filter(b => vacanteAbierta(b) && normTxt(b.local) === nLocal && b.puesto === p.puesto).length;
            // EXCEDIDO: no se crea salvo que se marque a mano "Falta completar" (excepciones)
            const excedido = nomina === 'EXCEDIDO';
            importLineas.push({
                usar: !excedido, excedido, faltaCompletar: false, local, regional: gr, zonal: gz, notas: obs, puesto: p.puesto, perfil: p.col,
                marca: marcaDeLocal(local, marcaDefecto), selector: previos.selector, zona: previos.zona || infoLocal(local)?.zona || '',
                estado_nomina: nomina || null, nomina_detalle: nomina ? detalleDe(r, p.col) || null : null,
                pedidas, abiertas, crear: Math.max(0, pedidas - abiertas)
            });
            importLineas[importLineas.length - 1].nomina_detalle_orig = importLineas[importLineas.length - 1].nomina_detalle;
        });
    });

    // Vacantes abiertas de esos locales: se les actualiza la nómina si cambió
    busquedas.filter(vacanteAbierta).forEach(b => {
        const n = nominaLocal.get(normTxt(b.local));
        if (!n) return;
        // Excepción marcada a mano ("Falta completar"): si el local sigue excedido, no vuelve a "Excedido"
        if (n.estado === 'EXCEDIDO' && esExcepcionNomina(b)) return;
        const perfil = PERFILES_SOLICITUD.find(p => p.puesto === b.puesto)?.col;
        const detalle = (perfil && n.detalle(perfil)) || null;
        if (b.estado_nomina !== n.estado || (b.nomina_detalle || null) !== detalle) {
            importNomina.push({ id: b.id, estado_nomina: n.estado, nomina_detalle: detalle });
        }
    });

    if (!importLineas.length) {
        if (importNomina.length) {
            preview.innerHTML = salteadosHtml();
            actualizarBotonImportar();
            resumen.textContent = `No hay perfiles pedidos. Se puede actualizar la nómina (excedido / debe completar / completo) de ${importNomina.length} vacante${importNomina.length === 1 ? '' : 's'} abierta${importNomina.length === 1 ? '' : 's'}.`;
            return;
        }
        resumen.textContent = cortas
            ? 'Las filas pegadas no llegan hasta la columna PART de "Perfiles a solicitar": copiá las filas completas (de GR a OBSERVACION) o incluí el encabezado.'
            : 'No se encontraron perfiles pedidos (los números de GT, ET, ENT, FULL o PART en "Perfiles a solicitar").';
        preview.innerHTML = salteadosHtml();
        actualizarBotonImportar();
        return;
    }
    renderImportPreview();
    if (inactivos) toast(`${inactivos} local(es) no están ACTIVOS ni en APERTURA y se saltearon`);
}

// Para que se vea por qué un local de la planilla no generó vacantes
function salteadosHtml() {
    const yaAbiertas = importLineas.filter(l => l.pedidas > 0 && l.crear === 0);
    const items = [...importSalteados, ...yaAbiertas.map(l => ({ local: l.local, motivo: `${l.puesto}: ya hay ${l.abiertas} abierta${l.abiertas === 1 ? '' : 's'} en el portal` }))];
    if (!items.length) return '';
    return `<details class="imp-salteados"><summary>${items.length} fila${items.length === 1 ? '' : 's'} de la planilla no crean vacantes (ver por qué)</summary>
        <ul>${items.map(i => `<li><strong>${esc(i.local)}</strong> — ${esc(i.motivo)}</li>`).join('')}</ul></details>`;
}

function renderImportPreview() {
    const sels = selectores();
    const fila = (l, i) => `<tr class="${l.usar && l.crear ? '' : 'row-locked'}">
        <td><input type="checkbox" ${l.usar ? 'checked' : ''} ${l.excedido && !l.faltaCompletar ? 'disabled title="Marcá Falta completar para crearla"' : ''} onchange="importLineas[${i}].usar=this.checked;renderImportPreview()"></td>
        <td><strong>${esc(l.local)}</strong></td>
        <td>${marcaMiniHtml(l.marca, l.local)}</td>
        <td>${l.excedido
            ? `<label class="imp-falta" title="Excepción: el local está excedido pero igual hay que cubrir este puesto"><input type="checkbox" ${l.faltaCompletar ? 'checked' : ''} onchange="marcarFaltaCompletar(${i}, this.checked)"> Falta completar</label>`
            : (nominaHtml(l) || '—')}</td>
        <td>${esc(l.puesto)}</td>
        <td class="mono">${l.pedidas}</td>
        <td class="mono" title="Vacantes abiertas de este puesto en el local">${l.abiertas || '—'}</td>
        <td><input type="number" min="0" max="20" class="inline-input inline-input-box" style="width:56px" value="${l.crear}" onchange="importLineas[${i}].crear=Math.max(0,Math.min(20,parseInt(this.value)||0));renderImportPreview()"></td>
        <td>${esc(l.regional || '—')}</td>
        <td>${esc(l.zonal || '—')}</td>
        <td><select class="inline-select" onchange="importLineas[${i}].selector=this.value">${optionsHtml(sels, l.selector, '—')}</select></td>
        <td class="imp-obs">${esc(l.notas || '')}</td>
    </tr>`;
    const tabla = (titulo, idx, nota = '') => idx.length ? `
        <h4 class="imp-subtitulo">${titulo}</h4>${nota}
        <div class="table-wrap" style="margin-top:6px;max-height:38vh">
            <table class="tabla-informe imp-tabla">
                <thead><tr><th></th><th>Local</th><th>Marca</th><th>Nómina</th><th>Puesto</th><th>Pedidas</th><th>Ya abiertas</th><th>A crear</th><th>Regional</th><th>Zonal</th><th>Selector</th><th>Observación</th></tr></thead>
                <tbody>${idx.map(i => fila(importLineas[i], i)).join('')}</tbody>
            </table>
        </div>` : '';
    const comunes = importLineas.map((l, i) => i).filter(i => !importLineas[i].excedido);
    const excedidos = importLineas.map((l, i) => i).filter(i => importLineas[i].excedido);
    document.getElementById('imp-preview').innerHTML =
        tabla(`Para completar · ${comunes.length}`, comunes) +
        tabla(`Excedidos · ${excedidos.length} (no se crean ni cuentan como búsqueda activa)`, excedidos,
            '<p class="tip" style="font-style:normal">Si en un local excedido igual hay que cubrir el puesto, marcá <strong>Falta completar</strong>: se crea y cuenta como búsqueda activa.</p>') +
        salteadosHtml();
    actualizarBotonImportar();
}

// Excepción a mano: el local está excedido pero falta completar este puesto
// Con una excepción marcada, las vacantes abiertas de ese local tampoco pasan a "Excedido"
function nominaAActualizar() {
    const excepcion = new Set(importLineas.filter(l => l.faltaCompletar).map(l => normTxt(l.local)));
    return importNomina.filter(u => !(u.estado_nomina === 'EXCEDIDO' && excepcion.has(normTxt(busquedas.find(b => b.id === u.id)?.local))));
}
const DETALLE_EXCEPCION = 'Excepción: local excedido';
const esExcepcionNomina = b => b.estado_nomina === 'DEBE COMPLETAR' && b.nomina_detalle === DETALLE_EXCEPCION;
function marcarFaltaCompletar(i, si) {
    const l = importLineas[i];
    l.faltaCompletar = si;
    l.usar = si;
    l.estado_nomina = si ? 'DEBE COMPLETAR' : 'EXCEDIDO';
    l.nomina_detalle = si ? DETALLE_EXCEPCION : l.nomina_detalle_orig;
    renderImportPreview();
}

function actualizarBotonImportar() {
    const total = importLineas.filter(l => l.usar).reduce((a, l) => a + l.crear, 0);
    const locales = new Set(importLineas.filter(l => l.usar && l.crear).map(l => normTxt(l.local))).size;
    const act = nominaAActualizar().length;
    const btn = document.getElementById('btn-crear-importadas');
    btn.disabled = total === 0 && act === 0;
    btn.innerHTML = `<i class="fas fa-check"></i> ` + (total && act ? `Crear ${total} y actualizar ${act}`
        : act && !total ? `Actualizar nómina de ${act}` : `Crear ${total} vacante${total === 1 ? '' : 's'}`);
    if (importLineas.length) document.getElementById('imp-resumen').textContent = `${total} vacante${total === 1 ? '' : 's'} en ${locales} local${locales === 1 ? '' : 'es'}. "Ya abiertas" cuenta las que siguen abiertas en el portal para ese local y puesto, y se descuentan de "A crear".`
        + (act ? ` Además se actualiza la nómina de ${act} vacante${act === 1 ? '' : 's'} abierta${act === 1 ? '' : 's'}.` : '');
}

// El Mapa de equipos toma de la planilla el regional, el zonal y la nómina de cada local
async function actualizarMapaDesdeImport() {
    const cambios = [];
    importLocales.forEach(x => {
        const l = localDe(x.local);
        if (!l) return;
        const upd = {};
        if (x.regional && x.regional !== l.regional) upd.regional = x.regional;
        if (x.zonal && x.zonal !== l.zonal) upd.zonal = x.zonal;
        if (x.estado_nomina && x.estado_nomina !== l.estado_nomina) upd.estado_nomina = x.estado_nomina;
        if (Object.keys(upd).length) cambios.push({ l, upd });
    });
    for (let i = 0; i < cambios.length; i += 10) {
        const res = await Promise.all(cambios.slice(i, i + 10).map(c => sb.from('seleccion_locales').update(c.upd).eq('id', c.l.id).select()));
        res.forEach((r, k) => { if (!r.error && r.data?.[0]) Object.assign(cambios[i + k].l, r.data[0]); });
    }
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
    const act = nominaAActualizar().length;
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
        nominaAActualizar().forEach(u => {
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
        await actualizarMapaDesdeImport();
        if (creadas.length || actualizadas) refreshView();
        const hecho = [creadas.length ? `${creadas.length} vacantes creadas` : '', actualizadas ? `nómina actualizada en ${actualizadas}` : ''].filter(Boolean).join(' · ');
        if (error) { toast(`Error: ${msgError(error)}${hecho ? ' (' + hecho + ')' : ''}`, true); return; }
        closeModal('modal-importar');
        toast(hecho + ' ✓');
    } finally { _importando = false; btn.disabled = false; }
}
