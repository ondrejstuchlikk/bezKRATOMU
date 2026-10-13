// Supabase Edge Function: delivers due web push notifications.
// Called every 5 minutes by pg_cron (supabase/migrations/0010_push_cron.sql).
// What to send is decided by private.claim_push_notifications() in the database;
// this function only encrypts the messages and hands them to the push services.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET
// SUPABASE_DB_URL is provided by Supabase automatically.

import postgres from 'npm:postgres@3.4.7'
import webpush from 'npm:web-push@3.6.7'

interface Due {
  endpoint: string
  p256dh: string
  auth: string
  title: string
  body: string
  url: string
  tag: string
}

const env = (name: string) => {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`missing secret ${name}`)
  return value
}

webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'))

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== env('CRON_SECRET')) return new Response('forbidden', { status: 403 })

  const sql = postgres(env('SUPABASE_DB_URL'), { prepare: false, max: 1 })
  try {
    const due = await sql<Due[]>`select * from private.claim_push_notifications()`
    const gone: string[] = []
    let sent = 0
    await Promise.all(
      due.map(async (n) => {
        try {
          await webpush.sendNotification(
            { endpoint: n.endpoint, keys: { p256dh: n.p256dh, auth: n.auth } },
            JSON.stringify({ title: n.title, body: n.body, url: n.url, tag: n.tag }),
            { TTL: 6 * 3600, urgency: 'normal' },
          )
          sent++
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode
          // 404/410: the user revoked permission or reinstalled; forget the device.
          if (status === 404 || status === 410) gone.push(n.endpoint)
          else console.error('push failed', status, (err as Error).message)
        }
      }),
    )
    if (gone.length) await sql`select private.remove_push_subscriptions(${gone})`
    return Response.json({ due: due.length, sent, removed: gone.length })
  } finally {
    await sql.end()
  }
})
