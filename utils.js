// ══════════════════════════════════════════════
//  UTILIDADES Y HELPERS
// ══════════════════════════════════════════════
function verifEnCurso(r) { return VERIF_EN_CURSO.includes(r); }
function isAdmin() { return currentProfile?.rol === 'admin'; }
function today() { return new Date().toISOString().slice(0, 10); }

let toastTimer;
function toast(msg, isError = false) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'show' + (isError ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.className = '', 3000);
}

// ── DÍAS HÁBILES ──
function workingDaysDiff(from, to = null) {
    if (!from) return 0;
    const start = new Date(from + 'T00:00:00');
    const end   = to ? new Date(to + 'T00:00:00') : new Date();
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    if (end <= start) return 0;
    let count = 0;
    const cur = new Date(start);
    cur.setDate(cur.getDate() + 1);
    while (cur <= end) {
        const dow = cur.getDay();
        if (dow !== 0 && dow !== 6) count++;
        cur.setDate(cur.getDate() + 1);
    }
    return count;
}
function daysDiff(from, to = null) { return workingDaysDiff(from, to); }

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
    return 'motivo-pdf';
}
function psicoClass(r) {
    if (r === 'Apto') return 'res-apto';
    if (r === 'Apto con observaciones') return 'res-obs';
    if (r === 'Apto con reservas') return 'res-reservas';
    return 'res-noapto';
}
function verifClass(r) {
    if (r === 'OK' || r === 'Apto') return 'res-apto';
    if (r === 'Observado') return 'res-reservas';
    if (r === 'No Apto' || r === 'Rechazado') return 'res-noapto';
    return 'res-obs';
}
function tagClass(s) {
    if (s === 'Proceso') return 'tag-proceso';
    if (s === 'Cerrada') return 'tag-cerrada';
    if (s === 'Sustituida') return 'tag-sustituida';
    if (s === 'Finalizada') return 'tag-finalizada';
    return 'tag-pausada';
}
function fmtMoney(n) {
    if (!n || n === 0) return '$ —';
    return '$ ' + new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n);
}

// ── MODALES ──
function openModal(id = 'modal-nueva') {
    if (id === 'modal-nueva') {
        const catSel = document.getElementById('n-categoria');
        if (catSel) catSel.value = (typeof pipelineCat !== 'undefined') ? pipelineCat : 'general';
    }
    document.getElementById(id).classList.remove('hidden');
}
function closeModal(id = 'modal-nueva') { document.getElementById(id).classList.add('hidden'); }
