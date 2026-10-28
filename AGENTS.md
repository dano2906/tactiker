# Tactiker

## Propósito del proyecto

Aplicación para manejar tácticas de fútbol. Soporta las modalidades de **fútbol 4, 5, 7 y 11**.

El objetivo es servir un **canvas** que actúe como terreno de juego, sobre el cual se colocan las **fichas de los jugadores** ordenadas tácticamente (formaciones/posiciones según la modalidad).

### Requisitos de dominio

- Modalidades: F4, F5, F7 y F11. Cada una tiene su cantidad de jugadores por equipo y sus dimensiones/proporciones de terreno propias.
- El terreno se renderiza en un canvas.
- Las fichas de jugadores se posicionan tácticamente sobre el terreno (formaciones por modalidad).

## Stack

- Preact 11 (nativo, sin `preact/compat`) + TypeScript (~7.0) + Vite 8 con `@preact/preset-vite`. JSX con `jsxImportSource: preact`; hooks desde `preact/hooks`
- Bun como gestor de paquetes (`bun.lock`)
- Lint con oxlint (`.oxlintrc.json`: plugins react, typescript, oxc)

## Comandos

- `bun run dev` — servidor de desarrollo
- `bun run build` — `tsc -b && vite build`
- `bun run lint` — oxlint
- `bun run preview` — preview del build

## Docker

- `Dockerfile` multi-etapa sobre `oven/bun`: `deps` (instala con `bun.lock` congelado) → `dev` (Vite con `--host 0.0.0.0`) → `build` → `prod` (`nginxinc/nginx-unprivileged`, usuario sin privilegios, puerto 8080, con healthcheck).
- `nginx.conf`: `/assets/` con caché inmutable (los archivos llevan hash), el resto `no-cache` y fallback a `index.html`; `sw.js` y `manifest.webmanifest` siempre `no-cache` (el manifiesto con su tipo MIME `application/manifest+json`).
- Dos ficheros Compose, con nombre de proyecto propio para que no se pisen (`tactiker-dev` y `tactiker-prod`); en ambos el servicio se llama `app` y solo publica en loopback:
  - `docker-compose.yml` (desarrollo): target `dev`, bind mount del código con recarga en caliente, `http://localhost:5173`. `docker compose up --build` · `docker compose down`.
  - `docker-compose.prod.yml` (producción): target `prod` (nginx), reinicio automático, `http://localhost:8080`. `docker compose -f docker-compose.prod.yml up -d --build` · `docker compose -f docker-compose.prod.yml down`.

## Convenciones Preact

- En campos de texto, número, color y rango usar `onInput` (el `onChange` de Preact solo salta al perder el foco); en checkbox, select y file `onChange`. Leer el valor con `e.currentTarget`.
- Tipos de eventos: los nativos (`PointerEvent`); `RefObject` desde `preact`.
- No hay React Compiler: no se memoiza automáticamente. Oxlint tiene desactivadas `react-hooks/exhaustive-deps` y `react/immutability` porque varios efectos leen las últimas props desde refs a propósito.

## Diseño (tokens compartidos)

- Una sola fuente de verdad en `src/index.css`: variables con los nombres de shadcn/ui (`--background`, `--foreground`, `--primary`, `--muted`, `--border`, `--ring`, `--radius`…) más las del terreno (`--pitch`, `--pitch-stripe`, `--pitch-line`, `--team-red`, `--team-blue`, `--neutral`, `--referee`) y tipografías. Tema único oscuro: grafito azulado y amarillo árbitro como único acento. Los puntos de ruptura (`App.css`) solo cambian la disposición; no redefinir colores, fuentes ni radios por ancho.
- El canvas lee esos mismos valores con `theme()` (`src/theme.ts`, cacheado) y `defaultColors()`: no escribir colores literales en `draw.ts`; añadir un token en CSS y leerlo desde `theme.ts`.
- Tipografía autoalojada en `public/fonts` (solo subconjunto latino, sin peticiones a terceros, precacheadas por el service worker): Outfit (variable, interfaz) y Barlow Condensed 600/700 (marcador, dorsales, títulos).
- Componentes al estilo shadcn/ui hechos con HTML nativo y CSS, sin Radix ni JavaScript extra: `button`/`.btn` (+ `.btn-primary`, `.btn-ghost`, `.btn-icon`, `.btn-sm`), campos, `select`, casilla con aspecto de interruptor, `.tabs`/`.tab`, `.badge`, `.glass`. Iconos: sprite SVG en `index.html` y componente `Icon` (`<Icon name="record" />`); no usar emojis ni glifos Unicode como iconos.
- Las pestañas sin etiqueta visible (solo icono) deben llevar `aria-label`.

## Rendimiento (no romper)

- La reproducción NO pasa por el estado en cada fotograma: `App` calcula `positionsAt` en un bucle rAF y dibuja con `pitchApi.draw` (imperativo) y actualiza la barra con `barApi.update` (modifica el mismo nodo de texto y el valor del rango). El estado solo se sincroniza al pausar o terminar (`commitPlayback`).
- Arrastrar fichas tampoco toca el estado: `Pitch` guarda posiciones temporales (`overrideRef`) y avisa con `onDrop` al soltar; el estado nuevo de posiciones sustituye al temporal.
- `Pitch` cachea la capa estática (césped y líneas) en un canvas fuera de pantalla por tamaño/modalidad, solo redimensiona el canvas cuando cambia el tamaño, limita el DPR a 2 y agrupa peticiones de dibujado con rAF.
- `recording.ts` precalcula pasos y duraciones por lista de movimientos (`WeakMap`), así que `positionsAt` es barato por fotograma.
- El mapa de calor se pinta dentro de la capa estática en caché (la clave incluye un id del mapa, `heatId`), no en cada fotograma: antes costaba ~5 ms por fotograma en raster por software y ahora ~0.
- `App` memoiza `tokens`, `groups` y usa un array vacío constante para las trayectorias ocultas (`NO_TRAILS`): `Pitch` redibuja cuando cambia la identidad de sus props, así que no deben recrearse en cada render.
- `gifenc` se carga con `import()` solo al generar un GIF (chunk aparte de ~9 KB).
- Las etiquetas del canvas (`drawLabel`) cachean la medida del texto.
- Medir rendimiento: perfil de CPU con CDP (`Profiler.start/stop`) sobre una reproducción; en headless la mayor parte es raster por software («(program)»), el JS propio es <5%.

## Dependencias

- Solo `preact` y `gifenc` en producción. No hay alternativa nativa a `gifenc` (el navegador no codifica GIF animado; `MediaRecorder` ya se usa para vídeo). Compresión de enlaces, portapapeles, `crypto.randomUUID`, `ResizeObserver`, `roundRect`, service worker y manifiesto son APIs nativas.
- `@preact/preset-vite` y `@babel/core` solo aportan recarga en caliente con estado (prefresh): el build de producción es idéntico (mismo hash) con la config de Vite vacía y `jsxImportSource` en `tsconfig.app.json`. Se mantienen por la experiencia de desarrollo; quitarlos deja `vite.config.ts` como `defineConfig({})` y recarga la página completa al editar.

## Estructura

- `src/main.tsx`, `src/App.tsx` — entrada, estado global y layout: terreno a pantalla completa (`.stage`) con elementos flotantes (`.hud-*`: título/jugada, herramientas de dibujo, grabación, vista), panel con pestañas (`.panel`: Campo · Grabar · Ficha · Jugadas · Exportar; Ficha se activa sola al seleccionar algo) y barra inferior (`.dock`: línea de tiempo opcional + reproducción). Estado de trabajo de la jugada activa + lista de jugadas (`scenes`: la activa tiene `data: null`, el resto un `SceneData` guardado; `stashActive`/`switchScene` los intercambian)
- `src/modes.ts` — modalidades (medidas del terreno y lista de `formations`; la primera es la de por defecto), tipos `Teams`/`TeamConfig` (formación y visibilidad por equipo, `left` rojo / `right` azul) y `layoutTeam`, `withSize` (medidas personalizadas del terreno: el área, el círculo y la portería escalan en proporción; límites en `SIZE_LIMITS`) y `lineKeys` (fichas de cada línea de campo). Una `Formation` incluye al portero como primera línea (ej. 4-4-2 = `[1, 4, 4, 2]`)
- `src/roster.ts` — datos personalizados de fichas (`Roster`: dorsal, nombre, posición y tamaño por clave de ficha), colores por defecto, `defaultRole`, `parseKey`/`keyTitle`. Claves de ficha: `left-N`/`right-N` (equipos; los N mayores que la formación son fichas añadidas), `neutral-N` (comodín, amarillo), `ref-N` (árbitro, oscuro) y `ball`
- `src/draw.ts` — dibujo en canvas sin framework: geometría, capa estática del terreno (`renderPitchLayer`) y `View` (zoom/desplazamiento; `clampView` impide sacar el terreno de la vista) y `tokenColor`; capa dinámica (`renderScene`: mapa de calor, jugada superpuesta tenue («ghost»), capas de análisis —líneas con distancia entre ellas, bloque con envolvente convexa, cobertura—, dibujos, trayectorias con etiquetas de medidas, fichas, balón y aro del poseedor)
- `src/Pitch.tsx` — componente del canvas: ciclo de dibujado (caché de capa, rAF), eventos de puntero (arrastre multipuntero al grabar, herramientas de dibujo, selección de fichas y de recorridos, tiradores para editar el recorrido seleccionado) y `PitchApi` (`draw`, `zoomBy`, `resetView`). Zoom con rueda, pellizco (dos dedos sobre vacío) y botones; con zoom>1 se arrastra el vacío para mover la vista. Fuera de la grabación, arrastrar una ficha sin movimientos la coloca (`placeable`/`onPlace`); un clic la selecciona. Recibe `canvasRef` para exportar
- `src/annotations.ts` — tipo `Annotation` (flecha, trazo libre con o sin punta —«curva»—, zona, elipse, cono, texto; coordenadas normalizadas), `Tool`, dibujo en canvas y detección de clic (`hitAnnotation`) para borrar
- `src/recording.ts` — modelo de grabación. `Positions` por clave de ficha (`${side}-${slot}` o `ball`). `Movement` = un arrastre (trayectoria con tiempos) con un `step`: los movimientos del mismo paso se reproducen a la vez, los pasos uno tras otro con pausa; varios movimientos de la misma ficha en un paso se encadenan. El balón tiene poseedor: `Movement.carrierAfter` (quién lo lleva tras el movimiento) y `linked` (movimiento del balón generado al llevarlo un jugador; se deshace/rehace junto al del jugador); `carrierAt` lo deriva. `movementStats` da metros, segundos y km/h. `Movement.delay` es la pausa previa dentro de su paso. Edición: `editMovement` (duración, pausa o nuevos puntos; el movimiento `linked` del balón se recalcula con el del jugador), `canRemoveMovement`/`removeMovement`, `canMoveEnd`, `paceToSpeed` (duración para una velocidad media), `rescalePath`/`retimePoints` y `pasteMovements` (traslada los recorridos copiados a donde está cada ficha). `schedule` da el inicio/fin absoluto de cada movimiento (línea de tiempo). Incluye `groupSteps`, `positionsAt`, `totalDuration`, `boundaries` y `straighten` (Ramer–Douglas–Peucker, tolerancia 3% del ancho, tiempos redistribuidos por distancia)
- `src/PlaybackBar.tsx` — reproducción: anterior/pausa-play/siguiente paso, línea de tiempo, tiempo y velocidad (0.5x/1x/2x)
- `src/DrawToolbar.tsx` — herramientas de dibujo (mover, flecha, trazo libre, flecha curva, zona, círculo/elipse, cono, texto, borrar), color y limpiar; píldora vertical flotante a la izquierda
- `src/Scenes.tsx` — pestañas de jugadas, renombrar, nueva, continuar desde el final, borrar y reproducir todas en secuencia
- `src/MovementPanel.tsx` — editor del movimiento seleccionado: duración, pausa previa, velocidad (km/h), «Velocidad realista» y borrar
- `src/Timeline.tsx` — línea de tiempo por jugador: una fila por ficha con bloques por movimiento; arrastrar un bloque cambia la pausa previa, su borde derecho la duración; la cabeza de reproducción se mueve imperativamente (`TimelineApi`)
- `src/PlayerPanel.tsx` — editor de la ficha seleccionada (dorsal, nombre, posición, tamaño), metros recorridos, «Dar balón» y «Quitar ficha»
- `src/heatmap.ts` — `buildHeatmap`: mapa de calor real (muestrea la jugada completa y reparte cada posición en una rejilla suavizada); se calcula con `useMemo` en `App`
- `src/templates.ts` — plantillas de jugada (`TEMPLATES`: córner, saque de banda, salida de balón, contraataque 3 contra 2) generadas con un `Builder` que encadena movimientos continuos y se adapta a la modalidad/formaciones; se aplican como jugada nueva
- `src/SavedTactics.tsx` — UI de tácticas guardadas (guardar, cargar, borrar, exportar, importar)
- `src/storage.ts` — `SceneData`/`Scene` (modalidad, medidas `size`, equipos, balón, poseedor inicial `carrier`, colores, roster, posición inicial, movimientos, anotaciones) y `Tactic` (nombre + lista de `Scene`); persistencia en `localStorage` (clave `tactiker.tactics`), validación (`parseTactic(s)`; tolera formatos antiguos: táctica de una sola jugada, sin `step`/`ball`/`roster`/`colors`/`annotations`/`size`/`carrier`) y descarga JSON
- `src/Icon.tsx`, `src/theme.ts` — icono del sprite y lectura de tokens CSS para el canvas
- `src/exporting.ts` — descarga de PNG y vídeo (`MediaRecorder` sobre el canvas; webm o mp4 según navegador)
- `src/gif.ts` — `encodeGif` (dependencia `gifenc`, tipos en `src/gifenc.d.ts`): GIF animado calculado fotograma a fotograma (12 fps, máx. 240 fotogramas, 640 px de ancho, pausa al inicio y al final), sin depender del tiempo real; cede el hilo cada pocos fotogramas para mostrar el avance
- `src/share.ts` — enlaces para compartir: `encodeTactic`/`decodeTactic` (JSON redondeado + `deflate-raw` con `CompressionStream` + base64url, prefijo `z.`; `j.` si el navegador no comprime) en `#t=<código>`; `decodeTactic` valida con `parseTactic` y limita el tamaño descomprimido a 4 MB
- `public/manifest.webmanifest`, `public/sw.js`, `public/icon*.svg|png` — app instalable (PWA): manifiesto con orientación horizontal, iconos (normal y maskable) y service worker (navegación red-primero con la última página como respaldo sin conexión; `/assets/` caché-primero y se podan los archivos que ya no usa la página; resto stale-while-revalidate). Se registra solo en producción (`main.tsx`). Si se cambia la estrategia de caché hay que subir `CACHE` en `sw.js`
- `public/` — assets estáticos

## Estado actual

- Pestaña «Campo» del panel para elegir F4/F5/F7/F11. Terreno en canvas con fichas numeradas de dos equipos y balón opcional (ficha arrastrable y grabable).
- Medidas del terreno: largo y ancho editables (m, límites en `SIZE_LIMITS`), por jugada; las posiciones son relativas, así que cambiarlas conserva la grabación. Cambiar de modalidad las restablece.
- Cada equipo puede mostrarse/ocultarse, tener su propia formación (F4: 2-1, 1-2, 1-1-1; F5: 2-2, 1-2-1, 3-1, 2-1-1; F7: 2-3-1, 3-2-1, 2-2-2, 3-3; F11: 4-4-2, 4-3-3, 3-5-2, 4-2-3-1, 5-3-2, 4-1-4-1) y su color. Cambiar formación, visibilidad, balón o modalidad reinicia la grabación de la jugada activa.
- Personalización: con la grabación parada, clic en una ficha para editar dorsal, nombre y posición; selector «Etiquetas» para mostrar nombre o posición bajo cada ficha. El panel muestra los metros que recorre la ficha.
- Balón: «Dar balón» (panel de jugador, antes de grabar movimientos) lo pega a una ficha (aro discontinuo). Al grabar, mover al poseedor mueve el balón con él (movimiento `linked`). Arrastrar el balón es un pase/disparo: si termina junto a un jugador, se pega a él; si no, queda libre.
- Grabación por pasos: Grabar empieza desde el inicio de la jugada (formación o, en jugadas creadas con «Continuar», el final de la anterior); lo arrastrado en un mismo paso se reproduce a la vez; «Nuevo paso» cierra el paso. Deshacer/Rehacer; Limpiar.
- Vista: «Trayectorias» (con flecha), «Medidas (m y km/h)» sobre cada trayectoria (la velocidad es la de la reproducción tal como se grabó), y análisis táctico en vivo, también durante la reproducción: «Líneas y distancias» (une cada línea de campo y muestra la distancia en profundidad entre líneas), «Bloque del equipo» (envolvente de los jugadores de campo) y «Cobertura» (círculo de 14% del ancho alrededor de cada jugador).
- Edición de movimientos (con la grabación parada): clic en una trayectoria la selecciona (se resalta con tiradores). Arrastrar un tirador mueve ese punto; arrastrar uno intermedio crea un punto nuevo; el primer punto está fijo y el último solo se mueve si es el último movimiento de esa ficha. El panel «Movimiento» permite cambiar duración, pausa previa y velocidad, aplicar una velocidad realista y borrar (solo si no hay movimientos posteriores de la ficha). Editar no es deshacible con Deshacer (ese solo quita movimientos grabados).
- Velocidad realista: casilla «Velocidad realista al soltar» (jugador 18 km/h, balón 45 km/h por defecto, editables) fija la duración de cada movimiento nuevo a esa velocidad media en lugar de la del arrastre.
- Línea de tiempo por jugador: casilla en Vista; muestra y permite desplazar/alargar cada movimiento (los del balón enlazados a un jugador van con él).
- Copiar/pegar: «Copiar» guarda el movimiento seleccionado (o todos) y «Pegar» lo añade al final de la jugada activa, también de otra jugada, trasladado a donde está cada ficha. «Duplicar jugada» copia la jugada completa.
- Zoom y desplazamiento del terreno (rueda, pellizco, botones ＋ － ⤢); no se guarda con la táctica.
- Fichas: «+ Rojo», «+ Azul», «+ Comodín», «+ Árbitro» (sección Fichas) añaden fichas a la posición inicial; arrastrar una ficha sin movimientos grabados la coloca; el panel de ficha permite cambiar su tamaño y quitarla. Cambiar formación/visibilidad/balón/modalidad regenera las fichas de equipo y pierde las añadidas.
- Plantillas: cuatro jugadas de partida (córner, saque de banda, salida de balón, contraataque); cada una crea una jugada nueva con tus formaciones y medidas.
- Mapa de calor (Vista): ninguno, equipo rojo, equipo azul, balón o ficha seleccionada, acumulando toda la jugada.
- Comparar jugadas: en Jugadas, «Comparar con» superpone otra jugada en tenue (recorridos punteados y fichas translúcidas) y se reproduce sincronizada con la actual. No hay vista lado a lado.
- Compartir: «Copiar enlace para compartir» (sección Exportar) copia una URL con toda la táctica (todas las jugadas); al abrirla en otro dispositivo se carga sola y se limpia la URL. Avisa si el enlace pasa de 8000 caracteres.
- GIF animado de la jugada activa (sección Exportar); durante la generación se bloquea la interfaz y se ocultan selecciones y aro del poseedor.
- App instalable: botón «Instalar app» cuando el navegador lo permite (`beforeinstallprompt`); funciona sin conexión tras la primera visita.
- Dibujo: píldora de herramientas a la izquierda del terreno con flecha, trazo libre, flecha curva a mano alzada, zona sombreada, círculo/elipse, cono, texto y borrador, con color; los dibujos son estáticos y pertenecen a la jugada.
- Jugadas: una táctica es una secuencia de jugadas (pestañas). «Nueva» parte de la formación inicial; «Continuar» parte de las posiciones finales de la actual (y del poseedor del balón). «Reproducir todas» encadena las jugadas con una pausa (`SCENE_GAP_MS`); `sequenceRef`/`nextSceneRef` gobiernan la secuencia y cualquier acción del usuario la detiene (`stopSequence`).
- Reproducción (barra inferior): play/pausa, línea de tiempo, paso anterior/siguiente, velocidad 0.5x/1x/2x cambiable durante el play.
- Tácticas: guardar con nombre en `localStorage` (todas las jugadas), cargar, borrar, exportar/importar JSON.
- Exportar: imagen PNG del canvas, vídeo de la jugada activa y, con varias jugadas, vídeo de todas en secuencia (se graba reproduciendo a 1x).
- Móvil/táctil: el terreno es siempre apaisado. Con `(max-width: 900px), (max-height: 500px)` (la misma consulta que `COMPACT_QUERY` en `App.tsx`) cambia la disposición, nunca los tokens: la barra inferior reproduce y aloja las pestañas del panel (solo iconos), el contenido del panel flota como hoja encima (se abre al tocar una pestaña y se cierra al tocar la activa) y la grabación pasa a una píldora vertical con un botón grande bajo el pulgar. En vertical aparece un aviso para girar el móvil. Botón de pantalla completa que intenta bloquear la orientación horizontal. Eventos de puntero con `touch-action: none`, radio de captura mayor con el dedo y objetivos de toque de 44 px en `pointer: coarse`.
- Modo presentación (icono de televisión): oculta la interfaz de edición, inclina el terreno con perspectiva CSS y desactiva su interacción; «Salir de la presentación» lo restaura.
