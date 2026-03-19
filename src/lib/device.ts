export function getOrCreateDeviceId() {
  const key = 'writespark.device_id'
  let value = window.localStorage.getItem(key)
  if (!value) {
    value = `guest_${crypto.randomUUID().replaceAll('-', '')}`
    window.localStorage.setItem(key, value)
  }
  return value
}

export function getSessionToken() {
  return window.localStorage.getItem('writespark.session_token')
}

export function setSessionToken(token: string | null) {
  if (token) window.localStorage.setItem('writespark.session_token', token)
  else window.localStorage.removeItem('writespark.session_token')
}
