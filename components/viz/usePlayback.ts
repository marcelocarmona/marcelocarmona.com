import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

/**
 * Discrete-step playback driver shared by every diagram.
 *
 * The contract that keeps diagrams maintainable: `step` is the only source of
 * truth, and layout is a pure function of it. Nothing here touches the DOM, so
 * there is no imperative animation code to keep in sync.
 */

export type Playback = {
  step: number
  playing: boolean
  speed: number
  setStep: (n: number) => void
  next: () => void
  prev: () => void
  reset: () => void
  toggle: () => void
  setSpeed: (n: number) => void
  /**
   * Told by `VizFigure` whether the diagram is on screen. While it is not, the
   * clock stops, so a reader scrolling down a long article arrives at step one
   * instead of at whatever step the diagram reached while nobody was looking.
   * On a phone, where every figure is off screen most of the time, this is also
   * the difference between one running timer and six.
   */
  setOnScreen: (visible: boolean) => void
}

export function usePlayback(totalSteps: number, intervalMs = 900): Playback {
  const [step, setStep] = useState(0)
  // null until the reader presses a control; until then autoplay is the default.
  const [userPlaying, setPlaying] = useState<boolean | null>(null)
  const [speed, setSpeed] = useState(1)
  const [onScreen, setOnScreen] = useState(true)

  // Respect the OS-level reduced-motion setting: never autoplay.
  const reduced = usePrefersReducedMotion()
  const playing = userPlaying ?? !reduced

  useEffect(() => {
    if (!playing || !onScreen || totalSteps <= 0) return
    const id = window.setInterval(
      () => setStep((s) => (s + 1) % totalSteps),
      Math.max(80, intervalMs / speed)
    )
    return () => window.clearInterval(id)
  }, [playing, onScreen, speed, intervalMs, totalSteps])

  const next = useCallback(() => {
    setPlaying(false)
    setStep((s) => (s + 1) % totalSteps)
  }, [totalSteps])

  const prev = useCallback(() => {
    setPlaying(false)
    setStep((s) => (s - 1 + totalSteps) % totalSteps)
  }, [totalSteps])

  const reset = useCallback(() => {
    setPlaying(false)
    setStep(0)
  }, [])

  const toggle = useCallback(() => setPlaying(!playing), [playing])

  return { step, playing, speed, setStep, next, prev, reset, toggle, setSpeed, setOnScreen }
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function subscribeToReducedMotion(onChange: () => void) {
  const mq = window.matchMedia(REDUCED_MOTION_QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false
  )
}
