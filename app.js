/* Viaje a China — Planificador
 * HTML + CSS + JS puro. Sin build. Datos en localStorage (nunca salen del dispositivo).
 * Mismo patrón que viaje-tailandia: formularios por esquema, motor de itinerario
 * propio y service worker. Las coordenadas se guardan en WGS-84 y solo se pasan
 * a GCJ-02 al generar los enlaces de Amap.
 */
'use strict';
(function () {

  /* ==========================================================
     Utilidades
     ========================================================== */
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const on = (sel, ev, fn) => { const n = $(sel); if (n) n.addEventListener(ev, fn); };
  const el = (tag, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const pad2 = n => String(n).padStart(2, '0');
  const clone = x => JSON.parse(JSON.stringify(x));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const escLines = s => esc(s).split('\n').join('<br>');
  // Marca visible para los datos que hay que verificar antes de viajar.
  const CHECK = '<span class="check-tag">[comprobar]</span>';
  const withCheck = s => esc(s).replace(/\[comprobar\]/g, CHECK);

  const svgIco = (d, size, sw) => `<svg viewBox="0 0 24 24" width="${size || 18}" height="${size || 18}" fill="none" stroke="currentColor" stroke-width="${sw || 2}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const PLANE = '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.2.4c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>';
  const ICON = {
    edit:   svgIco('<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>'),
    trash:  svgIco('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    chev:   svgIco('<path d="M6 9l6 6 6-6"/>', 22, 2.4),
    plus:   svgIco('<path d="M12 5v14M5 12h14"/>', 18, 2.4),
    plane:  svgIco(PLANE, 15, 2.2),
    planeL: svgIco(PLANE, 30, 2),
    train:  svgIco('<rect x="5" y="3" width="14" height="14" rx="4"/><path d="M5 11h14M9 21l1.5-4M15 21l-1.5-4M9 14h.01M15 14h.01"/>', 28, 2),
    moon:   svgIco('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>', 19, 2),
    sun:    svgIco('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>', 19, 2),
    map:    svgIco('<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14"/>', 15, 2.2),
    taxi:   svgIco('<path d="M5 17h14v-4l-2-5H7l-2 5v4zM5 13h14M9 5h6l1 3M7.5 17v2M16.5 17v2"/>', 15, 2.2)
  };

  const MES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const MES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DIA_L = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const DIA_C = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

  function parseDate(s) {
    if (!s) return null;
    const [y, m, d] = String(s).split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  }
  const ymd = dt => `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
  const hoyYMD = () => ymd(new Date());

  function fmtFecha(s, long) {
    const dt = parseDate(s);
    if (!dt) return '';
    const mes = (long ? MES_L : MES_C)[dt.getMonth()];
    return `${dt.getDate()} ${mes}${long ? ' ' + dt.getFullYear() : ''}`;
  }
  const fmtDiaSemana = s => { const dt = parseDate(s); return dt ? DIA_L[dt.getDay()] : ''; };

  function dtParts(s) {
    if (!s) return { date: '', time: '' };
    const [d, t] = String(s).split('T');
    return { date: d || '', time: (t || '').slice(0, 5) };
  }
  const toMin = t => {
    const m = String(t || '').match(/(\d{1,2}):(\d{2})/);
    return m ? (+m[1]) * 60 + (+m[2]) : 0;
  };
  const firstTime = s => {
    const m = String(s || '').match(/(\d{1,2}):(\d{2})/);
    return m ? `${pad2(+m[1])}:${m[2]}` : '';
  };

  function eachDay(a, b) {
    const out = [];
    const start = parseDate(a), end = parseDate(b);
    if (!start || !end || end < start) return out;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) out.push(ymd(new Date(d)));
    return out;
  }

  function haversine(a, b) {
    const R = 6371, toR = x => x * Math.PI / 180;
    const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 +
      Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  const hasXY = l => !!(l && l.lat != null && l.lng != null && isFinite(l.lat) && isFinite(l.lng));

  function fmtDur(min) {
    min = Math.round(min);
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60), m = min % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  // "2 h 30 min" / "2h30" / "90 min" -> minutos (o null)
  function parseDurLoose(s) {
    s = String(s || '');
    const hm = s.match(/(\d+)\s*h[^0-9]*(\d+)?/i);
    if (hm) return (+hm[1]) * 60 + (+(hm[2] || 0));
    const mm = s.match(/(\d+)\s*m/i);
    if (mm) return +mm[1];
    const n = s.match(/^\s*(\d+)\s*$/);
    return n ? +n[1] : null;
  }
  const minusMin = (hhmm, mins) => {
    const [h, m] = String(hhmm).split(':').map(Number);
    if (isNaN(h)) return '';
    let t = h * 60 + m - mins;
    t = ((t % 1440) + 1440) % 1440;
    return `${pad2(Math.floor(t / 60))}:${pad2(t % 60)}`;
  };
  const fmtKm = km => (km < 1 ? Math.round(km * 1000) + ' m' : (km < 10 ? km.toFixed(1).replace('.', ',') : Math.round(km)) + ' km');

  // China va entera en hora de Pekín (CST, UTC+8), sin horario de verano.
  // Ancla los cálculos de sol y de viabilidad del día a la hora local del viaje,
  // sea cual sea la zona horaria del dispositivo que consulta la app.
  const CN_TZ_OFFSET_MS = 8 * 3600000;

  /* ==========================================================
     Estado
     El esquema lleva versión (state.v). Cada vez que cambie la forma
     de los datos se sube SCHEMA_V y se añade un paso a MIGRATIONS:
     así quien ya tenía la app guardada conserva todo.
     ========================================================== */
  const STORE_KEY = 'china_trip';
  const SCHEMA_V = 1;
  // Tipo del BCE del 10 nov 2026. Solo se usa hasta la primera descarga y se
  // marca como aproximado.
  const FX_DEFAULT = 7.48;

  const blankFx = () => ({ rate: FX_DEFAULT, date: null, source: 'default', stamp: null });
  const blankMeteo = () => ({ precip: {}, fetched: null });

  const COLS = ['vuelos', 'transportes', 'alojamientos', 'excursiones', 'comidas', 'lugares', 'espectaculos', 'gastos', 'notas'];

  const blankState = () => ({
    v: SCHEMA_V,
    meta: { titulo: 'Viaje a China', fechaInicio: '', fechaFin: '' },
    viajeros: [],
    vuelos: [], transportes: [], alojamientos: [], excursiones: [], comidas: [], lugares: [],
    espectaculos: [], gastos: [], notas: [],
    fx: blankFx(), meteo: blankMeteo(),
    equipaje: [], antesDeViajar: [], diario: {}
  });

  // Lista de equipaje para China: sin datos personales, es una plantilla que
  // cada uno ajusta desde Datos. Se añaden por id los ítems nuevos que falten.
  const EQUIPAJE_SEED = [
    ['Documentos y dinero', 'Pasaporte (y una fotocopia y una foto guardadas aparte)'],
    ['Documentos y dinero', 'Tarjeta de crédito o débito vinculada a Alipay y WeChat Pay'],
    ['Documentos y dinero', 'Algo de efectivo en yuanes (CNY) para sitios que no acepten pago extranjero'],
    ['Documentos y dinero', 'Seguro de viaje: póliza y teléfono de asistencia'],
    ['Documentos y dinero', 'Reservas de hotel y billetes de tren descargados (sin conexión)'],
    ['Electrónica', 'Móvil con la eSIM instalada y Amap con los mapas offline descargados'],
    ['Electrónica', 'Cargador y cable'],
    ['Electrónica', 'Batería externa (en el equipaje de mano y con la capacidad impresa en la carcasa)'],
    ['Electrónica', 'Adaptador de enchufe (China: tipos A, C e I, 220 V)'],
    ['Ropa', 'Capas según la región y la estación (el norte es muy frío en invierno)'],
    ['Ropa', 'Chubasquero o paraguas plegable'],
    ['Ropa', 'Calzado cómodo para caminar mucho (y escaleras en la Gran Muralla)'],
    ['Botiquín y aseo', 'Analgésicos, antidiarreico y sales de rehidratación'],
    ['Botiquín y aseo', 'Medicación habitual en su envase original, con receta'],
    ['Botiquín y aseo', 'Mascarillas FFP2 para días de contaminación'],
    ['Botiquín y aseo', 'Pañuelos de papel y gel hidroalcohólico (en muchos baños no hay papel)'],
    ['Botiquín y aseo', 'Protector solar y gafas de sol'],
    ['Útiles', 'Botella reutilizable (agua caliente gratis en estaciones y hoteles; no bebas del grifo)'],
    ['Útiles', 'Mochila pequeña para el día (en metros y lugares hay control de seguridad)']
  ].map(([cat, texto], i) => ({ id: 'seed-eq-' + (i + 1), texto, cat, packed: false }));

  // Tareas antes de salir. «nota» se pinta debajo con [comprobar] resaltado.
  const ANTES_SEED = [
    ['Visado y documentos', 'Comprobar la entrada sin visado para pasaportes españoles',
      'Hoy (nov 2026): hasta 30 días por turismo, negocios, visitas o tránsito, en vigor hasta el 31 dic 2026; no se ha anunciado prórroga para 2027 [comprobar]. Confírmalo en la web oficial de la Embajada de China en España antes de viajar.'],
    ['Visado y documentos', 'Comprobar la validez del pasaporte',
      'Se suele pedir que le quede al menos 6 meses de validez a la entrada y tenga páginas en blanco [comprobar].'],
    ['Visado y documentos', 'Rellenar la tarjeta de llegada',
      'Se puede hacer en papel en el aeropuerto o por internet antes de llegar, en la web o la app de la Administración Nacional de Inmigración (NIA) [comprobar].'],
    ['Visado y documentos', 'Contratar el seguro de viaje con cobertura médica', ''],
    ['Pagos', 'Configurar Alipay ANTES de salir y vincular la tarjeta extranjera',
      'Verifica la identidad con el pasaporte y haz una prueba de pago pequeña desde España.'],
    ['Pagos', 'Configurar WeChat Pay ANTES de salir y vincular la tarjeta extranjera',
      'Algunos comercios solo aceptan una de las dos: lleva ambas listas.'],
    ['Pagos', 'Avisar al banco de que usarás la tarjeta en China', ''],
    ['Internet y mapas', 'Comprar e instalar la eSIM (o activar el roaming)',
      'Con eSIM o roaming extranjero puedes usar Google, WhatsApp o Instagram, que están bloqueados en las redes chinas [comprobar].'],
    ['Internet y mapas', 'Descargar los mapas offline de Amap (Gaode) de cada ciudad', ''],
    ['Internet y mapas', 'Instalar DiDi, Trip.com y una app de traducción con modo sin conexión', ''],
    ['Internet y mapas', 'Abrir esta app con conexión una vez antes de salir', 'Así queda guardada y arranca sin conexión.'],
    ['Transporte', 'Crear cuenta en 12306 o Trip.com para los trenes y comprar los billetes', 'Los billetes se abren con antelación limitada [comprobar].'],
    ['Vuelos', 'Facturar el vuelo de ida', ''],
    ['Vuelos', 'Facturar el vuelo de vuelta', '']
  ].map(([cat, texto, nota], i) => ({ id: 'seed-an-' + (i + 1), texto, nota, cat, hecho: false }));

  function mergeSeed(existing, seed) {
    const list = Array.isArray(existing) ? existing.slice() : [];
    const ids = new Set(list.map(i => i.id));
    seed.forEach(item => { if (!ids.has(item.id)) list.push(clone(item)); });
    return list;
  }

  /* ---------- Viaje real precargado (mayo de 2027) ----------
     La web es pública: solo nombres de pila. NUNCA apellidos, fechas de
     nacimiento, números de pasaporte ni localizadores. Lo que no venía en la
     reserva (horas de la escala en Frankfurt) se deja en blanco, sin inventar. */
  const META_SEED = { fechaInicio: '2027-05-07', fechaFin: '2027-05-23' };
  const VIAJEROS_SEED = ['Jose', 'Beatriz', 'David', 'Miguel', 'Sandra']
    .map((nombre, i) => ({ id: 'seed-vi-' + (i + 1), nombre }));
  const EQUIPAJE_VUELO = 'Por persona:\n' +
    '· 1 accesorio personal: va debajo del asiento de delante.\n' +
    '· 1 equipaje de mano de 20 × 40 × 55 cm, máx. 5 kg.\n' +
    '· 1 maleta facturada de máx. 23 kg.';
  const VUELOS_SEED = [
    {
      id: 'seed-vu-ida', tipo: 'Ida', reserva: '', antelacion: '', equipaje: EQUIPAJE_VUELO,
      notas: 'Lufthansa, clase turista. 1 escala en Frankfurt (FRA); 15 h 55 min en total.\n' +
        'La reserva no trae las horas de la escala en Frankfurt (llegada del LH1115 y salida del LH732): apúntalas al facturar [comprobar].\n' +
        'Asientos: sin elegir; los asigna la aerolínea.',
      tramos: [{
        aerolinea: 'Lufthansa', numero: 'LH1115', clase: 'Turista',
        origen: 'MAD', origenTerminal: '', destino: 'FRA', destinoTerminal: '',
        salida: '2027-05-07T17:10', llegada: '', duracion: ''
      }, {
        aerolinea: 'Lufthansa', numero: 'LH732', clase: 'Turista',
        origen: 'FRA', origenTerminal: '', destino: 'PVG', destinoTerminal: '',
        salida: '', llegada: '2027-05-08T15:05', duracion: ''
      }]
    },
    {
      id: 'seed-vu-vuelta', tipo: 'Vuelta', reserva: '', antelacion: '', equipaje: EQUIPAJE_VUELO,
      notas: 'Air China, clase turista. Directo, 12 h.\nAsientos: 52A, 52B, 52C, 52D y 52E.',
      tramos: [{
        aerolinea: 'Air China', numero: 'CA897', clase: 'Turista',
        origen: 'PEK', origenTerminal: '', destino: 'MAD', destinoTerminal: '',
        salida: '2027-05-23T15:00', llegada: '2027-05-23T21:00', duracion: '12 h'
      }]
    }
  ];

  // Versión de los datos precargados. aplicarSeeds solo AÑADE lo que falte,
  // una vez por versión: no pisa nada que cada uno haya editado o borrado después.
  const SEED_V = 1;
  function aplicarSeeds(s) {
    const v = s.seedV || 0;
    if (v >= SEED_V) return false;
    if (v < 1) {
      if (!s.meta.fechaInicio && !s.meta.fechaFin) Object.assign(s.meta, META_SEED);
      if (!s.viajeros.length) s.viajeros = clone(VIAJEROS_SEED);
      const numeros = new Set(s.vuelos.flatMap(x => (x.tramos || []).map(t => t.numero)).filter(Boolean));
      VUELOS_SEED.forEach(x => {
        const ya = s.vuelos.some(y => y.id === x.id) || x.tramos.some(t => numeros.has(t.numero));
        if (!ya) s.vuelos.push(clone(x));
      });
    }
    s.seedV = SEED_V;
    return true;
  }

  // MIGRATIONS[n] lleva los datos de la versión n a la n+1. Nunca borra nada
  // del usuario: solo añade campos o cambia su forma.
  const MIGRATIONS = [
    // 0 → 1: primera versión del esquema. Datos sin «v» (guardados antes de
    // versionar) se normalizan sin perder nada.
    p => { p.viajeros = Array.isArray(p.viajeros) ? p.viajeros : []; }
  ];

  function migrate(p) {
    let v = Number.isInteger(p.v) ? p.v : 0;
    while (v < SCHEMA_V) { MIGRATIONS[v](p); v++; }
    p.v = v;
    return p;
  }

  let seedsAplicadas = false;
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) {
        const s = blankState();
        s.equipaje = clone(EQUIPAJE_SEED);
        s.antesDeViajar = clone(ANTES_SEED);
        seedsAplicadas = aplicarSeeds(s);
        return s;
      }
      const p = migrate(JSON.parse(raw));
      const b = blankState();
      const s = {
        v: p.v,
        meta: Object.assign(b.meta, p.meta || {}),
        viajeros: p.viajeros || [],
        fx: Object.assign(blankFx(), p.fx || {}),
        meteo: Object.assign(blankMeteo(), p.meteo || {}),
        equipaje: mergeSeed(p.equipaje, EQUIPAJE_SEED),
        antesDeViajar: mergeSeed(p.antesDeViajar, ANTES_SEED),
        diario: p.diario || {}
      };
      COLS.forEach(c => { s[c] = Array.isArray(p[c]) ? p[c] : []; });
      // Conserva cualquier campo desconocido (p. ej. de una versión más nueva).
      Object.keys(p).forEach(k => { if (!(k in s)) s[k] = p[k]; });
      seedsAplicadas = aplicarSeeds(s);
      return s;
    } catch (e) {
      console.warn('Estado ilegible, se reinicia.', e);
      return blankState();
    }
  }

  let state = load();
  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 150);
  }
  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (e) {
      toast('No se pudo guardar (almacenamiento lleno).');
    }
  }
  // Si se cierra la app justo después de un cambio, que no se pierda. Solo
  // con un guardado pendiente: así otra pestaña abierta no pisa datos más nuevos.
  window.addEventListener('pagehide', () => { if (saveTimer) saveNow(); });
  if (seedsAplicadas) save(); // deja guardados los datos precargados recién añadidos

  const COL_OF  = { vuelo: 'vuelos', transporte: 'transportes', alojamiento: 'alojamientos', excursion: 'excursiones', comida: 'comidas', lugar: 'lugares', espectaculo: 'espectaculos', gasto: 'gastos', nota: 'notas' };
  const KIND_OF = Object.fromEntries(Object.entries(COL_OF).map(([k, c]) => [c, k]));

  /* ==========================================================
     Lugares conocidos de China (autocompletado + coordenadas WGS-84)
     Coordenadas de OpenStreetMap (Nominatim), comprobadas el 11 nov 2026.
     Ojo: NO copiar aquí coordenadas de Amap, Baidu o webs chinas: vienen en
     GCJ-02/BD-09 y, al convertirlas otra vez, saldrían desplazadas ~500 m.
     ========================================================== */
  const GAZ = [
    { n: 'Ciudad Prohibida (Pekín)', zh: '故宫博物院', lat: 39.9174, lng: 116.3908, min: 180 },
    { n: 'Plaza de Tiananmén (Pekín)', zh: '天安门广场', lat: 39.9027, lng: 116.3914, min: 45 },
    { n: 'Templo del Cielo (Pekín)', zh: '天坛公园', lat: 39.8799, lng: 116.4029, min: 120 },
    { n: 'Palacio de Verano (Pekín)', zh: '颐和园', lat: 39.9901, lng: 116.2647, min: 180 },
    { n: 'Gran Muralla, Mutianyu', zh: '慕田峪长城', lat: 40.4344, lng: 116.5635, min: 240 },
    { n: 'Gran Muralla, Badaling', zh: '八达岭长城', lat: 40.3603, lng: 116.0051, min: 210 },
    { n: 'Bund (Shanghái)', zh: '外滩', lat: 31.2353, lng: 121.4876, min: 60 },
    { n: 'Jardín Yuyuan (Shanghái)', zh: '豫园', lat: 31.2289, lng: 121.4880, min: 90 },
    { n: 'Guerreros de terracota (Xi\'an)', zh: '秦始皇帝陵博物院', lat: 34.3874, lng: 109.2777, min: 180 },
    { n: 'Torre de la Campana (Xi\'an)', zh: '西安钟楼', lat: 34.2610, lng: 108.9423, min: 45 },
    { n: 'Base de los pandas (Chengdú)', zh: '成都大熊猫繁育研究基地', lat: 30.7432, lng: 104.1329, min: 180 },
    { n: 'Callejones Kuanzhai (Chengdú)', zh: '宽窄巷子', lat: 30.6678, lng: 104.0479, min: 90 },
    { n: 'Lago del Oeste (Hangzhou)', zh: '西湖', lat: 30.2460, lng: 120.1431, min: 180 },
    { n: 'Calle del Oeste (Yangshuo)', zh: '阳朔西街', lat: 24.7782, lng: 110.4905, min: 90 },
    { n: 'Parque Forestal de Zhangjiajie (Wulingyuan)', zh: '张家界国家森林公园', lat: 29.3530, lng: 110.4390, min: 480 },
    { n: 'Ciudad vieja de Lijiang', zh: '丽江古城', lat: 26.8739, lng: 100.2353, min: 180 },
    { n: 'Aeropuerto de Pekín-Capital (PEK)', zh: '北京首都国际机场', lat: 40.0802, lng: 116.5939, min: 0 },
    { n: 'Aeropuerto de Pekín-Daxing (PKX)', zh: '北京大兴国际机场', lat: 39.4973, lng: 116.4123, min: 0 },
    { n: 'Aeropuerto de Shanghái-Pudong (PVG)', zh: '上海浦东国际机场', lat: 31.1427, lng: 121.8041, min: 0 },
    { n: 'Aeropuerto de Shanghái-Hongqiao (SHA)', zh: '上海虹桥国际机场', lat: 31.1977, lng: 121.3345, min: 0 },
    { n: 'Aeropuerto de Chengdú-Tianfu (TFU)', zh: '成都天府国际机场', lat: 30.3036, lng: 104.4457, min: 0 },
    { n: 'Aeropuerto de Chengdú-Shuangliu (CTU)', zh: '成都双流国际机场', lat: 30.5548, lng: 103.9479, min: 0 },
    { n: 'Aeropuerto de Xi\'an-Xianyang (XIY)', zh: '西安咸阳国际机场', lat: 34.4424, lng: 108.7600, min: 0 },
    { n: 'Aeropuerto de Cantón-Baiyun (CAN)', zh: '广州白云国际机场', lat: 23.3863, lng: 113.3023, min: 0 },
    { n: 'Estación de Pekín Sur', zh: '北京南站', lat: 39.8635, lng: 116.3727, min: 0 },
    { n: 'Estación de Pekín Oeste', zh: '北京西站', lat: 39.8937, lng: 116.3151, min: 0 },
    { n: 'Estación de Shanghái Hongqiao', zh: '上海虹桥站', lat: 31.1961, lng: 121.3161, min: 0 },
    { n: 'Estación de Xi\'an Norte', zh: '西安北站', lat: 34.3776, lng: 108.9339, min: 0 },
    { n: 'Estación de Chengdú Este', zh: '成都东站', lat: 30.6312, lng: 104.1389, min: 0 }
  ];
  const GAZ_BY_NAME = k => GAZ.find(g => g.n.toLowerCase() === String(k).trim().toLowerCase());

  /* ==========================================================
     Esquemas de formulario
     t: text | textarea | number | date | time | datetime-local | select | loc | zh | dias
     ========================================================== */
  const TIPOS_TRANSPORTE = ['Tren de alta velocidad', 'Tren convencional', 'Tren nocturno', 'Autobús', 'Barco', 'DiDi / taxi', 'Traslado privado', 'Otro'];
  const TIPOS_COMIDA = ['Restaurante', 'Callejero / snacks', 'Hot pot', 'Pato laqueado', 'Dim sum', 'Fideos', 'Dumplings', 'Barbacoa', 'Vegetariano', 'Desayuno', 'Café / té', 'Mercado nocturno', 'Otro'];
  const TIPOS_ESPECTACULO = ['Acrobacias', 'Ópera de Pekín', 'Ópera de Sichuan', 'Otro'];
  const CATS = ['Comida', 'Transporte', 'Alojamiento', 'Entradas', 'Compras', 'Internet / eSIM', 'Otros'];

  const ZH = { k: 'zh', t: 'zh' }; // nombreZh + direccionZh

  const SCHEMAS = {
    // Los vuelos usan un formulario propio (openFlightSheet) que admite escalas.
    vuelo: { sing: 'vuelo', ico: '飞', color: 'var(--sky)', fields: [] },
    meta: {
      sing: 'datos del viaje',
      fields: [
        { k: 'titulo', l: 'Nombre del viaje', t: 'text', req: true, ph: 'Viaje a China' },
        { k: 'fechaInicio', l: 'Fecha de inicio', t: 'date' },
        { k: 'fechaFin', l: 'Fecha de fin', t: 'date' },
        { k: 'viajerosTxt', l: 'Viajeros (uno por línea)', t: 'textarea', ph: 'Ana\nLuis' }
      ]
    },
    transporte: {
      sing: 'transporte', ico: '车', color: 'var(--sky)',
      fields: [
        { k: 'tipo', l: 'Tipo', t: 'select', opts: TIPOS_TRANSPORTE, def: 'Tren de alta velocidad', req: true },
        { k: 'numero', l: 'Número de tren o línea', t: 'text', mono: true, ph: 'G1' },
        { k: 'origen', l: 'Origen', t: 'loc', req: true },
        { k: 'destino', l: 'Destino', t: 'loc', req: true },
        { k: 'salida', l: 'Salida (fecha y hora)', t: 'datetime-local', req: true },
        { k: 'llegada', l: 'Llegada (fecha y hora)', t: 'datetime-local' },
        { k: 'clase', l: 'Clase', t: 'text', ph: 'Segunda clase' },
        { k: 'asiento', l: 'Coche y asiento', t: 'text', ph: 'Coche 5, 12F' },
        { k: 'reserva', l: 'Nº de pedido / reserva', t: 'text', mono: true },
        { k: 'precio', l: 'Precio pagado', t: 'text', ph: 'Lo que pone tu billete' },
        { k: 'notas', l: 'Notas', t: 'textarea' }
      ]
    },
    alojamiento: {
      sing: 'alojamiento', ico: '宿', color: 'var(--brass)',
      fields: [
        { k: 'nombre', l: 'Nombre', t: 'text', req: true, ph: 'Hotel en Dongcheng' },
        { k: 'ciudad', l: 'Ciudad', t: 'text', req: true, ph: 'Pekín' },
        ZH,
        { k: 'loc', l: 'Ubicación', t: 'loc' },
        { k: 'checkin', l: 'Entrada (check-in)', t: 'date', req: true },
        { k: 'checkout', l: 'Salida (check-out)', t: 'date', req: true },
        { k: 'reserva', l: 'Localizador / reserva', t: 'text', mono: true },
        { k: 'link', l: 'Enlace (opcional)', t: 'text', ph: 'https://…' },
        { k: 'notas', l: 'Notas', t: 'textarea' }
      ]
    },
    excursion: {
      sing: 'excursión', ico: '游', color: 'var(--jade)',
      fields: [
        { k: 'nombre', l: 'Nombre', t: 'text', req: true, ph: 'Gran Muralla en Mutianyu' },
        { k: 'fecha', l: 'Fecha', t: 'date', req: true },
        { k: 'hora', l: 'Hora', t: 'time' },
        { k: 'duracion', l: 'Duración (minutos)', t: 'number', ph: '240', min: 0 },
        { k: 'encuentro', l: 'Punto de encuentro', t: 'loc' },
        { k: 'proveedor', l: 'Proveedor / empresa', t: 'text' },
        { k: 'reserva', l: 'Localizador / reserva', t: 'text', mono: true },
        { k: 'notas', l: 'Notas', t: 'textarea' }
      ]
    },
    comida: {
      sing: 'sitio para comer', ico: '食', color: 'var(--red)',
      fields: [
        { k: 'nombre', l: 'Nombre', t: 'text', req: true, ph: 'Restaurante de pato laqueado' },
        ZH,
        { k: 'tipo', l: 'Tipo de comida', t: 'select', opts: TIPOS_COMIDA },
        { k: 'loc', l: 'Ubicación', t: 'loc' },
        { k: 'precio', l: 'Precio medio por persona (CNY)', t: 'number', min: 0, ph: 'El que hayas visto en la carta o en reseñas' },
        { k: 'fecha', l: 'Día (opcional)', t: 'date' },
        { k: 'horario', l: 'Hora o horario (opcional)', t: 'text', ph: '13:00' },
        { k: 'notas', l: 'Notas', t: 'textarea' }
      ]
    },
    lugar: {
      sing: 'lugar', ico: '景', color: 'var(--jade)',
      fields: [
        { k: 'nombre', l: 'Nombre', t: 'text', req: true, ph: 'Ciudad Prohibida (Pekín)', gaz: true },
        ZH,
        { k: 'loc', l: 'Ubicación', t: 'loc' },
        { k: 'fecha', l: 'Día (opcional)', t: 'date' },
        { k: 'hora', l: 'Hora aproximada (opcional)', t: 'time' },
        { k: 'visita', l: 'Tiempo de visita (min)', t: 'number', ph: '90', min: 0 },
        { k: 'prioridad', l: 'Prioridad', t: 'select', opts: ['Alta', 'Media', 'Baja'], def: 'Media' },
        { k: 'notas', l: 'Notas', t: 'textarea' }
      ]
    },
    espectaculo: {
      sing: 'espectáculo', ico: '戏', color: 'var(--red)',
      fields: [
        { k: 'nombre', l: 'Nombre del teatro o espectáculo', t: 'text', req: true },
        { k: 'tipo', l: 'Tipo', t: 'select', opts: TIPOS_ESPECTACULO, def: 'Acrobacias', req: true },
        ZH,
        { k: 'loc', l: 'Ubicación', t: 'loc' },
        { k: 'dias', l: 'Días de función', t: 'dias' },
        { k: 'horario', l: 'Horario', t: 'text', ph: 'El de la web oficial' },
        { k: 'precio', l: 'Precio', t: 'text', ph: 'El de la web oficial' },
        { k: 'web', l: 'Web o entradas', t: 'text', ph: 'https://…' },
        { k: 'notas', l: 'Notas', t: 'textarea' }
      ]
    },
    gasto: {
      sing: 'gasto', ico: '¥', color: 'var(--red)',
      fields: [
        { k: 'fecha', l: 'Fecha', t: 'date', req: true },
        { k: 'concepto', l: 'Concepto', t: 'text', req: true, ph: 'Cena de hot pot' },
        { k: 'categoria', l: 'Categoría', t: 'select', opts: CATS, def: 'Comida', req: true },
        { k: 'moneda', l: 'Moneda', t: 'select', opts: ['CNY', 'EUR'], def: 'CNY', req: true },
        { k: 'importe', l: 'Importe', t: 'number', req: true, min: 0, step: '0.01' },
        { k: 'notas', l: 'Notas', t: 'textarea' }
      ]
    },
    nota: {
      sing: 'nota', ico: '记', color: 'var(--brass)',
      fields: [
        { k: 'texto', l: 'Nota', t: 'textarea', req: true, ph: 'Ej.: Reservar la Ciudad Prohibida con el pasaporte' },
        { k: 'categoria', l: 'Categoría', t: 'select', opts: ['Ver', 'Hacer', 'Comer', 'Comprar', 'Consejo', 'Otro'], def: 'Consejo' },
        { k: 'link', l: 'Enlace (opcional)', t: 'text', ph: 'https://…' }
      ]
    }
  };

  /* ==========================================================
     Geocodificación (Nominatim / OpenStreetMap) — devuelve WGS-84
     ========================================================== */
  async function geocode(q) {
    const hit = GAZ_BY_NAME(q);
    if (hit) return { lat: hit.lat, lng: hit.lng, label: hit.n, zh: hit.zh };
    const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=cn&accept-language=es&q=' + encodeURIComponent(q);
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('geocode ' + r.status);
    const j = await r.json();
    if (!j.length) return null;
    return {
      lat: +(+j[0].lat).toFixed(5),
      lng: +(+j[0].lon).toFixed(5),
      label: String(j[0].display_name || '').split(',')[0]
    };
  }

  /* ==========================================================
     Formulario dinámico
     ========================================================== */
  let editing = null; // { kind, id }

  function labeled(text, control, req, cls) {
    const w = el('label', 'field' + (cls ? ' ' + cls : ''));
    const s = el('span');
    s.textContent = text + (req ? ' *' : '');
    w.append(s, control);
    return w;
  }

  function fieldRow(f, item) {
    const val = item[f.k];
    if (f.t === 'loc') {
      // Un <details> no debe ir dentro de un <label>: el clic se iría al input.
      const w = el('div', 'field');
      const s = el('span');
      s.textContent = f.l + (f.req ? ' *' : '');
      w.append(s, locControl(f, val || {}));
      return w;
    }
    if (f.t === 'zh') return zhFieldset(item);
    if (f.t === 'dias') return diasField(f, val);

    let input;
    if (f.t === 'textarea') {
      input = el('textarea');
    } else if (f.t === 'select') {
      input = el('select');
      if (!f.req) { const o = el('option'); o.value = ''; o.textContent = '—'; input.appendChild(o); }
      (f.opts || []).forEach(op => { const o = el('option'); o.value = op; o.textContent = op; input.appendChild(o); });
    } else {
      input = el('input');
      input.type = f.t;
      if (f.min != null) input.min = f.min;
      if (f.step) input.step = f.step;
      if (f.t === 'number') input.inputMode = 'decimal';
    }
    input.name = f.k;
    if (f.ph) input.placeholder = f.ph;
    if (f.req) input.required = true;
    if (f.mono) input.classList.add('mono');
    if (f.gaz) input.setAttribute('list', 'gaz-list');
    if (val != null && val !== '') input.value = val;
    else if (f.def) input.value = f.def;
    return labeled(f.l, input, f.req);
  }

  // Nombre y dirección en caracteres chinos: lo que se enseña al taxista.
  function zhFieldset(item) {
    const fs = el('fieldset', 'fieldset-zh');
    fs.innerHTML = '<legend>En chino (para el taxista)</legend>';
    const n = el('input'); n.type = 'text'; n.name = 'nombreZh'; n.lang = 'zh-Hans'; n.placeholder = '故宫博物院';
    n.value = item.nombreZh || '';
    const d = el('textarea'); d.name = 'direccionZh'; d.lang = 'zh-Hans'; d.rows = 2; d.placeholder = '北京市东城区景山前街4号';
    d.value = item.direccionZh || '';
    d.style.minHeight = '64px';
    fs.append(labeled('Nombre en chino', n, false, 'field--zh'), labeled('Dirección en chino', d, false, 'field--zh'));
    const hint = el('p', 'field__hint');
    hint.textContent = 'Cópialos de la reserva, de Amap o de Trip.com. Sin ellos no se muestra el botón «Enseñar al taxista».';
    hint.style.marginBottom = '10px';
    fs.appendChild(hint);
    return fs;
  }

  // Días de la semana (0 = domingo … 6 = sábado), en orden lunes → domingo.
  function diasField(f, val) {
    const w = el('div', 'field');
    const s = el('span'); s.textContent = f.l;
    const box = el('div', 'days-pick');
    box.dataset.dias = f.k;
    const sel = new Set(Array.isArray(val) ? val : []);
    [1, 2, 3, 4, 5, 6, 0].forEach(d => {
      const lb = el('label');
      lb.title = DIA_L[d];
      lb.innerHTML = `<input type="checkbox" value="${d}"${sel.has(d) ? ' checked' : ''}><span aria-hidden="true">${DIA_C[d]}</span>`;
      lb.querySelector('input').setAttribute('aria-label', DIA_L[d]);
      box.appendChild(lb);
    });
    const hint = el('p', 'field__hint');
    hint.textContent = 'Márcalos según la web oficial del teatro. Sin días, sale como «[comprobar]».';
    w.append(s, box, hint);
    return w;
  }

  function locControl(f, val) {
    const box = el('div', 'loc');
    box.dataset.loc = f.k;

    const row = el('div', 'loc__row');
    const txt = el('input');
    txt.type = 'text';
    txt.className = 'loc__text';
    txt.placeholder = 'Nombre o dirección en China';
    txt.value = val.texto || '';
    txt.setAttribute('list', 'gaz-list');
    txt.setAttribute('aria-label', f.l);

    const btn = el('button', 'btn btn--ghost btn--sm loc__btn');
    btn.type = 'button';
    btn.textContent = 'Buscar';
    row.append(txt, btn);

    const status = el('p', 'loc__status');
    const adv = el('details', 'loc__adv');
    const sum = el('summary');
    sum.textContent = 'Coordenadas WGS-84 (avanzado)';
    const latI = el('input');
    latI.type = 'number'; latI.step = 'any'; latI.placeholder = 'Latitud'; latI.className = 'loc__lat'; latI.inputMode = 'decimal';
    latI.setAttribute('aria-label', 'Latitud');
    if (val.lat != null) latI.value = val.lat;
    const lngI = el('input');
    lngI.type = 'number'; lngI.step = 'any'; lngI.placeholder = 'Longitud'; lngI.className = 'loc__lng'; lngI.inputMode = 'decimal';
    lngI.setAttribute('aria-label', 'Longitud');
    if (val.lng != null) lngI.value = val.lng;
    const advHint = el('p', 'field__hint');
    advHint.textContent = 'Las de OpenStreetMap o un GPS. No pegues coordenadas copiadas de Amap: ya vienen desplazadas (GCJ-02).';
    adv.append(sum, latI, lngI, advHint);
    box.append(row, status, adv);

    const paint = () => {
      const la = parseFloat(latI.value), lo = parseFloat(lngI.value);
      if (isFinite(la) && isFinite(lo)) {
        status.textContent = `📍 ${la.toFixed(4)}, ${lo.toFixed(4)}`;
        status.classList.add('is-set');
      } else {
        status.textContent = 'Sin coordenadas: no saldrá en el mapa ni en los cálculos de trayecto.';
        status.classList.remove('is-set');
      }
    };
    latI.addEventListener('input', paint);
    lngI.addEventListener('input', paint);

    // Si el sitio está en la lista de lugares conocidos, rellena coordenadas y
    // el nombre en chino (si el formulario lo tiene y está vacío).
    const fillZh = zh => {
      const form = box.closest('form');
      const n = form && form.querySelector('[name="nombreZh"]');
      if (n && zh && !n.value.trim()) n.value = zh;
    };
    txt.addEventListener('change', () => {
      const hit = GAZ_BY_NAME(txt.value);
      if (hit) { latI.value = hit.lat; lngI.value = hit.lng; fillZh(hit.zh); paint(); }
    });

    btn.addEventListener('click', async () => {
      const q = txt.value.trim();
      if (!q) { txt.focus(); return; }
      btn.disabled = true;
      btn.textContent = 'Buscando…';
      try {
        const res = await geocode(q);
        if (res) {
          latI.value = res.lat;
          lngI.value = res.lng;
          fillZh(res.zh);
          paint();
        } else {
          toast('No se encontró esa ubicación.');
        }
      } catch (e) {
        toast('Búsqueda no disponible ahora. Prueba con coordenadas.');
        adv.open = true;
      } finally {
        btn.disabled = false;
        btn.textContent = 'Buscar';
      }
    });

    paint();
    return box;
  }

  function readLoc(box) {
    const o = { texto: box.querySelector('.loc__text').value.trim() };
    const la = parseFloat(box.querySelector('.loc__lat').value);
    const lo = parseFloat(box.querySelector('.loc__lng').value);
    if (isFinite(la) && isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180) { o.lat = la; o.lng = lo; }
    return o;
  }

  // El nombre del lugar conocido rellena su ubicación al salir del campo.
  function wireGazName(form) {
    const n = form.querySelector('input[name="nombre"][list="gaz-list"]');
    if (!n) return;
    n.addEventListener('change', () => {
      const hit = GAZ_BY_NAME(n.value);
      if (!hit) return;
      const box = form.querySelector('[data-loc="loc"]');
      if (box) {
        const t = box.querySelector('.loc__text');
        if (!t.value.trim()) t.value = hit.n;
        box.querySelector('.loc__lat').value = hit.lat;
        box.querySelector('.loc__lng').value = hit.lng;
        box.querySelector('.loc__lat').dispatchEvent(new Event('input'));
      }
      const zh = form.querySelector('[name="nombreZh"]');
      if (zh && !zh.value.trim()) zh.value = hit.zh;
      const v = form.querySelector('[name="visita"]');
      if (v && !v.value && hit.min) v.value = hit.min;
    });
  }

  /* ---------- Formulario de vuelos (con escalas) ---------- */
  function mkInput(name, type, value, opts) {
    opts = opts || {};
    const i = el('input');
    i.type = type;
    i.name = name;
    if (value != null && value !== '') i.value = value;
    if (opts.ph) i.placeholder = opts.ph;
    if (opts.mono) i.classList.add('mono');
    return i;
  }
  const textField = (name, label, value, opts) => labeled(label, mkInput(name, 'text', value, opts), opts && opts.req);
  function textareaField(name, label, value) {
    const t = el('textarea');
    t.name = name;
    if (value) t.value = value;
    return labeled(label, t);
  }
  function selectField(name, label, options, value, req) {
    const sel = el('select');
    sel.name = name;
    options.forEach(o => { const op = el('option'); op.value = o; op.textContent = o; sel.appendChild(op); });
    if (value) sel.value = value;
    return labeled(label, sel, req);
  }

  function tramoCard(n, t) {
    t = t || {};
    const c = el('div', 'tramo');
    const head = el('div', 'tramo__head');
    const title = el('span');
    title.textContent = 'Tramo ' + n;
    const rm = el('button', 'icon-btn icon-btn--danger');
    rm.type = 'button';
    rm.setAttribute('aria-label', 'Eliminar tramo');
    rm.innerHTML = ICON.trash;
    rm.addEventListener('click', () => {
      const wrap = c.parentElement;
      if (wrap.querySelectorAll('.tramo').length <= 1) { toast('Un vuelo necesita al menos un tramo.'); return; }
      c.remove();
      $$('.tramo', wrap).forEach((card, i) => { $('.tramo__head span', card).textContent = 'Tramo ' + (i + 1); });
    });
    head.append(title, rm);
    c.appendChild(head);

    c.appendChild(textField('aerolinea', 'Aerolínea', t.aerolinea, { ph: 'Air China' }));
    const g1 = el('div', 'field-2');
    g1.append(textField('numero', 'Nº de vuelo', t.numero, { mono: true, ph: 'CA 908' }), textField('clase', 'Clase', t.clase, { ph: 'Turista' }));
    c.appendChild(g1);
    const g2 = el('div', 'field-2');
    g2.append(textField('origen', 'Origen (código)', t.origen, { ph: 'MAD', mono: true }), textField('origenTerminal', 'Terminal', t.origenTerminal, { ph: '4' }));
    c.appendChild(g2);
    const g3 = el('div', 'field-2');
    g3.append(textField('destino', 'Destino (código)', t.destino, { ph: 'PEK', mono: true }), textField('destinoTerminal', 'Terminal', t.destinoTerminal, { ph: '3' }));
    c.appendChild(g3);
    c.appendChild(labeled('Salida (hora local del aeropuerto)', mkInput('salida', 'datetime-local', t.salida), n === 1));
    c.appendChild(labeled('Llegada (hora local del aeropuerto)', mkInput('llegada', 'datetime-local', t.llegada)));
    c.appendChild(textField('duracion', 'Duración', t.duracion, { ph: '11 h 30 min' }));
    return c;
  }

  function openFlightSheet(id) {
    const v = id ? state.vuelos.find(x => x.id === id) : null;
    editing = { kind: 'vuelo', id: id || null };
    $('#sheet-title').textContent = (v ? 'Editar' : 'Añadir') + ' vuelo';
    const form = $('#sheet-form');
    form.innerHTML = '';
    form.appendChild(selectField('tipo', 'Tipo', ['Ida', 'Vuelta', 'Interno', 'Otro'], v ? v.tipo : 'Ida', true));
    const wrap = el('div', 'tramos');
    const tr = v && v.tramos && v.tramos.length ? v.tramos : [{}];
    tr.forEach((t, i) => wrap.appendChild(tramoCard(i + 1, t)));
    form.appendChild(wrap);
    const add = el('button', 'btn btn--add btn--block');
    add.type = 'button';
    add.innerHTML = ICON.plus + ' Añadir escala (otro tramo)';
    add.style.marginBottom = '14px';
    add.addEventListener('click', () => {
      const n = wrap.querySelectorAll('.tramo').length + 1;
      const card = tramoCard(n, {});
      wrap.appendChild(card);
      card.querySelector('input').focus();
    });
    form.appendChild(add);
    form.appendChild(textField('reserva', 'Localizador', v && v.reserva, { mono: true }));
    form.appendChild(textField('antelacion', 'Antelación en el aeropuerto', v && v.antelacion, { ph: '3 h' }));
    form.appendChild(textareaField('equipaje', 'Equipaje incluido', v && v.equipaje));
    form.appendChild(textareaField('notas', 'Notas', v && v.notas));
    showSheet();
  }

  function readFlight(form) {
    const g = n => (form.querySelector(`:scope > .field [name="${n}"]`) || {}).value || '';
    const tramos = $$('.tramo', form).map(c => {
      const t = {};
      ['aerolinea', 'numero', 'clase', 'origen', 'origenTerminal', 'destino', 'destinoTerminal', 'salida', 'llegada', 'duracion']
        .forEach(k => { t[k] = (c.querySelector(`[name="${k}"]`).value || '').trim(); });
      t.origen = t.origen.toUpperCase();
      t.destino = t.destino.toUpperCase();
      return t;
    });
    return {
      tipo: g('tipo'), reserva: g('reserva').trim(), antelacion: g('antelacion').trim(),
      equipaje: g('equipaje').trim(), notas: g('notas').trim(), tramos
    };
  }

  /* ---------- Hoja genérica ---------- */
  function openSheet(kind, id) {
    if (kind === 'vuelo') return openFlightSheet(id);
    const sch = SCHEMAS[kind];
    let item = {};
    if (kind === 'meta') {
      item = Object.assign({}, state.meta, { viajerosTxt: state.viajeros.map(v => v.nombre).join('\n') });
    } else if (id) {
      item = state[COL_OF[kind]].find(x => x.id === id) || {};
    }
    editing = { kind, id: id || null };
    $('#sheet-title').textContent = kind === 'meta' ? 'Fechas y viajeros' : (id ? 'Editar ' : 'Añadir ') + sch.sing;
    const form = $('#sheet-form');
    form.innerHTML = '';
    sch.fields.forEach(f => form.appendChild(fieldRow(f, item)));
    wireGazName(form);
    showSheet();
  }

  function readForm(kind, form) {
    const out = {};
    let missing = null;
    SCHEMAS[kind].fields.forEach(f => {
      if (f.t === 'loc') {
        const o = readLoc(form.querySelector(`[data-loc="${f.k}"]`));
        out[f.k] = o;
        if (f.req && !o.texto && !hasXY(o) && !missing) missing = { f, node: form.querySelector(`[data-loc="${f.k}"] .loc__text`) };
        return;
      }
      if (f.t === 'zh') {
        out.nombreZh = form.querySelector('[name="nombreZh"]').value.trim();
        out.direccionZh = form.querySelector('[name="direccionZh"]').value.trim();
        return;
      }
      if (f.t === 'dias') {
        out[f.k] = $$(`[data-dias="${f.k}"] input:checked`, form).map(i => +i.value);
        return;
      }
      const node = form.querySelector(`[name="${f.k}"]`);
      let v = (node.value || '').trim();
      if (f.t === 'number' && v !== '') v = Number(v.replace(',', '.'));
      if (f.req && (v === '' || (f.t === 'number' && !isFinite(v))) && !missing) missing = { f, node };
      out[f.k] = v;
    });
    return { out, missing };
  }

  on('#sheet-form', 'submit', e => {
    e.preventDefault();
    if (!editing) return;
    const form = e.currentTarget;
    const { kind, id } = editing;

    if (kind === 'vuelo') {
      const data = readFlight(form);
      if (!data.tramos.length || !data.tramos[0].salida) {
        toast('Falta la salida del primer tramo.');
        const n = form.querySelector('.tramo [name="salida"]');
        if (n) n.focus();
        return;
      }
      upsert('vuelos', id, data);
      return done('Vuelo guardado');
    }

    const { out, missing } = readForm(kind, form);
    if (missing) {
      toast('Falta: ' + missing.f.l);
      if (missing.node) missing.node.focus();
      return;
    }

    if (kind === 'meta') {
      if (out.fechaInicio && out.fechaFin && out.fechaFin < out.fechaInicio) { toast('La fecha de fin es anterior a la de inicio.'); return; }
      const nombres = String(out.viajerosTxt || '').split(/\n|,/).map(s => s.trim()).filter(Boolean);
      state.viajeros = nombres.map(n => state.viajeros.find(v => v.nombre === n) || { id: uid(), nombre: n });
      delete out.viajerosTxt;
      Object.assign(state.meta, out);
      state.meteo = blankMeteo(); // otras fechas: otra previsión
      return done('Datos del viaje guardados');
    }
    if (kind === 'alojamiento' && out.checkin && out.checkout && out.checkout <= out.checkin) {
      toast('La salida tiene que ser posterior a la entrada.');
      return;
    }
    upsert(COL_OF[kind], id, out);
    if (kind === 'alojamiento') state.meteo.fetched = null; // otras ubicaciones: otra previsión
    done(cap(SCHEMAS[kind].sing) + ' guardado');
  });

  const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);

  function upsert(col, id, data) {
    const list = state[col];
    if (id) {
      const i = list.findIndex(x => x.id === id);
      if (i > -1) { list[i] = Object.assign({}, list[i], data, { id }); return; }
    }
    list.push(Object.assign({ id: uid() }, data));
  }

  function done(msg) {
    save();
    hideSheet();
    renderAll();
    toast(msg);
  }

  async function removeItem(kind, id) {
    const col = COL_OF[kind];
    const it = state[col].find(x => x.id === id);
    if (!it) return;
    const name = it.nombre || it.concepto || (it.texto && it.texto.slice(0, 40)) || SCHEMAS[kind].sing;
    const ok = await confirmAsk(`¿Eliminar «${name}»?`);
    if (!ok) return;
    state[col] = state[col].filter(x => x.id !== id);
    save();
    renderAll();
    toast('Eliminado');
  }

  /* ==========================================================
     Enseñar al taxista
     ========================================================== */
  const hasZh = it => !!(it && (it.nombreZh || it.direccionZh));

  function taxiBtn(it, label) {
    if (!hasZh(it)) return '';
    return `<button type="button" class="taxi-btn" data-taxi="${esc(it.id)}" aria-label="Enseñar al taxista"><span class="brush" lang="zh-Hans" aria-hidden="true">出租</span>Taxista</button>`;
  }

  function findById(id) {
    for (const c of COLS) {
      const it = state[c].find(x => x.id === id);
      if (it) return it;
    }
    return null;
  }

  // Elementos que no están en state (catálogo de teatros) y también tienen texto en chino.
  const extraTaxi = {};
  let taxiReturnFocus = null;
  function showTaxi(it) {
    if (!hasZh(it)) return;
    taxiReturnFocus = document.activeElement;
    $('#taxi-zh').textContent = it.nombreZh || '';
    $('#taxi-zh').hidden = !it.nombreZh;
    $('#taxi-addr').textContent = it.direccionZh || '';
    $('#taxi-addr').hidden = !it.direccionZh;
    $('#taxi-es').textContent = it.nombre || '';
    $('#taxi').hidden = false;
    document.body.classList.add('no-scroll');
    const t = $('#taxi');
    if (t.requestFullscreen) t.requestFullscreen().catch(() => {});
    requestAnimationFrame(() => $('#taxi-close').focus());
  }
  function hideTaxi() {
    if ($('#taxi').hidden) return;
    $('#taxi').hidden = true;
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    if ($('#sheet').hidden) document.body.classList.remove('no-scroll');
    if (taxiReturnFocus && taxiReturnFocus.focus) taxiReturnFocus.focus();
  }
  on('#taxi-close', 'click', hideTaxi);
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-taxi]');
    if (!b) return;
    const it = findById(b.dataset.taxi) || extraTaxi[b.dataset.taxi];
    if (it) showTaxi(it);
  });

  /* ==========================================================
     Pantalla: DATOS
     ========================================================== */
  let selectedDatosTopic = 'all';

  function datosChip(key, label) {
    const b = el('button', 'chip');
    b.type = 'button';
    b.textContent = label;
    b.setAttribute('aria-pressed', String(selectedDatosTopic === key));
    b.addEventListener('click', () => {
      if (selectedDatosTopic === key) return;
      selectedDatosTopic = key;
      renderDatos();
    });
    return b;
  }

  const DATOS_GROUPS = [
    ['vuelos', 'Vuelos', () => vueloSummary],
    ['transportes', 'Transportes', () => transporteSummary],
    ['alojamientos', 'Alojamientos', () => alojSummary],
    ['excursiones', 'Excursiones', () => excSummary],
    ['comidas', 'Sitios para comer', () => comidaSummary],
    ['lugares', 'Lugares que ver', () => lugarSummary],
    ['espectaculos', 'Espectáculos', () => espectaculoSummary]
  ];

  function renderDatos() {
    const body = $('#datos-body');
    body.innerHTML = '';

    const chips = el('div', 'chips');
    chips.appendChild(datosChip('all', 'Todo'));
    DATOS_GROUPS.forEach(([col, label]) => chips.appendChild(datosChip(col, label)));
    chips.appendChild(datosChip('antes', 'Antes de viajar'));
    chips.appendChild(datosChip('equipaje', 'Equipaje'));
    body.appendChild(chips);

    body.appendChild(metaCard());

    DATOS_GROUPS.forEach(([col, label, sum]) => {
      if (selectedDatosTopic === 'all' || selectedDatosTopic === col) body.appendChild(groupEl(col, label, sum()));
    });
    if (selectedDatosTopic === 'all' || selectedDatosTopic === 'antes') body.appendChild(antesDeViajarBlock());
    if (selectedDatosTopic === 'all' || selectedDatosTopic === 'equipaje') body.appendChild(equipajeBlock());
  }

  function metaCard() {
    const m = state.meta;
    const c = el('section', 'trip-hero');
    const rango = (m.fechaInicio && m.fechaFin)
      ? `${fmtFecha(m.fechaInicio, true)} – ${fmtFecha(m.fechaFin, true)}`
      : 'Sin fechas todavía';
    const dias = (m.fechaInicio && m.fechaFin) ? eachDay(m.fechaInicio, m.fechaFin).length : 0;
    const stat = (n, txt) => `<span class="stat"><b>${n}</b> ${txt}</span>`;
    const ciudades = ciudadesEnOrden();
    const people = state.viajeros.length
      ? `<div class="trip-hero__people">${state.viajeros.map(v => `<span class="person"><span class="person__ini">${esc(v.nombre.trim()[0] || '?').toUpperCase()}</span>${esc(v.nombre)}</span>`).join('')}</div>`
      : '';
    c.innerHTML =
      `<span class="trip-hero__seal" aria-hidden="true" lang="zh-Hans">旅</span>` +
      `<h3 class="trip-hero__title">${esc(m.titulo || 'Viaje a China')}</h3>` +
      `<p class="trip-hero__dates">${esc(rango)}${ciudades.length ? ' · ' + esc(ciudades.join(' → ')) : ''}</p>` +
      people +
      `<div class="trip-hero__stats">` +
      (dias ? stat(dias, dias === 1 ? 'día' : 'días') : '') +
      stat(state.viajeros.length, state.viajeros.length === 1 ? 'viajero' : 'viajeros') +
      stat(state.vuelos.length, state.vuelos.length === 1 ? 'vuelo' : 'vuelos') +
      stat(state.alojamientos.length, state.alojamientos.length === 1 ? 'alojamiento' : 'alojamientos') +
      `</div>`;
    const b = el('button', 'btn btn--sm trip-hero__edit');
    b.type = 'button';
    b.innerHTML = ICON.edit + ' Fechas y viajeros';
    b.addEventListener('click', () => openSheet('meta'));
    c.appendChild(b);
    return c;
  }

  // Ciudades por orden de check-in (sin repetir seguidas).
  function ciudadesEnOrden() {
    const out = [];
    state.alojamientos.slice().sort((a, b) => (a.checkin || '').localeCompare(b.checkin || ''))
      .forEach(a => { const c = (a.ciudad || '').trim(); if (c && out[out.length - 1] !== c) out.push(c); });
    return out;
  }

  // Cabecera común de los bloques plegables: recuerda abierto/cerrado.
  // Prefijo «china_»: en GitHub Pages el localStorage se comparte con
  // viaje-tailandia (mismo origen), que usa las mismas claves «open_*».
  function groupShell(openKey, ico, label, countTxt, color) {
    openKey = 'china_' + openKey;
    const g = el('div', 'group');
    g.style.setProperty('--gc', color);
    let isOpen = true;
    try { isOpen = localStorage.getItem(openKey) !== '0'; } catch (e) {}
    const head = el('button', 'group__head');
    head.type = 'button';
    head.setAttribute('aria-expanded', String(isOpen));
    head.innerHTML =
      `<span class="group__label"><span class="group__ico" aria-hidden="true">${ico}</span>${esc(label)}</span>` +
      `<span class="group__right"><span class="count">${countTxt}</span><span class="chev" aria-hidden="true">${ICON.chev}</span></span>`;
    const body = el('div', 'group__body');
    body.hidden = !isOpen;
    head.addEventListener('click', () => {
      const willOpen = body.hidden;
      body.hidden = !willOpen;
      head.setAttribute('aria-expanded', String(willOpen));
      try { localStorage.setItem(openKey, willOpen ? '1' : '0'); } catch (e) {}
    });
    g.append(head, body);
    return { g, body };
  }

  function groupEl(col, label, summarize) {
    const items = state[col];
    const kind = KIND_OF[col];
    const sch = SCHEMAS[kind];
    const { g, body } = groupShell('open_' + col, sch.ico, label, items.length, sch.color);
    body.appendChild(itemList(kind, items, summarize));
    const add = el('button', 'btn btn--add btn--block');
    add.type = 'button';
    add.innerHTML = ICON.plus + ' Añadir ' + esc(sch.sing);
    add.addEventListener('click', () => openSheet(kind));
    body.appendChild(add);
    return g;
  }

  function itemList(kind, items, summarize) {
    const list = el('div', 'list');
    if (!items.length) {
      const e = el('div', 'empty');
      e.textContent = 'Aún no has añadido nada aquí.';
      list.appendChild(e);
    } else {
      items.slice().sort(itemSorter(COL_OF[kind])).forEach(it => list.appendChild(itemCard(kind, it, summarize(it))));
    }
    return list;
  }

  function itemCard(kind, it, summaryHtml) {
    const c = el('div', 'card item');
    const main = el('div', 'item__main');
    main.innerHTML = summaryHtml;
    c.appendChild(main);
    const acts = el('div', 'item__acts');
    const edit = el('button', 'icon-btn');
    edit.type = 'button';
    edit.setAttribute('aria-label', 'Editar');
    edit.innerHTML = ICON.edit;
    edit.addEventListener('click', () => openSheet(kind, it.id));
    const del = el('button', 'icon-btn icon-btn--danger');
    del.type = 'button';
    del.setAttribute('aria-label', 'Eliminar');
    del.innerHTML = ICON.trash;
    del.addEventListener('click', () => removeItem(kind, it.id));
    acts.append(edit, del);
    c.appendChild(acts);
    return c;
  }

  function itemSorter(col) {
    if (col === 'gastos') return (a, b) => (b.fecha || '').localeCompare(a.fecha || '');
    const key = {
      vuelos: x => (x.tramos && x.tramos[0] && x.tramos[0].salida) || '',
      transportes: x => x.salida || '',
      alojamientos: x => x.checkin || '',
      excursiones: x => (x.fecha || '') + ' ' + (x.hora || ''),
      comidas: x => (x.fecha || '~') + (x.nombre || ''),
      lugares: x => (x.fecha || '~') + (x.hora || '') + (x.nombre || ''),
      espectaculos: x => (x.tipo || '') + (x.nombre || ''),
      notas: x => x.categoria || ''
    }[col] || (() => '');
    return (a, b) => { const ka = key(a), kb = key(b); return ka < kb ? -1 : ka > kb ? 1 : 0; };
  }

  function locLine(loc) {
    if (!loc) return '';
    const bits = [];
    if (loc.texto) bits.push(esc(loc.texto));
    if (hasXY(loc)) bits.push('<span title="Con coordenadas">📍</span>');
    return bits.join(' ');
  }
  const zhLine = it => (it.nombreZh ? `<div class="item__zh" lang="zh-Hans">${esc(it.nombreZh)}</div>` : '');

  // Minutos entre dos horas locales del mismo aeropuerto.
  function layoverMin(llegada, salida) {
    if (!llegada || !salida) return null;
    const a = new Date(llegada), b = new Date(salida);
    if (isNaN(a) || isNaN(b)) return null;
    const m = Math.round((b - a) / 60000);
    return m > 0 ? m : null;
  }
  const vueloEscalas = tr => tr.slice(0, -1).map((t, i) => ({ cod: t.destino || '', min: layoverMin(t.llegada, tr[i + 1].salida) }));

  function vueloHoras(tr) {
    const legs = tr.map(t => parseDurLoose(t.duracion));
    if (!legs.length || legs.some(m => m == null)) return null;
    const vuelo = legs.reduce((a, b) => a + b, 0);
    const lay = vueloEscalas(tr).map(x => x.min);
    const total = lay.some(m => m == null) ? null : vuelo + lay.reduce((a, b) => a + b, 0);
    return { vuelo, total: tr.length > 1 ? total : null };
  }

  function vueloSummary(v) {
    const tr = v.tramos || [];
    const a = tr[0] || {}, z = tr[tr.length - 1] || {};
    const s = dtParts(a.salida), e = dtParts(z.llegada);
    let html =
      `<div class="pass"><div class="pass__top"><span class="pass__route"><span class="mono">${esc(a.origen || '—')}</span>${ICON.planeL}<span class="mono">${esc(z.destino || '—')}</span></span><span class="pass__tipo">${esc(v.tipo || 'Vuelo')}</span></div>` +
      `<div class="pass__tear"></div>` +
      `<div class="fly-summary">${s.date ? fmtFecha(s.date, true) : '—'} · sale <b>${s.time || '—'}</b> · llega <b>${e.time || '—'}</b>${e.date && e.date !== s.date ? ' (' + fmtFecha(e.date) + ')' : ''}${tr.length > 1 ? ' · ' + tr.length + ' tramos' : ''}</div>`;
    const horas = vueloHoras(tr);
    if (horas) html += `<div class="fly-summary"><b>${fmtDur(horas.vuelo)}</b> de vuelo${horas.total ? ` · ${fmtDur(horas.total)} en total con las escalas` : ''}</div>`;
    html += '<div class="fly-legs">';
    tr.forEach((t, i) => {
      const ts = dtParts(t.salida), ta = dtParts(t.llegada);
      html += `<div class="fly-leg"><div class="fly-leg__head">${[t.numero ? `<span class="mono">${esc(t.numero)}</span>` : '', esc(t.aerolinea || ''), esc(t.clase || '')].filter(Boolean).join(' · ')}</div>` +
        `<div class="fly-leg__route"><span>${esc(t.origen || '')}${t.origenTerminal ? ' <em>T' + esc(t.origenTerminal) + '</em>' : ''} ${ts.time || ''}</span><span class="fly-leg__arrow">→</span><span>${esc(t.destino || '')}${t.destinoTerminal ? ' <em>T' + esc(t.destinoTerminal) + '</em>' : ''} ${ta.time || ''}</span></div>` +
        (t.duracion ? `<div class="fly-leg__dur">${esc(t.duracion)}</div>` : '') + `</div>`;
      if (i < tr.length - 1) {
        const lay = layoverMin(t.llegada, tr[i + 1].salida);
        html += `<div class="fly-lay">↕ escala en ${esc(t.destino || '')}${lay ? ' · ' + fmtDur(lay) : ''}</div>`;
      }
    });
    html += '</div>';
    if (v.antelacion) {
      const mins = parseDurLoose(v.antelacion);
      const llega = (mins != null && s.time) ? ` Llega al aeropuerto sobre las <b>${minusMin(s.time, mins)}</b>.` : '';
      html += `<div class="fly-alert">Estar en el aeropuerto con <b>${esc(v.antelacion)}</b> de antelación.${llega}</div>`;
    }
    if (v.reserva) html += `<div class="item__meta">Localizador: <span class="mono">${esc(v.reserva)}</span></div>`;
    if (v.notas) html += `<div class="item__meta">${withCheck(v.notas).split('\n').join('<br>')}</div>`;
    if (v.equipaje) html += `<details class="fly-bags"><summary>Equipaje incluido</summary><p>${esc(v.equipaje)}</p></details>`;
    return html + '</div>';
  }

  function transporteSummary(t) {
    const s = dtParts(t.salida), l = dtParts(t.llegada);
    const dur = layoverMin(t.salida, t.llegada);
    const o = (t.origen && t.origen.texto) || '—', d = (t.destino && t.destino.texto) || '—';
    return `<div class="item__title">${t.numero ? `<span class="mono">${esc(t.numero)}</span> · ` : ''}${esc(o)} → ${esc(d)}</div>` +
      `<div class="item__meta"><span class="tag tag--tren">${esc(t.tipo || 'Transporte')}</span> ${s.date ? fmtFecha(s.date) : '—'} · sale <b>${s.time || '—'}</b>${l.time ? ' · llega <b>' + l.time + '</b>' + (l.date && l.date !== s.date ? ' (' + fmtFecha(l.date) + ')' : '') : ''}${dur ? ' · ' + fmtDur(dur) : ''}</div>` +
      `<div class="item__meta">${[t.clase, t.asiento, t.precio].filter(Boolean).map(esc).join(' · ')}</div>` +
      (t.reserva ? `<div class="item__meta">Pedido: <span class="mono">${esc(t.reserva)}</span></div>` : '') +
      (t.notas ? `<div class="item__meta">${escLines(t.notas)}</div>` : '') +
      linksRow(t.destino, { nombre: d });
  }

  function alojSummary(a) {
    const noches = Math.max(0, eachDay(a.checkin, a.checkout).length - 1);
    return `<div class="item__title">${esc(a.nombre || 'Alojamiento')}</div>${zhLine(a)}` +
      `<div class="item__meta">${a.ciudad ? '<b>' + esc(a.ciudad) + '</b> · ' : ''}${a.checkin ? fmtFecha(a.checkin) : '—'} → ${a.checkout ? fmtFecha(a.checkout) : '—'}${noches ? ' · ' + noches + ' noche' + (noches !== 1 ? 's' : '') : ''}</div>` +
      `<div class="item__meta">${locLine(a.loc)}</div>` +
      (a.direccionZh ? `<div class="item__meta zh" lang="zh-Hans">${esc(a.direccionZh)}</div>` : '') +
      (a.reserva ? `<div class="item__meta">Reserva: <span class="mono">${esc(a.reserva)}</span></div>` : '') +
      (a.notas ? `<div class="item__meta">${escLines(a.notas)}</div>` : '') +
      linksRow(a.loc, a, a.link ? `<a class="btn btn--xs" href="${esc(a.link)}" target="_blank" rel="noopener">Ver reserva ›</a>` : '');
  }

  function excSummary(e) {
    return `<div class="item__title">${esc(e.nombre || 'Excursión')}</div>` +
      `<div class="item__meta">${e.fecha ? fmtFecha(e.fecha) : '—'} ${e.hora || ''} ${e.duracion ? '· ' + fmtDur(+e.duracion) : ''}${e.proveedor ? ' · ' + esc(e.proveedor) : ''}</div>` +
      `<div class="item__meta">${e.encuentro && e.encuentro.texto ? 'Encuentro: ' + locLine(e.encuentro) : ''}</div>` +
      (e.reserva ? `<div class="item__meta">Reserva: <span class="mono">${esc(e.reserva)}</span></div>` : '') +
      (e.notas ? `<div class="item__meta">${escLines(e.notas)}</div>` : '') +
      linksRow(e.encuentro, { nombre: e.nombre });
  }

  const fmtPrecioCNY = p => (p !== '' && p != null && isFinite(p) ? `~${new Intl.NumberFormat('es-ES').format(p)} CNY/persona` : '');

  function comidaSummary(c) {
    return `<div class="item__title">${esc(c.nombre || '')}</div>${zhLine(c)}` +
      `<div class="item__meta">${[c.tipo, fmtPrecioCNY(c.precio), c.fecha ? fmtFecha(c.fecha) : '', c.horario].filter(Boolean).map(esc).join(' · ')}</div>` +
      `<div class="item__meta">${locLine(c.loc)}</div>` +
      (c.notas ? `<div class="item__meta">${escLines(c.notas)}</div>` : '') +
      linksRow(c.loc, c);
  }

  function lugarSummary(l) {
    const p = l.prioridad || 'Media';
    return `<div class="item__title">${esc(l.nombre || '')} <span class="tag tag--${p.toLowerCase()}">${esc(p)}</span></div>${zhLine(l)}` +
      `<div class="item__meta">${locLine(l.loc)}</div>` +
      `<div class="item__meta">${[l.visita ? fmtDur(+l.visita) + ' de visita' : '', l.fecha ? fmtFecha(l.fecha) : '', l.hora].filter(Boolean).map(esc).join(' · ')}</div>` +
      (l.notas ? `<div class="item__meta">${escLines(l.notas)}</div>` : '') +
      linksRow(l.loc, l);
  }

  function diasTxt(d) {
    if (!Array.isArray(d) || !d.length) return null;
    if (d.length === 7) return 'todos los días';
    return [1, 2, 3, 4, 5, 6, 0].filter(x => d.includes(x)).map(x => DIA_L[x]).join(', ');
  }

  function espectaculoSummary(s) {
    const dias = diasTxt(s.dias);
    return `<div class="item__title">${esc(s.nombre || '')} <span class="tag">${esc(s.tipo || '')}</span></div>${zhLine(s)}` +
      `<div class="item__meta">Funciones: ${dias ? esc(dias) : CHECK}${s.horario ? ' · ' + esc(s.horario) : ''}${s.precio ? ' · ' + esc(s.precio) : ''}</div>` +
      `<div class="item__meta">${locLine(s.loc)}</div>` +
      (s.notas ? `<div class="item__meta">${escLines(s.notas)}</div>` : '') +
      linksRow(s.loc, s, s.web ? `<a class="btn btn--xs" href="${esc(s.web)}" target="_blank" rel="noopener">Web ›</a>` : '');
  }

  // Botones de mapa + taxista.
  function linksRow(loc, it, extra) {
    const parts = [mapLinks(loc, it), taxiBtn(it), extra || ''].filter(Boolean);
    return parts.length ? `<div class="item__links">${parts.join('')}</div>` : '';
  }

  /* ---------- Checklists (antes de viajar / equipaje) ---------- */
  function checklistBlock(cfg) {
    const items = state[cfg.col];
    const doneN = items.filter(x => x[cfg.doneKey]).length;
    const { g, body } = groupShell(cfg.openKey, cfg.ico, cfg.label, `${doneN}/${items.length}`, cfg.color);
    if (cfg.intro) body.appendChild(cfg.intro());
    if (!items.length) {
      const e = el('div', 'empty');
      e.textContent = 'Sin elementos.';
      body.appendChild(e);
    } else {
      const cats = [], byCat = {};
      items.forEach(it => {
        const c = it.cat || 'Otros';
        if (!byCat[c]) { byCat[c] = []; cats.push(c); }
        byCat[c].push(it);
      });
      cats.forEach(cat => {
        const catEl = el('p', 'check-cat');
        catEl.textContent = cat;
        body.appendChild(catEl);
        const list = el('div', 'check-list');
        byCat[cat].forEach(it => {
          const row = el('label', 'check-row' + (it[cfg.doneKey] ? ' check-row--done' : ''));
          row.innerHTML = `<input type="checkbox"${it[cfg.doneKey] ? ' checked' : ''}><span>${esc(it.texto)}${cfg.extra ? cfg.extra(it) : ''}</span>`;
          row.querySelector('input').addEventListener('change', () => {
            it[cfg.doneKey] = !it[cfg.doneKey];
            save();
            renderDatos();
          });
          const del = el('button', 'icon-btn icon-btn--danger');
          del.type = 'button';
          del.setAttribute('aria-label', 'Eliminar «' + it.texto + '»');
          del.innerHTML = ICON.trash;
          del.addEventListener('click', async ev => {
            ev.preventDefault();
            const ok = await confirmAsk('¿Eliminar «' + it.texto + '» de la lista?');
            if (!ok) return;
            state[cfg.col] = state[cfg.col].filter(x => x.id !== it.id);
            save();
            renderDatos();
          });
          row.appendChild(del);
          list.appendChild(row);
        });
        body.appendChild(list);
      });
    }
    const addRow = el('form', 'check-add');
    addRow.innerHTML = `<input type="text" placeholder="Añadir a la lista…" maxlength="120" aria-label="Nuevo elemento"><button type="submit" class="btn btn--ghost">${ICON.plus} Añadir</button>`;
    addRow.addEventListener('submit', e => {
      e.preventDefault();
      const input = addRow.querySelector('input');
      const texto = input.value.trim();
      if (!texto) return;
      state[cfg.col].push(cfg.newItem(texto));
      save();
      renderDatos();
      const again = $(`#datos-body .group[data-col="${cfg.col}"] .check-add input`);
      if (again) again.focus();
    });
    body.appendChild(addRow);
    g.dataset.col = cfg.col;
    return g;
  }

  function equipajeBlock() {
    return checklistBlock({
      col: 'equipaje', openKey: 'open_equipaje', ico: '包', label: 'Equipaje', color: 'var(--jade)',
      doneKey: 'packed',
      newItem: texto => ({ id: uid(), texto, cat: 'Míos', packed: false })
    });
  }

  // Fecha a partir de la que se puede facturar (24 h antes del primer tramo).
  function facturaDesde(tipo) {
    const v = state.vuelos.find(x => x.tipo === tipo);
    const salida = v && v.tramos && v.tramos[0] && v.tramos[0].salida;
    if (!salida) return '';
    const d = new Date(salida);
    if (isNaN(d)) return '';
    d.setHours(d.getHours() - 24);
    return fmtFecha(ymd(d)) + ', ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function antesDeViajarBlock() {
    return checklistBlock({
      col: 'antesDeViajar', openKey: 'open_antes', ico: '备', label: 'Antes de viajar', color: 'var(--red)',
      doneKey: 'hecho',
      intro: () => {
        if (!state.meta.fechaFin || state.meta.fechaFin <= '2026-12-31') return document.createDocumentFragment();
        const n = el('div', 'notice notice--warn');
        n.innerHTML = 'Tu viaje es posterior al 31 dic 2026, cuando acaba la entrada sin visado vigente para pasaportes españoles. Comprueba en la web oficial si se ha prorrogado; si no, necesitaréis visado ' + CHECK + '.';
        return n;
      },
      extra: it => {
        let f = '';
        if (it.id === 'seed-an-13') f = facturaDesde('Ida');
        if (it.id === 'seed-an-14') f = facturaDesde('Vuelta');
        const bits = [];
        if (it.nota) bits.push(withCheck(it.nota));
        if (f) bits.push('Suele abrirse 24 h antes: desde el ' + esc(f) + ' ' + CHECK);
        return bits.map(b => `<span class="check-note">${b}</span>`).join('');
      },
      newItem: texto => ({ id: uid(), texto, cat: 'Mías', hecho: false })
    });
  }

  /* ==========================================================
     Coordenadas: WGS-84 → GCJ-02 y enlaces a mapas
     Todo se guarda en WGS-84 (GPS, OpenStreetMap, Leaflet). Amap usa GCJ-02
     dentro de China: sin convertir, los puntos salen desplazados ~500 m.
     La conversión se hace SOLO al generar los enlaces de Amap.
     Apple Maps recibe WGS-84 tal cual; Google Maps queda como opción secundaria.
     ========================================================== */
  const GCJ_A = 6378245.0;
  const GCJ_EE = 0.00669342162296594323;
  const outOfChina = (lat, lng) => lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
  function gcjDLat(x, y) {
    let r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    r += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
    r += (20 * Math.sin(y * Math.PI) + 40 * Math.sin(y / 3 * Math.PI)) * 2 / 3;
    r += (160 * Math.sin(y / 12 * Math.PI) + 320 * Math.sin(y * Math.PI / 30)) * 2 / 3;
    return r;
  }
  function gcjDLng(x, y) {
    let r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    r += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
    r += (20 * Math.sin(x * Math.PI) + 40 * Math.sin(x / 3 * Math.PI)) * 2 / 3;
    r += (150 * Math.sin(x / 12 * Math.PI) + 300 * Math.sin(x / 30 * Math.PI)) * 2 / 3;
    return r;
  }
  function wgsToGcj(lat, lng) {
    if (outOfChina(lat, lng)) return { lat, lng };
    let dLat = gcjDLat(lng - 105, lat - 35);
    let dLng = gcjDLng(lng - 105, lat - 35);
    const radLat = lat / 180 * Math.PI;
    let magic = Math.sin(radLat);
    magic = 1 - GCJ_EE * magic * magic;
    const sq = Math.sqrt(magic);
    dLat = (dLat * 180) / ((GCJ_A * (1 - GCJ_EE)) / (magic * sq) * Math.PI);
    dLng = (dLng * 180) / (GCJ_A / sq * Math.cos(radLat) * Math.PI);
    return { lat: lat + dLat, lng: lng + dLng };
  }
  const r6 = n => Math.round(n * 1e6) / 1e6;
  // Nombre que se manda a los mapas: sin comas (Amap separa campos con ellas).
  const mapName = s => String(s || '').replace(/[,，|]/g, ' ').trim().slice(0, 60);

  function amapPoint(loc, name) {
    const g = wgsToGcj(loc.lat, loc.lng);
    return `${r6(g.lng)},${r6(g.lat)}${name ? ',' + encodeURIComponent(mapName(name)) : ''}`;
  }
  const MAP = {
    amap(loc, name) {
      if (hasXY(loc)) return `https://uri.amap.com/marker?position=${amapPoint(loc, name)}&coordinate=gaode&src=viaje-china&callnative=1`;
      return `https://uri.amap.com/search?keyword=${encodeURIComponent(name || '')}&src=viaje-china&callnative=1`;
    },
    apple(loc, name) {
      if (hasXY(loc)) return `https://maps.apple.com/?ll=${r6(loc.lat)},${r6(loc.lng)}&q=${encodeURIComponent(mapName(name) || 'Destino')}`;
      return `https://maps.apple.com/?q=${encodeURIComponent(name || '')}`;
    },
    google(loc, name) {
      if (hasXY(loc)) return `https://www.google.com/maps/search/?api=1&query=${r6(loc.lat)},${r6(loc.lng)}`;
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name || '')}`;
    },
    // Ruta: Amap admite una sola parada intermedia (y solo en coche).
    amapRoute(stops) {
      const a = stops[0], z = stops[stops.length - 1];
      let u = `https://uri.amap.com/navigation?from=${amapPoint(a.loc, a.name)}&to=${amapPoint(z.loc, z.name)}`;
      if (stops.length === 3) u += `&via=${amapPoint(stops[1].loc, stops[1].name)}`;
      return u + '&mode=car&policy=0&src=viaje-china&callnative=1';
    },
    appleRoute(a, z) {
      return `https://maps.apple.com/?saddr=${r6(a.loc.lat)},${r6(a.loc.lng)}&daddr=${r6(z.loc.lat)},${r6(z.loc.lng)}`;
    },
    googleRoute(stops) {
      const p = s => `${r6(s.loc.lat)},${r6(s.loc.lng)}`;
      let u = `https://www.google.com/maps/dir/?api=1&origin=${p(stops[0])}&destination=${p(stops[stops.length - 1])}`;
      if (stops.length > 2) u += '&waypoints=' + encodeURIComponent(stops.slice(1, -1).map(p).join('|'));
      return u + '&travelmode=driving';
    }
  };

  // Botones de un punto: Amap (principal), Apple Maps y Google (secundario).
  // Sin coordenadas se busca por el nombre en chino, o si no por el texto.
  function mapLinks(loc, it) {
    it = it || {};
    const nameZh = it.nombreZh || '';
    const name = it.nombre || (loc && loc.texto) || '';
    if (!hasXY(loc) && !nameZh && !(loc && loc.texto)) return '';
    const q = hasXY(loc) ? (nameZh || name) : (nameZh || (loc && loc.texto) || name);
    // Un solo control compacto en vez de tres botones sueltos.
    return `<span class="maps" role="group" aria-label="Abrir en un mapa">` +
      `<a class="maps__a maps__a--main" href="${esc(MAP.amap(loc, q))}" target="_blank" rel="noopener" aria-label="Abrir en Amap">${ICON.map} Amap</a>` +
      `<a class="maps__a" href="${esc(MAP.apple(loc, hasXY(loc) ? (name || q) : q))}" target="_blank" rel="noopener" aria-label="Abrir en Apple Maps">Apple</a>` +
      `<a class="maps__a" href="${esc(MAP.google(loc, q))}" target="_blank" rel="noopener" aria-label="Abrir en Google Maps">Google</a></span>`;
  }

  /* ==========================================================
     Mapas (Leaflet): ruta del día, Dónde comer y espectáculos
     Teselas de OpenStreetMap (WGS-84, como los datos guardados).
     ========================================================== */
  const maps = {}; // key -> { map, node }
  function pinIcon(label, home) {
    return L.divIcon({
      className: '', iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -14],
      html: `<div class="map-pin${home ? ' map-pin--home' : ''}">${esc(label)}</div>`
    });
  }
  // points: [{lat, lng, label, title, home}]
  function drawMap(key, node, points, opts) {
    opts = opts || {};
    if (typeof L === 'undefined' || !node) return;
    if (maps[key]) { maps[key].map.remove(); delete maps[key]; }
    if (!points.length) return;
    const map = L.map(node, { scrollWheelZoom: false, attributionControl: true, zoomControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© OpenStreetMap'
    }).addTo(map);
    const ll = points.map(p => [p.lat, p.lng]);
    points.forEach(p => {
      L.marker([p.lat, p.lng], { icon: pinIcon(p.label, p.home), title: p.title || '' })
        .addTo(map).bindPopup(esc(p.title || ''));
    });
    if (opts.line && ll.length > 1) L.polyline(ll, { color: '#c23a22', weight: 3, opacity: .8, dashArray: '6 6' }).addTo(map);
    if (ll.length === 1) map.setView(ll[0], 15);
    else map.fitBounds(L.latLngBounds(ll), { padding: [28, 28], maxZoom: 16 });
    maps[key] = { map, node, ll };
  }
  function destroyMaps(prefix) {
    Object.keys(maps).forEach(k => { if (k.startsWith(prefix)) { maps[k].map.remove(); delete maps[k]; } });
  }
  function refreshMaps() {
    Object.keys(maps).forEach(k => {
      const m = maps[k];
      if (!document.contains(m.node)) { m.map.remove(); delete maps[k]; return; }
      if (m.node.offsetWidth) {
        m.map.invalidateSize();
        if (m.ll.length > 1) m.map.fitBounds(L.latLngBounds(m.ll), { padding: [28, 28], maxZoom: 16 });
      }
    });
  }

  /* ==========================================================
     Luz del día (cálculo local con SunCalc, hora de Pekín)
     ========================================================== */
  const isDate = d => d instanceof Date && !isNaN(d.getTime());

  // Ubicación de un día = alojamiento donde se duerme esa noche; si no, la
  // noche anterior; si no hay ninguno, null (no se inventa una ciudad).
  function alojForDate(dateStr) {
    let d = dateStr;
    for (let i = 0; i < 60; i++) {
      const a = state.alojamientos.find(x => x.checkin && x.checkout && x.checkin <= d && d < x.checkout);
      if (a) return a;
      const dt = parseDate(d);
      if (!dt) break;
      dt.setDate(dt.getDate() - 1);
      d = ymd(dt);
      if (state.meta.fechaInicio && d < state.meta.fechaInicio) break;
    }
    // Primer día antes del primer check-in: la ciudad a la que se llega.
    const next = state.alojamientos.filter(x => x.checkin && x.checkin >= dateStr)
      .sort((a, b) => a.checkin.localeCompare(b.checkin))[0];
    return next && next.checkin === dateStr ? next : null;
  }
  function locForDate(dateStr) {
    const a = alojForDate(dateStr);
    if (a && hasXY(a.loc)) return { lat: a.loc.lat, lng: a.loc.lng, label: a.ciudad || a.nombre };
    return null;
  }

  function sky(dateStr) {
    if (typeof SunCalc === 'undefined') return null;
    const loc = locForDate(dateStr);
    if (!loc) return null;
    const [Y, Mo, Da] = dateStr.split('-').map(Number);
    // Mediodía en hora de Pekín: SunCalc resuelve el día correcto en cualquier zona del dispositivo.
    const noon = new Date(Date.UTC(Y, Mo - 1, Da, 12, 0, 0) - CN_TZ_OFFSET_MS);
    const t = SunCalc.getTimes(noon, loc.lat, loc.lng);
    return {
      loc,
      sunrise: isDate(t.sunrise) ? t.sunrise : null,
      sunset: isDate(t.sunset) ? t.sunset : null,
      dusk: isDate(t.dusk) ? t.dusk : null,
      dawn: isDate(t.dawn) ? t.dawn : null,
      dayLenMin: isDate(t.sunrise) && isDate(t.sunset) ? Math.round((t.sunset - t.sunrise) / 60000) : null
    };
  }
  // Instante → 'HH:MM' en hora de Pekín.
  const cnHHMM = d => { const x = new Date(d.getTime() + CN_TZ_OFFSET_MS); return `${pad2(x.getUTCHours())}:${pad2(x.getUTCMinutes())}`; };

  /* ==========================================================
     Tiempos de trayecto (estimación)
     Línea recta × factor de rodeo ÷ velocidad media. En ciudad (tramos
     cortos) se cuenta el atasco y el metro; en tramos largos, carretera.
     No es una ruta calculada: solo da el orden de magnitud.
     ========================================================== */
  const DETOUR_FACTOR = 1.35;
  const CITY_KMH = 20;     // taxi/DiDi/metro en ciudad, con atascos y transbordos
  const ROAD_KMH = 55;     // trayectos largos por carretera
  const CITY_LIMIT_KM = 15;
  const WAIT_MIN = 6;      // esperar el DiDi o llegar al andén
  const MIN_LEG_KM = 0.6;  // por debajo, se va andando y no se muestra tramo

  function travel(a, b) {
    const km = haversine(a, b) * DETOUR_FACTOR;
    const kmh = km <= CITY_LIMIT_KM ? CITY_KMH : ROAD_KMH;
    return { km, min: Math.round(km / kmh * 60) + WAIT_MIN };
  }

  // Umbrales de viabilidad del día
  const SALIDA_FLOOR_MIN = 8 * 60;        // no se empieza antes de las 08:00 salvo hora fija
  const MARGEN_ATARDECER_MIN = 30;        // colchón antes de la puesta de sol para «ok»
  const MARGEN_ANCLA_MIN = 10;            // holgura para llegar a una hora fija
  const TRAYECTO_LARGO_H = 3;
  const TRAYECTO_MAX_H = 5;
  const COMIDA_MIN = 60;
  const EXCURSION_MIN = 240;
  const LUGAR_MIN = 90;
  const TREN_MIN = 120;
  const TREN_ANTELACION_MIN = 30;         // control de seguridad y de pasaporte en la estación

  /* ==========================================================
     Motor de itinerario
     ========================================================== */
  function buildItinerary() {
    const { meta } = state;
    const days = eachDay(meta.fechaInicio, meta.fechaFin);
    const byDay = new Map(days.map(d => [d, []]));
    const unassigned = [];
    const inRange = d => byDay.has(d);
    const push = (d, item) => byDay.get(d).push(item);
    const locOk = l => (hasXY(l) ? l : null);

    state.vuelos.forEach(v => {
      const tr = v.tramos || [];
      const a = tr[0] || {}, z = tr[tr.length - 1] || {};
      const p = dtParts(a.salida), arr = dtParts(z.llegada);
      const escTxt = vueloEscalas(tr).map(x => x.cod + (x.min ? ' ' + fmtDur(x.min) : '')).filter(Boolean);
      const antesMin = parseDurLoose(v.antelacion);
      const enAeropuerto = (antesMin != null && p.time) ? minusMin(p.time, antesMin) : '';
      const item = {
        t: 'vuelo', hora: p.time, sortT: p.time ? toMin(p.time) : 0,
        titulo: `Vuelo ${(v.tipo || '').toLowerCase()} · ${a.origen || ''} → ${z.destino || ''}`.trim(),
        sub: [
          a.numero ? a.numero : '',
          arr.time ? 'llega ' + arr.time + (arr.date && arr.date !== p.date ? ' (' + fmtFecha(arr.date) + ')' : '') : '',
          escTxt.length ? 'escala ' + escTxt.join(', ') : '',
          enAeropuerto ? 'en el aeropuerto a las ' + enAeropuerto : ''
        ].filter(Boolean).join(' · '),
        notas: v.notas || '', loc: null, costMin: 0
      };
      if (p.date && inRange(p.date)) push(p.date, item);
      else unassigned.push(Object.assign({ nota: p.date ? 'fecha fuera del viaje' : 'sin fecha' }, item));
      // Llegada otro día (vuelo nocturno): se anota también ese día.
      if (arr.date && arr.date !== p.date && inRange(arr.date)) {
        push(arr.date, { t: 'vuelo', hora: arr.time, sortT: toMin(arr.time), titulo: `Llegada a ${z.destino || ''}`, sub: z.numero || '', loc: null, costMin: 0, quiet: true });
      }
    });

    state.transportes.forEach(t => {
      const p = dtParts(t.salida), l = dtParts(t.llegada);
      const dur = layoverMin(t.salida, t.llegada);
      const o = (t.origen && t.origen.texto) || '', d = (t.destino && t.destino.texto) || '';
      const esTren = /tren/i.test(t.tipo || '');
      const item = {
        t: 'transporte', hora: p.time, sortT: p.time ? toMin(p.time) : 600,
        titulo: `${t.tipo || 'Transporte'}${t.numero ? ' ' + t.numero : ''} · ${o} → ${d}`,
        sub: [l.time ? 'llega ' + l.time + (l.date && l.date !== p.date ? ' (' + fmtFecha(l.date) + ')' : '') : '', dur ? fmtDur(dur) : '', t.asiento, esTren && p.time ? 'en la estación a las ' + minusMin(p.time, TREN_ANTELACION_MIN) : ''].filter(Boolean).join(' · '),
        notas: t.notas || '',
        loc: locOk(t.origen), locEnd: locOk(t.destino),
        anchor: true, prepMin: esTren ? TREN_ANTELACION_MIN : 0,
        costMin: dur != null && (!l.date || l.date === p.date) ? dur : (l.date && l.date !== p.date ? 1440 - toMin(p.time) : TREN_MIN),
        ref: t, refLoc: t.destino
      };
      if (p.date && inRange(p.date)) push(p.date, item);
      else unassigned.push(Object.assign({ nota: p.date ? 'fecha fuera del viaje' : 'sin fecha' }, item));
      if (l.date && l.date !== p.date && inRange(l.date)) {
        push(l.date, { t: 'transporte', hora: l.time, sortT: toMin(l.time), titulo: `Llegada a ${d || 'destino'}`, sub: `${t.tipo || ''} ${t.numero || ''}`.trim(), loc: locOk(t.destino), costMin: 0, quiet: true });
      }
    });

    state.alojamientos.forEach(a => {
      const loc = locOk(a.loc);
      const name = a.nombre || 'alojamiento';
      if (a.checkin && inRange(a.checkin)) push(a.checkin, { t: 'checkin', hora: '', sortT: 1380, titulo: `Check-in · ${name}`, sub: a.ciudad || '', loc, costMin: 0, ref: a });
      if (a.checkout && inRange(a.checkout)) push(a.checkout, { t: 'checkout', hora: '', sortT: 5, titulo: `Check-out · ${name}`, sub: a.ciudad || '', loc, costMin: 0, ref: a });
      eachDay(a.checkin, a.checkout).slice(1, -1).forEach(d => {
        if (inRange(d)) push(d, { t: 'noche', hora: '', sortT: 1, titulo: `Sales de ${name}`, sub: a.ciudad || '', loc, costMin: 0, quiet: true, ref: a });
      });
    });

    state.excursiones.forEach(e => {
      const item = {
        t: 'excursion', hora: e.hora || '', sortT: e.hora ? toMin(e.hora) : 540,
        titulo: e.nombre || 'Excursión',
        sub: [e.duracion ? fmtDur(+e.duracion) : '', e.encuentro && e.encuentro.texto ? 'Encuentro: ' + e.encuentro.texto : '', e.proveedor].filter(Boolean).join(' · '),
        notas: e.notas || '', loc: locOk(e.encuentro), anchor: !!e.hora,
        costMin: e.duracion ? +e.duracion : EXCURSION_MIN, ref: { nombre: e.nombre }, refLoc: e.encuentro
      };
      if (e.fecha && inRange(e.fecha)) push(e.fecha, item);
      else unassigned.push(Object.assign({ nota: e.fecha ? 'fecha fuera del viaje' : 'sin fecha' }, item));
    });

    state.comidas.forEach(c => {
      const ht = firstTime(c.horario);
      const item = {
        t: 'comida', hora: ht, sortT: ht ? toMin(ht) : 780,
        titulo: c.nombre || 'Comida', sub: [c.tipo, fmtPrecioCNY(c.precio)].filter(Boolean).join(' · '),
        notas: c.notas || '', loc: locOk(c.loc), costMin: COMIDA_MIN, ref: c
      };
      if (c.fecha && inRange(c.fecha)) push(c.fecha, item);
      else if (c.fecha) unassigned.push(Object.assign({ nota: 'fecha fuera del viaje' }, item));
    });

    state.lugares.forEach(l => {
      const item = {
        t: 'lugar', hora: l.hora || '', sortT: l.hora ? toMin(l.hora) : 660,
        titulo: l.nombre || 'Lugar',
        sub: [l.prioridad ? 'Prioridad ' + l.prioridad.toLowerCase() : '', l.visita ? fmtDur(+l.visita) + ' de visita' : ''].filter(Boolean).join(' · '),
        notas: l.notas || '', loc: locOk(l.loc), costMin: l.visita ? +l.visita : LUGAR_MIN, ref: l
      };
      if (l.fecha && inRange(l.fecha)) push(l.fecha, item);
      else unassigned.push(Object.assign({ nota: l.fecha ? 'fecha fuera del viaje' : 'sin día asignado' }, item));
    });

    const outDays = days.map((d, i) => ({
      date: d, idx: i + 1,
      items: byDay.get(d).slice().sort((a, b) => a.sortT - b.sortT)
    }));
    return { days: outDays, unassigned };
  }

  // Viabilidad del día: reloj en minutos continuos desde la medianoche del
  // día en hora de Pekín (puede pasar de 1440: no se envuelve).
  function dayPlan(day) {
    const sk = sky(day.date);
    const midnight = Date.UTC(+day.date.slice(0, 4), +day.date.slice(5, 7) - 1, +day.date.slice(8, 10)) - CN_TZ_OFFSET_MS;
    const minOn = d => (isDate(d) ? Math.round((d.getTime() - midnight) / 60000) : null);
    const anchorOf = it => (it.anchor && /^\d{1,2}:\d{2}$/.test(it.hora || '') ? toMin(it.hora) - (it.prepMin || 0) : null);

    const firstAnchor = day.items.reduce((m, it) => { const a = anchorOf(it); return a != null && (m == null || a < m) ? a : m; }, null);
    const firstActive = day.items.find(it => it.costMin > 0 || it.anchor);
    const firstFixed = firstActive && firstActive.hora ? toMin(firstActive.hora) : null;
    let inicio = SALIDA_FLOOR_MIN;
    if (firstFixed != null && firstFixed < inicio) inicio = firstFixed;
    if (firstAnchor != null && firstAnchor < inicio) inicio = firstAnchor;

    let reloj = inicio, prev = null, travelMin = 0, missed = null, active = false;
    const legs = new Map(); // índice del item -> tramo hasta él
    day.items.forEach((it, i) => {
      if (it.t === 'vuelo') return;
      if (it.loc && prev && haversine(prev, it.loc) >= MIN_LEG_KM) {
        const leg = travel(prev, it.loc);
        legs.set(i, leg);
        travelMin += leg.min;
        reloj += leg.min;
      }
      const a = anchorOf(it);
      if (a != null) {
        if (reloj > a + MARGEN_ANCLA_MIN) missed = missed || it.titulo;
        reloj = Math.max(reloj, a + (it.prepMin || 0));
      } else if (it.hora && it.costMin > 0) {
        reloj = Math.max(reloj, toMin(it.hora));
      }
      if (it.costMin > 0) active = true;
      reloj += it.costMin || 0;
      if (it.locEnd) prev = it.locEnd;
      else if (it.loc) prev = it.loc;
    });

    const endMin = reloj;
    const sunsetMin = sk ? minOn(sk.sunset) : null;
    const duskMin = sk ? minOn(sk.dusk) : null;
    // Lo que acaba de noche es una comida, un tren o un check-in: lo que cuenta
    // es la última visita al aire libre (lugar o excursión).
    let finVisitas = null;
    {
      let r = inicio, p = null;
      day.items.forEach(it => {
        if (it.t === 'vuelo') return;
        if (it.loc && p && haversine(p, it.loc) >= MIN_LEG_KM) r += travel(p, it.loc).min;
        const a = anchorOf(it);
        if (a != null) r = Math.max(r, a + (it.prepMin || 0));
        else if (it.hora && it.costMin > 0) r = Math.max(r, toMin(it.hora));
        r += it.costMin || 0;
        if (it.t === 'lugar' || it.t === 'excursion') finVisitas = r;
        if (it.locEnd) p = it.locEnd; else if (it.loc) p = it.loc;
      });
    }

    let luz = null;
    if (sunsetMin != null && finVisitas != null) {
      if (finVisitas <= sunsetMin - MARGEN_ATARDECER_MIN) luz = 'ok';
      else if (duskMin != null && finVisitas <= duskMin) luz = 'justo';
      else luz = 'pasa';
    }
    const h = travelMin / 60;
    const trayecto = h <= TRAYECTO_LARGO_H ? 'ok' : h <= TRAYECTO_MAX_H ? 'largo' : 'excesivo';
    const rank = { ok: 0, justo: 1, largo: 1, pasa: 2, excesivo: 2 };
    let veredicto = ['verde', 'ambar', 'rojo'][Math.max(rank[luz || 'ok'], rank[trayecto])];
    if (missed) veredicto = 'rojo';
    if (!active && !missed) veredicto = null;                       // día sin planes que juzgar
    if (day.items.some(x => x.t === 'vuelo' && !x.quiet)) veredicto = missed ? 'rojo' : null; // día de vuelo: no se juzga la luz
    return { sk, legs, travelMin, endMin, finVisitas, missed, luz, trayecto, veredicto, inicio, sunsetMin };
  }

  // Número de día en caracteres chinos (一, 二 … 十七, 二十三), para el sello del día.
  function zhNum(n) {
    const d = '零一二三四五六七八九';
    if (n <= 0 || n > 99) return String(n);
    if (n < 10) return d[n];
    const t = Math.floor(n / 10), u = n % 10;
    return (t > 1 ? d[t] : '') + '十' + (u ? d[u] : '');
  }

  function hhmmFromMin(m) {
    if (m == null) return '';
    const t = Math.round(m);
    const hm = `${pad2(Math.floor((t % 1440 + 1440) % 1440 / 60))}:${pad2(((t % 60) + 60) % 60)}`;
    return t >= 1440 ? hm + ' (+1 d)' : hm;
  }

  function verdictLabel(p) {
    if (p.veredicto === 'rojo') {
      if (p.missed) return 'No llegas a: ' + p.missed;
      if (p.trayecto === 'excesivo') return fmtDur(p.travelMin) + ' de trayectos';
      if (p.luz === 'pasa') return 'Las visitas acaban de noche';
      return 'Día muy cargado';
    }
    if (p.veredicto === 'ambar') {
      if (p.luz === 'justo') return 'Justo de luz';
      if (p.trayecto === 'largo') return fmtDur(p.travelMin) + ' de trayectos';
      return 'Ajustado';
    }
    return 'Viable';
  }

  /* ==========================================================
     Meteo — lluvia (Open-Meteo, por ubicación de pernocta)
     ========================================================== */
  const LLUVIA_FUERTE_DIA_MM = 20;   // acumulado del día
  const LLUVIA_FUERTE_HORA_MM = 7.6; // intensidad horaria de lluvia fuerte

  function meteoLocs() {
    const seen = new Set(), out = [];
    eachDay(state.meta.fechaInicio, state.meta.fechaFin).forEach(d => {
      const l = locForDate(d);
      if (!l) return;
      const key = l.lat.toFixed(2) + ',' + l.lng.toFixed(2);
      if (!seen.has(key)) { seen.add(key); out.push({ key, lat: l.lat, lng: l.lng }); }
    });
    return out;
  }
  const meteoKey = l => l.lat.toFixed(2) + ',' + l.lng.toFixed(2);

  let meteoFetching = false;
  function refreshMeteo() {
    if (meteoFetching || !navigator.onLine) return;
    if (!state.meta.fechaInicio || !state.meta.fechaFin) return;
    const f = state.meteo && state.meteo.fetched;
    if (f && Date.now() - Date.parse(f) < 2 * 3600e3) return;
    // Open-Meteo da 16 días: si el viaje empieza más tarde, no hay nada que pedir.
    const t0 = parseDate(state.meta.fechaInicio), t1 = parseDate(state.meta.fechaFin);
    const lim = new Date(); lim.setDate(lim.getDate() + 16);
    if (t0 > lim || t1 < new Date(Date.now() - 864e5)) return;
    const locs = meteoLocs();
    if (!locs.length) return;
    const url = 'https://api.open-meteo.com/v1/forecast'
      + '?latitude=' + locs.map(l => l.lat).join(',')
      + '&longitude=' + locs.map(l => l.lng).join(',')
      + '&daily=precipitation_sum,precipitation_probability_max&hourly=precipitation'
      + '&timezone=Asia%2FShanghai&forecast_days=16';
    meteoFetching = true;
    fetch(url).then(r => (r.ok ? r.json() : Promise.reject())).catch(() => null).then(raw => {
      meteoFetching = false;
      if (!raw) return;
      const results = Array.isArray(raw) ? raw : [raw];
      const days = new Set(eachDay(state.meta.fechaInicio, state.meta.fechaFin));
      const precip = {};
      results.forEach((res, i) => {
        if (!locs[i] || !res || !res.daily || !Array.isArray(res.daily.time)) return;
        const out = {};
        res.daily.time.forEach((d, j) => {
          if (!days.has(d)) return;
          out[d] = { mm: res.daily.precipitation_sum[j], prob: (res.daily.precipitation_probability_max || [])[j], maxH: 0, maxAt: '' };
        });
        const H = res.hourly;
        if (H && Array.isArray(H.time)) {
          H.time.forEach((t, j) => {
            const d = t.slice(0, 10), mm = H.precipitation[j];
            if (out[d] && typeof mm === 'number' && mm > out[d].maxH) { out[d].maxH = mm; out[d].maxAt = t.slice(11, 16); }
          });
        }
        precip[locs[i].key] = out;
      });
      state.meteo = { precip, fetched: new Date().toISOString() };
      save();
      const ae = document.activeElement;
      const itin = $('#itin-body');
      if (!(ae && itin && itin.contains(ae))) renderItinerario();
    });
  }

  function rainFor(dateStr) {
    const l = locForDate(dateStr);
    if (!l || !state.meteo || !state.meteo.precip) return null;
    const m = state.meteo.precip[meteoKey(l)];
    return m && m[dateStr] ? m[dateStr] : null;
  }

  /* ==========================================================
     Pantalla: ITINERARIO
     ========================================================== */
  let selectedItinDay = null; // null = aún sin elegir; luego 'all' o 'YYYY-MM-DD'

  function itinChip(key, label) {
    const b = el('button', 'chip');
    b.type = 'button';
    b.textContent = label;
    b.setAttribute('aria-pressed', String(selectedItinDay === key));
    b.addEventListener('click', () => {
      if (selectedItinDay === key) return;
      selectedItinDay = key;
      renderItinerario();
    });
    return b;
  }

  function renderItinerario() {
    const body = $('#itin-body');
    destroyMaps('day-');
    body.innerHTML = '';
    const { fechaInicio, fechaFin } = state.meta;
    if (!fechaInicio || !fechaFin) {
      $('#itin-sub').textContent = '';
      body.innerHTML = '<div class="empty">Añade las fechas del viaje en Datos y el itinerario se genera solo.</div>';
      return;
    }
    const it = buildItinerary();
    $('#itin-sub').textContent = `${it.days.length} días · se ordena solo por hora. Trayectos estimados en línea recta, no rutas reales.`;
    const hoy = hoyYMD();
    if (selectedItinDay == null) selectedItinDay = (hoy >= fechaInicio && hoy <= fechaFin) ? hoy : 'all';
    if (selectedItinDay !== 'all' && !it.days.some(d => d.date === selectedItinDay)) selectedItinDay = 'all';

    const chips = el('div', 'chips');
    chips.appendChild(itinChip('all', 'Todos'));
    it.days.forEach(d => chips.appendChild(itinChip(d.date, (d.date === hoy ? 'Hoy · ' : '') + `Día ${d.idx} · ${fmtFecha(d.date)}`)));
    body.appendChild(chips);

    if (!state.alojamientos.some(a => hasXY(a.loc))) {
      const n = el('div', 'notice');
      n.textContent = 'Pon la ubicación de los alojamientos para calcular la luz del día, los trayectos y el aviso de lluvia.';
      body.appendChild(n);
    }

    it.days.filter(d => selectedItinDay === 'all' || d.date === selectedItinDay).forEach(d => body.appendChild(dayCard(d)));

    if (it.unassigned.length && selectedItinDay === 'all') {
      const u = el('section', 'unassigned');
      u.innerHTML = '<h3>Sin día en el itinerario</h3>';
      const list = el('div', 'list');
      it.unassigned.forEach(x => {
        const c = el('div', 'card item');
        c.innerHTML = `<div class="item__main"><div class="item__title"><span class="tl__dot tl__dot--${x.t}"></span>${esc(x.titulo)}</div><div class="item__meta">${esc(x.nota)}${x.sub ? ' · ' + esc(x.sub) : ''}</div></div>`;
        list.appendChild(c);
      });
      u.appendChild(list);
      body.appendChild(u);
    }
  }

  function dayCard(day) {
    const p = dayPlan(day);
    const c = el('article', 'day');
    const a = alojForDate(day.date);
    const sk = p.sk;
    const rain = rainFor(day.date);
    const skyBits = [];
    if (sk && sk.sunrise && sk.sunset) {
      skyBits.push(`☀ ${cnHHMM(sk.sunrise)} – ${cnHHMM(sk.sunset)}`);
      if (sk.dayLenMin) skyBits.push(fmtDur(sk.dayLenMin) + ' de luz');
    }
    if (rain && rain.mm >= 1) skyBits.push(`☂ ${String(Math.round(rain.mm * 10) / 10).replace('.', ',')} mm${rain.prob != null ? ' · ' + rain.prob + ' %' : ''}`);
    c.innerHTML =
      `<header class="day__head"><div class="day__num"><span class="day__zh${zhNum(day.idx).length > 2 ? ' day__zh--long' : ''}" lang="zh-Hans" aria-hidden="true">${zhNum(day.idx)}</span><small>Día ${day.idx}</small></div>` +
      `<div class="day__title"><h3 class="day__date">${cap(fmtDiaSemana(day.date))} ${fmtFecha(day.date, true)}</h3>` +
      `<p class="day__city">${a ? esc(a.ciudad || a.nombre) : 'Sin alojamiento esta noche'}</p>` +
      (skyBits.length ? `<p class="day__sky">${skyBits.map(s => `<span>${esc(s)}</span>`).join('')}</p>` : '') +
      (p.veredicto ? (() => { const lb = verdictLabel(p); return `<span class="verdict verdict--${p.veredicto}">${esc(lb)}${p.travelMin && !/trayectos/.test(lb) ? ' · ' + fmtDur(p.travelMin) + ' de trayectos' : ''}</span>`; })() : '') +
      `</div></header>`;

    if (rain && (rain.mm >= LLUVIA_FUERTE_DIA_MM || rain.maxH >= LLUVIA_FUERTE_HORA_MM)) {
      const n = el('div', 'notice notice--warn rain');
      n.innerHTML = `<b>Lluvia fuerte prevista:</b> ${esc(String(Math.round(rain.mm)))} mm en el día` +
        (rain.maxH >= LLUVIA_FUERTE_HORA_MM ? `, hasta ${esc(String(Math.round(rain.maxH * 10) / 10).replace('.', ','))} mm/h hacia las ${esc(rain.maxAt)}` : '') +
        '. Lleva chubasquero, cuenta con más atasco y menos taxis, y mira el <a href="#quever" data-open-guide="planb">plan B para días de lluvia</a>.';
      c.appendChild(n);
    }

    const ul = el('ol', 'timeline');
    if (!day.items.length) {
      const li = el('li', 'tl');
      li.innerHTML = '<span class="tl__time">—</span><div class="tl__sub">Día libre. Añade lugares, comidas o excursiones con esta fecha desde Datos.</div>';
      ul.appendChild(li);
    }
    day.items.forEach((x, i) => {
      const leg = p.legs.get(i);
      if (leg) {
        const lg = el('li', 'leg');
        lg.textContent = `${fmtKm(leg.km)} · unos ${fmtDur(leg.min)} en taxi o metro`;
        ul.appendChild(lg);
      }
      const li = el('li', 'tl' + (x.quiet ? ' tl--quiet' : ''));
      const ref = x.ref || {};
      const links = (x.t === 'lugar' || x.t === 'comida' || x.t === 'excursion' || x.t === 'checkin' || x.t === 'transporte')
        ? linksRow(x.t === 'transporte' ? x.refLoc : (x.refLoc || x.loc || ref.loc), x.t === 'transporte' ? { nombre: (x.refLoc && x.refLoc.texto) || '' } : ref)
        : '';
      li.innerHTML = `<span class="tl__time">${esc(x.hora || '')}</span>` +
        `<div><div class="tl__title"><span class="tl__dot tl__dot--${x.t}" aria-hidden="true"></span>${esc(x.titulo)}</div>` +
        (x.sub ? `<div class="tl__sub">${esc(x.sub)}</div>` : '') +
        (x.notas ? `<div class="tl__notes">${esc(x.notas)}</div>` : '') +
        links + '</div>';
      ul.appendChild(li);
    });
    c.appendChild(ul);

    const foot = el('div', 'day__foot');
    foot.appendChild(routeBlock(day));
    const diary = el('label', 'field diary');
    diary.innerHTML = '<span>Diario del día</span>';
    const ta = el('textarea');
    ta.placeholder = 'Cómo fue el día, qué comisteis, qué repetiríais…';
    ta.value = state.diario[day.date] || '';
    ta.addEventListener('input', () => {
      const v = ta.value;
      if (v.trim()) state.diario[day.date] = v; else delete state.diario[day.date];
      save();
    });
    diary.appendChild(ta);
    foot.appendChild(diary);
    c.appendChild(foot);
    return c;
  }

  // Paradas con coordenadas del día, en orden (sin repetir la misma seguida).
  function dayStops(day) {
    const stops = [];
    day.items.forEach(x => {
      [x.loc, x.locEnd].forEach((l, k) => {
        if (!l) return;
        const prev = stops[stops.length - 1];
        if (prev && haversine(prev.loc, l) < 0.05) return;
        const ref = x.ref || {};
        const name = x.t === 'transporte' ? (l.texto || '') : (ref.nombre || x.titulo);
        stops.push({ loc: l, name: (k === 0 && ref.nombreZh) ? ref.nombreZh : name, label: name });
      });
    });
    return stops;
  }

  function routeBlock(day) {
    const wrap = el('div', 'day__routewrap');
    const stops = dayStops(day);
    if (stops.length < 2) {
      const p = el('p', 'muted');
      p.style.fontSize = '.82rem';
      p.textContent = stops.length ? 'Solo hay una parada con ubicación: no hay ruta que dibujar.' : 'Sin paradas con ubicación: añade coordenadas para ver la ruta del día.';
      wrap.appendChild(p);
      return wrap;
    }
    const row = el('div', 'day__route');
    row.innerHTML = `<span class="day__route-lbl">Ruta del día · ${stops.length} paradas</span>`;
    const btnMap = el('button', 'btn btn--xs btn--jade');
    btnMap.type = 'button';
    btnMap.setAttribute('aria-expanded', 'false');
    btnMap.innerHTML = ICON.map + ' Ver en el mapa';
    row.appendChild(btnMap);
    row.insertAdjacentHTML('beforeend',
      `<a class="btn btn--xs btn--accent" href="${esc(MAP.amapRoute(stops))}" target="_blank" rel="noopener">Amap${stops.length > 3 ? ' (inicio → fin)' : ''}</a>` +
      `<a class="btn btn--xs btn--ghost" href="${esc(MAP.googleRoute(stops))}" target="_blank" rel="noopener">Google</a>`);
    wrap.appendChild(row);

    const mapNode = el('div', 'day__map');
    mapNode.hidden = true;
    wrap.appendChild(mapNode);
    btnMap.addEventListener('click', () => {
      const show = mapNode.hidden;
      mapNode.hidden = !show;
      btnMap.setAttribute('aria-expanded', String(show));
      btnMap.innerHTML = ICON.map + (show ? ' Ocultar mapa' : ' Ver en el mapa');
      if (show) {
        drawMap('day-' + day.date, mapNode, stops.map((s, i) => ({ lat: s.loc.lat, lng: s.loc.lng, label: String(i + 1), title: (i + 1) + '. ' + s.label })), { line: true });
      } else {
        destroyMaps('day-' + day.date);
      }
    });

    // Amap solo admite una parada intermedia; Apple Maps, ninguna: tramo a tramo.
    const det = el('details', 'fly-bags');
    det.innerHTML = `<summary>Tramo a tramo (Amap y Apple Maps)</summary>`;
    const list = el('div', 'list');
    list.style.marginTop = '8px';
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i], z = stops[i + 1];
      const d = el('div', 'item__meta');
      d.innerHTML = `${i + 1} → ${i + 2}: ${esc(a.label)} → ${esc(z.label)}<div class="item__links" style="margin-top:4px">` +
        `<a class="btn btn--xs btn--accent" href="${esc(MAP.amapRoute([a, z]))}" target="_blank" rel="noopener">Amap</a>` +
        `<a class="btn btn--xs" href="${esc(MAP.appleRoute(a, z))}" target="_blank" rel="noopener">Apple Maps</a></div>`;
      list.appendChild(d);
    }
    det.appendChild(list);
    wrap.appendChild(det);
    return wrap;
  }

  /* ==========================================================
     Dinero — tipo de cambio EUR↔CNY (BCE vía frankfurter.dev) y gastos
     ========================================================== */
  const RATE  = () => (state.fx && state.fx.rate > 0 ? state.fx.rate : FX_DEFAULT); // CNY por 1 €
  const toEUR = (imp, mon) => (mon === 'EUR' ? +imp : +imp / RATE());
  const toCNY = (imp, mon) => (mon === 'CNY' ? +imp : +imp * RATE());
  const fmtEUR = n => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0);
  const fmtCNY = n => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(Math.round((n || 0) * 100) / 100) + ' CNY';

  // Tipo del día del BCE, guardado en caché en state.fx: se pide como mucho una
  // vez al día. Un ajuste manual no se pisa hasta que se vuelve al del BCE.
  let fxFetching = false;
  function refreshFx(force) {
    if (fxFetching || !navigator.onLine) return Promise.resolve(false);
    if (!force && state.fx && (state.fx.source === 'manual' || state.fx.stamp === hoyYMD())) return Promise.resolve(false);
    fxFetching = true;
    return fetch('https://api.frankfurter.dev/v1/latest?from=EUR&to=CNY')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .catch(() => null)
      .then(j => {
        fxFetching = false;
        const cny = j && j.rates && j.rates.CNY;
        if (typeof cny !== 'number' || !(cny > 0)) return false;
        state.fx = { rate: cny, date: j.date || hoyYMD(), source: 'api', stamp: hoyYMD() };
        save();
        renderGastos();
        return true;
      });
  }

  function renderGastos() {
    const body = $('#gastos-body');
    body.innerHTML = '';
    const grid = el('div', 'gastos-grid');
    const left = el('div', 'money-col');
    const right = el('div');

    // Totales (todo pasa a € para poder sumar monedas mezcladas)
    let totEUR = 0, totCNY = 0;
    const porCat = {};
    state.gastos.forEach(g => {
      const imp = +g.importe || 0;
      totEUR += toEUR(imp, g.moneda);
      totCNY += toCNY(imp, g.moneda);
      const k = g.categoria || 'Otros';
      porCat[k] = (porCat[k] || 0) + toEUR(imp, g.moneda);
    });

    const hero = el('section', 'money-hero');
    const nV = state.viajeros.length;
    const dias = (state.meta.fechaInicio && state.meta.fechaFin) ? eachDay(state.meta.fechaInicio, state.meta.fechaFin).length : 0;
    hero.innerHTML =
      `<p class="money-hero__lbl">Total gastado · <span lang="zh-Hans">合计</span></p>` +
      `<p class="money-hero__tot">${fmtEUR(totEUR)}</p>` +
      `<p class="money-hero__alt">≈ ${fmtCNY(totCNY)}</p>` +
      `<p class="money-hero__per">${state.gastos.length} ${state.gastos.length === 1 ? 'gasto' : 'gastos'}${dias && totEUR ? ' · ' + fmtEUR(totEUR / dias) + ' por día de viaje' : ''}${nV > 1 && totEUR ? ' · ' + fmtEUR(totEUR / nV) + ' por viajero' : ''}</p>`;

    // Línea del tipo de cambio, editable a mano
    const fx = state.fx || blankFx();
    const etiqueta = fx.source === 'api' ? `BCE, ${fmtFecha(fx.date, true)}`
      : fx.source === 'manual' ? 'ajustado a mano' : 'aproximado hasta tener conexión';
    const rateShown = String(+(+fx.rate || FX_DEFAULT).toFixed(4));
    const line = el('div', 'fx-line');
    line.innerHTML = `<label for="fx-rate">1 € =</label> <input id="fx-rate" type="number" step="0.0001" min="0" inputmode="decimal" value="${rateShown}"> CNY <span class="muted">· ${esc(etiqueta)}</span>` +
      (fx.source === 'default' ? ' ' + CHECK : '');
    const inp = line.querySelector('input');
    inp.addEventListener('change', () => {
      const v = +String(inp.value).replace(',', '.');
      if (v > 0) {
        state.fx = { rate: v, date: hoyYMD(), source: 'manual', stamp: hoyYMD() };
        save();
        renderGastos();
        toast('Tipo de cambio ajustado a mano');
      } else {
        inp.value = rateShown;
      }
    });
    if (fx.source !== 'api') {
      const b = el('button', 'btn btn--xs');
      b.type = 'button';
      b.textContent = 'Usar el del BCE';
      b.addEventListener('click', () => {
        b.disabled = true;
        refreshFx(true).then(ok => {
          if (!ok) { b.disabled = false; toast('Sin conexión: no se puede descargar el tipo del BCE ahora.'); }
          else toast('Tipo del BCE actualizado');
        });
      });
      line.appendChild(b);
    }
    hero.appendChild(line);
    left.appendChild(hero);

    // Resumen por categoría
    const cats = Object.keys(porCat).filter(k => Math.abs(porCat[k]) > 0.005).sort((a, b) => porCat[b] - porCat[a]);
    if (cats.length) {
      const h = el('h3', 'section-title');
      h.textContent = 'Por categoría';
      left.appendChild(h);
      const box = el('div', 'cats');
      const max = Math.max(...cats.map(k => porCat[k]));
      cats.forEach(k => {
        const pct = totEUR ? Math.round(porCat[k] / totEUR * 100) : 0;
        const row = el('div', 'cat-row');
        row.innerHTML = `<span>${esc(k)} <span class="muted">· ${pct} %</span></span><b>${fmtEUR(porCat[k])}</b>` +
          `<span class="cat-row__bar" aria-hidden="true"><i style="width:${Math.max(2, porCat[k] / max * 100)}%"></i></span>`;
        box.appendChild(row);
      });
      left.appendChild(box);
    }

    // Lista
    const add = el('button', 'btn btn--accent btn--block');
    add.type = 'button';
    add.innerHTML = ICON.plus + ' Añadir gasto';
    add.style.marginTop = '0';
    add.addEventListener('click', () => openSheet('gasto'));
    right.appendChild(add);
    const h2 = el('h3', 'section-title');
    h2.textContent = 'Movimientos';
    right.appendChild(h2);
    if (!state.gastos.length) {
      const e = el('div', 'empty');
      e.textContent = 'Aún no hay gastos. Apunta lo que pagues en yuanes o en euros.';
      right.appendChild(e);
    } else {
      const byDay = {};
      state.gastos.slice().sort(itemSorter('gastos')).forEach(g => { (byDay[g.fecha || ''] = byDay[g.fecha || ''] || []).push(g); });
      Object.keys(byDay).forEach(d => {
        const sub = byDay[d].reduce((a, g) => a + toEUR(+g.importe || 0, g.moneda), 0);
        const p = el('p', 'check-cat');
        p.textContent = (d ? `${cap(fmtDiaSemana(d))} ${fmtFecha(d)}` : 'Sin fecha') + ' · ' + fmtEUR(sub);
        right.appendChild(p);
        right.appendChild(itemList('gasto', byDay[d], gastoSummary));
      });
    }
    grid.append(left, right);
    body.appendChild(grid);
  }

  function gastoSummary(g) {
    const imp = +g.importe || 0;
    const propia = g.moneda === 'EUR' ? fmtEUR(imp) : fmtCNY(imp);
    const otra = g.moneda === 'EUR' ? fmtCNY(toCNY(imp, 'EUR')) : fmtEUR(toEUR(imp, 'CNY'));
    return `<div class="item__title">${esc(g.concepto || 'Gasto')}</div>` +
      `<div class="item__meta"><span class="tag">${esc(g.categoria || 'Otros')}</span></div>` +
      `<div class="item__meta gasto-amt"><b>${propia}</b> <span class="muted">≈ ${otra}</span></div>` +
      (g.notas ? `<div class="item__meta">${escLines(g.notas)}</div>` : '');
  }

  /* ==========================================================
     Pantalla: DÓNDE COMER
     Tus sitios para comer, agrupados por la ciudad del alojamiento más
     cercano, con la distancia en línea recta desde él, el precio medio y
     un mapa por ciudad. Solo datos que has metido tú: no se inventan precios.
     ========================================================== */
  const NEAR_KM = 60; // más lejos que esto de cualquier alojamiento: «Otros sitios»

  // Ciudades con su(s) alojamiento(s) con coordenadas, en orden de viaje.
  function zonasDeAlojamiento() {
    const zonas = [];
    state.alojamientos.slice().sort((a, b) => (a.checkin || '').localeCompare(b.checkin || '')).forEach(a => {
      if (!hasXY(a.loc)) return;
      const nombre = (a.ciudad || a.nombre || 'Alojamiento').trim();
      let z = zonas.find(x => x.nombre.toLowerCase() === nombre.toLowerCase());
      if (!z) { z = { nombre, alojs: [] }; zonas.push(z); }
      z.alojs.push(a);
    });
    return zonas;
  }

  // Alojamiento más cercano a un punto (entre todos los de todas las zonas).
  function nearestAloj(zonas, loc) {
    let best = null;
    zonas.forEach(z => z.alojs.forEach(a => {
      const km = haversine(a.loc, loc);
      if (!best || km < best.km) best = { zona: z, aloj: a, km };
    }));
    return best;
  }

  function venueCard(it, n, near, extraMeta) {
    const c = el('div', 'card venue');
    const precio = fmtPrecioCNY(it.precio);
    const precioEur = (it.precio !== '' && it.precio != null && isFinite(it.precio)) ? ' (≈ ' + fmtEUR(toEUR(+it.precio, 'CNY')) + ')' : '';
    c.innerHTML =
      `<div class="venue__top"><div class="item__title">${n ? `<span class="venue__num">${n}</span>` : ''}${esc(it.nombre || '')}</div>` +
      (near ? `<span class="venue__dist">${fmtKm(near.km)}</span>` : '') + `</div>` +
      zhLine(it) +
      `<div class="item__meta">${[it.tipo ? esc(it.tipo) : '', precio ? esc(precio) + esc(precioEur) : '<span class="muted">Precio medio sin apuntar</span>'].filter(Boolean).join(' · ')}</div>` +
      (near ? `<div class="item__meta">A ${fmtKm(near.km)} en línea recta de ${esc(near.aloj.nombre || 'tu alojamiento')}</div>` : '') +
      (extraMeta || '') +
      (it.fecha ? `<div class="item__meta">En el itinerario: ${cap(fmtDiaSemana(it.fecha))} ${fmtFecha(it.fecha)}${it.horario ? ' · ' + esc(it.horario) : ''}</div>` : '') +
      (it.notas ? `<div class="item__meta">${escLines(it.notas)}</div>` : '') +
      linksRow(it.loc, it);
    return c;
  }

  function zoneShell(title, sub) {
    const z = el('section', 'zone');
    z.innerHTML = `<header class="zone__head"><h3 class="zone__title">${esc(title)}</h3>${sub ? `<p class="zone__sub">${sub}</p>` : ''}</header>`;
    const inner = el('div', 'zone__inner');
    const mapWrap = el('div', 'zone__mapwrap');
    const mapNode = el('div', 'zone__map');
    mapWrap.appendChild(mapNode);
    const list = el('div', 'zone__list');
    inner.append(mapWrap, list);
    z.appendChild(inner);
    return { z, mapNode, list };
  }

  function alojFechas(a) {
    return a.checkin && a.checkout ? `${fmtFecha(a.checkin)} – ${fmtFecha(a.checkout)}` : '';
  }

  function renderComer() {
    const body = $('#comer-body');
    destroyMaps('comer-');
    pendingComer = [];
    body.innerHTML = '';
    const zonas = zonasDeAlojamiento();
    const sinLoc = [], lejos = [];
    const porZona = new Map(zonas.map(z => [z, []]));

    state.comidas.forEach(c => {
      if (!hasXY(c.loc)) { sinLoc.push(c); return; }
      const near = nearestAloj(zonas, c.loc);
      if (near && near.km <= NEAR_KM) porZona.get(near.zona).push({ c, near });
      else lejos.push(c);
    });

    if (!state.comidas.length) {
      const e = el('div', 'empty');
      e.innerHTML = 'Aún no tienes sitios para comer. Añádelos en <a href="#datos">Datos › Sitios para comer</a> con su ubicación, nombre en chino y precio medio, y aparecerán aquí ordenados por distancia a tu alojamiento.';
      body.appendChild(e);
    }
    if (state.comidas.length && !zonas.length) {
      const n = el('div', 'notice');
      n.textContent = 'Pon la ubicación de tus alojamientos para ver la distancia a cada sitio y agruparlos por ciudad.';
      body.appendChild(n);
    }
    if (zonas.length && state.comidas.length) {
      const n = el('div', 'notice');
      n.textContent = 'Distancias en línea recta desde el alojamiento, no a pie. Los precios medios son los que has apuntado tú. Amap abre el punto ya corregido a coordenadas chinas (GCJ-02).';
      body.appendChild(n);
    }

    zonas.forEach((z, zi) => {
      const items = porZona.get(z).sort((a, b) => a.near.km - b.near.km);
      if (!items.length) return;
      const conPrecio = items.filter(x => x.c.precio !== '' && x.c.precio != null && isFinite(x.c.precio));
      const media = conPrecio.length ? conPrecio.reduce((s, x) => s + +x.c.precio, 0) / conPrecio.length : null;
      const sub = z.alojs.map(a => `${esc(a.nombre || 'Alojamiento')}${alojFechas(a) ? ' · ' + alojFechas(a) : ''}`).join('<br>') +
        `<br>${items.length} ${items.length === 1 ? 'sitio' : 'sitios'}${media != null ? ' · precio medio de tus sitios ~' + Math.round(media) + ' CNY/persona (≈ ' + fmtEUR(toEUR(media, 'CNY')) + ')' : ''}`;
      const { z: node, mapNode, list } = zoneShell(z.nombre, sub);
      items.forEach((x, i) => list.appendChild(venueCard(x.c, i + 1, x.near)));
      body.appendChild(node);
      const pts = z.alojs.map(a => ({ lat: a.loc.lat, lng: a.loc.lng, label: '⌂', title: a.nombre || 'Alojamiento', home: true }))
        .concat(items.map((x, i) => ({ lat: x.c.loc.lat, lng: x.c.loc.lng, label: String(i + 1), title: (i + 1) + '. ' + (x.c.nombre || '') })));
      if (!$('#screen-comer').hidden) drawMap('comer-' + zi, mapNode, pts);
      else pendingComer.push(() => drawMap('comer-' + zi, mapNode, pts));
    });

    const extra = (title, arr, sub) => {
      if (!arr.length) return;
      const s = el('section', 'zone');
      s.innerHTML = `<header class="zone__head"><h3 class="zone__title">${esc(title)}</h3><p class="zone__sub">${esc(sub)}</p></header>`;
      const list = el('div', 'zone__list');
      arr.forEach(c => list.appendChild(venueCard(c, 0, null)));
      s.appendChild(list);
      body.appendChild(s);
    };
    extra('Otros sitios', lejos, `A más de ${NEAR_KM} km de tus alojamientos.`);
    extra('Sin ubicación', sinLoc, 'Sin coordenadas no se puede calcular la distancia. Amap los busca por el nombre en chino.');
  }

  // Leaflet no puede medir un mapa oculto: los de Comer se dibujan al abrir la pestaña.
  let pendingComer = [];
  function flushPendingMaps() {
    if ($('#screen-comer').hidden || !pendingComer.length) return;
    const fns = pendingComer; pendingComer = [];
    fns.forEach(f => f());
  }

  /* ==========================================================
     Pantalla: QUÉ VER — Transporte y guías
     Texto revisado en noviembre de 2026. Lo que cambia a menudo o no se ha
     podido confirmar en una fuente fiable va marcado con [comprobar].
     ========================================================== */
  const ph = (zh, py, es) => `<div class="phrase"><span class="zh" lang="zh-Hans">${zh}</span><span class="muted">${py}</span><small>${es}</small></div>`;

  const GUIAS = [
    { id: 'trenes', titulo: 'Trenes de alta velocidad', zh: '高铁', html: `
      <p>Los trenes <b>G</b> son los de alta velocidad, los <b>D</b> son rápidos y los <b>Z, T y K</b> son convencionales (algunos, nocturnos con litera). Para distancias de hasta unas 5–6 horas suelen compensar más que el avión: salen del centro y no hay que facturar.</p>
      <ul>
        <li><b>Dónde comprar:</b> en <b>12306</b>, la web y app oficial de China Railway (tiene versión en inglés), con el pasaporte. Antes de comprar pide verificar el pasaporte, el móvil y el correo. <b>Trip.com</b> es más sencillo para extranjeros, pero cobra comisión [comprobar].</li>
        <li><b>Antelación:</b> los billetes suelen salir a la venta unos 15 días antes [comprobar]. Trip.com deja «prerreservar» antes, pero eso es una solicitud, no un billete confirmado. En festivos (Año Nuevo chino, 1–5 de mayo, 1–7 de octubre) se agotan muy rápido.</li>
        <li><b>El pasaporte es el billete:</b> el mismo con el que compraste. Si la puerta automática no lee tu pasaporte, ve al paso manual (人工通道).</li>
        <li><b>Llega con margen:</b> hay control de seguridad e identidad al entrar en la estación, y el embarque cierra unos minutos antes de la salida [comprobar]. La app ya calcula llegar 30 min antes.</li>
        <li><b>Ojo con la estación:</b> las grandes ciudades tienen varias (Pekín Sur, Oeste, Norte, Chaoyang…). Comprueba cuál pone tu billete.</li>
        <li>En los trenes hay agua caliente gratis. La maleta va contigo, en el portaequipajes.</li>
      </ul>
      <div class="phrases">${ph('火车站', 'huǒchēzhàn', 'Estación de tren')}${ph('检票口', 'jiǎnpiàokǒu', 'Puerta de embarque')}${ph('人工通道', 'réngōng tōngdào', 'Paso manual (con personal)')}</div>
      <p><a href="https://www.12306.cn/en/index.html" target="_blank" rel="noopener">12306 en inglés ›</a></p>` },

    { id: 'didi', titulo: 'DiDi, taxi y metro', zh: '滴滴 · 地铁', html: `
      <ul>
        <li><b>DiDi</b> es el «Uber chino». Tiene interfaz en inglés, admite tarjeta extranjera y también funciona como miniprograma dentro de Alipay. Elige el destino en el mapa o escríbelo en chino: así no hay malentendidos.</li>
        <li><b>Taxi:</b> con taxímetro. Enseña el destino con el botón <b>«Enseñar al taxista»</b> de cada alojamiento, sitio o lugar (rellena el nombre y la dirección en chino en Datos). Muchos taxis cobran solo con Alipay, WeChat Pay o efectivo.</li>
        <li><b>Metro:</b> barato, rápido y con letreros en inglés en las ciudades grandes. Hay control de seguridad con escáner en cada estación. Puedes pagar con el código de transporte de Alipay (乘车码) o con billete de máquina. Algunas ciudades aceptan ya tarjeta bancaria sin contacto en los tornos [comprobar].</li>
        <li>Evita las horas punta si vas con maletas: de 7:30 a 9:30 y de 17:30 a 19:30, más o menos.</li>
        <li>Para moverte en transporte público, <b>Amap</b> calcula rutas de metro y autobús. Los enlaces de esta app la abren con las coordenadas ya corregidas (GCJ-02).</li>
      </ul>
      <div class="phrases">${ph('请带我去这里', 'qǐng dài wǒ qù zhèlǐ', 'Lléveme aquí, por favor')}${ph('在这里停', 'zài zhèlǐ tíng', 'Pare aquí')}${ph('地铁站', 'dìtiězhàn', 'Estación de metro')}</div>` },

    { id: 'pagos', titulo: 'Pagos: Alipay y WeChat Pay', zh: '支付宝 · 微信支付', html: `
      <p>En China casi todo se paga con el móvil. Las dos apps admiten <b>tarjetas Visa o Mastercard extranjeras</b> después de verificar el pasaporte, sin cuenta en un banco chino.</p>
      <ul>
        <li><b>Configúralas ANTES de salir:</b> descárgalas, regístrate con tu móvil español, vincula la tarjeta, verifica el pasaporte (en Alipay puede tardar algún día [comprobar]) y haz un pago pequeño de prueba.</li>
        <li><b>Comisión:</b> con tarjeta extranjera, 0 % hasta 200 CNY por pago y 3 % por encima [comprobar]. Tu banco puede cobrar además su comisión por cambio de divisa.</li>
        <li><b>Límites:</b> por pago y por año, cambian según la app y la tarjeta, y las fuentes no coinciden. Míralos en la propia app antes de un pago grande [comprobar].</li>
        <li><b>Cómo se paga:</b> o escaneas el QR del comercio y escribes el importe, o enseñas tu código de pago (付款码) para que lo escaneen.</li>
        <li>Lleva <b>algo de efectivo en CNY</b> para mercados pequeños o por si falla la app. Los cajeros de bancos grandes (Bank of China, ICBC…) suelen aceptar tarjetas extranjeras [comprobar].</li>
        <li>Hoteles grandes y centros comerciales aceptan la tarjeta física; los comercios pequeños, casi nunca.</li>
      </ul>` },

    { id: 'internet', titulo: 'Internet: eSIM o VPN', zh: '上网', html: `
      <p>En las redes chinas están <b>bloqueados</b> Google (buscador, Maps, Gmail, Traductor), WhatsApp, Instagram, Facebook, YouTube y X, entre otros.</p>
      <ul>
        <li><b>eSIM o roaming con operador extranjero:</b> es lo más sencillo. El tráfico sale por fuera de China y esas apps suelen funcionar [comprobar con tu operador o tu eSIM]. Instálala y actívala en España.</li>
        <li><b>VPN:</b> solo hace falta con SIM china o con el wifi del hotel. Instálala y pruébala antes de salir, porque en China no la podrás descargar. Funciona de forma irregular y su uso no está autorizado oficialmente [comprobar].</li>
        <li><b>Funcionan sin problema:</b> Amap, DiDi, Trip.com, Alipay, WeChat y 12306. Descarga un traductor con idiomas sin conexión (el de Google no funciona sin VPN o eSIM).</li>
        <li>Muchos wifis públicos piden un móvil chino para recibir el código por SMS.</li>
      </ul>` },

    { id: 'etiqueta', titulo: 'Etiqueta y costumbres', zh: '礼仪', html: `
      <ul>
        <li><b>Lleva siempre el pasaporte:</b> lo piden en hoteles, trenes y museos, y para reservar muchas entradas.</li>
        <li><b>Entradas con reserva:</b> muchos sitios grandes piden reservar antes con el pasaporte y tienen cupo diario (Ciudad Prohibida, Museo Nacional…). Algunos cierran un día a la semana [comprobar].</li>
        <li>Palillos: no los claves de pie en el arroz (recuerda a las ofrendas a los muertos) y no señales con ellos.</li>
        <li>Los platos se comparten en el centro. Brindis: 干杯 (gānbēi). Las propinas no se esperan en general.</li>
        <li>Entrega y recibe tarjetas, regalos o dinero con las dos manos. No regales relojes: «regalar un reloj» (送钟) suena como acompañar a alguien en su muerte.</li>
        <li>En templos: ropa discreta, no pises el umbral de la puerta y no toques las imágenes.</li>
        <li>Pide permiso antes de fotografiar a la gente. Está prohibido fotografiar zonas militares, y en algunos museos y templos no se permiten fotos.</li>
        <li>En conversaciones, evita la política (Taiwán, Tíbet, Tiananmén).</li>
        <li>En estaciones y metros hay mucha gente y las colas son flexibles: paciencia.</li>
      </ul>
      <div class="phrases">${ph('你好', 'nǐ hǎo', 'Hola')}${ph('谢谢', 'xièxie', 'Gracias')}${ph('不用了，谢谢', 'bú yòng le, xièxie', 'No, gracias')}${ph('多少钱？', 'duōshao qián?', '¿Cuánto cuesta?')}</div>` },

    { id: 'comida', titulo: 'Comida por regiones', zh: '美食', html: `
      <ul>
        <li><b>Pekín y el norte:</b> pato laqueado (北京烤鸭), dumplings (饺子), fideos y cordero. Más trigo que arroz.</li>
        <li><b>Sichuan (Chengdú, Chongqing):</b> picante y 麻辣, el picor que adormece la boca por la pimienta de Sichuan. Hot pot (火锅), mapo tofu (麻婆豆腐), pollo kung pao (宫保鸡丁) y fideos dandan (担担面).</li>
        <li><b>Hunan:</b> muy picante, pero sin el adormecimiento de Sichuan.</li>
        <li><b>Shanghái y alrededores:</b> sabores más dulces. Xiaolongbao (小笼包), shengjianbao (生煎包) y cerdo estofado (红烧肉).</li>
        <li><b>Cantón y el sur:</b> dim sum (点心) a media mañana, asados como el char siu (叉烧) y sopas. Poco picante.</li>
        <li><b>Xi'an y el noroeste:</b> cocina hui (musulmana). Roujiamo (肉夹馍), sopa de cordero con pan (羊肉泡馍) y fideos biangbiang. El barrio musulmán, por la noche.</li>
        <li><b>Yunnan:</b> setas, flores comestibles y fideos «cruzando el puente» (过桥米线).</li>
      </ul>
      <p>Muchos restaurantes tienen un QR en la mesa para pedir y pagar desde el móvil (a veces solo con WeChat). El agua del grifo no es potable: bebe embotellada o hervida.</p>
      <div class="phrases">${ph('不要辣', 'bú yào là', 'Sin picante')}${ph('微辣', 'wēi là', 'Poco picante')}${ph('我对花生过敏', 'wǒ duì huāshēng guòmǐn', 'Soy alérgico a los cacahuetes')}${ph('买单', 'mǎidān', 'La cuenta, por favor')}</div>` },

    { id: 'temporada', titulo: 'Temporada por región', zh: '气候', html: `
      <p>China es enorme: el mismo mes puede ser invierno seco en Pekín y monzón en Guilin. Así es el patrón general (cada año varía):</p>
      <div class="table-scroll"><table class="season">
        <thead><tr><th>Región</th><th>Dic–feb</th><th>Mar–may</th><th>Jun–ago</th><th>Sep–nov</th></tr></thead>
        <tbody>
          <tr><td>Norte<br><span class="muted">Pekín, Xi'an</span></td><td>Frío y seco, bajo cero y con viento. A veces, contaminación por la calefacción.</td><td>Primavera corta y ventosa; puede haber polvo y arena.</td><td>Calor y la mayor parte de la lluvia del año (julio y agosto), con tormentas.</td><td><b>La mejor época:</b> seco, templado y cielos claros.</td></tr>
          <tr><td>Este<br><span class="muted">Shanghái, Hangzhou</span></td><td>Frío húmedo.</td><td>Templado. Desde mediados de junio, la época de lluvias 梅雨 («lluvia de las ciruelas»).</td><td>Calor húmedo; lluvias 梅雨 hasta julio y posibles tifones.</td><td>Agradable; algún tifón en septiembre.</td></tr>
          <tr><td>Sur<br><span class="muted">Cantón, Guilin</span></td><td>Suave y bastante seco.</td><td>Cada vez más húmedo y lluvioso.</td><td><b>Monzón de verano:</b> mucho calor, lluvias fuertes y tifones.</td><td>Buena época; seco desde octubre.</td></tr>
          <tr><td>Suroeste<br><span class="muted">Chengdú, Yunnan</span></td><td>Chengdú, gris y frío húmedo; Kunming, suave.</td><td>Templado.</td><td>Calor y lluvias; en Yunnan, estación de lluvias de mayo a octubre.</td><td>Agradable; Yunnan se seca a partir de noviembre.</td></tr>
        </tbody>
      </table></div>
      <p><b>Festivos que lo llenan todo y suben precios:</b> Año Nuevo chino (enero o febrero, cambia cada año), del 1 al 5 de mayo y la Semana Dorada del 1 al 7 de octubre [comprobar las fechas del año de tu viaje].</p>` },

    { id: 'planb', titulo: 'Plan B: lluvia o contaminación', zh: '备选', html: `
      <ul>
        <li><b>Contaminación:</b> mira el índice de calidad del aire (AQI) en la app del tiempo del móvil o en aqicn.org [comprobar]. Por encima de 150 se considera insalubre: usa mascarilla FFP2 o KN95, cambia a planes de interior y deja para otro día las subidas largas (Gran Muralla, montañas).</li>
        <li><b>Lluvia fuerte:</b> el Itinerario te avisa por días. Habrá más atasco y menos DiDi libres; el metro es lo más fiable. Los senderos de montaña y la Muralla resbalan: si puedes, cambia ese día por otro.</li>
        <li><b>Tifones (verano en el sur y el este):</b> pueden cancelar trenes, vuelos y barcos. Mira los avisos oficiales y la app de la compañía.</li>
        <li><b>Planes de interior:</b> museos grandes (reserva con pasaporte), casas de té, masaje de pies, los espectáculos de este mismo bloque, mercados cubiertos y centros comerciales, o una clase de cocina o de dumplings.</li>
        <li><b>Reorganizar:</b> cambia la fecha de un lugar o una excursión en Datos y el Itinerario se recalcula solo, con la luz y los trayectos.</li>
      </ul>` }
  ];

  let selectedGuia = 'all';
  function renderGuias() {
    const body = $('#guias-body');
    body.innerHTML = '';
    const chips = el('div', 'chips');
    const chip = (key, label) => {
      const b = el('button', 'chip');
      b.type = 'button';
      b.textContent = label;
      b.setAttribute('aria-pressed', String(selectedGuia === key));
      b.addEventListener('click', () => { selectedGuia = key; renderGuias(); });
      return b;
    };
    chips.appendChild(chip('all', 'Todo'));
    GUIAS.forEach(g => chips.appendChild(chip(g.id, g.titulo.split(':')[0])));
    body.appendChild(chips);
    const n = el('div', 'notice notice--warn');
    n.innerHTML = `Revisado en noviembre de 2026. Lo marcado con ${CHECK} cambia a menudo o no se ha podido confirmar: compruébalo en la web oficial antes de viajar.`;
    body.appendChild(n);
    GUIAS.filter(g => selectedGuia === 'all' || selectedGuia === g.id).forEach(g => {
      const s = el('section', 'guide');
      s.id = 'guia-' + g.id;
      s.innerHTML = `<h4>${esc(g.titulo)} <span class="zh" lang="zh-Hans">${g.zh}</span></h4>` + g.html.replace(/\[comprobar([^\]]*)\]/g, (m, extra) => `<span class="check-tag">[comprobar${esc(extra)}]</span>`);
      body.appendChild(s);
    });
  }

  // Enlace «plan B» desde el aviso de lluvia del Itinerario.
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-open-guide]');
    if (!a) return;
    e.preventDefault();
    selectedGuia = a.dataset.openGuide;
    renderGuias();
    $('#qv-guias').open = true;
    showScreen('quever');
    const t = $('#guia-' + selectedGuia);
    if (t) setTimeout(() => t.scrollIntoView({ block: 'start' }), 30);
  });

  /* ==========================================================
     Espectáculos locales (acrobacias, ópera de Pekín, ópera de Sichuan)
     Catálogo de teatros conocidos (coordenadas WGS-84 de OpenStreetMap,
     11 nov 2026) + los que añadas tú. Los días que no se han podido
     confirmar en la web oficial van con [comprobar]: no se inventan horarios.
     ========================================================== */
  const TEATROS = [
    { id: 'cat-chaoyang', nombre: 'Teatro Chaoyang', nombreZh: '朝阳剧场', tipo: 'Acrobacias', ciudad: 'Pekín',
      loc: { lat: 39.92107, lng: 116.45646 }, dias: [0, 1, 2, 3, 4, 5, 6], fuente: 'Función diaria según guías de 2026',
      nota: 'El teatro de acrobacias más conocido de Pekín.' },
    { id: 'cat-liyuan', nombre: 'Teatro Liyuan', nombreZh: '梨园剧场', direccionZh: '前门建国饭店内', tipo: 'Ópera de Pekín', ciudad: 'Pekín',
      loc: { lat: 39.88552, lng: 116.37952 }, dias: [0, 1, 2, 3, 4, 5, 6], fuente: 'Función diaria según guías de 2026',
      nota: 'Dentro del hotel Qianmen Jianguo. Fragmentos cortos de ópera pensados para quien la ve por primera vez.' },
    { id: 'cat-huguang', nombre: 'Salón del Gremio de Huguang', nombreZh: '北京湖广会馆', tipo: 'Ópera de Pekín', ciudad: 'Pekín',
      loc: { lat: 39.88748, lng: 116.37766 }, dias: null,
      nota: 'Teatro tradicional de madera, de los más antiguos de la ciudad.' },
    { id: 'cat-changan', nombre: 'Gran Teatro Chang\'an', nombreZh: '长安大戏院', tipo: 'Ópera de Pekín', ciudad: 'Pekín',
      loc: { lat: 39.90771, lng: 116.41556 }, dias: null,
      nota: 'Programación de ópera para público local; consulta qué obra hay cada día.' },
    { id: 'cat-circo-sh', nombre: 'Shanghai Circus World', nombreZh: '上海马戏城', tipo: 'Acrobacias', ciudad: 'Shanghái',
      loc: { lat: 31.28180, lng: 121.44730 }, dias: null,
      nota: 'Sede del espectáculo de acrobacias más conocido de Shanghái.' },
    { id: 'cat-shufeng', nombre: 'Shufeng Yayun', nombreZh: '蜀风雅韵', tipo: 'Ópera de Sichuan', ciudad: 'Chengdú',
      loc: { lat: 30.66363, lng: 104.04275 }, dias: null,
      nota: 'En el Parque Cultural. Variedades de ópera de Sichuan con el «cambio de caras» (变脸).' },
    { id: 'cat-jinjiang', nombre: 'Teatro Jinjiang', nombreZh: '锦江剧场', tipo: 'Ópera de Sichuan', ciudad: 'Chengdú',
      loc: { lat: 30.66204, lng: 104.07790 }, dias: null,
      nota: 'Teatro histórico de ópera de Sichuan en el centro.' }
  ];
  TEATROS.forEach(t => { extraTaxi[t.id] = t; });
  const TEATRO_KM = 30; // «cerca» de un alojamiento

  // Noches de la estancia en una zona (checkin … checkout-1) que caen en los días de función.
  function nochesQueEncajan(zona, dias) {
    const noches = [];
    zona.alojs.forEach(a => eachDay(a.checkin, a.checkout).slice(0, -1).forEach(d => {
      if (!noches.includes(d)) noches.push(d);
    }));
    noches.sort();
    if (!Array.isArray(dias) || !dias.length) return { noches, encajan: null };
    return { noches, encajan: noches.filter(d => dias.includes(parseDate(d).getDay())) };
  }

  function espectaculoCard(sp, n, near, zona) {
    const { noches, encajan } = nochesQueEncajan(zona, sp.dias);
    const verificado = !sp.catalogo || !!sp.verificado;
    let diasHtml;
    if (!sp.dias || !sp.dias.length) diasHtml = `Días de función: ${CHECK} en la web oficial`;
    else diasHtml = `Días de función: ${esc(diasTxt(sp.dias))}${sp.fuente ? ' <span class="muted">(' + esc(sp.fuente) + ')</span>' : ''}${verificado ? '' : ' ' + CHECK}`;
    let nochesHtml = '';
    if (encajan && encajan.length) {
      nochesHtml = `<div class="venue__nights">Encaja con tus noches: <b>${encajan.map(d => fmtDiaSemana(d) + ' ' + fmtFecha(d)).map(esc).join(', ')}</b></div>`;
    } else if (encajan && !encajan.length && noches.length) {
      nochesHtml = '<div class="venue__nights venue__nights--none">Ninguna noche de tu estancia coincide con los días de función.</div>';
    } else if (noches.length) {
      nochesHtml = `<div class="venue__nights venue__nights--none">Tus noches aquí: ${noches.map(d => fmtDiaSemana(d) + ' ' + fmtFecha(d)).map(esc).join(', ')}. Mira qué días hay función.</div>`;
    }
    const c = el('div', 'card venue');
    c.innerHTML =
      `<div class="venue__top"><div class="item__title">${n ? `<span class="venue__num">${n}</span>` : ''}${esc(sp.nombre)} <span class="tag">${esc(sp.tipo || '')}</span></div>` +
      (near ? `<span class="venue__dist">${fmtKm(near.km)}</span>` : '') + `</div>` + zhLine(sp) +
      `<div class="item__meta">${diasHtml}</div>` +
      (sp.horario ? `<div class="item__meta">Horario: ${esc(sp.horario)}</div>` : (sp.catalogo ? `<div class="item__meta">Horario y precio: ${CHECK} en la web oficial o en Trip.com</div>` : '')) +
      (sp.precio ? `<div class="item__meta">Precio: ${esc(sp.precio)}</div>` : '') +
      (near ? `<div class="item__meta">A ${fmtKm(near.km)} en línea recta de ${esc(near.aloj.nombre || 'tu alojamiento')}</div>` : '') +
      (sp.nota ? `<div class="item__meta">${esc(sp.nota)}</div>` : '') +
      (sp.notas ? `<div class="item__meta">${escLines(sp.notas)}</div>` : '') +
      nochesHtml +
      linksRow(sp.loc, sp, sp.web ? `<a class="btn btn--xs" href="${esc(sp.web)}" target="_blank" rel="noopener">Web ›</a>` : '');
    return c;
  }

  let pendingQv = [];
  function renderEspectaculos() {
    const body = $('#espectaculos-body');
    destroyMaps('esp-');
    pendingQv = [];
    body.innerHTML = '';
    const zonas = zonasDeAlojamiento();
    const todos = TEATROS.map(t => Object.assign({ catalogo: true }, t))
      .concat(state.espectaculos.map(s => Object.assign({}, s)));
    const n = el('div', 'notice');
    n.innerHTML = `Teatros conocidos más los que añadas en Datos › Espectáculos, a menos de ${TEATRO_KM} km de cada alojamiento. Días, horarios y precios cambian: lo no confirmado va con ${CHECK}. Distancias en línea recta.`;
    body.appendChild(n);

    if (!zonas.length) {
      const e = el('div', 'empty');
      e.textContent = 'Pon la ubicación de tus alojamientos y aquí aparecerán los espectáculos cercanos con las noches que te encajan.';
      body.appendChild(e);
    }
    let alguno = false;
    zonas.forEach((z, zi) => {
      const items = [];
      todos.forEach(sp => {
        if (!hasXY(sp.loc)) return;
        let best = null;
        z.alojs.forEach(a => { const km = haversine(a.loc, sp.loc); if (!best || km < best.km) best = { aloj: a, km }; });
        if (best && best.km <= TEATRO_KM) items.push({ sp, near: best });
      });
      if (!items.length) return;
      alguno = true;
      items.sort((a, b) => a.near.km - b.near.km);
      const sub = z.alojs.map(a => `${esc(a.nombre || 'Alojamiento')}${alojFechas(a) ? ' · ' + alojFechas(a) : ''}`).join('<br>');
      const { z: node, mapNode, list } = zoneShell(z.nombre, sub);
      items.forEach((x, i) => list.appendChild(espectaculoCard(x.sp, i + 1, x.near, z)));
      body.appendChild(node);
      const pts = z.alojs.map(a => ({ lat: a.loc.lat, lng: a.loc.lng, label: '⌂', title: a.nombre || 'Alojamiento', home: true }))
        .concat(items.map((x, i) => ({ lat: x.sp.loc.lat, lng: x.sp.loc.lng, label: String(i + 1), title: (i + 1) + '. ' + x.sp.nombre })));
      pendingQv.push(() => drawMap('esp-' + zi, mapNode, pts));
    });
    if (zonas.length && !alguno) {
      const e = el('div', 'empty');
      e.textContent = 'No hay teatros del catálogo cerca de tus alojamientos. Añade los que encuentres en Datos › Espectáculos, con sus días de función.';
      body.appendChild(e);
    }
    const sinLoc = state.espectaculos.filter(s => !hasXY(s.loc));
    if (sinLoc.length) {
      const p = el('p', 'check-cat');
      p.textContent = 'Sin ubicación';
      body.appendChild(p);
      sinLoc.forEach(s => body.appendChild(espectaculoCard(s, 0, null, { alojs: [] })));
    }
    const add = el('button', 'btn btn--add btn--block');
    add.type = 'button';
    add.innerHTML = ICON.plus + ' Añadir espectáculo';
    add.addEventListener('click', () => openSheet('espectaculo'));
    body.appendChild(add);
    flushQvMaps();
  }
  // Los mapas miden 0 con el bloque plegado: se dibujan al desplegarlo.
  function flushQvMaps() {
    if ($('#screen-quever').hidden || !$('#qv-espectaculos').open || !pendingQv.length) return;
    const fns = pendingQv; pendingQv = [];
    fns.forEach(f => f());
  }
  on('#qv-espectaculos', 'toggle', e => {
    if (!e.currentTarget.open) return;
    flushQvMaps();
    setTimeout(refreshMaps, 60);
  });

  /* ==========================================================
     Mis notas
     ========================================================== */
  function notaSummary(n) {
    const link = n.link ? `<div class="item__links"><a class="btn btn--xs" href="${esc(n.link)}" target="_blank" rel="noopener">Abrir enlace ›</a></div>` : '';
    return `<div class="item__meta" style="margin-top:0"><span class="tag">${esc(n.categoria || 'Otro')}</span></div><div class="item__title" style="font-weight:600">${escLines(n.texto || '')}</div>${link}`;
  }
  function renderNotas() {
    const body = $('#notas-body');
    body.innerHTML = '';
    body.appendChild(itemList('nota', state.notas, notaSummary));
    const add = el('button', 'btn btn--add btn--block');
    add.type = 'button';
    add.innerHTML = ICON.plus + ' Añadir nota';
    add.addEventListener('click', () => openSheet('nota'));
    body.appendChild(add);
  }

  function renderQueVer() {
    renderGuias();
    renderEspectaculos();
    renderNotas();
  }


  /* ==========================================================
     Navegación por pestañas
     ========================================================== */
  const SCREENS = ['datos', 'itinerario', 'gastos', 'comer', 'quever'];

  function showScreen(name) {
    if (!SCREENS.includes(name)) name = 'datos';
    SCREENS.forEach(s => {
      const scr = $('#screen-' + s);
      if (scr) scr.hidden = (s !== name);
      const tab = $(`.tab[data-tab="${s}"]`);
      if (tab) tab.setAttribute('aria-current', s === name ? 'page' : 'false');
    });
    if (name === 'comer' || name === 'quever' || name === 'itinerario') {
      // Leaflet necesita medir el contenedor ya visible.
      flushPendingMaps();
      flushQvMaps();
      refreshMaps();
      setTimeout(refreshMaps, 60);
      setTimeout(refreshMaps, 300);
    }
    window.scrollTo(0, 0);
    if (name === 'itinerario') refreshMeteo();
    if (location.hash.slice(1) !== name) history.replaceState(null, '', '#' + name);
  }

  $$('.tab').forEach(t => t.addEventListener('click', () => showScreen(t.dataset.tab)));
  window.addEventListener('hashchange', () => showScreen(location.hash.slice(1)));
  // Al girar el móvil o cambiar el tamaño de la ventana, reencuadrar los mapas.
  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(refreshMaps, 200); });

  /* ==========================================================
     Bottom sheet
     ========================================================== */
  let sheetReturnFocus = null;
  function showSheet() {
    const s = $('#sheet');
    sheetReturnFocus = document.activeElement;
    s.hidden = false;
    s.setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');
    requestAnimationFrame(() => {
      s.classList.add('is-open');
      const f = $('#sheet-form').querySelector('input, select, textarea');
      if (f) f.focus({ preventScroll: true });
    });
  }
  function hideSheet() {
    const s = $('#sheet');
    s.classList.remove('is-open');
    s.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
    setTimeout(() => { s.hidden = true; $('#sheet-form').innerHTML = ''; }, 220);
    editing = null;
    if (sheetReturnFocus && document.contains(sheetReturnFocus)) sheetReturnFocus.focus({ preventScroll: true });
  }
  $$('#sheet [data-close]').forEach(b => b.addEventListener('click', hideSheet));

  /* ==========================================================
     Diálogo de confirmación
     ========================================================== */
  let confirmResolve = null;
  function confirmAsk(msg) {
    return new Promise(resolve => {
      confirmResolve = value => {
        $('#confirm').hidden = true;
        if ($('#sheet').hidden) document.body.classList.remove('no-scroll');
        confirmResolve = null;
        resolve(value);
      };
      $('#confirm-msg').textContent = msg;
      $('#confirm').hidden = false;
      document.body.classList.add('no-scroll');
      requestAnimationFrame(() => $('#confirm [data-ok]').focus());
    });
  }
  $$('#confirm [data-cancel]').forEach(b => b.addEventListener('click', () => confirmResolve && confirmResolve(false)));
  on('#confirm [data-ok]', 'click', () => confirmResolve && confirmResolve(true));

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!$('#taxi').hidden) hideTaxi();
    else if (!$('#confirm').hidden && confirmResolve) confirmResolve(false);
    else if (!$('#sheet').hidden) hideSheet();
  });

  /* ==========================================================
     Toast
     ========================================================== */
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    requestAnimationFrame(() => t.classList.add('is-on'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      t.classList.remove('is-on');
      setTimeout(() => { t.hidden = true; }, 220);
    }, 2600);
  }

  /* ==========================================================
     Cuenta atrás hasta la salida del avión
     ========================================================== */
  function firstDeparture() {
    let best = null;
    state.vuelos.forEach(v => (v.tramos || []).forEach(t => { if (t.salida && (!best || t.salida < best)) best = t.salida; }));
    return best;
  }
  function countdownStr(depStr) {
    if (!depStr) return '';
    const ms = new Date(depStr).getTime() - Date.now();
    if (isNaN(ms) || ms <= 0) return '';
    const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
    if (d >= 2) return d + ' días';
    if (d === 1) return '1 día ' + h + ' h';
    if (h >= 1) return h + ' h ' + m + ' min';
    return m + ' min';
  }
  function tripStatus() {
    const { fechaInicio, fechaFin } = state.meta;
    if (!fechaInicio) return 'antes';
    const hoy = hoyYMD();
    if (fechaFin && hoy > fechaFin) return 'fin';
    return hoy >= fechaInicio ? 'curso' : 'antes';
  }
  function updateCountdown() {
    const box = $('#appbar-count');
    const st = tripStatus();
    box.classList.remove('is-live');
    if (st === 'fin') { box.hidden = true; return; }
    if (st === 'curso') {
      const n = eachDay(state.meta.fechaInicio, hoyYMD()).length;
      box.textContent = 'Día ' + n;
      box.title = 'El viaje está en marcha';
      box.classList.add('is-live');
      box.hidden = false;
      return;
    }
    const s = countdownStr(firstDeparture());
    if (!s) { box.hidden = true; return; }
    box.innerHTML = ICON.plane + '<span>' + esc(s) + '</span>';
    box.title = 'Cuenta atrás hasta el primer vuelo';
    box.hidden = false;
  }

  function paintAppbar() {
    $('#appbar-title').textContent = state.meta.titulo || 'Viaje a China';
    const m = state.meta;
    $('#appbar-sub').textContent = (m.fechaInicio && m.fechaFin)
      ? `${fmtFecha(m.fechaInicio)} – ${fmtFecha(m.fechaFin, true)}`
      : 'Sin fechas · añádelas en Datos';
    updateCountdown();
  }
  setInterval(updateCountdown, 60000);

  /* ==========================================================
     Tema claro / oscuro
     ========================================================== */
  const TEMA_COLOR = { light: '#9e2a22', dark: '#2a100d' }; // color de la cabecera
  const temaActual = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  // Clave propia («china_tema»): el origen de GitHub Pages se comparte con viaje-tailandia.
  const TEMA_KEY = 'china_tema';
  const temaGuardado = () => { try { return localStorage.getItem(TEMA_KEY); } catch (e) { return null; } };
  function paintTheme() {
    const dark = temaActual() === 'dark';
    const btn = $('#theme-btn');
    btn.innerHTML = dark ? ICON.sun : ICON.moon;
    btn.setAttribute('aria-pressed', String(dark));
    btn.setAttribute('aria-label', dark ? 'Activar modo claro' : 'Activar modo oscuro');
    $('meta[name="theme-color"]').content = TEMA_COLOR[temaActual()];
  }
  function setTheme(t, guardar) {
    document.documentElement.dataset.theme = t;
    if (guardar) { try { localStorage.setItem(TEMA_KEY, t === 'dark' ? 'oscuro' : 'claro'); } catch (e) {} }
    paintTheme();
    refreshMaps();
  }
  on('#theme-btn', 'click', () => setTheme(temaActual() === 'dark' ? 'light' : 'dark', true));
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', ev => {
    if (!temaGuardado()) setTheme(ev.matches ? 'dark' : 'light', false);
  });
  paintTheme();

  /* ==========================================================
     Arranque
     ========================================================== */
  function renderAll() {
    paintAppbar();
    renderDatos();
    renderItinerario();
    renderGastos();
    renderComer();
    renderQueVer();
  }

  function initGazList() {
    const dl = $('#gaz-list');
    GAZ.forEach(g => { const o = el('option'); o.value = g.n; dl.appendChild(o); });
  }

  try {
    initGazList();
    renderAll();
    showScreen(location.hash.slice(1) || 'datos');
    refreshMeteo();
    refreshFx();
  } catch (err) {
    console.error('Error al iniciar:', err);
    const b = document.getElementById('datos-body');
    if (b) b.innerHTML = '<div class="notice notice--bad">Ha ocurrido un error al cargar. Cierra la app del todo y vuelve a abrirla; si persiste, borra los datos del sitio en el navegador.</div>';
  }

})();

/* ==========================================================
   Service worker: registro y actualización automática
   Si hay una versión nueva, se recarga sola, pero solo cuando no hay ningún
   formulario, confirmación o pantalla del taxista abiertos y no se está
   escribiendo en un campo (p. ej. el diario).
   ========================================================== */
(function () {
  if (!('serviceWorker' in navigator)) return;

  var LOOP_KEY = 'china-sw-reload-at';
  var reloaded = false;
  var retryTimer = null;
  // Solo se recarga en el controllerchange de una actualización iniciada aquí;
  // el de la primera instalación (clients.claim) no debe recargar nada.
  var updating = false;

  function readMark() {
    try { return +sessionStorage.getItem(LOOP_KEY) || 0; } catch (e) { return 0; }
  }
  function writeMark() {
    try { sessionStorage.setItem(LOOP_KEY, String(Date.now())); } catch (e) {}
  }

  function safeToReload() {
    var open = ['sheet', 'confirm', 'taxi'].some(function (id) {
      var n = document.getElementById(id);
      return n && !n.hidden;
    });
    var ae = document.activeElement;
    var typing = ae && (ae.tagName === 'TEXTAREA' || (ae.tagName === 'INPUT' && ae.type !== 'checkbox'));
    return !open && !typing;
  }

  // Pide al worker en espera que tome el control; si no es buen momento,
  // reintenta cada 2 s (una sola cadena de reintento).
  function applyUpdate(reg) {
    if (!reg.waiting) return;
    if (!safeToReload()) {
      if (retryTimer) return;
      retryTimer = setTimeout(function () { retryTimer = null; applyUpdate(reg); }, 2000);
      return;
    }
    updating = true;
    reg.waiting.postMessage({ type: 'SKIP_WAITING' });
  }

  function track(reg, sw) {
    if (!sw) return;
    sw.addEventListener('statechange', function () {
      if (sw.state === 'installed' && navigator.serviceWorker.controller) applyUpdate(reg);
    });
  }

  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!updating || reloaded) return;
    if (Date.now() - readMark() < 10000) {
      console.warn('[sw] recarga omitida: posible bucle de actualización.');
      writeMark();
      return;
    }
    reloaded = true;
    writeMark();
    location.reload();
  });

  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      reg.update().catch(function () {});
      if (reg.waiting && navigator.serviceWorker.controller) applyUpdate(reg);
      track(reg, reg.installing);
      reg.addEventListener('updatefound', function () { track(reg, reg.installing); });
      // Al volver a primer plano tras un rato, buscar versión nueva.
      var lastCheck = Date.now();
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState !== 'visible') return;
        if (Date.now() - lastCheck < 15 * 60 * 1000) return;
        lastCheck = Date.now();
        reg.update().catch(function () {});
      });
    }).catch(function (e) {
      console.warn('[sw] registro fallido:', e);
    });
  });
})();
