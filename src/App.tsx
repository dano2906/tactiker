import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import {
  MODES, SIDES, SIDE_LABELS, SIZE_LIMITS, defaultTeams, getFormation, lineKeys, playerCount, withSize,
  type Mode, type ModeId, type Side, type Size, type Teams,
} from './modes'
import { DEFAULT_ANNOTATION_COLOR, type Annotation, type Tool } from './annotations'
import DrawToolbar from './DrawToolbar'
import Icon from './Icon'
import { downloadBlob, downloadPng, pickVideoMime, safeName } from './exporting'
import { encodeGif } from './gif'
import { LONG_LINK, codeFromLocation, decodeTactic, encodeTactic, shareUrl } from './share'
import MovementPanel from './MovementPanel'
import PlaybackBar, { type BarApi } from './PlaybackBar'
import { tokenColor, type Analysis } from './draw'
import Pitch, { type PitchApi, type TokenLabel } from './Pitch'
import PlayerPanel from './PlayerPanel'
import { SIZE_RANGE, defaultColors, defaultRole, keyTitle, parseKey, type LabelMode, type PlayerInfo, type Roster } from './roster'
import { buildHeatmap, type HeatTarget } from './heatmap'
import { TEMPLATES, type Template } from './templates'
import SavedTactics from './SavedTactics'
import Timeline, { type TimelineApi } from './Timeline'
import Scenes from './Scenes'
import {
  BALL_KEY, boundaries, canMoveEnd, canRemoveMovement, carrierAt, editMovement, groupSteps, initialPositions,
  movementStats, paceToSpeed, pasteMovements, positionsAt, removeMovement, straighten, totalDuration,
  type MovementEdit,
  type Movement, type PathPoint, type Positions,
} from './recording'
import {
  downloadTactic, loadTactics, parseTactics, persistTactics, type SceneData, type Tactic,
} from './storage'
import './App.css'

type Status = 'idle' | 'recording' | 'playing'

type PanelTab = 'campo' | 'grabar' | 'seleccion' | 'jugadas' | 'exportar'

const TABS: { id: PanelTab; label: string; icon: string }[] = [
  { id: 'campo', label: 'Campo', icon: 'sliders' },
  { id: 'grabar', label: 'Grabar', icon: 'record' },
  { id: 'seleccion', label: 'Ficha', icon: 'user' },
  { id: 'jugadas', label: 'Jugadas', icon: 'layers' },
  { id: 'exportar', label: 'Exportar', icon: 'share' },
]

/** Evento no estándar de Chrome/Edge que permite mostrar el aviso de instalación cuando queramos. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
}

const SPEEDS = [0.5, 1, 2]

/** Sin trayectorias: siempre el mismo array, para que el terreno no se redibuje sin motivo. */
const NO_TRAILS: Movement[] = []

/** Pausa entre jugadas al reproducir la secuencia. */
const SCENE_GAP_MS = 600
/** Distancia (m) a la que el balón queda pegado al jugador que lo lleva. */
const BALL_OFFSET_M = 1.4
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** Móviles y tablets: el menú pasa a ser un cajón sobre el terreno. */
const COMPACT_QUERY = '(max-width: 900px), (max-height: 500px)'

interface SceneSlot {
  name: string
  /** Datos guardados; `null` en la jugada activa, cuyo estado vive en el componente. */
  data: SceneData | null
}

function App() {
  const [modeId, setModeId] = useState<ModeId>('f11')
  /** Escritorio: panel lateral visible u oculto. Móvil: hoja inferior desplegada o solo con las pestañas. */
  const [panelOpen, setPanelOpen] = useState(() => !window.matchMedia(COMPACT_QUERY).matches)
  const [tab, setTab] = useState<PanelTab>('campo')
  /** Modo presentación: terreno inclinado, sin interfaz de edición. */
  const [presenting, setPresenting] = useState(false)
  const [hintDismissed, setHintDismissed] = useState(false)
  const baseMode = MODES.find((m) => m.id === modeId)!
  const [size, setSize] = useState<Size | null>(null)
  /** Modalidad con las medidas personalizadas: es la que usan el dibujo y las mediciones. */
  const mode = withSize(baseMode, size)

  const [teams, setTeams] = useState<Teams>(() => defaultTeams(baseMode))
  const [ball, setBall] = useState(true)
  const [colors, setColors] = useState(defaultColors)
  const [roster, setRoster] = useState<Roster>({})
  const [selected, setSelected] = useState<string | null>(null)
  const [showTrails, setShowTrails] = useState(true)
  const [labelMode, setLabelMode] = useState<LabelMode>('none')
  const [currentStep, setCurrentStep] = useState(0)
  const [positions, setPositions] = useState<Positions>(() => initialPositions(mode, teams, true))
  const [start, setStart] = useState<Positions>(positions)
  const [movements, setMovements] = useState<Movement[]>([])
  const [redo, setRedo] = useState<Movement[][]>([])
  const [startCarrier, setStartCarrier] = useState<string | null>(null)
  const [measures, setMeasures] = useState(false)
  const [analysis, setAnalysis] = useState<Analysis>({ lines: false, block: false, coverage: false })
  const [sequencing, setSequencing] = useState(false)
  const [heatTarget, setHeatTarget] = useState<HeatTarget>('off')
  const [compareIndex, setCompareIndex] = useState<number | null>(null)
  const [zoom, setZoom] = useState(1)
  const [selMove, setSelMove] = useState<number | null>(null)
  const [showTimeline, setShowTimeline] = useState(false)
  const [clipboard, setClipboard] = useState<Movement[] | null>(null)
  /** Al soltar una ficha, ajusta la duración a una velocidad media (km/h) en vez de la del arrastre. */
  const [realistic, setRealistic] = useState({ on: false, player: 18, ball: 45 })
  const [status, setStatus] = useState<Status>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [tactics, setTactics] = useState<Tactic[]>(loadTactics)
  const [tool, setTool] = useState<Tool>('select')
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [annotationColor, setAnnotationColor] = useState(DEFAULT_ANNOTATION_COLOR)
  const [scenes, setScenes] = useState<SceneSlot[]>([{ name: 'Jugada 1', data: null }])
  const [activeScene, setActiveScene] = useState(0)
  const [exporting, setExporting] = useState(false)
  /** Avance (0..1) de la generación del GIF; `null` si no se está generando. */
  const [gifProgress, setGifProgress] = useState<number | null>(null)
  /** Aviso breve bajo los botones de exportar (enlace copiado, errores…). */
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  /** Evento del navegador que permite instalar la app (solo existe si es instalable y aún no lo está). */
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const pitchApi = useRef<PitchApi | null>(null)
  const barApi = useRef<BarApi | null>(null)
  const timelineApi = useRef<TimelineApi | null>(null)
  // Refs para poder cambiar la velocidad o avanzar el tiempo sin reiniciar el efecto de reproducción.
  const speedRef = useRef(speed)
  const elapsedRef = useRef(0)
  const sequenceRef = useRef(false)
  const sequenceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const nextSceneRef = useRef<() => void>(() => {})

  const total = totalDuration(movements)
  const busy = status !== 'idle' || sequencing || gifProgress !== null
  const carrier = carrierAt(startCarrier, movements)
  const ghostData =
    compareIndex !== null && compareIndex !== activeScene ? (scenes[compareIndex]?.data ?? null) : null

  const stopSequence = () => {
    clearTimeout(sequenceTimer.current)
    sequenceRef.current = false
    setSequencing(false)
  }

  /** Deja el terreno en el estado final de `list` y el cursor al final. */
  const showEnd = (list: Movement[], from: Positions) => {
    const end = totalDuration(list)
    elapsedRef.current = end
    setElapsed(end)
    setPositions(positionsAt(from, list, end))
  }

  const load = (
    next: {
      mode: Mode
      size: Size | null
      teams: Teams
      ball: boolean
      carrier: string | null
      start: Positions
      movements: Movement[]
      roster?: Roster
      colors?: Record<Side, string>
      annotations?: Annotation[]
    },
    keepSequence = false,
  ) => {
    if (!keepSequence) stopSequence()
    setModeId(next.mode.id)
    setSize(next.size)
    setTeams(next.teams)
    setBall(next.ball)
    setStartCarrier(next.carrier)
    if (next.roster) setRoster(next.roster)
    if (next.colors) setColors(next.colors)
    if (next.annotations) setAnnotations(next.annotations)
    setSelected(null)
    setSelMove(null)
    setCurrentStep(0)
    setStart(next.start)
    setMovements(next.movements)
    setRedo([])
    setStatus('idle')
    showEnd(next.movements, next.start)
  }

  /** Vuelve a la formación inicial con los cambios indicados, sin movimientos grabados. */
  const reset = (
    changes: { mode?: Mode; size?: Size | null; teams?: Teams; ball?: boolean; roster?: Roster } = {},
  ) => {
    const nextMode = changes.mode ?? baseMode
    const nextSize = changes.size === undefined ? size : changes.size
    const nextTeams = changes.teams ?? teams
    const nextBall = changes.ball ?? ball
    load({
      mode: nextMode,
      size: nextSize,
      teams: nextTeams,
      ball: nextBall,
      carrier: null,
      start: initialPositions(nextMode, nextTeams, nextBall),
      movements: [],
      roster: changes.roster,
    })
  }

  const selectMode = (id: ModeId) => {
    const next = MODES.find((m) => m.id === id)!
    // Los slots de otra modalidad no se corresponden: se limpian los datos de jugadores y las medidas.
    reset({ mode: next, size: null, teams: defaultTeams(next), roster: {} })
  }

  const updateTeam = (side: Side, patch: Partial<Teams[Side]>) =>
    reset({ teams: { ...teams, [side]: { ...teams[side], ...patch } } })

  /** Las posiciones son relativas al terreno, así que cambiar las medidas conserva la grabación. */
  const updateSize = (patch: Partial<Size>) =>
    setSize({ length: size?.length ?? baseMode.length, width: size?.width ?? baseMode.width, ...patch })

  /** Empieza a grabar desde el inicio de la jugada (formación, o final de la anterior si se creó con «Continuar»). */
  const startRecording = () => {
    setTool('select')
    load({
      mode: baseMode, size, teams, ball, carrier: startCarrier, start, movements: [],
    })
    setStatus('recording')
  }

  const stopRecording = () => {
    setStatus('idle')
    showEnd(movements, start)
  }

  /** Ficha de jugador (no el balón) más cercana a `pt`, si está lo bastante cerca para recibir el balón. */
  const playerNear = (pt: { x: number; y: number }): string | null => {
    const reach = Math.max(1.2, mode.width * 0.045)
    let best: string | null = null
    let bestDist = reach
    for (const [key, p] of Object.entries(positions)) {
      if (key === BALL_KEY) continue
      const d = Math.hypot((p.x - pt.x) * mode.length, (p.y - pt.y) * mode.width)
      if (d <= bestDist) {
        best = key
        bestDist = d
      }
    }
    return best
  }

  /** Posición del balón cuando lo lleva la ficha `key` que está en `at`. */
  const carriedBallAt = (key: string, at: { x: number; y: number }) => ({
    x: clamp01(at.x + ((key.startsWith('left') ? 1 : -1) * BALL_OFFSET_M) / mode.length),
    y: at.y,
  })

  const handleDrop = (key: string, path: PathPoint[]) => {
    const a = path[0]
    const b = path[path.length - 1]
    if (Math.hypot(a.x - b.x, a.y - b.y) < 0.005) {
      // Arrastre sin desplazamiento: se devuelve la ficha a donde estaba.
      setPositions((p) => ({ ...p, [key]: { x: a.x, y: a.y } }))
      return
    }
    let smooth = straighten(path, mode)
    if (realistic.on) smooth = paceToSpeed(smooth, mode, key === BALL_KEY ? realistic.ball : realistic.player)
    const added: Movement[] = []
    const moved: Positions = {}

    if (key === BALL_KEY) {
      // Pase o disparo: si el balón llega junto a un jugador, se queda con él.
      const receiver = playerNear(b)
      if (receiver) smooth[smooth.length - 1] = { ...smooth[smooth.length - 1], ...carriedBallAt(receiver, positions[receiver]) }
      const end = smooth[smooth.length - 1]
      moved[key] = { x: end.x, y: end.y }
      added.push({ key, path: smooth, step: currentStep, carrierAfter: receiver })
    } else {
      const end = smooth[smooth.length - 1]
      moved[key] = { x: end.x, y: end.y }
      added.push({ key, path: smooth, step: currentStep })
      const ballPos = positions[BALL_KEY]
      if (carrier === key && ballPos) {
        // El balón acompaña a quien lo lleva con el mismo recorrido y tiempos.
        const dx = ballPos.x - a.x
        const dy = ballPos.y - a.y
        const ballPath = smooth.map((pt) => ({ x: clamp01(pt.x + dx), y: clamp01(pt.y + dy), t: pt.t }))
        const ballEnd = ballPath[ballPath.length - 1]
        moved[BALL_KEY] = { x: ballEnd.x, y: ballEnd.y }
        added.push({ key: BALL_KEY, path: ballPath, step: currentStep, carrierAfter: key, linked: true })
      }
    }
    setPositions((p) => ({ ...p, ...moved }))
    setMovements((m) => [...m, ...added])
    setRedo([])
  }

  /** Edita un movimiento (duración, pausa o recorrido) y deja la jugada en su estado final. */
  const applyEdit = (index: number, edit: MovementEdit) => {
    const target = movements[index]?.linked ? index - 1 : index
    const next = editMovement(movements, target, edit, mode)
    if (next === movements) return
    setMovements(next)
    setRedo([])
    showEnd(next, start)
  }

  const removeSelectedMovement = () => {
    if (selMoveIndex === null || !canRemoveMovement(movements, selMoveIndex)) return
    const next = removeMovement(movements, selMoveIndex)
    setMovements(next)
    setRedo([])
    setSelMove(null)
    setCurrentStep(next.length ? next[next.length - 1].step : 0)
    showEnd(next, start)
  }

  /** Copia el movimiento seleccionado (con el del balón que lo acompaña) o, si no hay, todos. */
  const copyMovements = () => {
    if (selMoveIndex === null) {
      setClipboard(movements)
      return
    }
    const partner = movements[selMoveIndex + 1]
    setClipboard(partner?.linked ? [movements[selMoveIndex], partner] : [movements[selMoveIndex]])
  }

  /** Pega al final de la jugada lo copiado (aunque venga de otra jugada). */
  const pasteClipboard = () => {
    if (!clipboard) return
    const pasted = pasteMovements(clipboard, movements, positionsAt(start, movements, total))
    if (pasted.length === 0) return
    const next = [...movements, ...pasted]
    setMovements(next)
    setRedo([])
    setCurrentStep(next[next.length - 1].step)
    showEnd(next, start)
  }

  /** Las fichas sin movimientos grabados se pueden colocar arrastrándolas (fuera de la grabación). */
  const placeable = (key: string) =>
    status === 'idle' && !sequencing && !movements.some((m) => m.key === key)

  const placeToken = (key: string, x: number, y: number) => {
    const updates: Positions = { [key]: { x, y } }
    if (key === BALL_KEY) setStartCarrier(null)
    else if (startCarrier === key && BALL_KEY in positions && placeable(BALL_KEY)) {
      // si lleva el balón, el balón va con la ficha
      updates[BALL_KEY] = carriedBallAt(key, { x, y })
    }
    setStart((s) => ({ ...s, ...updates }))
    setPositions((p) => ({ ...p, ...updates }))
  }

  const addToken = (kind: 'left' | 'right' | 'neutral' | 'ref') => {
    const slots = Object.keys(positions).filter((k) => k.startsWith(`${kind}-`)).map((k) => parseKey(k).slot)
    const key = `${kind}-${Math.max(0, ...slots) + 1}`
    const at = { left: { x: 0.3, y: 0.5 }, right: { x: 0.7, y: 0.5 }, neutral: { x: 0.5, y: 0.12 }, ref: { x: 0.5, y: 0.88 } }[kind]
    setStart((s) => ({ ...s, [key]: at }))
    setPositions((p) => ({ ...p, [key]: at }))
    setSelected(key)
    setSelMove(null)
  }

  const removeToken = (key: string) => {
    const without = (p: Positions) => Object.fromEntries(Object.entries(p).filter(([k]) => k !== key))
    setStart(without)
    setPositions(without)
    setRoster((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== key)))
    if (startCarrier === key) setStartCarrier(null)
    setSelected(null)
  }

  /** Crea una jugada nueva a partir de una plantilla (no toca la actual). */
  const applyTemplate = (template: Template) => {
    const forced: Teams = {
      left: { ...teams.left, visible: true },
      right: { ...teams.right, visible: true },
    }
    const built = template.build(mode, forced)
    const stashed = stashActive()
    setScenes([...stashed, { name: template.name, data: null }])
    setActiveScene(scenes.length)
    load({
      mode: baseMode, size, teams: forced, ball: true, carrier: built.carrier,
      start: built.start, movements: built.movements, annotations: [],
    })
  }

  /** El balón empieza pegado a la ficha `key` (solo antes de grabar movimientos). */
  const giveBall = (key: string) => {
    const p = positions[key]
    if (!p || !(BALL_KEY in positions)) return
    const begin = { ...start, [BALL_KEY]: carriedBallAt(key, p) }
    setStart(begin)
    setPositions(begin)
    setStartCarrier(key)
  }

  /** Cierra el paso actual: lo siguiente que se mueva empezará en otro paso. */
  const newStep = () => setCurrentStep((s) => s + 1)
  const canStartStep = movements.some((m) => m.step === currentStep)

  const undo = () => {
    const last = movements[movements.length - 1]
    if (!last) return
    // El movimiento del balón generado al llevarlo se deshace junto con el del jugador.
    const group = last.linked && movements.length > 1 ? movements.slice(-2) : [last]
    const next = movements.slice(0, movements.length - group.length)
    setMovements(next)
    setRedo((r) => [...r, group])
    setCurrentStep(next.length ? next[next.length - 1].step : 0)
    showEnd(next, start)
  }

  const redoLast = () => {
    const group = redo[redo.length - 1]
    if (!group) return
    const next = [...movements, ...group]
    setMovements(next)
    setRedo((r) => r.slice(0, -1))
    setCurrentStep(group[0].step)
    showEnd(next, start)
  }

  const selectSpeed = (value: number) => {
    speedRef.current = value
    setSpeed(value)
  }

  const seek = (ms: number) => {
    stopSequence()
    const t = Math.min(Math.max(ms, 0), total)
    setStatus('idle')
    elapsedRef.current = t
    setElapsed(t)
    setPositions(positionsAt(start, movements, t))
  }

  const step = (direction: -1 | 1) => {
    const marks = boundaries(movements)
    const target =
      direction === 1
        ? (marks.find((t) => t > elapsed + 1) ?? total)
        : ([...marks].reverse().find((t) => t < elapsed - 1) ?? 0)
    seek(target)
  }

  /** Termina la reproducción en el instante `t`: el estado de la interfaz vuelve a coincidir con lo dibujado. */
  const commitPlayback = (t: number) => {
    elapsedRef.current = t
    setElapsed(t)
    setPositions(positionsAt(start, movements, t))
    setStatus('idle')
  }

  const togglePlay = () => {
    if (status === 'playing') {
      stopSequence()
      commitPlayback(elapsedRef.current)
      return
    }
    if (elapsed >= total) seek(0)
    setStatus('playing')
  }

  // Durante la reproducción se dibuja directamente en el canvas y la barra: la interfaz no se vuelve a pintar
  // en cada fotograma, solo al pausar o terminar (`commitPlayback`).
  useEffect(() => {
    if (status !== 'playing') return
    let last = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const next = elapsedRef.current + (now - last) * speedRef.current
      last = now
      const t = Math.min(next, total)
      elapsedRef.current = t
      pitchApi.current?.draw(
        positionsAt(start, movements, t),
        ghostData ? positionsAt(ghostData.start, ghostData.movements, t) : null,
      )
      barApi.current?.update(t)
      timelineApi.current?.update(t)
      if (next >= total) {
        const hasNext = sequenceRef.current && activeScene + 1 < scenes.length
        if (!hasNext) stopSequence()
        commitPlayback(total)
        if (hasNext) sequenceTimer.current = setTimeout(() => nextSceneRef.current(), SCENE_GAP_MS)
        return
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [status, start, movements, total, ghostData])

  const updateTactics = (next: Tactic[]) => {
    setTactics(next)
    persistTactics(next)
  }

  const snapshot = (): SceneData => ({
    modeId, size, teams, ball, carrier: startCarrier, colors, roster, start, movements, annotations,
  })

  const loadScene = (d: SceneData, keepSequence = false) =>
    load(
      {
        mode: MODES.find((m) => m.id === d.modeId)!,
        size: d.size,
        teams: d.teams,
        ball: d.ball,
        carrier: d.carrier,
        start: d.start,
        movements: d.movements,
        roster: d.roster,
        colors: d.colors,
        annotations: d.annotations,
      },
      keepSequence,
    )

  /** Guarda el estado de la jugada activa en su ranura para poder cambiar de jugada. */
  const stashActive = () =>
    scenes.map((s, i) => (i === activeScene ? { ...s, data: snapshot() } : s))

  /** Carga la jugada `index`; con `play` la empieza a reproducir desde el principio. */
  const switchScene = (index: number, play = false, keepSequence = false) => {
    if (index === activeScene) return
    const next = stashActive()
    const target = next[index].data!
    next[index] = { ...next[index], data: null }
    setScenes(next)
    setActiveScene(index)
    loadScene(target, keepSequence)
    if (play) {
      elapsedRef.current = 0
      setElapsed(0)
      setPositions(target.start)
      setStatus('playing')
    }
  }

  const restartPlayback = () => {
    elapsedRef.current = 0
    setElapsed(0)
    setPositions(start)
    setStatus('playing')
  }

  /** Reproduce todas las jugadas seguidas, desde la primera. */
  const startSequence = () => {
    sequenceRef.current = true
    setSequencing(true)
    if (activeScene === 0) restartPlayback()
    else switchScene(0, true, true)
  }

  // Siempre apunta a la jugada siguiente de la renderización actual (la usa el temporizador de la secuencia).
  useEffect(() => {
    nextSceneRef.current = () => {
      if (sequenceRef.current) switchScene(activeScene + 1, true, true)
    }
  })

  /** `fromEnd`: la nueva jugada parte de las posiciones finales de la actual. */
  const addScene = (fromEnd: boolean) => {
    const stashed = stashActive()
    const begin = fromEnd
      ? positionsAt(start, movements, total)
      : initialPositions(baseMode, teams, ball)
    setScenes([...stashed, { name: `Jugada ${scenes.length + 1}`, data: null }])
    setActiveScene(scenes.length)
    load({
      mode: baseMode, size, teams, ball, carrier: fromEnd ? carrier : null,
      start: begin, movements: [], annotations: [],
    })
  }

  /** Copia la jugada activa (movimientos y dibujos incluidos) y pasa a trabajar en la copia. */
  const duplicateScene = () => {
    const copy = snapshot()
    const scenesNow = [...stashActive(), { name: `${scenes[activeScene].name} (copia)`.slice(0, 40), data: null }]
    setScenes(scenesNow)
    setActiveScene(scenesNow.length - 1)
    loadScene(copy)
  }

  const deleteScene = (index: number) => {
    if (scenes.length < 2) return
    setCompareIndex(null)
    if (index !== activeScene) {
      setScenes(scenes.filter((_, i) => i !== index))
      setActiveScene(index < activeScene ? activeScene - 1 : activeScene)
      return
    }
    const target = index > 0 ? index - 1 : 1
    const data = scenes[target].data!
    setScenes(
      scenes
        .map((s, i) => (i === target ? { ...s, data: null } : s))
        .filter((_, i) => i !== index),
    )
    setActiveScene(target > index ? target - 1 : target)
    loadScene(data)
  }

  const renameScene = (index: number, name: string) =>
    setScenes((list) => list.map((s, i) => (i === index ? { ...s, name } : s)))

  const saveTactic = (name: string) =>
    updateTactics([
      {
        id: crypto.randomUUID(),
        name,
        scenes: stashActive().map((s, i) => ({ ...(i === activeScene ? snapshot() : s.data!), name: s.name })),
        savedAt: Date.now(),
      },
      ...tactics,
    ])

  const loadTactic = (t: Tactic) => {
    setScenes(t.scenes.map((s, i) => ({ name: s.name, data: i === 0 ? null : s })))
    setActiveScene(0)
    loadScene(t.scenes[0])
  }

  const exportName = safeName(scenes[activeScene].name)

  const showNotice = (text: string) => {
    setNotice(text)
    clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), 7000)
  }

  /** GIF animado de la jugada activa: se calcula fotograma a fotograma, sin depender del tiempo real. */
  const exportGif = async () => {
    const canvas = canvasRef.current
    if (!canvas || total === 0 || busy) return
    // Sin selecciones ni tiradores en la imagen: se espera a que el terreno se vuelva a dibujar limpio.
    setSelected(null)
    setSelMove(null)
    setGifProgress(0)
    await new Promise((resolve) => setTimeout(resolve, 80))
    try {
      const blob = await encodeGif({
        source: canvas,
        duration: total,
        drawAt: (t) =>
          pitchApi.current?.draw(
            positionsAt(start, movements, t),
            ghostData ? positionsAt(ghostData.start, ghostData.movements, t) : null,
          ),
        onProgress: setGifProgress,
      })
      downloadBlob(blob, `${exportName}.gif`)
    } catch {
      showNotice('No se pudo generar el GIF.')
    } finally {
      setGifProgress(null)
      setPositions(positionsAt(start, movements, elapsedRef.current))
    }
  }

  /** Copia un enlace que contiene toda la táctica (todas las jugadas) para abrirla en otro dispositivo. */
  const shareLink = async () => {
    const tactic: Tactic = {
      id: crypto.randomUUID(),
      name: scenes.length > 1 ? 'Táctica compartida' : scenes[0].name,
      scenes: stashActive().map((s, i) => ({ ...(i === activeScene ? snapshot() : s.data!), name: s.name })),
      savedAt: Date.now(),
    }
    const url = shareUrl(await encodeTactic(tactic))
    try {
      await navigator.clipboard.writeText(url)
      showNotice(
        url.length > LONG_LINK
          ? `Enlace copiado, pero es muy largo (${url.length} caracteres) y algunas apps lo cortan. Mejor exporta el JSON.`
          : 'Enlace copiado: quien lo abra verá esta táctica.',
      )
    } catch {
      window.prompt('Copia este enlace:', url)
    }
  }

  const installApp = async () => {
    if (!installEvent) return
    await installEvent.prompt()
    setInstallEvent(null)
  }

  /** Abre una táctica compartida si la URL trae `#t=...`; después limpia la URL. */
  const openSharedLink = async () => {
    const code = codeFromLocation()
    if (!code) return
    history.replaceState(null, '', location.pathname + location.search)
    const tactic = await decodeTactic(code)
    if (!tactic) {
      showNotice('El enlace no contiene una táctica válida.')
      return
    }
    loadTactic(tactic)
    showNotice(`Táctica compartida cargada: ${tactic.name}`)
  }

  useEffect(() => {
    openSharedLink()
    window.addEventListener('hashchange', openSharedLink)
    const onInstallable = (e: Event) => {
      e.preventDefault()
      setInstallEvent(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setInstallEvent(null)
    window.addEventListener('beforeinstallprompt', onInstallable)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('hashchange', openSharedLink)
      window.removeEventListener('beforeinstallprompt', onInstallable)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const exportPng = () => {
    if (canvasRef.current) downloadPng(canvasRef.current, exportName)
  }

  const hasAnyMovement = scenes.some((s, i) => (i === activeScene ? movements : s.data!.movements).length > 0)

  /** Con `all`, el vídeo recorre todas las jugadas en secuencia. */
  const exportVideo = (all = false) => {
    const canvas = canvasRef.current
    const format = pickVideoMime()
    if (!canvas || !format || (all ? !hasAnyMovement : total === 0)) return
    const recorder = new MediaRecorder(canvas.captureStream(30), {
      mimeType: format.mime,
      videoBitsPerSecond: 4_000_000,
    })
    const chunks: Blob[] = []
    const previousSpeed = speed
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data)
    }
    recorder.onstop = () => {
      downloadBlob(new Blob(chunks, { type: format.mime }), `${exportName}.${format.ext}`)
      recorderRef.current = null
      selectSpeed(previousSpeed)
      setExporting(false)
    }
    recorderRef.current = recorder
    setExporting(true)
    selectSpeed(1)
    recorder.start()
    if (all) {
      startSequence()
    } else {
      seek(0)
      setStatus('playing')
    }
  }

  // Al terminar (o pausar) la reproducción se cierra la grabación de vídeo, con un margen para el último fotograma.
  useEffect(() => {
    const recorder = recorderRef.current
    if (status === 'playing' || sequenceRef.current || recorder?.state !== 'recording') return
    const timer = setTimeout(() => recorder.state === 'recording' && recorder.stop(), 400)
    return () => clearTimeout(timer)
  }, [status])

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
        return
      }
      await document.documentElement.requestFullscreen()
      // En móvil intenta fijar la orientación horizontal (solo funciona a pantalla completa).
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (orientation: string) => Promise<void>
      }
      await orientation.lock?.('landscape')
    } catch {
      // Pantalla completa u orientación no disponibles en este navegador.
    }
  }

  const importFile = async (file: File) => {
    try {
      const imported = parseTactics(JSON.parse(await file.text())).map((t) => ({
        ...t,
        id: crypto.randomUUID(),
      }))
      if (imported.length === 0) {
        alert('El archivo no contiene tácticas válidas.')
        return
      }
      updateTactics([...imported, ...tactics])
    } catch {
      alert('No se pudo leer el archivo JSON.')
    }
  }

  const updateInfo = (key: string, patch: PlayerInfo) =>
    setRoster((r) => ({ ...r, [key]: { ...r[key], ...patch } }))

  // Estos objetos solo cambian si cambian sus datos; así el terreno no se redibuja en cada renderizado de la app
  // (por ejemplo, al teclear en un campo o al cambiar el zoom).
  const tokenKeys = Object.keys(positions).join(',')
  const tokens = useMemo(() => {
    const result: Record<string, TokenLabel> = {}
    for (const key of tokenKeys ? tokenKeys.split(',') : []) {
      if (key === BALL_KEY) continue
      const { kind, slot } = parseKey(key)
      const info = roster[key]
      const isTeam = kind === 'left' || kind === 'right'
      const role = info?.role ?? (isTeam ? defaultRole(getFormation(baseMode, teams[kind].formationId), slot) : '')
      result[key] = {
        text: String(info?.dorsal ?? (isTeam ? slot : kind === 'neutral' ? 'C' : 'Á')),
        caption: labelMode === 'name' ? (info?.name ?? '') : labelMode === 'role' ? role : '',
        size: info?.size,
      }
    }
    return result
  }, [tokenKeys, roster, labelMode, teams, baseMode])

  const selectedKey = selected && selected in positions && selected !== BALL_KEY ? selected : null
  const selParsed = selectedKey ? parseKey(selectedKey) : null
  const stepCount = groupSteps(movements).length
  const leftFormation = teams.left.formationId
  const rightFormation = teams.right.formationId
  const groups = useMemo(
    () => ({
      left: lineKeys(getFormation(baseMode, leftFormation), 'left'),
      right: lineKeys(getFormation(baseMode, rightFormation), 'right'),
    }),
    [baseMode, leftFormation, rightFormation],
  )
  const heat = useMemo(() => {
    if (heatTarget === 'off') return null
    const include = {
      left: (k: string) => k.startsWith('left-'),
      right: (k: string) => k.startsWith('right-'),
      ball: (k: string) => k === BALL_KEY,
      selected: (k: string) => k === selectedKey,
    }[heatTarget]
    return buildHeatmap(start, movements, include)
  }, [heatTarget, start, movements, selectedKey])
  const selMoveIndex =
    status === 'idle' && !sequencing && selMove !== null && selMove < movements.length
      ? movements[selMove].linked
        ? selMove - 1
        : selMove
      : null
  const labelOf = (key: string) => {
    const { kind } = parseKey(key)
    if (kind === 'ball') return '⚽'
    const prefix = kind === 'left' ? 'R' : kind === 'right' ? 'A' : kind === 'neutral' ? 'Co' : 'Ár'
    return `${prefix}${kind === 'left' || kind === 'right' ? (tokens[key]?.text ?? '') : parseKey(key).slot}`
  }
  const colorOf = (key: string) => tokenColor(key, colors)
  const selectedMove = selMoveIndex === null ? null : movements[selMoveIndex]
  const selectedStats = selectedMove ? movementStats(selectedMove, mode) : null
  const selectedDistance = selectedKey
    ? movements.filter((m) => m.key === selectedKey).reduce((sum, m) => sum + movementStats(m, mode).distance, 0)
    : 0
  const giveBallBlocked = !ball
    ? 'Activa el balón primero'
    : movements.length > 0
      ? 'Solo se puede antes de grabar movimientos'
      : null

  // Al elegir algo en el terreno, su editor pasa a primer plano.
  const hasSelection = selectedKey !== null || selMoveIndex !== null
  useEffect(() => {
    if (hasSelection) setTab('seleccion')
  }, [hasSelection, selectedKey, selMoveIndex])

  const openTab = (id: PanelTab) => {
    setTab(id)
    setPanelOpen(true)
  }

  const statusText =
    status === 'recording'
      ? `Grabando · paso ${currentStep + 1}`
      : status === 'playing'
        ? 'Reproduciendo'
        : `${stepCount} paso${stepCount === 1 ? '' : 's'} · ${movements.length} mov.`

  const campoTab = (
    <>
      <section>
        <h3>Modalidad</h3>
        <nav className="mode-grid">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`btn${m.id === modeId ? ' active' : ''}`}
              aria-pressed={m.id === modeId}
              disabled={busy}
              onClick={() => selectMode(m.id)}
            >
              <span>{m.label}</span>
              <small>{playerCount(m.formations[0])} jug.</small>
            </button>
          ))}
        </nav>
      </section>

      <section>
        <h3>Medidas del terreno</h3>
        <div className="size-inputs">
          {(['length', 'width'] as const).map((dim) => (
            <label key={dim}>
              <span>{dim === 'length' ? 'Largo' : 'Ancho'} (m)</span>
              <input
                type="number"
                min={SIZE_LIMITS[dim][0]}
                max={SIZE_LIMITS[dim][1]}
                step={0.5}
                value={mode[dim]}
                disabled={busy}
                onChange={(e) => {
                  const input = e.currentTarget
                  const [min, max] = SIZE_LIMITS[dim]
                  const n = input.valueAsNumber
                  if (Number.isNaN(n) || n < min || n > max) {
                    input.value = String(mode[dim])
                    return
                  }
                  updateSize({ [dim]: n })
                }}
              />
            </label>
          ))}
        </div>
        <button type="button" className="btn btn-sm" disabled={busy || !size} onClick={() => setSize(null)}>
          Restablecer medidas
        </button>
      </section>

      <section>
        <h3>Equipos</h3>
        <div className="teams">
          {SIDES.map((side) => (
            <div key={side} className={`team ${side}`}>
              <label className="visible-toggle">
                <input
                  type="checkbox"
                  checked={teams[side].visible}
                  disabled={busy}
                  onChange={(e) => updateTeam(side, { visible: e.currentTarget.checked })}
                />
                <span>{SIDE_LABELS[side]}</span>
              </label>
              <input
                type="color"
                aria-label={`Color ${SIDE_LABELS[side]}`}
                value={colors[side]}
                onInput={(e) => setColors((c) => ({ ...c, [side]: e.currentTarget.value }))}
              />
              <select
                aria-label={`Formación ${SIDE_LABELS[side]}`}
                value={teams[side].formationId}
                disabled={busy || !teams[side].visible}
                onChange={(e) => updateTeam(side, { formationId: e.currentTarget.value })}
              >
                {mode.formations.map((f) => (
                  <option key={f.id} value={f.id}>{f.id}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3>Fichas</h3>
        <div className="token-buttons">
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => addToken('left')}>+ Rojo</button>
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => addToken('right')}>+ Azul</button>
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => addToken('neutral')}>+ Comodín</button>
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => addToken('ref')}>+ Árbitro</button>
        </div>
        <p className="hint">Arrastra una ficha para colocarla (mientras no tenga movimientos grabados) y púlsala para editarla o quitarla.</p>
      </section>

      <section>
        <h3>Vista</h3>
        <div className="view-options">
          <label className="check">
            <input type="checkbox" checked={ball} disabled={busy} onChange={(e) => reset({ ball: e.currentTarget.checked })} />
            <span>Balón</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={showTrails} onChange={(e) => setShowTrails(e.currentTarget.checked)} />
            <span>Trayectorias</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={measures} onChange={(e) => setMeasures(e.currentTarget.checked)} />
            <span>Medidas (m y km/h)</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={analysis.lines} onChange={(e) => setAnalysis({ ...analysis, lines: e.currentTarget.checked })} />
            <span>Líneas y distancias</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={analysis.block} onChange={(e) => setAnalysis({ ...analysis, block: e.currentTarget.checked })} />
            <span>Bloque del equipo</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={analysis.coverage} onChange={(e) => setAnalysis({ ...analysis, coverage: e.currentTarget.checked })} />
            <span>Cobertura</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={showTimeline} onChange={(e) => setShowTimeline(e.currentTarget.checked)} />
            <span>Línea de tiempo por jugador</span>
          </label>
          <label className="check">
            <span>Mapa de calor</span>
            <select value={heatTarget} onChange={(e) => setHeatTarget(e.currentTarget.value as HeatTarget)}>
              <option value="off">Ninguno</option>
              <option value="left">Equipo rojo</option>
              <option value="right">Equipo azul</option>
              <option value="ball">Balón</option>
              <option value="selected">Ficha seleccionada</option>
            </select>
          </label>
          <label className="check">
            <span>Etiquetas</span>
            <select value={labelMode} onChange={(e) => setLabelMode(e.currentTarget.value as LabelMode)}>
              <option value="none">Ninguna</option>
              <option value="name">Nombre</option>
              <option value="role">Posición</option>
            </select>
          </label>
        </div>
      </section>
    </>
  )

  const grabarTab = (
    <>
      <section>
        <h3>Movimientos</h3>
        <p className="status">{statusText}</p>
        <div className="controls">
          {status === 'recording' ? (
            <button type="button" className="btn btn-primary" onClick={stopRecording}>
              <Icon name="stop" />Finalizar grabación
            </button>
          ) : (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={startRecording}>
              <Icon name="record" />Grabar
            </button>
          )}
          {status === 'recording' && (
            <button type="button" className="btn" disabled={!canStartStep} onClick={newStep}>
              <Icon name="step" />Nuevo paso
            </button>
          )}
          <div className="row">
            <button type="button" className="btn" disabled={status === 'playing' || movements.length === 0} onClick={undo}>
              <Icon name="undo" />Deshacer
            </button>
            <button type="button" className="btn" disabled={status === 'playing' || redo.length === 0} onClick={redoLast}>
              <Icon name="redo" />Rehacer
            </button>
          </div>
          <div className="row">
            <button
              type="button"
              className="btn"
              disabled={busy || movements.length === 0}
              title={selMoveIndex === null ? 'Copia todos los movimientos de la jugada' : 'Copia el movimiento seleccionado'}
              onClick={copyMovements}
            >
              <Icon name="copy" />Copiar
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy || !clipboard}
              title="Pega lo copiado al final de esta jugada, desde donde está cada ficha"
              onClick={pasteClipboard}
            >
              <Icon name="paste" />Pegar
            </button>
          </div>
          <button type="button" className="btn" disabled={busy || movements.length === 0} onClick={() => reset()}>
            <Icon name="trash" />Limpiar
          </button>
        </div>
      </section>
      <section>
        <h3>Velocidad</h3>
        <label className="check">
          <input type="checkbox" checked={realistic.on} onChange={(e) => setRealistic({ ...realistic, on: e.currentTarget.checked })} />
          <span>Velocidad realista al soltar</span>
        </label>
        {realistic.on && (
          <div className="size-inputs">
            {(['player', 'ball'] as const).map((who) => (
              <label key={who}>
                <span>{who === 'player' ? 'Jugador' : 'Balón'} (km/h)</span>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={realistic[who]}
                  onChange={(e) => {
                    const n = e.currentTarget.valueAsNumber
                    if (Number.isNaN(n) || n < 1 || n > 120) e.currentTarget.value = String(realistic[who])
                    else setRealistic({ ...realistic, [who]: n })
                  }}
                />
              </label>
            ))}
          </div>
        )}
      </section>
    </>
  )

  const seleccionTab = (
    <>
      {selectedKey && selParsed && (
        <PlayerPanel
          title={keyTitle(selectedKey)}
          info={roster[selectedKey] ?? {}}
          defaultDorsal={selParsed.slot}
          defaultRole={
            selParsed.kind === 'left' || selParsed.kind === 'right'
              ? defaultRole(getFormation(baseMode, teams[selParsed.kind].formationId), selParsed.slot)
              : ''
          }
          sizeRange={SIZE_RANGE}
          disabled={busy}
          distance={selectedDistance}
          carrying={carrier === selectedKey}
          giveBallBlocked={giveBallBlocked}
          removeBlocked={placeable(selectedKey) ? null : 'Tiene movimientos grabados: bórralos antes'}
          onGiveBall={() => giveBall(selectedKey)}
          onRemove={() => removeToken(selectedKey)}
          onChange={(patch) => updateInfo(selectedKey, patch)}
          onReset={() =>
            setRoster((r) => {
              const { [selectedKey]: _removed, ...rest } = r
              return rest
            })
          }
          onClose={() => setSelected(null)}
        />
      )}
      {selectedMove && selectedStats && selMoveIndex !== null && (
        <MovementPanel
          title={`${labelOf(selectedMove.key)} · paso ${selectedMove.step + 1}`}
          distance={selectedStats.distance}
          duration={selectedStats.seconds}
          delay={(selectedMove.delay ?? 0) / 1000}
          speedKmh={selectedStats.speedKmh}
          realisticKmh={selectedMove.key === BALL_KEY ? realistic.ball : realistic.player}
          disabled={busy}
          removeBlocked={
            canRemoveMovement(movements, selMoveIndex)
              ? null
              : 'Hay movimientos posteriores de esta ficha: bórralos antes'
          }
          onDuration={(s) => applyEdit(selMoveIndex, { duration: s * 1000 })}
          onDelay={(s) => applyEdit(selMoveIndex, { delay: s * 1000 })}
          onSpeed={(kmh) => applyEdit(selMoveIndex, { duration: (selectedStats.distance / (kmh / 3.6)) * 1000 })}
          onRealistic={() =>
            applyEdit(selMoveIndex, {
              duration:
                (selectedStats.distance /
                  ((selectedMove.key === BALL_KEY ? realistic.ball : realistic.player) / 3.6)) *
                1000,
            })
          }
          onRemove={removeSelectedMovement}
          onClose={() => setSelMove(null)}
        />
      )}
      {!hasSelection && (
        <p className="empty">
          Toca una ficha o una trayectoria del terreno para editarla aquí: nombre, dorsal, tamaño, duración o velocidad.
        </p>
      )}
    </>
  )

  const jugadasTab = (
    <>
      <Scenes
        names={scenes.map((s) => s.name)}
        active={activeScene}
        disabled={busy}
        sequencing={sequencing}
        onSelect={(i) => switchScene(i)}
        onPlayAll={startSequence}
        onStopAll={() => {
          stopSequence()
          commitPlayback(elapsedRef.current)
        }}
        onAdd={() => addScene(false)}
        onContinue={() => addScene(true)}
        onDelete={deleteScene}
        onDuplicate={duplicateScene}
        compareIndex={compareIndex}
        onCompare={setCompareIndex}
        onRename={renameScene}
      />
      <section>
        <h3>Plantillas</h3>
        <div className="controls">
          {TEMPLATES.map((t) => (
            <button key={t.id} type="button" className="btn" disabled={busy} title={t.description} onClick={() => applyTemplate(t)}>
              {t.name}
            </button>
          ))}
        </div>
        <p className="hint">Cada plantilla crea una jugada nueva con tus formaciones y medidas.</p>
      </section>
      <SavedTactics
        tactics={tactics}
        disabled={busy}
        onSave={saveTactic}
        onLoad={loadTactic}
        onDelete={(id) => updateTactics(tactics.filter((t) => t.id !== id))}
        onExport={downloadTactic}
        onImport={importFile}
      />
    </>
  )

  const exportarTab = (
    <section>
      <h3>Exportar</h3>
      <div className="controls">
        <button type="button" className="btn" disabled={exporting} onClick={exportPng}>
          <Icon name="image" />Imagen PNG
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy || total === 0 || !pickVideoMime()}
          title={pickVideoMime() ? 'Graba la jugada a 1x' : 'Tu navegador no permite grabar vídeo'}
          onClick={() => exportVideo()}
        >
          <Icon name="film" />{exporting ? 'Grabando vídeo…' : 'Vídeo de la jugada'}
        </button>
        {scenes.length > 1 && (
          <button
            type="button"
            className="btn"
            disabled={busy || !hasAnyMovement || !pickVideoMime()}
            title="Graba todas las jugadas seguidas a 1x"
            onClick={() => exportVideo(true)}
          >
            <Icon name="film" />Vídeo de todas las jugadas
          </button>
        )}
        <button
          type="button"
          className="btn"
          disabled={busy || total === 0}
          title="GIF animado de la jugada (fácil de enviar por mensajería)"
          onClick={exportGif}
        >
          <Icon name="image" />{gifProgress === null ? 'GIF animado' : `Generando GIF… ${Math.round(gifProgress * 100)}%`}
        </button>
        <button type="button" className="btn" title="Copia un enlace con toda la táctica" onClick={shareLink}>
          <Icon name="link" />Copiar enlace para compartir
        </button>
        {installEvent && (
          <button type="button" className="btn btn-primary" onClick={installApp}>
            <Icon name="install" />Instalar app
          </button>
        )}
      </div>
    </section>
  )

  const tabContent = { campo: campoTab, grabar: grabarTab, seleccion: seleccionTab, jugadas: jugadasTab, exportar: exportarTab }[tab]

  return (
    <div className={`app${presenting ? ' presenting' : ''}`}>
      <main className="stage">
        <Pitch
          mode={mode}
          positions={positions}
          editable={status === 'recording'}
          colors={colors}
          tokens={tokens}
          trails={showTrails ? movements : NO_TRAILS}
          selected={selectedKey}
          heat={heat}
          ghost={
            ghostData
              ? {
                  positions: positionsAt(ghostData.start, ghostData.movements, elapsed),
                  trails: showTrails ? ghostData.movements : [],
                }
              : null
          }
          placeable={placeable}
          onPlace={placeToken}
          onZoomChange={setZoom}
          carrier={status === 'playing' || gifProgress !== null ? null : carrier}
          measures={measures && showTrails}
          analysis={analysis}
          groups={groups}
          canvasRef={canvasRef}
          apiRef={pitchApi}
          tool={tool}
          annotations={annotations}
          annotationColor={annotationColor}
          onAnnotate={(an) => setAnnotations((list) => [...list, an])}
          onErase={(id) => setAnnotations((list) => list.filter((an) => an.id !== id))}
          onSelect={(key) => {
            setSelected(key)
            if (key) setSelMove(null)
          }}
          selectedMovement={selMoveIndex}
          endMovable={selMoveIndex !== null && canMoveEnd(movements, selMoveIndex)}
          onSelectMovement={(i) => {
            setSelMove(i)
            if (i !== null) setSelected(null)
          }}
          onEditPath={(i, points) => applyEdit(i, { points })}
          onDrop={handleDrop}
        />

        <header className="hud hud-title glass">
          <span className="brand">Tactiker</span>
          <span className="scene-name" title={scenes[activeScene].name}>{scenes[activeScene].name}</span>
          <span className="badge">{statusText}</span>
        </header>

        <div className="hud hud-tools glass">
          <DrawToolbar
            tool={tool}
            color={annotationColor}
            count={annotations.length}
            onTool={setTool}
            onColor={setAnnotationColor}
            onClear={() => setAnnotations([])}
          />
        </div>

        <div className="hud-cluster">
        <div className="hud hud-rec glass" role="group" aria-label="Grabación">
          {status === 'recording' ? (
            <button type="button" className="btn btn-primary rec-btn" aria-label="Finalizar grabación" onClick={stopRecording}>
              <Icon name="stop" /><span>Finalizar</span>
            </button>
          ) : (
            <button type="button" className="btn btn-primary rec-btn" aria-label="Grabar" disabled={busy} onClick={startRecording}>
              <Icon name="record" /><span>Grabar</span>
            </button>
          )}
          {status === 'recording' && (
            <button type="button" className="btn btn-icon" aria-label="Nuevo paso" title="Nuevo paso" disabled={!canStartStep} onClick={newStep}>
              <Icon name="step" />
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Deshacer" title="Deshacer" disabled={status === 'playing' || movements.length === 0} onClick={undo}>
            <Icon name="undo" />
          </button>
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Rehacer" title="Rehacer" disabled={status === 'playing' || redo.length === 0} onClick={redoLast}>
            <Icon name="redo" />
          </button>
        </div>

        <div className="hud hud-view glass" role="group" aria-label="Vista del terreno">
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Acercar" title="Acercar (o rueda del ratón / pellizco)" onClick={() => pitchApi.current?.zoomBy(1.5)}>
            <Icon name="zoom-in" />
          </button>
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Alejar" title="Alejar" disabled={zoom <= 1} onClick={() => pitchApi.current?.zoomBy(1 / 1.5)}>
            <Icon name="zoom-out" />
          </button>
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Restablecer zoom" title="Ver el terreno entero" disabled={zoom <= 1} onClick={() => pitchApi.current?.resetView()}>
            <Icon name="fit" />
          </button>
          <button type="button" className="btn btn-ghost btn-icon hide-compact" aria-label="Panel" title="Mostrar u ocultar el panel" aria-pressed={panelOpen} onClick={() => setPanelOpen((o) => !o)}>
            <Icon name="panel" />
          </button>
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Modo presentación" title="Modo presentación: terreno inclinado, sin menús" onClick={() => {
              setSelected(null)
              setSelMove(null)
              setPresenting(true)
            }}>
            <Icon name="tv" />
          </button>
          {document.fullscreenEnabled && (
            <button type="button" className="btn btn-ghost btn-icon" aria-label="Pantalla completa" title="Pantalla completa (horizontal en móvil)" onClick={toggleFullscreen}>
              <Icon name="maximize" />
            </button>
          )}
        </div>

        </div>

        {presenting && (
          <button type="button" className="btn btn-primary hud-exit" onClick={() => setPresenting(false)}>
            <Icon name="x" />Salir de la presentación
          </button>
        )}

        {notice && (
          <div className="toast glass" role="status">
            <Icon name="check" />
            <span>{notice}</span>
          </div>
        )}

        {!hintDismissed && (
          <div className="rotate-hint glass">
            <span>Gira el móvil en horizontal para ver el terreno más grande</span>
            <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Cerrar aviso" onClick={() => setHintDismissed(true)}>
              <Icon name="x" />
            </button>
          </div>
        )}
      </main>

      <aside className="panel glass" data-open={panelOpen} aria-label="Panel de edición">
        <div className="panel-head">
          <div className="tabs" role="tablist" aria-label="Secciones">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                className="tab"
                aria-label={t.label}
                title={t.label}
                aria-selected={tab === t.id}
                onClick={() => (tab === t.id && panelOpen && window.matchMedia(COMPACT_QUERY).matches ? setPanelOpen(false) : openTab(t.id))}
              >
                <Icon name={t.icon} />
                <span className="tab-label">{t.label}</span>
                {t.id === 'seleccion' && hasSelection && tab !== 'seleccion' && <i className="dot" />}
              </button>
            ))}
          </div>
        </div>
        <div className="panel-body" role="tabpanel" key={tab}>
          {tabContent}
        </div>
      </aside>

      <footer className="dock glass">
        {showTimeline && (
          <Timeline
            movements={movements}
            total={total}
            elapsed={elapsed}
            selected={selMoveIndex}
            disabled={busy}
            labelOf={labelOf}
            colorOf={colorOf}
            apiRef={timelineApi}
            onSelect={(i) => {
              setSelMove(i)
              setSelected(null)
            }}
            onEdit={applyEdit}
          />
        )}
        <PlaybackBar
          apiRef={barApi}
          disabled={status === 'recording' || movements.length === 0}
          playing={status === 'playing'}
          elapsed={elapsed}
          total={total}
          speed={speed}
          speeds={SPEEDS}
          onTogglePlay={togglePlay}
          onSeek={seek}
          onStep={step}
          onSpeed={selectSpeed}
        />
      </footer>
    </div>
  )
}

export default App
