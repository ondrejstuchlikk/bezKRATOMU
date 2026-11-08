import { RequirePlan } from '../components/layout'
import { useSubstance } from '../hooks/substance'
import { IntakeTodayPage } from './IntakeTodayPage'
import { TodayPage } from './TodayPage'

/** Dnes tab: kratom needs a plan; other substances are plain tracking. */
export function TodayRoute() {
  const { substance } = useSubstance()
  if (substance !== 'kratom') return <IntakeTodayPage substance={substance} />
  return (
    <RequirePlan>
      <TodayPage />
    </RequirePlan>
  )
}
