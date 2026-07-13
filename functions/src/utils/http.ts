// fetch con TIMEOUT (AbortController). El webhook de MP ahora procesa SÍNCRONO antes de responder;
// un fetch colgado (API de MP / Resend lentos o sin responder) bloquearía la respuesta más allá de
// la ventana de notificación de MP (~20s) y dispararía reintentos aunque el trabajo termine OK.
// Con timeout cortamos y fallamos rápido (el que llama ya maneja el error: retry vía 500, o warn).
export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 10000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}
