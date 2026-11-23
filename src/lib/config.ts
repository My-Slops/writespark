export const CONFIG = {
  WORD_LIMIT_PER_ENTRY: 3000,
  /** Hard cap on entry size in characters (server-validated; client checks it too). */
  MAX_CONTENT_CHARS: 100_000,
  AUTOSAVE_DEBOUNCE_MS: 800,
  SESSION_EXPIRY_DAYS: 30,
  PASSWORD_MIN_LENGTH: 8,
  DEVICE_ID_MIN_LENGTH: 12,
  SESSION_TOKEN_MIN_LENGTH: 10,
  // Auth rate limits. State is per-process memory (resets on restart, not shared across instances).
  /** Failed logins per (email, client IP) pair before that pair is locked for the window. */
  LOGIN_MAX_FAILURES_PER_EMAIL_IP: 10,
  /** Backstop: failed logins per email across all IPs (distributed guessing). */
  LOGIN_MAX_FAILURES_PER_EMAIL: 50,
  LOGIN_FAILURE_WINDOW_MS: 15 * 60 * 1000,
  /** Failed logins per client IP (successful logins are not counted). */
  LOGIN_MAX_FAILURES_PER_IP: 30,
  /** Signup attempts per client IP (every attempt counts). */
  AUTH_MAX_ATTEMPTS_PER_IP: 30,
  AUTH_IP_WINDOW_MS: 15 * 60 * 1000,
  DB_CONNECTION_POOL: {
    MAX_CONNECTIONS: 10,
    IDLE_TIMEOUT_SECONDS: 20,
    MAX_LIFETIME_SECONDS: 60 * 30,
    CONNECT_TIMEOUT_SECONDS: 10,
  },
} as const
