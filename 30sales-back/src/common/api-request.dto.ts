import type { IncomingHttpHeaders } from 'node:http';
export class ApiRequestDto {
  readonly correlationId: string | null;
  constructor(readonly headers: IncomingHttpHeaders) {
    const requestId = headers['x-request-id'];
    this.correlationId = typeof requestId === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(requestId) ? requestId : null;
  }
}
