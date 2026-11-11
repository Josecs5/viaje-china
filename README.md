# Viaje a China — Planificador

PWA con modo offline para planificar un viaje a China: vuelos con escalas,
transportes (trenes de alta velocidad, autobuses, DiDi…), alojamientos,
excursiones, sitios para comer, lugares que ver y espectáculos — **todo
editable desde el móvil**, sin datos precargados. Genera un **itinerario
diario** automático que ordena cada elemento por hora y marca la
**viabilidad de cada día** (luz disponible con SunCalc, en hora de Pekín, y
tiempo de trayecto entre paradas; los trenes cuentan como hora fija con
30 min para el control de la estación). Avisa de **lluvia fuerte** por día
(Open-Meteo) y cada día tiene un campo de **diario de viaje** y la **ruta del
día**: mapa con las paradas numeradas y enlaces a Amap, Apple Maps y
Google Maps. Incluye un **registro de gastos** en CNY y € con el tipo de
cambio del BCE (frankfurter.dev, guardado en caché, con ajuste manual) y un
resumen por categoría. La pestaña **Dónde comer** agrupa tus sitios por
ciudad, ordenados por distancia en línea recta al alojamiento, con el precio
medio que hayas apuntado y un mapa por ciudad (Leaflet). La pestaña **Qué
ver** agrupa, plegados, **Transporte y guías** (trenes con 12306 y
Trip.com, DiDi y metro, Alipay y WeChat Pay con tarjeta extranjera, eSIM o
VPN, costumbres, comida por regiones, calendario de **temporada por región**
y un plan B para días de lluvia o contaminación), **Espectáculos locales**
(acrobacias, ópera de Pekín y ópera de Sichuan cerca de cada alojamiento,
con las noches de tu estancia que coinciden con los días de función) y tus
**notas**. Datos incluye la checklist de **tareas antes de viajar** (entrada
sin visado, pasaporte, tarjeta de llegada, Alipay y WeChat Pay, mapas
offline de Amap, eSIM, facturación de los vuelos…) y una **lista de
equipaje** con checklist, ítems propios y borrado.

Pensada para China: cada alojamiento, sitio para comer, lugar o espectáculo
tiene su **nombre y dirección en caracteres chinos**, y el botón **«Enseñar al
taxista»** los muestra a pantalla completa y en letra grande. Como Google
Maps no funciona en China, los enlaces van a **Amap (Gaode)** y a **Apple
Maps**, con Google como opción secundaria.

Todo se guarda en `localStorage` del navegador: los datos no salen del dispositivo.

## Uso

Abre `index.html` servido por HTTP(S) (no vale `file://`):

```bash
python -m http.server 8000
# luego abre http://localhost:8000
```

Para instalarla como app en el móvil: ábrela en el navegador → menú de
compartir → **Añadir a pantalla de inicio**. Se abre en modo standalone.

La app viene con el **viaje real precargado**: fechas (7–23 de mayo de
2027), los cinco viajeros (solo el nombre de pila: la web es pública) y los
vuelos de ida (Lufthansa, Madrid → Frankfurt → Shanghái Pudong) y vuelta
(Air China, Pekín → Madrid) con su equipaje. Todo es editable. Añade
alojamientos (con su ciudad y ubicación), transportes y excursiones desde la
pestaña Datos, y el resto (itinerario, dónde comer, espectáculos cercanos)
se genera solo. Los datos precargados se aplican una sola vez y solo añaden
lo que falte: no pisan nada de quien ya tuviera la app guardada. Ábrela al menos una vez con conexión antes de salir: así queda
guardada y arranca sin cobertura.

### Coordenadas: WGS-84 y GCJ-02

Las coordenadas se guardan siempre en **WGS-84** (las del GPS y
OpenStreetMap, que usan el mapa de la app y el botón «Buscar»). En China,
Amap trabaja en **GCJ-02**, un sistema desplazado unos 500 m, así que la
app convierte a GCJ-02 **solo al generar los enlaces de Amap**. Por eso:

- Usa «Buscar» (OpenStreetMap) o coordenadas de GPS/OpenStreetMap.
- **No pegues coordenadas copiadas de Amap** (ni de Baidu o webs chinas):
  ya vienen en GCJ-02 y, al convertirlas otra vez, el punto saldría
  desplazado. Ejemplo: la Ciudad Prohibida es 39.9174, 116.3908 en WGS-84
  (OpenStreetMap). El punto 39.9163, 116.3972 es GCJ-02: pegado tal cual en
  Amap cae en el Salón de la Armonía Suprema (太和殿), pero si se guarda en
  la app como WGS-84 el enlace de Amap sale unos 550 m al este, fuera del
  foso.

## Estructura

| Archivo | Contenido |
|---|---|
| `index.html` | Estructura y meta tags PWA/iOS |
| `style.css` | Tema «Ciudad Prohibida»: rojo de muralla (宫墙红), oro de teja (琉璃黄), verde azulado (青绿), tinta y papel de arroz; sellos, greca 回纹 y pestañas con caracteres a pincel. Modo claro y oscuro; responsive, móvil primero |
| `app.js` | Lógica: CRUD, motor de itinerario, gastos, dónde comer, conversión WGS-84 → GCJ-02 y enlaces a mapas, espectáculos, guías y registro del service worker |
| `sw.js` | Service worker: precache del shell |
| `vendor/` | Leaflet 1.9.4, SunCalc 1.9.0 y fuentes web servidas desde el repo (OFL): Noto Serif SC (宋体) para títulos y Ma Shan Zheng (pincel) para sellos, ambas recortadas a los caracteres que usa el diseño (~60 KB en total), y Manrope para el texto. La lista de caracteres está en `vendor/fonts/fonts.css` |
| `manifest.json` | Manifiesto PWA |
| `icons/` | Iconos 192 / 512 / maskable + apple-touch-icon + SVG |

Solo HTML, CSS y JavaScript. Sin frameworks ni paso de build. Service worker
para uso sin conexión; Leaflet, SunCalc y las fuentes van incluidos en el
repo (**nada se carga de Google Fonts**, que está bloqueado en China).

El shell (HTML/CSS/JS, Leaflet, SunCalc, fuentes, iconos) se guarda en la
primera visita con conexión, así que la app arranca sin cobertura. Los
mapas (teselas de OpenStreetMap), la búsqueda de ubicaciones, el tiempo y
el tipo de cambio necesitan conexión; sin ella se usa lo último guardado.

Los datos guardados llevan versión de esquema (`v`): cuando cambie su forma,
una migración los adapta sin perder lo que ya tenías. Las claves de
`localStorage` y la caché del service worker llevan el prefijo `china`, para
no chocar con otras apps publicadas en el mismo dominio de GitHub Pages
(como `viaje-tailandia`).

La app se actualiza sola: al detectar una versión nueva se recarga cuando no
hay ningún formulario abierto ni estás escribiendo. Si algo se queda raro,
cierra la app del todo y vuelve a abrirla, o borra los datos del sitio en el
navegador (se borran caché y datos). Al publicar una versión nueva, sube
`SHELL_CACHE` en `sw.js` y los `?v=` de `index.html` y del precache.

## Aviso

App personal sin ánimo de lucro. No está afiliada a ninguna aerolínea,
compañía ferroviaria, alojamiento, teatro ni operador turístico. Los tiempos
de trayecto son estimaciones aproximadas (línea recta × un factor de rodeo,
con velocidad de ciudad o de carretera), no rutas calculadas. Plazos de
visado, días de función, comisiones y demás datos marcados con
**[comprobar]** pueden cambiar: confírmalos en la fuente oficial antes de
viajar.
