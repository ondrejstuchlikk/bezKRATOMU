import { cs } from '../i18n/cs'
import { isSupabaseConfigured } from '../lib/supabase'

export function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-6 py-12">
      <header className="space-y-3">
        <span className="inline-block rounded-full bg-accent/15 px-3 py-1 text-sm font-medium text-accent">
          {cs.home.comingSoon}
        </span>
        <h1 className="font-display text-5xl font-semibold tracking-tight">{cs.appName}</h1>
        <p className="text-lg text-muted">{cs.tagline}</p>
      </header>

      <p className="rounded-2xl border border-line bg-surface p-5 leading-relaxed">{cs.home.intro}</p>

      <p className="flex items-center gap-2 text-sm text-muted">
        <span
          aria-hidden
          className={`size-2.5 rounded-full ${isSupabaseConfigured ? 'bg-accent' : 'bg-warn'}`}
        />
        {isSupabaseConfigured ? cs.setup.supabaseReady : cs.setup.supabaseMissing}
      </p>
    </main>
  )
}
