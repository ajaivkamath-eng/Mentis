/* Structured logging + error tracking hook (Sentry DSN optional).
 * Set VITE_SENTRY_DSN to forward; otherwise logs to console. */
interface Fields { [k: string]: unknown }

const DSN = (import.meta.env.VITE_SENTRY_DSN as string | undefined) ?? '';

function send(level: string, message: string, fields: Fields = {}) {
  const entry = { ts: new Date().toISOString(), level, message, ...fields };
  if (level === 'error') console.error(entry);
  else console.log(entry);
  if (DSN) {
    try {
      navigator.sendBeacon?.(`${DSN}`, JSON.stringify(entry));
    } catch { /* telemetry never breaks the app */ }
  }
}

export const log = {
  info: (message: string, fields?: Fields) => send('info', message, fields),
  warn: (message: string, fields?: Fields) => send('warn', message, fields),
  error: (message: string, fields?: Fields) => send('error', message, fields),
};
