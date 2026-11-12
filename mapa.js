// ══════════════════════════════════════════════
//  MAPA DE EQUIPOS · vista "Mapa"
//  Mapa real con calles (MapLibre + OpenFreeMap: gratis, sin clave). Cada local es una columna:
//  color por regional / zonal / selector / nómina y altura por vacantes abiertas. Usa los mismos
//  filtros que la lista (marca, regional, zonal, selector, búsqueda).
//  Ubicación aproximada: el centro de la localidad del local; los de una misma localidad se reparten
//  alrededor. Los que no están en la hoja de asignaciones se ven transparentes (próximas aperturas).
// ══════════════════════════════════════════════
const MAPA_LIB = { js: 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js', css: 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css' };
const MAPA_ESTILO = 'https://tiles.openfreemap.org/styles/liberty';
const MAPA_INICIO = { center: [-58.56, -34.63], zoom: 9.7, pitch: 50, bearing: -15 };

let eqModoMapa = false, eqMapaColor = 'regional';
let _eqMapa = null, _eqMapaListo = false, _eqMapaLib = null, _eqMapaDatos = { lista: [], fuera: () => false }, _eqMapaPuntos = [];

// Centro aproximado de cada localidad [lng, lat]
const MAPA_COORDS = (() => {
    const c = {
        'Barracas': [-58.383, -34.645], 'Belgrano': [-58.456, -34.562], 'Boedo': [-58.417, -34.630], 'Caballito': [-58.442, -34.619],
        'Callao': [-58.392, -34.604], 'Chilavert': [-58.420, -34.655], 'Constitución': [-58.381, -34.627], 'Corrientes': [-58.405, -34.603],
        'Entre Ríos': [-58.391, -34.615], 'Flores': [-58.463, -34.628], 'Florida': [-58.375, -34.600], 'Lacroze': [-58.455, -34.587],
        'Lavalle': [-58.380, -34.602], 'Lugano': [-58.473, -34.676], 'Mataderos': [-58.502, -34.660], 'Obelisco': [-58.3816, -34.6037],
        'Once': [-58.406, -34.609], 'Palermo': [-58.430, -34.588], 'Parque Chacabuco': [-58.437, -34.635], 'Pompeya': [-58.415, -34.650],
        'Pueyrredón': [-58.400, -34.604], 'Recoleta': [-58.393, -34.588], 'Retiro': [-58.375, -34.592], 'Tucumán': [-58.385, -34.601],
        'Villa del Parque': [-58.490, -34.605], 'Villa Real': [-58.525, -34.620], 'Villa Urquiza': [-58.485, -34.573], 'Villa Soldati': [-58.445, -34.665],
        'Adolfo Sourdeaux': [-58.660, -34.500], 'Bella Vista': [-58.690, -34.560], 'Benavídez': [-58.700, -34.410], 'Boulogne': [-58.570, -34.500],
        'Del Viso': [-58.795, -34.450], 'Don Torcuato': [-58.620, -34.493], 'El Talar': [-58.655, -34.468], 'Escobar': [-58.795, -34.350],
        'Garín': [-58.760, -34.420], 'General Pacheco': [-58.640, -34.460], 'Gran Bourg': [-58.725, -34.490], 'José C. Paz': [-58.770, -34.515],
        'José León Suárez': [-58.580, -34.533], 'Los Polvorines': [-58.700, -34.505], 'Manuel Alberti': [-58.770, -34.455],
        'Maquinista Savio': [-58.780, -34.400], 'Martínez': [-58.505, -34.490], 'Maschwitz': [-58.745, -34.385], 'Munro': [-58.523, -34.528],
        'Olivos': [-58.490, -34.507], 'Pilar': [-58.914, -34.458], 'Pte. Saavedra': [-58.505, -34.545], 'San Fernando': [-58.560, -34.443],
        'San Isidro': [-58.512, -34.471], 'San Martín': [-58.537, -34.574], 'San Miguel': [-58.712, -34.543], 'Tigre': [-58.580, -34.426],
        'Tortuguitas': [-58.750, -34.470], 'Vicente López': [-58.475, -34.525], 'Villa Adelina': [-58.545, -34.517],
        'Villa Ballester': [-58.555, -34.548], 'Virreyes': [-58.575, -34.450],
        'Caseros': [-58.563, -34.605], 'Castelar': [-58.645, -34.652], 'Ciudadela': [-58.535, -34.632], 'Crovara': [-58.540, -34.700],
        'El Palomar': [-58.595, -34.615], 'General Rodríguez': [-58.952, -34.608], 'Gonzalez Catan': [-58.645, -34.770], 'Haedo': [-58.595, -34.645],
        'Hurlingham': [-58.635, -34.590], 'Isidro Casanova': [-58.585, -34.705], 'Ituzaingó': [-58.670, -34.658], 'Laferrere': [-58.590, -34.750],
        'Liniers': [-58.520, -34.642], 'Loma Hermosa': [-58.600, -34.580], 'Lomas del Mirador': [-58.530, -34.665], 'Luján': [-59.105, -34.570],
        'Merlo': [-58.728, -34.665], 'Moreno': [-58.790, -34.650], 'Morón': [-58.620, -34.653], 'Padua': [-58.700, -34.665],
        'Paso del Rey': [-58.760, -34.650], 'Rafael Castillo': [-58.625, -34.715], 'Ramos Mejía': [-58.565, -34.645], 'San Justo': [-58.560, -34.683],
        'Santos Lugares': [-58.540, -34.600], 'Tapiales': [-58.510, -34.702], 'William Morris': [-58.665, -34.590],
        'Adrogué': [-58.390, -34.800], 'Avellaneda': [-58.365, -34.662], 'Banfield': [-58.395, -34.745], 'Berazategui': [-58.212, -34.763],
        'Burzaco': [-58.392, -34.828], 'Claypole': [-58.335, -34.800], 'El Jagüel': [-58.495, -34.825], 'Ezeiza': [-58.523, -34.853],
        'Florencio Varela': [-58.276, -34.808], 'Gerli': [-58.380, -34.688], 'Glew': [-58.384, -34.886], 'La Plata': [-57.955, -34.921],
        'Lanús': [-58.392, -34.700], 'Lomas de Zamora': [-58.406, -34.761], 'Monte Grande': [-58.468, -34.818], 'Quilmes': [-58.254, -34.723],
        'Solano': [-58.315, -34.780], 'Temperley': [-58.395, -34.775], 'Tristán Suárez': [-58.565, -34.885], 'Valentin Alsina': [-58.410, -34.672],
        'Wilde': [-58.320, -34.700], 'Campana': [-58.959, -34.163], 'Zárate': [-59.028, -34.098],
        'Córdoba': [-64.183, -31.420], 'Rosario': [-60.639, -32.947], 'Mar del Plata': [-57.556, -38.002], 'Paraná': [-60.529, -31.732],
        'Santa Fe': [-60.700, -31.633], 'San Nicolás': [-60.211, -33.334], 'Lezama': [-57.894, -35.866], 'Pergamino': [-60.573, -33.889],
        'Tandil': [-59.134, -37.321], 'Villa María': [-63.240, -32.407]
    };
    const m = new Map(Object.entries(c).map(([k, v]) => [normTxt(k), v]));
    // Nombres cortos que usan los locales ("SABORES MDQ 3", "EXTREMAS VARELA")
    [['MDQ', 'Mar del Plata'], ['VARELA', 'Florencio Varela'], ['CRUCE VARELA', 'Florencio Varela'], ['PACHECO', 'General Pacheco'],
     ['RAMOS', 'Ramos Mejía'], ['TALAR', 'El Talar'], ['GRAL RODRIGUEZ', 'General Rodríguez'], ['RODRIGUEZ', 'General Rodríguez'],
     ['POLVORINES', 'Los Polvorines'], ['ALBERTI', 'Manuel Alberti'], ['SAVIO', 'Maquinista Savio'], ['URQUIZA', 'Villa Urquiza'],
     ['PELLEGRINI', 'Obelisco'], ['PTE SAAVEDRA', 'Pte. Saavedra'], ['GRAND BOURG', 'Gran Bourg'], ['JOSE C PAZ', 'José C. Paz'],
     ['CRUCE CASTELAR', 'Castelar']].forEach(([a, b]) => m.set(a, c[b]));
    return m;
})();
const MAPA_ZONA = { CABA: [-58.44, -34.61], NORTE: [-58.62, -34.47], OESTE: [-58.68, -34.65], SUR: [-58.38, -34.78] };

// Dónde va el local: su localidad; si no, el nombre ("SABORES CAMPANA 2" → CAMPANA); si no, el centro de su zona
function coordsLocal(l) {
    const porLocalidad = l.localidad && MAPA_COORDS.get(normTxt(l.localidad));
    if (porLocalidad) return { c: porLocalidad, aprox: false };
    const nombre = normTxt(l.local).replace(/^(APERTURA|APER\.?)\s+/, '').replace(/^(SABORES EXPRESS|SABORES|HAMBURGUESAS EXTREMAS|EXTREMAS|EMPANADA MANIA)\s+/, '')
        .replace(/\s*\(.*\)\s*$/, '').replace(/\s+\d+(\/\d+)?$/, '').replace(/\./g, '');
    const porNombre = MAPA_COORDS.get(nombre);
    if (porNombre) return { c: porNombre, aprox: false };
    const porZona = MAPA_ZONA[normTxt(l.zona)];
    return porZona ? { c: porZona, aprox: true } : null;
}

// ── Colores
const MAPA_PALETA = ['#2563eb', '#f59e0b', '#db2777', '#059669', '#7c3aed', '#ea580c', '#65a30d', '#dc2626', '#0891b2', '#a16207', '#4f46e5', '#0d9488'];
const MAPA_NOMINA = { 'DEBE COMPLETAR': ['#dc2626', 'Debe completar'], 'EXCEDIDO': ['#f59e0b', 'Excedido'], 'COMPLETO': ['#16a34a', 'Completo'], '': ['#94a3b8', 'Sin dato de nómina'] };
const MAPA_MODOS = { regional: 'Regional', zonal: 'Zonal', selector: 'Selector', nomina: 'Nómina' };
const claveMapa = l => eqMapaColor === 'nomina' ? (l.estado_nomina || '') : (l[eqMapaColor] || '');
function coloresMapa() {
    if (eqMapaColor === 'nomina') return k => MAPA_NOMINA[k]?.[0] || MAPA_NOMINA[''][0];
    if (eqMapaColor === 'selector') return k => k ? colorDe(k) : '#94a3b8';
    // Regional y zonal: color fijo por nombre (no cambia al filtrar)
    const claves = [...new Set(locales.map(l => l[eqMapaColor]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const idx = new Map(claves.map((k, i) => [k, i]));
    return k => {
        if (!k) return '#94a3b8';
        const i = idx.get(k) ?? 0;
        return i < MAPA_PALETA.length && eqMapaColor === 'regional' ? MAPA_PALETA[i] : `hsl(${Math.round((i * 137.508) % 360)}, 65%, 48%)`;
    };
}
const nombreMapa = k => eqMapaColor === 'nomina' ? (MAPA_NOMINA[k]?.[1] || MAPA_NOMINA[''][1])
    : !k ? 'Sin asignar' : eqMapaColor === 'selector' ? k : k.toLowerCase().replace(/(^|\s)\S/g, s => s.toUpperCase());

// ── Columnas (hexágonos) y etiquetas
function geojsonMapa(lista, fuera) {
    const vac = new Map();
    busquedas.forEach(b => { if (!vacanteAbierta(b)) return; const l = localDe(b.local); if (l) vac.set(l.id, (vac.get(l.id) || 0) + 1); });
    const color = coloresMapa();
    const conPos = lista.map(l => ({ l, p: coordsLocal(l) })).filter(x => x.p);
    // Los de una misma localidad se reparten en círculo para que no se pisen
    const grupos = {};
    conPos.forEach(x => (grupos[x.p.c.join()] = grupos[x.p.c.join()] || []).push(x));
    const columnas = [], puntos = [];
    Object.values(grupos).forEach(arr => arr.forEach((x, i) => {
        const [lng0, lat0] = x.p.c, kx = 1 / (111320 * Math.cos(lat0 * Math.PI / 180)), ky = 1 / 111320;
        const r = arr.length > 1 ? 700 + arr.length * 70 : 0, a = i / arr.length * 2 * Math.PI;
        const lng = lng0 + r * Math.cos(a) * kx, lat = lat0 + r * Math.sin(a) * ky;
        const v = vac.get(x.l.id) || 0;
        const props = {
            id: x.l.id, local: x.l.local, localidad: x.l.localidad || '', regional: x.l.regional || '', zonal: x.l.zonal || '',
            selector: x.l.selector || '', nomina: MAPA_NOMINA[x.l.estado_nomina || '']?.[1] || '', vacantes: v,
            fuera: fuera(x.l), aprox: x.p.aprox, clave: claveMapa(x.l), color: color(claveMapa(x.l)), alto: 250 + v * 800
        };
        const hex = [];
        for (let k = 0; k <= 6; k++) { const b = (k % 6) / 6 * 2 * Math.PI + Math.PI / 6; hex.push([lng + 420 * Math.cos(b) * kx, lat + 420 * Math.sin(b) * ky]); }
        columnas.push({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [hex] } });
        puntos.push({ type: 'Feature', properties: { ...props, corto: x.l.local.replace(/^(SABORES|EXTREMAS)\s+/, '') }, geometry: { type: 'Point', coordinates: [lng, lat] } });
    }));
    return { columnas: { type: 'FeatureCollection', features: columnas }, puntos: { type: 'FeatureCollection', features: puntos }, sinPos: lista.length - conPos.length };
}

// ── Carga de la librería (solo la primera vez que se abre el mapa)
function cargarLibMapa() {
    if (window.maplibregl) return Promise.resolve();
    if (!_eqMapaLib) _eqMapaLib = new Promise((ok, mal) => {
        const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = MAPA_LIB.css; document.head.appendChild(css);
        const s = document.createElement('script'); s.src = MAPA_LIB.js; s.onload = ok;
        s.onerror = () => { _eqMapaLib = null; mal(new Error('lib')); };
        document.head.appendChild(s);
    });
    return _eqMapaLib;
}

function eqVerMapa(si) {
    eqModoMapa = si;
    document.getElementById('eq-ver-lista').classList.toggle('active', !si);
    document.getElementById('eq-ver-mapa').classList.toggle('active', si);
    renderEquipos();
}
function eqColorMapa(modo) { eqMapaColor = modo; actualizarMapaEquipos(); }

// Lo llama renderEquipos con la lista ya filtrada
async function pintarMapaEquipos(lista, fuera) {
    _eqMapaDatos = { lista, fuera };
    const box = document.getElementById('equipos-mapa');
    if (!box.dataset.armado) {
        box.dataset.armado = '1';
        box.innerHTML = `<div class="eq-mapa-barra">
                <div class="eq-mapa-modos" role="group" aria-label="Color por">${Object.entries(MAPA_MODOS).map(([k, t]) =>
                    `<button class="eq-mapa-modo" data-modo="${k}" onclick="eqColorMapa(this.dataset.modo)">${t}</button>`).join('')}</div>
                <button class="btn-sm" onclick="eqMapaVista('amba')"><i class="fas fa-crosshairs"></i> AMBA</button>
                <button class="btn-sm" onclick="eqMapaVista('todo')"><i class="fas fa-expand"></i> Ver todos</button>
                <button class="btn-sm" id="eq-mapa-3d" onclick="eqMapaVista('3d')">Vista plana</button>
            </div>
            <div class="eq-mapa-cuerpo"><div id="eq-mapa-canvas"></div><div class="eq-mapa-leyenda" id="eq-mapa-leyenda"></div></div>
            <div class="eq-mapa-nota" id="eq-mapa-nota"></div>`;
    }
    try { await cargarLibMapa(); }
    catch (e) { document.getElementById('eq-mapa-nota').textContent = 'No se pudo cargar el mapa (revisá la conexión o un bloqueador) y volvé a abrirlo.'; return; }
    if (!_eqMapa) {
        _eqMapa = new maplibregl.Map({ container: 'eq-mapa-canvas', style: MAPA_ESTILO, ...MAPA_INICIO, attributionControl: { compact: true } });
        _eqMapa.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
        _eqMapa.on('error', e => console.warn('Mapa:', e?.error?.message || e));
        _eqMapa.on('load', () => {
            _eqMapa.addSource('eq-columnas', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
            _eqMapa.addSource('eq-puntos', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
            const alto = ['get', 'alto'];
            _eqMapa.addLayer({ id: 'eq-col', type: 'fill-extrusion', source: 'eq-columnas', filter: ['!', ['get', 'fuera']],
                paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-height': alto, 'fill-extrusion-opacity': 0.92 } });
            _eqMapa.addLayer({ id: 'eq-col-fuera', type: 'fill-extrusion', source: 'eq-columnas', filter: ['get', 'fuera'],
                paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-height': alto, 'fill-extrusion-opacity': 0.35 } });
            _eqMapa.addLayer({ id: 'eq-nombres', type: 'symbol', source: 'eq-puntos', minzoom: 12,
                layout: { 'text-field': ['get', 'corto'], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-offset': [0, 1.2], 'text-anchor': 'top' },
                paint: { 'text-color': '#172033', 'text-halo-color': '#ffffff', 'text-halo-width': 1.4 } });
            ['eq-col', 'eq-col-fuera'].forEach(id => {
                _eqMapa.on('click', id, ev => popupMapa(ev));
                _eqMapa.on('mouseenter', id, () => { _eqMapa.getCanvas().style.cursor = 'pointer'; });
                _eqMapa.on('mouseleave', id, () => { _eqMapa.getCanvas().style.cursor = ''; });
            });
            _eqMapaListo = true;
            actualizarMapaEquipos();
        });
    } else {
        _eqMapa.resize();
        actualizarMapaEquipos();
    }
}

function actualizarMapaEquipos() {
    document.querySelectorAll('.eq-mapa-modo').forEach(b => b.classList.toggle('activa', b.dataset.modo === eqMapaColor));
    const { lista, fuera } = _eqMapaDatos;
    const g = geojsonMapa(lista, fuera);
    if (_eqMapaListo) {
        _eqMapa.getSource('eq-columnas').setData(g.columnas);
        _eqMapa.getSource('eq-puntos').setData(g.puntos);
    }
    // Leyenda: lo que se ve con el filtro actual
    const color = coloresMapa(), grupos = new Map();
    _eqMapaPuntos = g.puntos.features;
    g.columnas.features.forEach(f => {
        const k = f.properties.clave;
        const e = grupos.get(k) || { n: 0, v: 0 }; e.n++; e.v += f.properties.vacantes; grupos.set(k, e);
    });
    const orden = [...grupos.keys()].sort((a, b) => eqMapaColor === 'nomina'
        ? ['DEBE COMPLETAR', 'EXCEDIDO', 'COMPLETO', ''].indexOf(a) - ['DEBE COMPLETAR', 'EXCEDIDO', 'COMPLETO', ''].indexOf(b)
        : grupos.get(b).n - grupos.get(a).n);
    document.getElementById('eq-mapa-leyenda').innerHTML = `<div class="eq-mapa-ley-tit">${MAPA_MODOS[eqMapaColor]}</div>` +
        orden.map(k => `<div class="eq-mapa-ley-fila"><i style="background:${color(k)}"></i><span>${esc(nombreMapa(k))}</span><b>${grupos.get(k).n}</b></div>`).join('');
    const nFuera = g.columnas.features.filter(f => f.properties.fuera).length;
    document.getElementById('eq-mapa-nota').innerHTML = `<b>Altura</b> = vacantes abiertas · ubicación aproximada por localidad`
        + (nFuera ? ` · <b>${nFuera}</b> transparente${nFuera === 1 ? '' : 's'} = no está${nFuera === 1 ? '' : 'n'} en la hoja (posibles aperturas)` : '')
        + (g.sinPos ? ` · ${g.sinPos} sin ubicación` : '');
}

function popupMapa(ev) {
    const p = ev.features[0].properties;
    const fila = (t, v) => v ? `<div><span>${t}</span> ${esc(v)}</div>` : '';
    new maplibregl.Popup({ closeButton: true, maxWidth: '280px' }).setLngLat(ev.lngLat).setHTML(`<div class="eq-mapa-pop">
        <b>${esc(p.local)}</b>${p.fuera === true || p.fuera === 'true' ? ' <span class="eq-local-fuera">No está en la hoja</span>' : ''}
        ${fila('Localidad', p.localidad)}${fila('Regional', p.regional)}${fila('Zonal', p.zonal)}${fila('Selector', p.selector)}
        ${fila('Nómina', p.nomina)}<div><span>Vacantes abiertas</span> ${p.vacantes}</div></div>`).addTo(_eqMapa);
}

function eqMapaVista(cual) {
    if (!_eqMapa) return;
    if (cual === 'amba') { _eqMapa.flyTo({ ...MAPA_INICIO, pitch: _eqMapa.getPitch() }); return; }
    if (cual === '3d') {
        const plano = _eqMapa.getPitch() > 5;
        _eqMapa.easeTo({ pitch: plano ? 0 : 50, bearing: plano ? 0 : -15 });
        document.getElementById('eq-mapa-3d').textContent = plano ? 'Vista 3D' : 'Vista plana';
        return;
    }
    const fs = _eqMapaPuntos;
    if (!fs.length) return;
    const b = new maplibregl.LngLatBounds();
    fs.forEach(f => b.extend(f.geometry.coordinates));
    _eqMapa.fitBounds(b, { padding: 60, pitch: _eqMapa.getPitch(), maxZoom: 13 });
}
