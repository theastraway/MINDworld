import { Gamepad2, X } from 'lucide-react'

interface ControlsProps {
  onHide: () => void
}

// Desktop-only controls helper card in the bottom-left. Dismissible via X.
export function Controls({ onHide }: ControlsProps) {
  return (
    <div
      className="absolute bottom-4 left-4 z-20 max-w-[260px] pointer-events-none"
      role="region"
      aria-label="Keyboard controls"
    >
      <div className="rounded-xl border border-white/15 bg-black/60 backdrop-blur-md p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] text-white/85 font-bold">
            <Gamepad2 className="size-3.5" aria-hidden="true" /> Controls
          </div>
          <button
            onClick={onHide}
            aria-label="Hide keyboard controls"
            className="size-7 rounded-full flex items-center justify-center text-white/70 hover:text-white pointer-events-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFCC4D] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </div>
        <dl className="text-[11px] text-white/90 leading-relaxed grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
          <dt><span className="font-mono bg-white/10 px-1.5 py-0.5 rounded">W A S D</span></dt>
          <dd>drive</dd>
          <dt><span className="font-mono bg-white/10 px-1.5 py-0.5 rounded">⇧ Shift</span></dt>
          <dd>boost</dd>
          <dt><span className="font-mono bg-white/10 px-1.5 py-0.5 rounded">Space</span></dt>
          <dd>drift</dd>
          <dt><span className="font-mono bg-white/10 px-1.5 py-0.5 rounded">H</span></dt>
          <dd>honk (hold for surprise)</dd>
          <dt><span className="font-mono bg-white/10 px-1.5 py-0.5 rounded">Esc</span></dt>
          <dd>close card</dd>
        </dl>
      </div>
    </div>
  )
}
