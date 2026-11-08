import { RequirePlan } from '../components/layout'
import { useSubstance } from '../hooks/substance'
import { IntakeTodayPage } from './IntakeTodayPage'
import { NicotineTodayPage } from './NicotineTodayPage'
import { TodayPage } from './TodayPage'

/** Dnes tab: kratom needs a plan; other substances are plain tracking. */
export function TodayRoute() {
  const { substance } = useSubstance()
  if (substance === 'caffeine') return <IntakeTodayPage substance={substance} />
  if (substance === 'nicotine') return <NicotineTodayPage />
  return (
    <RequirePlan>
      <TodayPage />
    </RequirePlan>
  )
}
