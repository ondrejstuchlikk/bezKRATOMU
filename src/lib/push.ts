// Browser side of web push: permission, subscription of this device, and a
// local test notification. The server side lives in supabase/functions/push.

import { backend } from '../api'
import { VAPID_PUBLIC_KEY } from '../config/push'

/**
 * - ready: notifications can be turned on (or already are)
 * - ios-install: iPhone/iPad in Safari; push only works once the app is added to the home screen
 * - unsupported: this browser has no web push
 * - denied: the user blocked notifications for this app in the browser/phone settings
 */
export type PushAvailability = 'ready' | 'ios-install' | 'unsupported' | 'denied'

export interface PushKeys {
  endpoint: string
  p256dh: string
  auth: string
}

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}

export function pushAvailability(): PushAvailability {
  if (isIos() && !isStandalone()) return 'ios-install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  return 'ready'
}

/** The VAPID key as bytes (it is base64url-encoded). */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

function toKeys(sub: PushSubscription): PushKeys {
  const json = sub.toJSON()
  return { endpoint: sub.endpoint, p256dh: json.keys!.p256dh, auth: json.keys!.auth }
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null
  const registration = await navigator.serviceWorker.getRegistration()
  return (await registration?.pushManager.getSubscription()) ?? null
}

/**
 * Asks for permission and subscribes this device. Must be called right from a
 * tap (iOS requires it). Returns null when the user doesn't allow notifications.
 */
export async function subscribeThisDevice(): Promise<PushKeys | null> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return null
  const registration = await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  const sub =
    existing ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }))
  return toKeys(sub)
}

/** Unsubscribes this device; returns its endpoint so the server copy can be deleted too. */
export async function unsubscribeThisDevice(): Promise<string | null> {
  const sub = await currentSubscription()
  if (!sub) return null
  const endpoint = sub.endpoint
  await sub.unsubscribe()
  return endpoint
}

/** Turns off push on this device and forgets it on the server, e.g. before logging out. */
export async function disablePushOnThisDevice(): Promise<void> {
  const endpoint = await unsubscribeThisDevice()
  if (endpoint) await backend.deletePushSubscription(endpoint)
}

/** Shows a notification right away (no server involved) to confirm it works. */
export async function showLocalNotification(body: string): Promise<void> {
  const registration = await navigator.serviceWorker.ready
  await registration.showNotification('bezKRATOMU', { body, icon: 'pwa-192x192.png', tag: 'test' })
}
