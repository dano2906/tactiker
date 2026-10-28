import { useEffect, useRef } from 'preact/hooks'
import Icon from './Icon'
import type { Report } from './report'
import { reportToCsv, reportToText } from './report'
import { downloadBlob, safeName } from './exporting'

interface Props {
  report: Report | null
  onClose: () => void
  onNotice: (text: string) => void
}

const pct = (n: number) => Math.round(n * 100)
const num = (n: number) => String(n).replace('.', ',')

/** Informe de la jugada: tabla de jugadores, pases, espacio controlado y distancias entre líneas. */
function ReportDialog({ report, onClose, onNotice }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (report && !dialog.open) dialog.showModal()
    else if (!report && dialog.open) dialog.close()
  }, [report])

  const copy = async () => {
    if (!report) return
    try {
      await navigator.clipboard.writeText(reportToText(report))
      onNotice('Informe copiado como texto.')
    } catch {
      onNotice('No se pudo copiar el informe.')
    }
  }

  return (
    <dialog
      ref={ref}
      className="palette glass report"
      aria-label="Informe de la jugada"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
    >
      {report && (
        <>
          <div className="shortcuts-head">
            <div>
              <h2>{report.name}</h2>
              <p className="hint">
                {report.modeLabel} · {report.size} · {num(report.seconds)} s · {report.steps} paso{report.steps === 1 ? '' : 's'}
              </p>
            </div>
            <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Cerrar" onClick={onClose}>
              <Icon name="x" />
            </button>
          </div>
          <div className="shortcuts-body report-body">
            <section>
              <h3>Espacio controlado</h3>
              {[['Inicio', report.controlStart], ['Final', report.controlEnd]].map(([label, c]) => {
                const control = c as Report['controlStart']
                return (
                  <div key={label as string} className="control-bar">
                    <span>{label as string}</span>
                    <div role="img" aria-label={`Rojo ${pct(control.left)} %, azul ${pct(control.right)} %`}>
                      <i className="left" style={{ width: `${pct(control.left)}%` }}>{pct(control.left)} %</i>
                      <i className="right" style={{ width: `${pct(control.right)}%` }}>{pct(control.right)} %</i>
                    </div>
                  </div>
                )
              })}
            </section>

            {report.depths.length > 0 && (
              <section>
                <h3>Distancia entre líneas (m)</h3>
                <table>
                  <thead><tr><th>Equipo</th><th>Al inicio</th><th>Al final</th></tr></thead>
                  <tbody>
                    {report.depths.map((d) => (
                      <tr key={d.team}>
                        <td>{d.team}</td>
                        <td>{d.start.map(num).join(' · ') || '—'}</td>
                        <td>{d.end.map(num).join(' · ') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            <section>
              <h3>Pases ({report.network.total})</h3>
              {report.network.edges.length === 0 ? (
                <p className="hint">No hay pases entre compañeros. Se cuentan al arrastrar el balón hasta otro jugador.</p>
              ) : (
                <ul className="plain-list">
                  {[...report.network.edges].sort((a, b) => b.count - a.count).map((e) => (
                    <li key={`${e.from}>${e.to}`}>
                      <span>{report.labels[e.from]} → {report.labels[e.to]}</span>
                      <strong>{e.count}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3>Jugadores</h3>
              {report.players.length === 0 ? (
                <p className="hint">Graba movimientos para ver recorridos y velocidades.</p>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr><th>Ficha</th><th>Mov.</th><th>Metros</th><th>Media km/h</th><th>Máx. km/h</th></tr>
                    </thead>
                    <tbody>
                      {[...report.players, ...(report.ball ? [report.ball] : [])].map((p) => (
                        <tr key={p.key}>
                          <td>{p.label}</td>
                          <td>{p.movements}</td>
                          <td>{num(p.meters)}</td>
                          <td>{num(p.avgKmh)}</td>
                          <td>{num(p.maxKmh)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {(report.notes || report.stepNotes.length > 0) && (
              <section>
                <h3>Notas</h3>
                {report.notes && <p>{report.notes}</p>}
                <ul className="plain-list">
                  {report.stepNotes.map((n) => (
                    <li key={n.step}><span>Paso {n.step}</span><span>{n.text}</span></li>
                  ))}
                </ul>
              </section>
            )}

            <div className="row">
              <button type="button" className="btn btn-sm" onClick={copy}><Icon name="copy" />Copiar resumen</button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() =>
                  downloadBlob(new Blob([reportToCsv(report)], { type: 'text/csv;charset=utf-8' }), `${safeName(report.name)}-informe.csv`)
                }
              >
                <Icon name="download" />Descargar CSV
              </button>
            </div>
          </div>
        </>
      )}
    </dialog>
  )
}

export default ReportDialog
