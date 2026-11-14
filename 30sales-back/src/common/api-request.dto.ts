import type { IncomingHttpHeaders } from 'node:http';
export class ApiRequestDto {
  constructor(readonly headers: IncomingHttpHeaders) {}
}
