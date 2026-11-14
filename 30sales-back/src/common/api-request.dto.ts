import type { IncomingHttpHeaders } from 'node:http';
import { readCorrelationId } from './request-context';
export class ApiRequestDto {
  readonly correlationId: string | null;
  constructor(readonly headers: IncomingHttpHeaders) {
    this.correlationId = readCorrelationId(headers);
  }
}
