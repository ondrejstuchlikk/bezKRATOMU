import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { backend, type MySettings } from '../api'
import { keys } from '../hooks/queries'
import { cs } from '../i18n/cs'
import {
  currentSubscription,
  disablePushOnThisDevice,
  pushAvailability,
  showLocalNotification,
  subscribeThisDevice,
  type PushAvailability,
} from '../lib/push'
import { Card, errorMessage, inputClass, Toggle } from './ui'

const REMINDER_HOURS = Array.from({ length: 16 }, (_, i) => i + 8) // 8:00 … 23:00
const DEFAULT_REMINDER_HOUR = 20

export function NotificationSettings({ settings }: { settings: MySettings }) {
  const queryClient = useQueryClient()
  const [availability, setAvailability] = useState<PushAvailability>(() =>
    backend.mode === 'demo' ? 'unsupported' : pushAvailability(),
  )
  const [subscribed, setSubscribed] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (availability !== 'ready') return
    currentSubscription().then(
      (sub) => setSubscribed(!!sub),
      () => setSubscribed(false),
    )
  }, [availability])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(errorMessage(err))
    }
    setBusy(false)
  }

  async function update(patch: Partial<MySettings>) {
    await backend.updateSettings(patch)
    await queryClient.invalidateQueries({ queryKey: keys.settings })
  }

  const toggleDevice = (on: boolean) =>
    run(async () => {
      if (!on) {
        await disablePushOnThisDevice()
        setSubscribed(false)
        return
      }
      const pushKeys = await subscribeThisDevice()
      if (!pushKeys) {
        setAvailability(pushAvailability())
        setError(Notification.permission === 'denied' ? null : cs.notifications.declined)
        return
      }
      await backend.savePushSubscription(pushKeys)
      setSubscribed(true)
      // First time: switch on both kinds, the user can fine-tune below.
      if (settings.reminderHour === null && !settings.notifySocial) {
        await update({ reminderHour: DEFAULT_REMINDER_HOUR, notifySocial: true })
      }
      await showLocalNotification(cs.notifications.enabledTest)
    })

  const message =
    backend.mode === 'demo'
      ? cs.notifications.demo
      : availability === 'ios-install'
        ? cs.notifications.iosInstall
        : availability === 'unsupported'
          ? cs.notifications.unsupported
          : availability === 'denied'
            ? cs.notifications.denied
            : null

  return (
    <Card className="space-y-4">
      <h2 className="font-semibold">{cs.notifications.title}</h2>
      {message ? (
        <p className="text-sm leading-relaxed text-muted">{message}</p>
      ) : (
        <>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-4">
              <span className="font-medium">{cs.notifications.device}</span>
              <div className={busy || subscribed === null ? 'pointer-events-none opacity-50' : ''}>
                <Toggle checked={!!subscribed} onChange={toggleDevice} label={cs.notifications.device} />
              </div>
            </div>
            <p className="text-sm text-muted">{cs.notifications.deviceHint}</p>
          </div>

          <div className="space-y-1.5">
            <label className="font-medium" htmlFor="reminder-hour">
              {cs.notifications.reminder}
            </label>
            <select
              id="reminder-hour"
              className={inputClass}
              value={settings.reminderHour ?? ''}
              disabled={busy}
              onChange={(e) => run(() => update({ reminderHour: e.target.value === '' ? null : Number(e.target.value) }))}
            >
              <option value="">{cs.notifications.reminderOff}</option>
              {REMINDER_HOURS.map((h) => (
                <option key={h} value={h}>
                  {cs.notifications.hour(h)}
                </option>
              ))}
            </select>
            <p className="text-sm text-muted">{cs.notifications.reminderHint}</p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between gap-4">
              <span className="font-medium">{cs.notifications.social}</span>
              <div className={busy ? 'pointer-events-none opacity-50' : ''}>
                <Toggle
                  checked={settings.notifySocial}
                  onChange={(on) => run(() => update({ notifySocial: on }))}
                  label={cs.notifications.social}
                />
              </div>
            </div>
            <p className="text-sm text-muted">{cs.notifications.socialHint}</p>
          </div>

          <p className="text-xs text-muted">{cs.notifications.privacy}</p>
        </>
      )}
      {error && (
        <p className="text-sm text-over" role="alert">
          {error}
        </p>
      )}
    </Card>
  )
}
