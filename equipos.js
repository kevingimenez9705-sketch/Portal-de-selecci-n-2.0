// ══════════════════════════════════════════════
//  MAPA DE EQUIPOS — regional → zonal → locales y el selector de cada local
//  Al importar solicitudes, cada vacante toma el selector asignado acá a su local.
// ══════════════════════════════════════════════
let eqMarca = '', eqSelector = null;   // eqSelector: null = todos, '' = sin asignar

const NOMINA_PUNTO = { 'DEBE COMPLETAR': ['nomina-completar', 'Debe completar'], 'EXCEDIDO': ['nomina-excedido', 'Excedido'], 'COMPLETO': ['nomina-completo', 'Completo'] };

// Fotos de regionales y zonales: mismas que usa el Contador de Vacantes (repo de fotos, por nombre)
const FOTOS_BASE = 'https://raw.githubusercontent.com/kevingimenez9705-sketch/ascensos-/main/assets/photos/';
const slugPersona = n => String(n || '').split('·')[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function fotoPersonaHtml(nombre, marca, chica = false) {
    const slug = slugPersona(nombre);
    const ini = esc(iniciales(String(nombre || '').split('·')[0]));
    if (!slug || /^sin-/.test(slug)) return `<span class="eq-foto ${chica ? 'eq-foto-chica' : ''}">${ini}</span>`;
    // Extremas: hex-nombre.png o .jpg · Sabores: sabores-nombre.jpg
    const [url, otra] = marca === 'Hamburguesas Extremas' ? [`${FOTOS_BASE}hex-${slug}.png`, `${FOTOS_BASE}hex-${slug}.jpg`] : [`${FOTOS_BASE}sabores-${slug}.jpg`, ''];
    return `<span class="eq-foto ${chica ? 'eq-foto-chica' : ''}">${ini}<img src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer"
        onerror="${otra ? `if(!this.dataset.otra){this.dataset.otra=1;this.src='${esc(otra)}'}else ` : ''}this.remove()"></span>`;
}

// Regional y zonal salen de las hojas de asignaciones (Solicitudes y Asignaciones de cada marca). El Mapa
// muestra todos los locales; los que la última sincronización no vio en la hoja de su marca (6 h de margen)
// llevan "No está en la hoja" (muchos son próximas aperturas). Marca todavía sin sincronizar: no se marca.
const MARGEN_HOJA = 6 * 3600e3;
function fueraDeHoja() {
    const ultima = {};
    locales.forEach(l => { const t = Date.parse(l.en_hoja) || 0; if (t > (ultima[l.marca] || 0)) ultima[l.marca] = t; });
    return l => !!ultima[l.marca] && (Date.parse(l.en_hoja) || 0) < ultima[l.marca] - MARGEN_HOJA;
}
function eqLocalesMarca() { return locales.filter(l => !eqMarca || l.marca === eqMarca); }
const distintos = (lista, f) => [...new Set(lista.map(f).filter(Boolean))].sort((a, b) => a.localeCompare(b));

function eqElegirMarca(m) { eqMarca = eqMarca === m ? '' : m; eqSelector = null; renderEquipos(); }
function eqElegirSelector(s) { eqSelector = s === null || eqSelector === s ? null : s; renderEquipos(); }

function renderEquipos() {
    const base = eqLocalesMarca();
    const fuera = fueraDeHoja();
    // Tarjetas de marca: locales y zonales
    document.getElementById('equipos-marcas').innerHTML = MARCAS.map(m => {
        const ls = locales.filter(l => l.marca === m);
        return `<button class="eq-marca ${eqMarca === m ? 'activa' : ''}" data-m="${esc(m)}" onclick="eqElegirMarca(this.dataset.m)">
            <span class="eq-marca-nom">${esc(m)}</span>
            <span class="eq-marca-num"><strong>${ls.length}</strong> locales · <strong>${distintos(ls, l => l.zonal).length}</strong> zonales</span></button>`;
    }).join('');

    // Filtros de regional y zonal (dependen de la marca)
    const selReg = document.getElementById('eq-regional'), selZon = document.getElementById('eq-zonal');
    const reg = selReg.value, zon = selZon.value;
    selReg.innerHTML = optionsHtml(distintos(base, l => l.regional), reg, 'Todos los regionales');
    const zonales = distintos(base.filter(l => !selReg.value || l.regional === selReg.value), l => l.zonal);
    selZon.innerHTML = optionsHtml(zonales, zonales.includes(zon) ? zon : '', 'Todos los zonales');

    // Tarjetas de selector: cuántos locales tiene cada uno
    const sels = selectores();
    const cuenta = s => base.filter(l => (l.selector || '') === s).length;
    // "Ver todos" primero: saca el filtro de selector
    const todos = `<button class="eq-sel eq-sel-todos ${eqSelector === null ? 'activa' : ''}" onclick="eqElegirSelector(null)">
            <span class="avatar avatar-eq eq-todos" aria-hidden="true"><i class="fas fa-users"></i></span>
            <span><span class="eq-sel-nom">Ver todos</span><span class="eq-sel-num">${base.length} local${base.length === 1 ? '' : 'es'}</span></span></button>`;
    document.getElementById('equipos-selectores').innerHTML = todos + [...sels, ''].map(s => {
        const n = cuenta(s);
        if (!s && !n) return '';
        return `<button class="eq-sel ${eqSelector === s ? 'activa' : ''}" ${s ? `style="--team:${colorDe(s)}"` : ''} data-s="${esc(s)}" onclick="eqElegirSelector(this.dataset.s)">
            ${s ? avatarHtml(s, 'avatar-eq') : '<span class="avatar avatar-eq eq-sin"><i class="fas fa-question"></i></span>'}
            <span><span class="eq-sel-nom">${s ? esc(s) : 'Sin asignar'}</span><span class="eq-sel-num">${n} local${n === 1 ? '' : 'es'}</span></span></button>`;
    }).join('');

    // Árbol filtrado
    const q = normTxt(document.getElementById('eq-buscar').value);
    const lista = base.filter(l => (!selReg.value || l.regional === selReg.value) && (!selZon.value || l.zonal === selZon.value)
        && (eqSelector === null || (l.selector || '') === eqSelector)
        && (!q || [l.local, l.zonal, l.regional, l.localidad].some(v => normTxt(v).includes(q))));
    const box = document.getElementById('equipos-arbol');
    // Vista Mapa: la misma lista filtrada, en el mapa (mapa.js)
    box.classList.toggle('hidden', eqModoMapa);
    document.getElementById('equipos-mapa').classList.toggle('hidden', !eqModoMapa);
    if (eqModoMapa) { pintarMapaEquipos(lista, fuera); return; }
    if (!locales.length) { box.innerHTML = '<div class="tip eq-vacio">No hay locales cargados.</div>'; return; }
    if (!lista.length) { box.innerHTML = '<div class="tip eq-vacio">Ningún local coincide con el filtro.</div>'; return; }
    const porReg = agrupar(lista, l => l.regional || 'Sin regional');
    box.innerHTML = Object.keys(porReg).sort((a, b) => a.localeCompare(b)).map(r => {
        const porZon = agrupar(porReg[r], l => l.zonal || 'Sin zonal');
        return `<div class="eq-regional">
            <div class="eq-regional-tit">${fotoPersonaHtml(r, porReg[r][0].marca)}<span class="eq-regional-nom">Regional · ${esc(r)}</span><span>${porReg[r].length} locales · ${Object.keys(porZon).length} zonales</span></div>
            <div class="eq-zonales">${Object.keys(porZon).sort((a, b) => a.localeCompare(b)).map(z => {
                const ls = porZon[z].sort((a, b) => a.local.localeCompare(b.local));
                const ids = ls.map(l => l.id).join(',');
                const unico = distintos(ls, l => l.selector || '-');
                return `<div class="eq-zonal">
                    <div class="eq-zonal-tit"><span>${fotoPersonaHtml(z, ls[0].marca, true)}${esc(z)}</span>
                        <select class="filter-select eq-asignar" title="Asignar un selector a todos los locales del zonal" onchange="asignarSelector([${ids}], this.value, this)">
                            ${optionsHtml(sels, unico.length === 1 && unico[0] !== '-' ? unico[0] : null, unico.length > 1 ? 'Varios selectores…' : '— Sin asignar —')}</select></div>
                    ${ls.map(l => {
                        const [cls, txt] = NOMINA_PUNTO[l.estado_nomina] || ['nomina-sin', 'Sin dato de nómina'];
                        return `<div class="eq-local"><span class="eq-punto ${cls}" title="${txt}"></span>
                            <span class="eq-local-nom">${esc(l.local)}${eqMarca ? '' : ` <span class="eq-local-marca">${l.marca === 'Sabores Express' ? (esMania(l.local) ? 'Mania' : 'Sabores') : 'Extremas'}</span>`}${fuera(l) ? ' <span class="eq-local-fuera" title="No figura en la hoja Solicitudes y Asignaciones de su marca">No está en la hoja</span>' : ''}</span>
                            <select class="filter-select eq-asignar" onchange="asignarSelector([${l.id}], this.value, this)">${optionsHtml(sels, l.selector || null, '— Sin asignar —')}</select></div>`;
                    }).join('')}
                </div>`;
            }).join('')}</div></div>`;
    }).join('') + `<div class="eq-leyenda">${Object.values(NOMINA_PUNTO).map(([c, t]) => `<span><i class="eq-punto ${c}"></i>${t}</span>`).join('')}</div>`;
}

// Asigna el selector a los locales y a sus vacantes abiertas del tablero
async function asignarSelector(ids, selector, el) {
    const ls = locales.filter(l => ids.includes(l.id));
    const nuevo = selector || null;
    const set = new Set(ls.map(l => l.id));
    const vacs = busquedas.filter(b => vacanteAbierta(b) && set.has(localDe(b.local)?.id) && (b.selector || null) !== nuevo);
    if (ls.length > 1 && !(await confirmar(`¿Asignar ${nuevo || 'ningún selector'} a ${ls.length} locales${vacs.length ? ` y a sus ${vacs.length} vacantes abiertas` : ''}?`, 'Asignar'))) { renderEquipos(); return; }
    if (el) el.disabled = true;
    const r = await sb.from('seleccion_locales').update({ selector: nuevo }).in('id', ids).select('id, selector');
    if (r.error) { toast('Error al asignar: ' + msgError(r.error), true); renderEquipos(); return; }
    (r.data || []).forEach(d => { const l = locales.find(x => x.id === d.id); if (l) l.selector = d.selector; });
    let nv = 0;
    if (vacs.length) {
        const rv = await sb.from('seleccion_busquedas').update({ selector: nuevo }).in('id', vacs.map(b => b.id)).select('id, selector');
        if (rv.error) toast('Locales asignados, pero no las vacantes: ' + msgError(rv.error), true);
        else (rv.data || []).forEach(d => { const b = busquedas.find(x => x.id === d.id); if (b) { b.selector = d.selector; nv++; } });
    }
    renderEquipos();
    toast(`${nuevo || 'Sin selector'} ✓ ${ls.length} local${ls.length === 1 ? '' : 'es'}${nv ? ` · ${nv} vacante${nv === 1 ? '' : 's'} abiertas` : ''}`);
}
