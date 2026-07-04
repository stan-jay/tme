export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const REQUEST_TIMEOUT_MS = 15_000;

export async function apiFetch<T>(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
      signal: options.signal ?? controller.signal,
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        typeof body?.message === 'string'
          ? body.message
          : Array.isArray(body?.message)
            ? body.message.join(', ')
            : `Request failed with status ${response.status}`;
      throw new Error(message);
    }
    return body as T;
  } catch (caught) {
    if (caught instanceof DOMException && caught.name === 'AbortError') {
      throw new Error(`Backend did not respond within ${REQUEST_TIMEOUT_MS / 1000}s at ${API_URL}`);
    }
    if (caught instanceof TypeError) {
      throw new Error(`Cannot reach backend at ${API_URL}. Check VITE_API_URL, CORS, and whether the backend is running.`);
    }
    throw caught;
  } finally {
    window.clearTimeout(timeout);
  }
}
