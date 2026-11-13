// ══════════════════════════════════════════════
//  MAPA DE EQUIPOS · vista "Mapa"
//  Mapa real (MapLibre + OpenFreeMap: gratis, sin clave) teñido de azul, con paneles de vidrio.
//  Agrupado (zonal / regional / selector): una burbuja con la foto de cada persona en el centro de sus
//  locales, con la cantidad de vacantes abiertas; los locales quedan como puntos chicos. Las burbujas
//  se acomodan solas para no pisarse (con una línea a su lugar real). Al elegir una se ve su zona,
//  sus locales y su nómina. "Locales": cada local es una columna (color por regional / zonal /
//  selector / nómina y altura por vacantes abiertas).
//  Usa los mismos filtros que la lista (marca, regional, zonal, selector, búsqueda).
//  Ubicación aproximada: el centro de la localidad del local; los de una misma localidad se reparten
//  alrededor. Los que no están en la hoja de asignaciones se ven huecos / transparentes (próximas aperturas).
// ══════════════════════════════════════════════
const MAPA_LIB = { js: 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js', css: 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css' };
const MAPA_ESTILO = 'https://tiles.openfreemap.org/styles/positron';
const MAPA_INICIO = { center: [-58.56, -34.63], zoom: 9.7, pitch: 30, bearing: -10 };

let eqModoMapa = true, eqMapaColor = 'regional', eqMapaGrupo = 'zonal';   // abre en el Mapa; la Lista queda segunda
let _eqMapa = null, _eqMapaListo = false, _eqMapaLib = null, _eqMapaDatos = { lista: [], fuera: () => false }, _eqMapaPuntos = [];
let _eqMapaGrupos = [], _eqMapaSel = null, _eqMapaMarcas = new Map(), _eqMapaRaf = 0;

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
const MAPA_NOMINA = { 'DEBE COMPLETAR': ['#dc2626', 'Debe completar'], 'EXCEDIDO': ['#d97706', 'Excedido'], 'COMPLETO': ['#16a34a', 'Completo'], '': ['#94a3b8', 'Sin dato de nómina'] };
const MAPA_NOMINA_ORDEN = ['DEBE COMPLETAR', 'EXCEDIDO', 'COMPLETO', ''];
// Etapa de cada búsqueda abierta (paleta categórica validada, siempre en este orden)
const MAPA_ETAPAS = [['sin', 'Sin persona', '#2a78d6'], ['cargada', 'Persona cargada', '#eb6834'], ['zonal', 'En el zonal', '#1baf7a'],
    ['aprobado', 'Aprobado / citado', '#eda100'], ['rechazado', 'Rechazado zonal', '#e87ba4']];
function etapaBusqueda(b) {
    if (b.estado === 'RECHAZADO ZONAL') return 'rechazado';
    if (!tienePersona(b)) return 'sin';
    if (!b.estado) return 'cargada';
    return b.estado === 'ENVIADO A ZONAL' ? 'zonal' : 'aprobado';
}
const etapasVacias = () => Object.fromEntries(MAPA_ETAPAS.map(([k]) => [k, 0]));
const textoEtapas = et => MAPA_ETAPAS.filter(([k]) => et[k]).map(([k, t]) => `${et[k]} ${t.toLowerCase()}`).join(', ');
const MAPA_MODOS = { regional: 'Regional', zonal: 'Zonal', selector: 'Selector', nomina: 'Nómina' };
const MAPA_GRUPOS = { zonal: 'Zonal', regional: 'Regional', selector: 'Selector', locales: 'Locales' };
const MAPA_GRUPOS_PL = { zonal: 'Zonales', regional: 'Regionales', selector: 'Selectores' };
const MAPA_AZUL = '#2563eb', MAPA_RESALTE = '#ee60b9';
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
const tituloMapa = k => String(k || '').toLowerCase().replace(/(^|[\s(])\S/g, s => s.toUpperCase());
const nombreMapa = k => eqMapaColor === 'nomina' ? (MAPA_NOMINA[k]?.[1] || MAPA_NOMINA[''][1])
    : !k ? 'Sin asignar' : eqMapaColor === 'selector' ? k : tituloMapa(k);
const nombreGrupo = k => k ? (eqMapaGrupo === 'selector' ? k : tituloMapa(k)) : `Sin ${MAPA_GRUPOS[eqMapaGrupo].toLowerCase()}`;
const colorGrupo = k => eqMapaGrupo === 'selector' && k ? colorDe(k) : k ? MAPA_AZUL : '#94a3b8';
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// ── Locales: búsquedas abiertas y posición (los de una misma localidad, repartidos en círculo)
function busquedasPorLocal() {
    const bq = new Map();
    busquedas.forEach(b => {
        if (!vacanteAbierta(b)) return;
        const l = localDe(b.local);
        if (l) { if (!bq.has(l.id)) bq.set(l.id, []); bq.get(l.id).push(b); }
    });
    return bq;
}
const contarVacantes = bq => new Map([...bq].map(([id, bs]) => [id, bs.length]));
const vacantesPorLocal = () => contarVacantes(busquedasPorLocal());
const metrosA = lat => ({ kx: 1 / (111320 * Math.cos(lat * Math.PI / 180)), ky: 1 / 111320 });
function posicionesMapa(lista) {
    const conPos = lista.map(l => ({ l, p: coordsLocal(l) })).filter(x => x.p);
    const grupos = {};
    conPos.forEach(x => (grupos[x.p.c.join()] = grupos[x.p.c.join()] || []).push(x));
    const pos = [];
    Object.values(grupos).forEach(arr => arr.forEach((x, i) => {
        const [lng0, lat0] = x.p.c, { kx, ky } = metrosA(lat0);
        const r = arr.length > 1 ? 700 + arr.length * 70 : 0, a = i / arr.length * 2 * Math.PI;
        pos.push({ l: x.l, aprox: x.p.aprox, lng: lng0 + r * Math.cos(a) * kx, lat: lat0 + r * Math.sin(a) * ky });
    }));
    return { pos, sinPos: lista.length - conPos.length };
}
const propsLocal = (x, vac, fuera) => ({
    id: x.l.id, local: x.l.local, localidad: x.l.localidad || '', regional: x.l.regional || '', zonal: x.l.zonal || '',
    selector: x.l.selector || '', nomina: MAPA_NOMINA[x.l.estado_nomina || '']?.[1] || MAPA_NOMINA[''][1], vacantes: vac.get(x.l.id) || 0,
    fuera: fuera(x.l), aprox: x.aprox, corto: x.l.local.replace(/^(SABORES|EXTREMAS)\s+/, '')
});
const fc = features => ({ type: 'FeatureCollection', features });

// ── Vista "Locales": columnas (hexágonos)
function columnasMapa(pos, vac, fuera) {
    const color = coloresMapa();
    return fc(pos.map(x => {
        const { kx, ky } = metrosA(x.lat), v = vac.get(x.l.id) || 0, hex = [];
        for (let k = 0; k <= 6; k++) { const b = (k % 6) / 6 * 2 * Math.PI + Math.PI / 6; hex.push([x.lng + 420 * Math.cos(b) * kx, x.lat + 420 * Math.sin(b) * ky]); }
        return { type: 'Feature', properties: { ...propsLocal(x, vac, fuera), clave: claveMapa(x.l), color: color(claveMapa(x.l)), alto: 250 + v * 800 },
            geometry: { type: 'Polygon', coordinates: [hex] } };
    }));
}

// ── Vista agrupada: una burbuja por zonal / regional / selector
const mediana = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
function gruposMapa(lista, pos, vac, bq) {
    const porId = new Map(pos.map(x => [x.l.id, x])), g = new Map();
    lista.forEach(l => {
        const k = l[eqMapaGrupo] || '';
        if (!g.has(k)) g.set(k, { clave: k, locales: [], puntos: [], aprox: [], vac: 0, etapas: etapasVacias(), marcas: {} });
        const e = g.get(k), x = porId.get(l.id);
        e.locales.push(l);
        e.vac += vac.get(l.id) || 0;
        (bq.get(l.id) || []).forEach(b => e.etapas[etapaBusqueda(b)]++);
        e.marcas[l.marca] = (e.marcas[l.marca] || 0) + 1;
        if (x) (x.aprox ? e.aprox : e.puntos).push([x.lng, x.lat]);
    });
    return [...g.values()].map(e => {
        const pts = e.puntos.length ? e.puntos : e.aprox;
        if (!pts.length) return null;
        e.centro = [mediana(pts.map(p => p[0])), mediana(pts.map(p => p[1]))];
        e.marca = Object.entries(e.marcas).sort((a, b) => b[1] - a[1])[0][0];
        e.nombre = nombreGrupo(e.clave);
        return e;
    }).filter(Boolean).sort((a, b) => b.vac - a.vac || b.locales.length - a.locales.length || a.nombre.localeCompare(b.nombre));
}

// Zona de un grupo: envolvente de círculos de ~1,2 km alrededor de sus locales (sin los que quedan a más de 40 km)
function zonaGrupo(e) {
    const { kx, ky } = metrosA(e.centro[1]);
    const cerca = e.puntos.filter(([lng, lat]) => Math.hypot((lng - e.centro[0]) / kx, (lat - e.centro[1]) / ky) < 40000);
    const pts = [];
    (cerca.length ? cerca : [e.centro]).forEach(([lng, lat]) => {
        for (let k = 0; k < 16; k++) { const a = k / 16 * 2 * Math.PI; pts.push([lng + 1200 * Math.cos(a) * kx, lat + 1200 * Math.sin(a) * ky]); }
    });
    // Envolvente convexa (cadena monótona)
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cruz = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lado = arr => { const h = []; arr.forEach(p => { while (h.length >= 2 && cruz(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop(); h.push(p); }); h.pop(); return h; };
    const anillo = lado(pts).concat(lado([...pts].reverse()));
    anillo.push(anillo[0]);
    return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [anillo] } };
}

function fotoGrupo(e) {
    if (!e.clave) return '<span class="eq-foto eq-sin"><i class="fas fa-question"></i></span>';
    return eqMapaGrupo === 'selector' ? avatarHtml(e.clave) : fotoPersonaHtml(e.clave, e.marca);
}

// ── Burbujas (marcadores HTML) que se acomodan para no pisarse
let _ctxMedir = null;
function anchoEtiqueta(e) {
    _ctxMedir = _ctxMedir || document.createElement('canvas').getContext('2d');
    _ctxMedir.font = '800 12px Inter, system-ui, sans-serif';
    const a = _ctxMedir.measureText(e.nombre).width;
    _ctxMedir.font = '600 11px Inter, system-ui, sans-serif';
    return Math.ceil(Math.max(a, _ctxMedir.measureText(subEtiqueta(e)).width)) + 22;
}
const subEtiqueta = e => `${plural(e.locales.length, 'local', 'locales')} · ${plural(e.vac, 'vacante', 'vacantes')}`;

function marcadoresMapa() {
    _eqMapaMarcas.forEach(m => m.marker.remove());
    _eqMapaMarcas.clear();
    if (!_eqMapaListo || eqMapaGrupo === 'locales') return;
    _eqMapaGrupos.forEach(e => {
        const el = document.createElement('div');
        el.className = 'mg';
        el.style.setProperty('--c', colorGrupo(e.clave));
        el.innerHTML = `<svg class="mg-linea" width="1" height="1" aria-hidden="true"><line x1="0" y1="0" x2="0" y2="0"/></svg><span class="mg-pin"></span>
            <button class="mg-burbuja" type="button" aria-label="${esc(e.nombre)}: ${esc(subEtiqueta(e))}">${fotoGrupo(e)}${e.vac ? `<span class="mg-badge">${e.vac}</span>` : ''}</button>
            <div class="mg-etq"><b>${esc(e.nombre)}</b><span>${esc(subEtiqueta(e))}</span></div>`;
        el.querySelector('.mg-burbuja').addEventListener('click', ev => { ev.stopPropagation(); eqMapaElegir(e.clave); });
        const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(e.centro).addTo(_eqMapa);
        _eqMapaMarcas.set(e.clave, { marker, el, e, w: anchoEtiqueta(e) });
    });
    marcarSeleccion();
    acomodarMarcadores();
}
function programarAcomodo() { if (!_eqMapaRaf) _eqMapaRaf = requestAnimationFrame(acomodarMarcadores); }

function acomodarMarcadores() {
    _eqMapaRaf = 0;
    if (!_eqMapa || !_eqMapaMarcas.size) return;
    const cv = _eqMapa.getCanvas(), W = cv.clientWidth, H = cv.clientHeight;
    const R = 22, SEP = 14, SUBE = 30, ALTO = 36;   // SEP: lugar para el número de vacantes
    const ns = [..._eqMapaMarcas.values()].map((m, i) => { const a = _eqMapa.project(m.e.centro); return { m, i, ax: a.x, ay: a.y, x: a.x, y: a.y - SUBE }; });
    // Se empujan de a pares hasta que no se pisen; un resorte suave las vuelve a su lugar
    for (let it = 0; it < 90; it++) {
        let movio = false;
        for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) {
            const A = ns[i], B = ns[j];
            let dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy);
            if (d >= 2 * R + SEP) continue;
            if (d < 0.01) { dx = Math.cos(B.i * 2.4); dy = Math.sin(B.i * 2.4); d = 1; }
            const f = (2 * R + SEP - d) / 2 / d;
            A.x -= dx * f; A.y -= dy * f; B.x += dx * f; B.y += dy * f;
            movio = true;
        }
        ns.forEach(n => { n.x += (n.ax - n.x) * 0.03; n.y += (n.ay - SUBE - n.y) * 0.03; });
        if (!movio && it > 4) break;
    }
    // Etiquetas: primero la elegida y las de más vacantes; a la derecha, izquierda o abajo, donde entre
    const cajas = ns.map(n => [n.x - R, n.y - R, n.x + R, n.y + R]);
    // Los paneles de vidrio tapan el mapa: ahí tampoco van etiquetas
    const cvR = cv.getBoundingClientRect();
    document.querySelectorAll('.mg-panel').forEach(pn => {
        if (!pn.offsetParent || getComputedStyle(pn).position !== 'absolute') return;
        const r = pn.getBoundingClientRect();
        cajas.push([r.left - cvR.left - 6, r.top - cvR.top - 6, r.right - cvR.left + 6, r.bottom - cvR.top + 6]);
    });
    const choca = r => r[0] < 4 || r[1] < 4 || r[2] > W - 4 || r[3] > H - 4 || cajas.some(c => r[0] < c[2] && r[2] > c[0] && r[1] < c[3] && r[3] > c[1]);
    const orden = [...ns].sort((a, b) => (b.m.e.clave === _eqMapaSel) - (a.m.e.clave === _eqMapaSel) || b.m.e.vac - a.m.e.vac || b.m.e.locales.length - a.m.e.locales.length);
    orden.forEach(n => {
        const w = n.m.w, h = ALTO;
        const lugares = [[n.x + R + 5, n.y - h / 2], [n.x - R - 5 - w, n.y - h / 2], [n.x - w / 2, n.y + R + 5], [n.x - w / 2, n.y - R - 5 - h]]
            .map(([x, y]) => [x, y, x + w, y + h]);
        const ok = lugares.find(r => !choca(r));
        n.etq = ok || lugares[0];
        n.oculta = !ok;
        if (ok) cajas.push(ok);
    });
    ns.forEach(n => {
        const dx = Math.round(n.x - n.ax), dy = Math.round(n.y - n.ay), el = n.m.el;
        el.querySelector('.mg-burbuja').style.transform = `translate(${dx}px, ${dy}px)`;
        const ln = el.querySelector('line');
        ln.setAttribute('x2', dx); ln.setAttribute('y2', dy);
        const etq = el.querySelector('.mg-etq');
        etq.style.transform = `translate(${Math.round(n.etq[0] - n.ax)}px, ${Math.round(n.etq[1] - n.ay)}px)`;
        etq.classList.toggle('oculta', n.oculta);
    });
}

function marcarSeleccion() {
    _eqMapaMarcas.forEach(m => {
        m.el.classList.toggle('sel', m.e.clave === _eqMapaSel);
        m.el.classList.toggle('atenuada', _eqMapaSel !== null && m.e.clave !== _eqMapaSel);
    });
}
function eqMapaResaltar(k, si) { _eqMapaMarcas.get(k)?.el.classList.toggle('hover', si); }

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
function eqMapaAgrupar(modo) { eqMapaGrupo = modo; _eqMapaSel = null; actualizarMapaEquipos(); eqMapaVista('amba'); }

// Mapa base en azules (tipo "mapa digital"): se repinta el estilo Positron capa por capa
function pintarMapaBase() {
    const set = (id, prop, v) => { try { _eqMapa.setPaintProperty(id, prop, v); } catch (e) { /* capa sin esa propiedad */ } };
    (_eqMapa.getStyle().layers || []).forEach(ly => {
        const id = ly.id;
        if (ly.type === 'background') set(id, 'background-color', '#e9f1fd');
        else if (ly.type === 'fill') {
            if (/water|ocean|sea|lake/.test(id)) set(id, 'fill-color', '#8cb8f0');
            else if (/building/.test(id)) set(id, 'fill-color', '#dbe6f8');
            else if (/park|wood|grass|forest|landcover|green/.test(id)) set(id, 'fill-color', '#dcebf9');
            else set(id, 'fill-color', '#e2ecfb');
        } else if (ly.type === 'line') {
            if (/water|river|stream|canal/.test(id)) set(id, 'line-color', '#8cb8f0');
            else if (/boundary|admin/.test(id)) set(id, 'line-color', '#9db5dc');
            else if (/casing/.test(id)) set(id, 'line-color', '#cbdaf2');
            else if (/rail/.test(id)) set(id, 'line-color', '#c2d3ee');
            else set(id, 'line-color', '#ffffff');
        } else if (ly.type === 'fill-extrusion') set(id, 'fill-extrusion-color', '#d6e3f7');
        else if (ly.type === 'symbol' && ly.layout?.['text-field']) {
            set(id, 'text-color', /water/.test(id) ? '#2b5ca6' : '#4a6290');
            set(id, 'text-halo-color', 'rgba(255, 255, 255, 0.9)');
        }
    });
}

// Lo llama renderEquipos con la lista ya filtrada
async function pintarMapaEquipos(lista, fuera) {
    _eqMapaDatos = { lista, fuera };
    const box = document.getElementById('equipos-mapa');
    if (!box.dataset.armado) {
        box.dataset.armado = '1';
        const seg = (id, lbl, obj, fn, attr) => `<div class="mg-control" id="${id}"><span class="mg-control-lbl">${lbl}</span><div class="eq-mapa-modos" role="group" aria-label="${lbl}">${Object.entries(obj).map(([k, t]) =>
            `<button class="eq-mapa-modo" data-${attr}="${k}" onclick="${fn}(this.dataset.${attr})">${t}</button>`).join('')}</div></div>`;
        box.innerHTML = `<div class="eq-mapa-barra">
                ${seg('mg-agrupar', 'Agrupar por', MAPA_GRUPOS, 'eqMapaAgrupar', 'grupo')}
                ${seg('mg-colorear', 'Color por', MAPA_MODOS, 'eqColorMapa', 'modo')}
                <span class="mg-espacio"></span>
                <button class="btn-sm" onclick="eqMapaVista('amba')"><i class="fas fa-crosshairs"></i> AMBA</button>
                <button class="btn-sm" onclick="eqMapaVista('todo')"><i class="fas fa-expand"></i> Ver todos</button>
                <button class="btn-sm" id="eq-mapa-3d" onclick="eqMapaVista('3d')">Vista plana</button>
            </div>
            <div class="eq-mapa-cuerpo">
                <div class="mg-lienzo"><div id="eq-mapa-canvas"></div></div>
                <div class="mg-panel mg-resumen" id="mg-resumen"></div>
                <div class="mg-panel mg-lista" id="mg-lista"></div>
                <div class="mg-tip" id="mg-tip" hidden></div>
            </div>
            <div class="eq-mapa-nota" id="eq-mapa-nota"></div>`;
        const cuerpo = box.querySelector('.eq-mapa-cuerpo');
        cuerpo.addEventListener('mousemove', tipMapa);
        cuerpo.addEventListener('mouseleave', () => { document.getElementById('mg-tip').hidden = true; });
    }
    try { await cargarLibMapa(); }
    catch (e) { document.getElementById('eq-mapa-nota').textContent = 'No se pudo cargar el mapa (revisá la conexión o un bloqueador) y volvé a abrirlo.'; actualizarMapaEquipos(); return; }
    if (!_eqMapa) {
        _eqMapa = new maplibregl.Map({ container: 'eq-mapa-canvas', style: MAPA_ESTILO, ...MAPA_INICIO, attributionControl: { compact: true } });
        _eqMapa.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-left');
        _eqMapa.setPadding(padCamara());
        _eqMapa.on('error', e => console.warn('Mapa:', e?.error?.message || e));
        _eqMapa.on('load', () => {
            pintarMapaBase();
            const vacio = fc([]);
            ['eq-columnas', 'eq-puntos', 'eq-zona'].forEach(id => _eqMapa.addSource(id, { type: 'geojson', data: vacio }));
            const alto = ['get', 'alto'];
            // Vista "Locales"
            _eqMapa.addLayer({ id: 'eq-col', type: 'fill-extrusion', source: 'eq-columnas', filter: ['!', ['get', 'fuera']],
                paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-height': alto, 'fill-extrusion-opacity': 0.92 } });
            _eqMapa.addLayer({ id: 'eq-col-fuera', type: 'fill-extrusion', source: 'eq-columnas', filter: ['get', 'fuera'],
                paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-height': alto, 'fill-extrusion-opacity': 0.35 } });
            // Vista agrupada: zona del elegido y locales como puntos
            _eqMapa.addLayer({ id: 'eq-zona', type: 'fill', source: 'eq-zona', paint: { 'fill-color': MAPA_RESALTE, 'fill-opacity': 0.12 } });
            _eqMapa.addLayer({ id: 'eq-zona-borde', type: 'line', source: 'eq-zona', paint: { 'line-color': MAPA_RESALTE, 'line-width': 2, 'line-dasharray': [2, 1.5] } });
            _eqMapa.addLayer({ id: 'eq-dots', type: 'circle', source: 'eq-puntos', paint: {
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, ['case', ['get', 'sel'], 4.5, 3], 13, ['case', ['get', 'sel'], 8, 6]],
                'circle-color': ['case', ['get', 'fuera'], '#ffffff', ['get', 'color']],
                'circle-stroke-color': ['case', ['get', 'fuera'], ['get', 'color'], '#ffffff'],
                'circle-stroke-width': ['case', ['get', 'fuera'], 2, 1.5],
                'circle-opacity': ['case', ['get', 'atenuado'], 0.35, 1], 'circle-stroke-opacity': ['case', ['get', 'atenuado'], 0.35, 1] } });
            _eqMapa.addLayer({ id: 'eq-nombres', type: 'symbol', source: 'eq-puntos', minzoom: 12,
                layout: { 'text-field': ['get', 'corto'], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-offset': [0, 1.1], 'text-anchor': 'top' },
                paint: { 'text-color': '#172033', 'text-halo-color': '#ffffff', 'text-halo-width': 1.4 } });
            ['eq-col', 'eq-col-fuera', 'eq-dots'].forEach(id => {
                _eqMapa.on('click', id, ev => popupMapa(ev.features[0].properties, ev.lngLat));
                _eqMapa.on('mouseenter', id, () => { _eqMapa.getCanvas().style.cursor = 'pointer'; });
                _eqMapa.on('mouseleave', id, () => { _eqMapa.getCanvas().style.cursor = ''; });
            });
            _eqMapa.on('move', programarAcomodo);
            _eqMapa.on('resize', () => { _eqMapa.setPadding(padCamara()); programarAcomodo(); });
            _eqMapaListo = true;
            actualizarMapaEquipos();
        });
    } else {
        _eqMapa.resize();
    }
    actualizarMapaEquipos();
}

function actualizarMapaEquipos() {
    const agrupado = eqMapaGrupo !== 'locales';
    document.querySelectorAll('[data-grupo]').forEach(b => b.classList.toggle('activa', b.dataset.grupo === eqMapaGrupo));
    document.querySelectorAll('[data-modo]').forEach(b => b.classList.toggle('activa', b.dataset.modo === eqMapaColor));
    document.getElementById('mg-colorear')?.classList.toggle('hidden', agrupado);
    const tip = document.getElementById('mg-tip');
    if (tip) tip.hidden = true;
    const { lista, fuera } = _eqMapaDatos;
    const bq = busquedasPorLocal(), vac = contarVacantes(bq);
    const { pos, sinPos } = posicionesMapa(lista);
    _eqMapaGrupos = agrupado ? gruposMapa(lista, pos, vac, bq) : [];
    if (_eqMapaSel !== null && !_eqMapaGrupos.some(e => e.clave === _eqMapaSel)) _eqMapaSel = null;
    const sel = _eqMapaGrupos.find(e => e.clave === _eqMapaSel);
    _eqMapaPuntos = pos.map(x => [x.lng, x.lat]);

    if (_eqMapaListo) {
        ['eq-col', 'eq-col-fuera'].forEach(id => _eqMapa.setLayoutProperty(id, 'visibility', agrupado ? 'none' : 'visible'));
        ['eq-zona', 'eq-zona-borde', 'eq-dots'].forEach(id => _eqMapa.setLayoutProperty(id, 'visibility', agrupado ? 'visible' : 'none'));
        _eqMapa.getSource('eq-columnas').setData(agrupado ? fc([]) : columnasMapa(pos, vac, fuera));
        _eqMapa.getSource('eq-puntos').setData(fc(pos.map(x => {
            const k = x.l[eqMapaGrupo] || '';
            const enSel = agrupado && _eqMapaSel !== null && k === _eqMapaSel;
            return { type: 'Feature', geometry: { type: 'Point', coordinates: [x.lng, x.lat] }, properties: { ...propsLocal(x, vac, fuera),
                sel: enSel, atenuado: agrupado && _eqMapaSel !== null && !enSel, color: enSel ? MAPA_RESALTE : agrupado ? colorGrupo(k) : '#172033' } };
        })));
        _eqMapa.getSource('eq-zona').setData(sel ? fc([zonaGrupo(sel)]) : fc([]));
        marcadoresMapa();
    }
    document.getElementById('mg-resumen').innerHTML = resumenHtml(lista, vac, bq);
    document.getElementById('mg-lista').innerHTML = sel ? detalleGrupoHtml(sel, bq, fuera) : agrupado ? rankingHtml() : leyendaLocalesHtml(lista, vac);
    const nFuera = lista.filter(fuera).length;
    document.getElementById('eq-mapa-nota').innerHTML = (agrupado
        ? `Cada burbuja es un ${MAPA_GRUPOS[eqMapaGrupo].toLowerCase()} en el centro de sus locales · <b>número</b> = vacantes abiertas · puntos = locales`
        : `<b>Altura</b> = vacantes abiertas`)
        + ` · ubicación aproximada por localidad`
        + (nFuera ? ` · <b>${nFuera}</b> ${agrupado ? 'hueco' : 'transparente'}${nFuera === 1 ? '' : 's'} = no está${nFuera === 1 ? '' : 'n'} en la hoja (posibles aperturas)` : '')
        + (sinPos ? ` · ${sinPos} sin ubicación` : '');
}

// ── Paneles
function resumenHtml(lista, vac, bq) {
    const et = etapasVacias();
    lista.forEach(l => (bq.get(l.id) || []).forEach(b => et[etapaBusqueda(b)]++));
    const nVac = lista.reduce((s, l) => s + (vac.get(l.id) || 0), 0);
    const tercero = eqMapaGrupo === 'locales' ? ['zonal', 'Zonales'] : [eqMapaGrupo, MAPA_GRUPOS_PL[eqMapaGrupo]];
    const nGrupos = new Set(lista.map(l => l[tercero[0]]).filter(Boolean)).size;
    const marca = eqMarca ? (eqMarca === 'Sabores Express' ? 'Sabores' : 'Extremas') : 'Sabores y Extremas';
    const pct = n => nVac ? Math.round(n / nVac * 100) : 0;
    return `<div class="mg-tit">Mapa de equipos</div>
        <div class="mg-sub">${esc(marca)} · ${eqMapaGrupo === 'locales' ? 'por local' : 'por ' + MAPA_GRUPOS[eqMapaGrupo].toLowerCase()}</div>
        <div class="mg-kpis">
            <div><b>${lista.length}</b><span>Locales</span></div>
            <div><b>${nVac}</b><span>Vacantes abiertas</span></div>
            <div><b>${nGrupos}</b><span>${tercero[1]}</span></div>
        </div>
        <div class="mg-sec">Búsquedas abiertas</div>
        ${nVac ? `<div class="mg-dona-fila">${donaEtapas(et, nVac)}<div class="mg-dona-ley">${MAPA_ETAPAS.map(([k, t, c]) =>
            `<div data-tip="${t}: ${plural(et[k], 'vacante', 'vacantes')} (${pct(et[k])}%)"><i style="background:${c}"></i><span>${t}</span><b>${et[k]}</b></div>`).join('')}</div></div>`
            : '<div class="tip">No hay búsquedas abiertas con este filtro.</div>'}`;
}

// Dona de etapas: un segmento por etapa, separados 2 px; en el centro, las que no tienen a nadie
function donaEtapas(et, total) {
    const R = 34, C = 2 * Math.PI * R, partes = MAPA_ETAPAS.filter(([k]) => et[k]);
    let acc = 0;
    const segs = partes.map(([k, t, c]) => {
        const len = et[k] / total * C, gap = partes.length > 1 ? 2 : 0;
        const s = `<circle cx="46" cy="46" r="${R}" fill="none" stroke="${c}" stroke-width="12" stroke-dasharray="${Math.max(len - gap, 0.5).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}"
            data-tip="${t}: ${plural(et[k], 'vacante', 'vacantes')} (${Math.round(et[k] / total * 100)}%)"></circle>`;
        acc += len;
        return s;
    }).join('');
    return `<svg class="mg-dona" viewBox="0 0 92 92" width="92" height="92" role="img" aria-label="Búsquedas abiertas: ${esc(textoEtapas(et))}">
        <g transform="rotate(-90 46 46)">${segs}</g>
        <text x="46" y="45" text-anchor="middle" class="mg-dona-num">${et.sin}</text>
        <text x="46" y="58" text-anchor="middle" class="mg-dona-lbl">sin persona</text></svg>`;
}

// Barra apilada por etapa (ancho total = escala)
const barraEtapas = (et, escala) => MAPA_ETAPAS.filter(([k]) => et[k])
    .map(([k, t, c]) => `<i style="width:${et[k] / escala * 100}%;background:${c}"></i>`).join('');

function rankingHtml() {
    if (!_eqMapaGrupos.length) return `<div class="mg-tit">${MAPA_GRUPOS_PL[eqMapaGrupo]}</div><div class="tip" style="margin-top:6px">Nada para mostrar con este filtro.</div>`;
    const max = Math.max(1, ..._eqMapaGrupos.map(e => e.vac));
    return `<div class="mg-tit">Vacantes abiertas por ${MAPA_GRUPOS[eqMapaGrupo].toLowerCase()}</div>
        <div class="mg-sub">${plural(_eqMapaGrupos.filter(e => e.clave).length, MAPA_GRUPOS[eqMapaGrupo].toLowerCase(), MAPA_GRUPOS_PL[eqMapaGrupo].toLowerCase())} · tocá uno para ver su zona</div>
        <div class="mg-filas">${_eqMapaGrupos.map(e => `<button class="mg-fila" data-k="${esc(e.clave)}" onclick="eqMapaElegir(this.dataset.k)"
                onmouseenter="eqMapaResaltar(this.dataset.k, true)" onmouseleave="eqMapaResaltar(this.dataset.k, false)"
                data-tip="${esc(e.nombre)}: ${esc(subEtiqueta(e))}${e.vac ? ` (${esc(textoEtapas(e.etapas))})` : ''}">
            <span class="mg-fila-foto" style="--c:${colorGrupo(e.clave)}">${fotoGrupo(e)}</span>
            <span class="mg-fila-nom">${esc(e.nombre)}<small>${plural(e.locales.length, 'local', 'locales')}</small></span>
            <span class="mg-barra">${barraEtapas(e.etapas, max)}</span>
            <b>${e.vac}</b></button>`).join('')}</div>`;
}

function detalleGrupoHtml(e, bq, fuera) {
    const nv = l => (bq.get(l.id) || []).length;
    const ls = [...e.locales].sort((a, b) => nv(b) - nv(a) || a.local.localeCompare(b.local));
    const otros = f => [...new Set(e.locales.map(l => l[f]).filter(Boolean))];
    const rol = eqMapaGrupo === 'zonal' ? ['Zonal', ...otros('regional').map(r => 'Regional ' + tituloMapa(r)), ...otros('selector')]
        : eqMapaGrupo === 'regional' ? ['Regional', plural(otros('zonal').length, 'zonal', 'zonales'), ...otros('selector')]
        : ['Selector', plural(otros('zonal').length, 'zonal', 'zonales')];
    return `<button class="mg-volver" onclick="eqMapaElegir(_eqMapaSel)"><i class="fas fa-arrow-left"></i> Todos</button>
        <div class="mg-det-cab"><span class="mg-fila-foto mg-det-foto" style="--c:${MAPA_RESALTE}">${fotoGrupo(e)}</span>
            <div><b>${esc(e.nombre)}</b><span>${esc(rol.join(' · '))}</span></div></div>
        <div class="mg-kpis">
            <div><b>${e.locales.length}</b><span>Locales</span></div>
            <div><b>${e.vac}</b><span>Vacantes abiertas</span></div>
            <div><b>${e.etapas.sin}</b><span>Sin persona</span></div>
        </div>
        ${e.vac ? `<div class="mg-sec">Búsquedas abiertas</div>
            <div class="mg-barra mg-barra-grande">${barraEtapas(e.etapas, e.vac)}</div>
            <div class="mg-etapas">${MAPA_ETAPAS.filter(([k]) => e.etapas[k]).map(([k, t, c]) => `<span><i style="background:${c}"></i>${t} <b>${e.etapas[k]}</b></span>`).join('')}</div>` : ''}
        <div class="mg-sec">Locales</div>
        <div class="mg-filas">${ls.map(l => {
            const bs = bq.get(l.id) || [], et = etapasVacias();
            bs.forEach(b => et[etapaBusqueda(b)]++);
            return `<button class="mg-local" onclick="eqMapaIrLocal(${l.id})" data-tip="${esc(l.localidad || '')}${bs.length ? `${l.localidad ? ' · ' : ''}${esc(textoEtapas(et))}` : ''}${fuera(l) ? ' · no está en la hoja' : ''}">
                <span class="mg-local-nom">${esc(l.local)}</span>${bs.length ? `<span class="mg-barra mg-barra-local">${barraEtapas(et, bs.length)}</span><b>${plural(bs.length, 'vac.', 'vac.')}</b>` : ''}</button>`;
        }).join('')}</div>`;
}

function leyendaLocalesHtml(lista, vac) {
    const color = coloresMapa(), grupos = new Map();
    lista.forEach(l => { const k = claveMapa(l), e = grupos.get(k) || { n: 0, v: 0 }; e.n++; e.v += vac.get(l.id) || 0; grupos.set(k, e); });
    const orden = [...grupos.keys()].sort((a, b) => eqMapaColor === 'nomina'
        ? MAPA_NOMINA_ORDEN.indexOf(a) - MAPA_NOMINA_ORDEN.indexOf(b) : grupos.get(b).n - grupos.get(a).n);
    return `<div class="mg-tit">Color por ${MAPA_MODOS[eqMapaColor].toLowerCase()}</div><div class="mg-sub">locales · vacantes abiertas</div>
        <div class="mg-filas">${orden.map(k => `<div class="eq-mapa-ley-fila"><i style="background:${color(k)}"></i><span>${esc(nombreMapa(k))}</span><b>${grupos.get(k).n} · ${grupos.get(k).v}</b></div>`).join('')}</div>`;
}

function tipMapa(ev) {
    const t = ev.target.closest?.('[data-tip]'), tip = document.getElementById('mg-tip');
    if (!t) { tip.hidden = true; return; }
    const box = ev.currentTarget.getBoundingClientRect();
    tip.textContent = t.dataset.tip;
    tip.hidden = false;
    const x = ev.clientX - box.left + 14, y = ev.clientY - box.top + 14;
    tip.style.left = Math.min(x, box.width - tip.offsetWidth - 8) + 'px';
    tip.style.top = Math.min(y, box.height - tip.offsetHeight - 8) + 'px';
}

// ── Elegir un grupo / ir a un local
// Con los paneles al costado (pantalla ancha), el centro del mapa es el espacio libre entre ellos
const paneles = () => !window.matchMedia('(max-width: 900px)').matches;
const padCamara = () => paneles() ? { top: 10, bottom: 10, left: 284, right: 304 } : { top: 0, bottom: 0, left: 0, right: 0 };
const paddingMapa = () => 50;
function eqMapaElegir(k) {
    _eqMapaSel = _eqMapaSel === k ? null : k;
    actualizarMapaEquipos();
    const e = _eqMapaGrupos.find(x => x.clave === _eqMapaSel);
    if (!_eqMapa) return;
    if (!e) { eqMapaVista('amba'); return; }
    const pts = e.puntos.length ? e.puntos : e.aprox, b = new maplibregl.LngLatBounds();
    pts.forEach(p => b.extend(p));
    _eqMapa.fitBounds(b, { padding: paddingMapa(), maxZoom: 12.5, pitch: _eqMapa.getPitch(), duration: 900 });
}
function eqMapaIrLocal(id) {
    const x = posicionesMapa(_eqMapaDatos.lista).pos.find(p => p.l.id === id);
    if (!x || !_eqMapa) return;
    _eqMapa.flyTo({ center: [x.lng, x.lat], zoom: Math.max(_eqMapa.getZoom(), 13), duration: 800 });
    popupMapa(propsLocal(x, vacantesPorLocal(), _eqMapaDatos.fuera), [x.lng, x.lat]);
}

let _eqMapaPopup = null;
function popupMapa(p, lngLat) {
    const fila = (t, v) => v ? `<div><span>${t}</span> ${esc(v)}</div>` : '';
    _eqMapaPopup?.remove();
    _eqMapaPopup = new maplibregl.Popup({ closeButton: true, maxWidth: '280px', offset: 10 }).setLngLat(lngLat).setHTML(`<div class="eq-mapa-pop">
        <b>${esc(p.local)}</b>${p.fuera === true || p.fuera === 'true' ? ' <span class="eq-local-fuera">No está en la hoja</span>' : ''}
        ${fila('Localidad', p.localidad)}${fila('Regional', tituloMapa(p.regional))}${fila('Zonal', tituloMapa(p.zonal))}${fila('Selector', p.selector)}
        ${fila('Nómina', p.nomina)}<div><span>Vacantes abiertas</span> ${p.vacantes}</div></div>`).addTo(_eqMapa);
}

function eqMapaVista(cual) {
    if (!_eqMapa) return;
    if (cual === 'amba') { _eqMapa.flyTo({ ...MAPA_INICIO, pitch: _eqMapa.getPitch(), bearing: _eqMapa.getBearing() }); return; }
    if (cual === '3d') {
        const plano = _eqMapa.getPitch() > 5;
        _eqMapa.easeTo({ pitch: plano ? 0 : MAPA_INICIO.pitch, bearing: plano ? 0 : MAPA_INICIO.bearing });
        document.getElementById('eq-mapa-3d').textContent = plano ? 'Vista 3D' : 'Vista plana';
        return;
    }
    if (!_eqMapaPuntos.length) return;
    const b = new maplibregl.LngLatBounds();
    _eqMapaPuntos.forEach(p => b.extend(p));
    _eqMapa.fitBounds(b, { padding: paddingMapa(), pitch: _eqMapa.getPitch(), maxZoom: 13 });
}
