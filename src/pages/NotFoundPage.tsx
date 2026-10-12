import { Link } from 'react-router-dom'
import { cs } from '../i18n/cs'

export function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6">
      <h1 className="font-display text-3xl font-semibold">{cs.notFound.title}</h1>
      <Link
        to="/"
        className="inline-flex min-h-12 items-center justify-center rounded-xl bg-accent px-5 font-semibold text-accent-ink"
      >
        {cs.notFound.back}
      </Link>
    </main>
  )
}
