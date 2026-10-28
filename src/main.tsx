import { render } from 'preact'
import './index.css'
import App from './App.tsx'

render(<App />, document.getElementById('root')!)

// Permite instalar la app y usarla sin conexión (solo en producción: en desarrollo estorbaría a la recarga en caliente).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
