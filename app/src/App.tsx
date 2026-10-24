import { World } from './scene/World'
import { useStore } from './store'
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
