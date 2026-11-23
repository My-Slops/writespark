import { DEVICE_ID_RE } from './validation'

const DEVICE_KEY = 'writespark.device_id'

function generateDeviceId() {
  return `guest_${crypto.randomUUID().replaceAll('-', '')}`
}

export function getOrCreateDeviceId() {
  const value = window.localStorage.getItem(DEVICE_KEY)
  if (value && DEVICE_ID_RE.test(value)) return value
  const fresh = generateDeviceId()
  window.localStorage.setItem(DEVICE_KEY, fresh)
  return fresh
}

/** Store a brand-new device id (e.g. after logout on a shared device) and return it. */
export function resetDeviceId(): string {
  const fresh = generateDeviceId()
  window.localStorage.setItem(DEVICE_KEY, fresh)
  return fresh
}

export function getSessionToken() {
  return window.localStorage.getItem('writespark.session_token')
}

export function setSessionToken(token: string | null) {
  if (token) window.localStorage.setItem('writespark.session_token', token)
  else window.localStorage.removeItem('writespark.session_token')
}
