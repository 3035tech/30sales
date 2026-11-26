import { z } from 'zod';
import { apiRequest } from './client';

export class ApiError extends Error { readonly status: number; readonly code: string; constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; this.name = 'ApiError'; } }

export async function request<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  const response = await apiRequest(path, { ...init, headers });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const errorSchema = z.object({ code: z.string().optional(), message: z.string().optional(), error: z.string().optional() }).passthrough();
    const parsedError = errorSchema.safeParse(payload);
    throw new ApiError(response.status, parsedError.success ? parsedError.data.code ?? 'REQUEST_FAILED' : 'REQUEST_FAILED', parsedError.success ? parsedError.data.message ?? parsedError.data.error ?? 'The request could not be completed.' : 'The request could not be completed.');
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new ApiError(502, 'INVALID_API_RESPONSE', 'The server returned an unexpected response.');
  return parsed.data;
}

export async function requestBlob(path: string): Promise<Blob> {
  const headers = new Headers({ accept: 'application/octet-stream' });
  const response = await apiRequest(path, { headers });
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const errorSchema = z.object({ code: z.string().optional(), message: z.string().optional(), error: z.string().optional() }).passthrough();
    const parsedError = errorSchema.safeParse(payload);
    throw new ApiError(response.status, parsedError.success ? parsedError.data.code ?? 'REQUEST_FAILED' : 'REQUEST_FAILED', parsedError.success ? parsedError.data.message ?? parsedError.data.error ?? 'The request could not be completed.' : 'The request could not be completed.');
  }
  return response.blob();
}
