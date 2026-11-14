import { AsyncLocalStorage } from 'node:async_hooks';
import type { IncomingHttpHeaders } from 'node:http';

export type RequestContext = { correlationId: string | null };
export const requestContext = new AsyncLocalStorage<RequestContext>();

export function readCorrelationId(headers: IncomingHttpHeaders): string | null {
  const requestId = headers['x-request-id'];
  return typeof requestId === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(requestId) ? requestId : null;
}
