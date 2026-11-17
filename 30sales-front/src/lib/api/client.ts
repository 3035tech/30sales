const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

export function apiRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('x-request-id', crypto.randomUUID());
  if (init.body && !(typeof FormData !== 'undefined' && init.body instanceof FormData) && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });
}

export function apiEventSource(path: string): EventSource {
  return new EventSource(`${API_BASE_URL}${path}`, { withCredentials: true });
}
