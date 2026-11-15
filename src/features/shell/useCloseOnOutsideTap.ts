import { useEffect, useRef } from 'react'

/** Closes a <details> dropdown on a tap outside it, like any dropdown (a <details> only closes from its own summary). */
export function useCloseOnOutsideTap() {
  const ref = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const close = (e: PointerEvent) => {
      const d = ref.current
      if (d?.open && !d.contains(e.target as Node)) d.open = false
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])
  return ref
}
