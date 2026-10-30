// ══════════════════════════════════════════════
//  PROCESOS DE TAREAS GRUPALES
//  · Datos de ingreso (CopiarDatosIngreso.gs): las respuestas del formulario de ingreso
//    completan los datos de la persona en su vacante, buscándola por email.
//  · iCheck (pestaña exportacion_icheck): las vacantes en HUELLA se bajan con las
//    columnas de iCheck; después de subirlas, "Ya los cargué" las saca de la lista.
// ══════════════════════════════════════════════

// ── DATOS DE INGRESO ──
const CAMPOS_INGRESO = ['nombre', 'apellido', 'tel', 'tel_emergencia', 'fecha_nacimiento', 'nacionalidad', 'cuil', 'dni', 'sexo',
    'domicilio', 'domicilio_numero', 'codigo_postal', 'localidad', 'provincia', 'pais'];
let ingresoCambios = [];
let _aplicandoIngreso = false;

async function openDatosIngreso() {
    const box = document.getElementById('ingreso-content');
    const btn = document.getElementById('btn-aplicar-ingreso');
    ingresoCambios = [];
    btn.disabled = true;
    box.innerHTML = '<span class="tip">Buscando respuestas del formulario de ingreso…</span>';
    openModal('modal-ingreso');

    let ingresos;
    try { ingresos = await fetchTodo('seleccion_ingresos'); }
    catch (e) { box.innerHTML = `<span class="tip">No se pudieron leer las respuestas: ${esc(msgError(e))}</span>`; return; }
    if (!ingresos.length) {
        box.innerHTML = '<p class="tip" style="font-style:normal">Todavía no llegó ninguna respuesta del formulario de ingreso. Llegan solas cada 10 minutos desde la pestaña Proceso de Ingreso de TAREAS GRUPALES (flujo de n8n).</p>';
        return;
    }

    // De cada email vale la respuesta más nueva
    const porEmail = new Map();
    ingresos.forEach(i => {
        const k = String(i.email || '').trim().toLowerCase();
        const previa = porEmail.get(k);
        if (!previa || String(i.marca_temporal) > String(previa.marca_temporal)) porEmail.set(k, i);
    });

    let sinRespuesta = 0;
    busquedas.forEach(b => {
        const email = String(b.email || '').trim().toLowerCase().replace(/\s+/g, '');
        if (!email) return;
        const i = porEmail.get(email);
        if (!i) { sinRespuesta++; return; }
        const cambios = {};
        CAMPOS_INGRESO.forEach(f => {
            let v = i[f];
            if (v == null || v === '') return;          // un dato vacío del formulario no borra lo que ya hay
            v = f === 'sexo' ? sexoDe(v) : mayus(f, String(v).trim());
            if (v && String(b[f] ?? '') !== v) cambios[f] = v;
        });
        if (!Object.keys(cambios).length) return;
        if ((cambios.nombre || cambios.apellido) && b.estado === 'COMUNICADO') cambios.ingreso_nombre = nombreCompleto({ ...b, ...cambios });
        ingresoCambios.push({ b, cambios, recibido: i.marca_temporal });
    });

    const titulo = f => COLUMNAS.find(c => c.f === f)?.t || f;
    box.innerHTML = `
        <p class="tip" style="font-style:normal;margin-bottom:10px">
            <strong>${ingresoCambios.length}</strong> vacante${ingresoCambios.length === 1 ? '' : 's'} se completa${ingresoCambios.length === 1 ? '' : 'n'} con el formulario de ingreso ·
            ${sinRespuesta} con email todavía sin respuesta · ${porEmail.size} respuestas recibidas.
            Se busca por email y no se borra nada que ya esté cargado.</p>
        ${ingresoCambios.length ? `<div class="table-wrap" style="max-height:52vh">
            <table class="tabla-informe">
                <thead><tr><th>N°</th><th>Persona</th><th>Vacante</th><th>Se completa</th><th>Respuesta del</th></tr></thead>
                <tbody>${ingresoCambios.map(({ b, cambios, recibido }) => `<tr>
                    <td class="mono">${esc(b.numero)}</td>
                    <td><strong>${esc(nombreCompleto({ ...b, ...cambios }) || '—')}</strong><div class="cand-meta">${esc(b.email)}</div></td>
                    <td>${esc(b.local)}<div class="cand-meta">${esc(b.puesto)}</div></td>
                    <td class="cand-meta">${Object.keys(cambios).filter(f => f !== 'ingreso_nombre').map(f => esc(titulo(f))).join(', ')}</td>
                    <td class="mono">${fmtFecha(String(recibido).slice(0, 10))}</td>
                </tr>`).join('')}</tbody>
            </table></div>` : '<span class="tip">Todas las vacantes ya tienen los datos del formulario.</span>'}`;
    btn.disabled = !ingresoCambios.length;
    btn.innerHTML = `<i class="fas fa-check"></i> Completar ${ingresoCambios.length} vacante${ingresoCambios.length === 1 ? '' : 's'}`;
}

async function aplicarDatosIngreso() {
    if (_aplicandoIngreso || !ingresoCambios.length) return;
    _aplicandoIngreso = true;
    const btn = document.getElementById('btn-aplicar-ingreso');
    btn.disabled = true;
    let ok = 0, error = null;
    try {
        for (let i = 0; i < ingresoCambios.length && !error; i += 10) {
            const lote = ingresoCambios.slice(i, i + 10);
            const res = await Promise.all(lote.map(({ b, cambios }) => sb.from('seleccion_busquedas').update(cambios).eq('id', b.id).select()));
            res.forEach(r => {
                if (r.error) { error = error || r.error; return; }
                if (r.data?.[0]) { aplicarCambiosBusqueda(r.data[0]); ok++; }
            });
        }
        refreshView();
        if (error) { toast(`Error: ${msgError(error)} (se completaron ${ok})`, true); return; }
        closeModal('modal-ingreso');
        toast(`Datos de ingreso copiados en ${ok} vacante${ok === 1 ? '' : 's'} ✓`);
    } finally { _aplicandoIngreso = false; btn.disabled = false; }
}

// ── ICHECK ──
const ICHECK_COLUMNAS = ['NOMBRES (*)', 'APELLIDO (*)', 'SEXO (M-F-X)', 'NUMERO DE DNI (*)', 'NUMERO DE CUIL', 'FECHA DE NACIMIENTO', 'MAIL',
    'LEGAJO', 'SUCURSAL', 'FECHA DE INGRESO', 'DOMICILIO', 'NÚMERO', 'PISO', 'DTO', 'LOCALIDAD', 'PROVINCIA', 'PAIS', 'CODIGO POSTAL',
    'TELEFONO', 'CELULAR', 'RAZON SOCIAL', 'DEPARTAMENTO', 'CATEGORIA', 'TURNO', 'INTERVALO', 'OBSERVACIONES', 'BANCO', 'CBU',
    'NACIONALIDAD', 'OBRA SOCIAL'];
const ICHECK_OBLIGATORIOS = ['nombre', 'apellido', 'dni', 'ingreso'];

const fechaIcheck = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${+m[3]}/${+m[2]}/${m[1]}` : ''; };
const categoriaIcheck = puesto => String(puesto || '').replace(/\s*\(.*\)\s*$/, '').trim();

function pendientesIcheck(incluirCargados = false) {
    return busquedas.filter(b => b.estado === 'HUELLA' && (incluirCargados || !b.icheck_exportado))
        .sort((a, b) => String(a.ingreso || '').localeCompare(String(b.ingreso || '')) || a.id - b.id);
}

function filaIcheck(b) {
    return [b.nombre, b.apellido, b.sexo, b.dni, b.cuil, fechaIcheck(b.fecha_nacimiento), b.email, b.dni, b.local, fechaIcheck(b.ingreso),
        b.domicilio, b.domicilio_numero, '', '', b.localidad, b.provincia, b.pais, b.codigo_postal, b.tel, '',
        (infoLocal(b.local)?.razon_social || '').toUpperCase(), '', categoriaIcheck(b.puesto), 'UNICO', '', '', '', '', b.nacionalidad, '']
        .map(v => v == null ? '' : v);
}

function openIcheck() {
    renderIcheck();
    openModal('modal-icheck');
}

function renderIcheck() {
    const todos = document.getElementById('icheck-todos').checked;
    const lista = pendientesIcheck(todos);
    const faltan = b => ICHECK_OBLIGATORIOS.filter(f => !b[f]).map(f => COLUMNAS.find(c => c.f === f)?.t || f);
    document.getElementById('icheck-content').innerHTML = lista.length ? `
        <div class="table-wrap" style="max-height:52vh">
            <table class="tabla-informe">
                <thead><tr><th>N°</th><th>Persona</th><th>DNI</th><th>Sucursal</th><th>Primer día</th><th>Categoría</th><th></th></tr></thead>
                <tbody>${lista.map(b => {
                    const f = faltan(b);
                    return `<tr class="${f.length ? 'fila-alerta' : ''}">
                        <td><button class="link-btn" data-num="${esc(b.numero)}" onclick="closeModal('modal-icheck');verEnPipeline(this.dataset.num)">${esc(b.numero)}</button></td>
                        <td><strong>${esc(nombreCompleto(b) || '—')}</strong></td>
                        <td class="mono">${esc(b.dni || '—')}</td>
                        <td>${esc(b.local)}</td>
                        <td class="mono">${fmtFecha(b.ingreso) || '—'}</td>
                        <td>${esc(categoriaIcheck(b.puesto))}</td>
                        <td>${f.length ? `<span class="tip" style="color:var(--red);font-style:normal">Falta: ${esc(f.join(', '))}</span>`
                            : b.icheck_exportado ? `<span class="tip">Cargado ${fmtFecha(b.icheck_exportado)}</span>` : ''}</td>
                    </tr>`;
                }).join('')}</tbody>
            </table></div>`
        : `<span class="tip">No hay vacantes en HUELLA ${todos ? '' : 'pendientes de cargar '}en iCheck.</span>`;
    const pendientes = lista.filter(b => !b.icheck_exportado).length;
    document.getElementById('icheck-resumen').textContent = `${lista.length} en HUELLA${todos ? '' : ' para cargar'}`;
    document.getElementById('btn-icheck-bajar').disabled = !lista.length;
    document.getElementById('btn-icheck-cargados').disabled = !pendientes;
}

function descargarIcheck() {
    const lista = pendientesIcheck(document.getElementById('icheck-todos').checked);
    if (!lista.length) return;
    descargarCSV(`icheck_${today()}.csv`, ICHECK_COLUMNAS, lista.map(filaIcheck));
    toast(`Archivo de iCheck con ${lista.length} persona${lista.length === 1 ? '' : 's'} ✓`);
}

let _marcandoIcheck = false;
async function marcarIcheckCargados() {
    const lista = pendientesIcheck(false);
    if (_marcandoIcheck || !lista.length) return;
    if (!(await confirmar(`¿Ya cargaste en iCheck a ${lista.length} persona${lista.length === 1 ? '' : 's'}? Salen de la lista de pendientes (siguen en HUELLA).`, 'Ya los cargué'))) return;
    _marcandoIcheck = true;
    try {
        const { data, error } = await sb.from('seleccion_busquedas').update({ icheck_exportado: today() }).in('id', lista.map(b => b.id)).select('id, icheck_exportado');
        if (error) { toast('Error al guardar: ' + msgError(error), true); return; }
        (data || []).forEach(aplicarCambiosBusqueda);
        renderIcheck();
        refreshView();
        toast('Marcados como cargados en iCheck ✓');
    } finally { _marcandoIcheck = false; }
}

// Contador en el botón de arriba: cuántos esperan para iCheck
function actualizarBotonIcheck() {
    const el = document.getElementById('icheck-count');
    if (!el) return;
    const n = pendientesIcheck(false).length;
    el.textContent = n || '';
    el.classList.toggle('hidden', !n);
}
