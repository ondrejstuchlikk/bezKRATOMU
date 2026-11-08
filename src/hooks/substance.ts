import { createContext, createElement, useContext, useState, type ReactNode } from 'react'
import { trackedSubstances, type Substance } from '../lib/substances'
import { useSettings } from './queries'

const STORAGE_KEY = 'substance'

interface SubstanceState {
  /** The substance the tabs show. Always one of `tracked`. */
  substance: Substance
  setSubstance: (s: Substance) => void
  tracked: Substance[]
}

const SubstanceContext = createContext<SubstanceState>({ substance: 'kratom', setSubstance: () => {}, tracked: ['kratom'] })

function stored(): Substance | null {
  try {
    return localStorage.getItem(STORAGE_KEY) as Substance | null
  } catch {
    return null
  }
}

/** Which substance the app shows; remembered per device. Use inside RequireAuth. */
export function SubstanceProvider({ children }: { children: ReactNode }) {
  const settings = useSettings()
  const tracked = trackedSubstances(settings.data)
  const [choice, setChoice] = useState<Substance | null>(stored)
  const substance = choice && tracked.includes(choice) ? choice : 'kratom'

  function setSubstance(s: Substance) {
    setChoice(s)
    try {
      localStorage.setItem(STORAGE_KEY, s)
    } catch {
      // ignore
    }
  }

  return createElement(SubstanceContext.Provider, { value: { substance, setSubstance, tracked } }, children)
}

export function useSubstance(): SubstanceState {
  return useContext(SubstanceContext)
}
