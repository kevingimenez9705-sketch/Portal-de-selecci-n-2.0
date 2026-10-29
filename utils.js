// ══════════════════════════════════════════════
//  UTILIDADES Y HELPERS
// ══════════════════════════════════════════════
// Con el código del equipo todos pueden todo (como la cuenta compartida del panel de Staff)
function isAdmin() { return true; }

// Fecha local (AAAA-MM-DD). toISOString() da la fecha UTC: en Argentina,
// después de las 21 hs devolvía el día de mañana.
function fechaLocalISO(d = new Date()) {
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function today() { return fechaLocalISO(); }

// Escapa texto cargado por usuarios antes de meterlo en el HTML.
function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// No guardar fechas con año inválido (scroll accidental sobre el input, edición a medias).
function fechaValida(val) {
    if (!val) return true;
    const m = /^(\d{4})-\d{2}-\d{2}$/.exec(val);
    if (!m) return true;
    return +m[1] >= 2000 && +m[1] <= 2100;
}

// El scroll del mouse sobre un input de fecha/número con foco le cambiaba el valor.
document.addEventListener('wheel', e => {
    const el = e.target;
    if (el && el.tagName === 'INPUT' && (el.type === 'date' || el.type === 'number') && document.activeElement === el) e.preventDefault();
}, { passive: false });

let toastTimer;
function toast(msg, isError = false) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'show' + (isError ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.className = '', isError ? 6000 : 3000);
}

// ── DÍAS HÁBILES ──
// Cuenta lunes a viernes entre (from, to]. Cálculo directo: con una fecha de año
// corrupto, iterar día por día colgaba la pestaña.
function workingDaysDiff(from, to = null) {
    if (!from || !fechaValida(from) || (to && !fechaValida(to))) return 0;
    const start = new Date(from + 'T00:00:00');
    const end   = to ? new Date(to + 'T00:00:00') : new Date();
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    if (isNaN(start) || isNaN(end) || end <= start) return 0;
    const totalDias = Math.round((end - start) / 86400000);
    if (totalDias > 200000) return 0;
    let count = Math.floor(totalDias / 7) * 5;
    let dow = (start.getDay() + 1) % 7;
    for (let i = 0; i < totalDias % 7; i++) {
        if (dow !== 0 && dow !== 6) count++;
        dow = (dow + 1) % 7;
    }
    return count;
}
function daysDiff(from, to = null) { return workingDaysDiff(from, to); }

function fmtFechaCorta(iso) {
    if (!iso) return '';
    const [, m, d] = iso.split('-');
    return `${d}/${m}`;
}
function fmtFecha(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
}
function edad(fechaNac) {
    if (!fechaNac) return '';
    const n = new Date(fechaNac + 'T00:00:00'), h = new Date();
    let e = h.getFullYear() - n.getFullYear();
    if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) e--;
    return e > 0 && e < 100 ? e : '';
}

// Link de WhatsApp a partir del teléfono como se carga en las planillas (1156458362, +54 9 11…, 011…)
function waLink(tel) {
    let d = String(tel || '').replace(/\D/g, '');
    if (!d) return '';
    if (!d.startsWith('54')) {
        d = d.replace(/^0/, '');
        if (d.length === 10) d = '549' + d;
    }
    return 'https://wa.me/' + d;
}

// ── EQUIPO ──
function selectores() { return equipo.filter(e => e.activo && e.es_selector).map(e => e.nombre); }
// Solo #rrggbb: el color va dentro de atributos style y se le suma transparencia ("…1a")
function colorDe(nombre) {
    const i = equipo.findIndex(e => e.nombre === nombre);
    if (i === -1) return '#7a7166';
    return /^#[0-9a-f]{6}$/i.test(equipo[i].color || '') ? equipo[i].color : COLORES_EQUIPO[i % COLORES_EQUIPO.length];
}
function iniciales(nombre) {
    return String(nombre || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
}
function nombrePostulante(p) { return p ? [p.nombre, p.apellido].filter(Boolean).join(' ') : '(postulante borrado)'; }

// ── CLASES DE ESTILO ──
function demoraClass(dias, nivel) {
    const lim = DEMORA_LIMITE[nivel] || 15;
    if (dias <= lim * 0.6) return 'demora-ok';
    if (dias <= lim) return 'demora-warn';
    return 'demora-danger';
}
function motivoClass(m) {
    if (m === 'Expansión') return 'motivo-expansion';
    if (m === 'Rotación') return 'motivo-rotacion';
    if (m === 'Apertura') return 'motivo-apertura';
    return 'motivo-pdf';
}
function tagClass(s) {
    if (s === 'Proceso') return 'tag-proceso';
    if (s === 'Cerrada') return 'tag-cerrada';
    if (s === 'Cancelada') return 'tag-cancelada';
    if (s === 'Finalizada') return 'tag-finalizada';
    return 'tag-pausada';
}
function candClass(estado) {
    if (estado === 'Ingresó') return 'cand-ok';
    if (CAND_SALIDA.includes(estado)) return 'cand-out';
    return '';
}
function marcaClass(m) {
    if (m === 'Sabores Express') return 'marca-sabores';
    if (m === 'Hamburguesas Extremas') return 'marca-extremas';
    return '';
}
// Tarjeta de número con barra de color (mismo estilo que el Contador de Vacantes)
function kpiHtml(num, lbl, tono = 'violeta', sub = '') {
    return `<div class="kpi kpi--${tono}"><div class="kpi-num">${num}</div><div class="kpi-lbl">${lbl}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ''}</div>`;
}
function docClass(v) {
    if (v === 'Sí') return 'doc-ok';
    if (v === 'En trámite') return 'doc-warn';
    return 'doc-no';
}

// ── HTML chico reutilizado ──
function optionsHtml(lista, actual, vacio = null) {
    return (vacio !== null ? `<option value="">${esc(vacio)}</option>` : '')
        + lista.map(o => `<option value="${esc(o)}" ${o === actual ? 'selected' : ''}>${esc(o)}</option>`).join('');
}
// Valores ya usados + sugeridos, para los datalist (local, regional, zonal, puesto…)
function valoresUsados(campo, extra = []) {
    return [...new Set([...extra, ...busquedas.map(b => b[campo]).filter(Boolean)])].sort((a, b) => a.localeCompare(b));
}

function csvEscape(val) {
    if (val === null || val === undefined) return '';
    const s = String(val);
    return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function descargarCSV(nombre, headers, rows) {
    const csv = [headers, ...rows].map(r => r.map(csvEscape).join(';')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ── MODALES ──
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
document.querySelectorAll('.modal-bg').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.add('hidden'); }));

// ── DIÁLOGOS PROPIOS (reemplazan confirm() / prompt()) ──
// Embebida en Google Sites el navegador bloquea confirm()/prompt() y devuelven
// "Cancelar" sin mostrar nada. Este diálogo es HTML de la página y funciona igual.
function dialogo({ mensaje, okTexto = 'Aceptar', peligro = false, input = null }) {
    return new Promise(resolve => {
        const bg = document.createElement('div');
        bg.className = 'modal-bg';
        bg.style.zIndex = 200;
        bg.innerHTML = `
            <div class="modal-box" style="max-width:440px" role="dialog" aria-modal="true">
                <div style="font-size:14px;line-height:1.5;white-space:pre-line">${esc(mensaje)}</div>
                ${input !== null ? `<input class="form-input" style="margin-top:12px" value="${esc(input)}">` : ''}
                <div class="modal-footer">
                    <button class="btn-cancel" data-r="no">Cancelar</button>
                    <button class="btn-primary${peligro ? ' btn-danger-solid' : ''}" data-r="si">${esc(okTexto)}</button>
                </div>
            </div>`;
        const inp = bg.querySelector('input');
        const cerrar = ok => {
            document.removeEventListener('keydown', onKey);
            bg.remove();
            resolve(input !== null ? (ok ? inp.value : null) : ok);
        };
        const onKey = e => { if (e.key === 'Escape') cerrar(false); if (e.key === 'Enter') cerrar(true); };
        bg.addEventListener('click', e => {
            if (e.target === bg) cerrar(false);
            const r = e.target.closest('[data-r]')?.dataset.r;
            if (r) cerrar(r === 'si');
        });
        document.addEventListener('keydown', onKey);
        document.body.appendChild(bg);
        (inp || bg.querySelector('[data-r="si"]')).focus();
    });
}
function confirmar(mensaje, okTexto = 'Confirmar') {
    return dialogo({ mensaje, okTexto, peligro: /eliminar|borrar|quitar/i.test(mensaje) });
}
function pedirTexto(mensaje, valorInicial = '') {
    return dialogo({ mensaje, input: valorInicial });
}
