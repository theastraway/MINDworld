import { Volume2, VolumeX } from 'lucide-react'

interface MuteButtonProps {
  muted: boolean
  onToggle: () => void
}

// Round mute/unmute toggle in the top-right corner.
export function MuteButton({ muted, onToggle }: MuteButtonProps) {
  return (
    <button
      onClick={onToggle}
      aria-label={muted ? 'Unmute MIND World audio' : 'Mute MIND World audio'}
      aria-pressed={!muted}
      className="size-11 sm:size-9 rounded-full bg-black/40 hover:bg-black/60 text-white border border-white/20 backdrop-blur-md flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFCC4D] focus-visible:ring-offset-2 focus-visible:ring-offset-black/40"
    >
      {muted ? <VolumeX className="size-4" aria-hidden="true" /> : <Volume2 className="size-4" aria-hidden="true" />}
    </button>
  )
}
