import { EXAMPLE_TEXT } from './palace/example'
import { parsePalace } from './palace/parse'
import { World } from './scene/World'
import { useStore } from './store'

// ?demo entra directo al palacio de ejemplo (útil para el pitch y para pruebas).
if (new URLSearchParams(window.location.search).has('demo')) {
  const r = parsePalace(EXAMPLE_TEXT)
  if (r.ok) useStore.getState().enterPalace(r.palace)
}
import { Hud } from './ui/Hud'
import { Landing } from './ui/Landing'

export default function App() {
  const screen = useStore((s) => s.screen)
  const layout = useStore((s) => s.layout)

  if (screen === 'palace' && layout) {
    return (
      <div className="palace">
        <World layout={layout} />
        <Hud layout={layout} />
      </div>
    )
  }
  return <Landing />
}
