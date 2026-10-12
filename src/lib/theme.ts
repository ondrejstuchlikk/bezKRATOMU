import { useEffect, useState } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'

const KEY = 'theme'
const EVENT = 'themechange'
const media = () => window.matchMedia('(prefers-color-scheme: dark)')

export function getThemePreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    // ignore
  }
  return 'system'
}

function apply() {
  const pref = getThemePreference()
  const dark = pref === 'system' ? media().matches : pref === 'dark'
  document.documentElement.classList.toggle('dark', dark)
  window.dispatchEvent(new Event(EVENT))
}

export function setThemePreference(pref: ThemePreference) {
  try {
    if (pref === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, pref)
  } catch {
    // ignore
  }
  apply()
}

/** Keeps the page in sync with the OS theme while the preference is "system". */
export function watchSystemTheme() {
  media().addEventListener('change', apply)
}

/** Resolved palette colors for SVG charts; updates when the theme changes. */
export function useThemeColors() {
  const read = () => {
    const s = getComputedStyle(document.documentElement)
    const v = (name: string) => s.getPropertyValue(name).trim()
    return {
      ink: v('--ink'),
      muted: v('--muted'),
      line: v('--line'),
      surface: v('--surface'),
      accent: v('--accent'),
      warn: v('--warn'),
      over: v('--over'),
    }
  }
  const [colors, setColors] = useState(read)
  useEffect(() => {
    const update = () => setColors(read())
    window.addEventListener(EVENT, update)
    return () => window.removeEventListener(EVENT, update)
  }, [])
  return colors
}
