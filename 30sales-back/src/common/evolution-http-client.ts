import { Agent as HttpAgent, request as httpRequest } from 'node:http';
import { Agent as HttpsAgent, request as httpsRequest } from 'node:https';
import { Readable } from 'node:stream';
import { lookupPublicEvolutionTarget } from './assert-public-evolution-target';

const evolutionHttpAgent = new HttpAgent({ keepAlive: true, maxSockets: 64, maxFreeSockets: 8, timeout: 30_000 });
const evolutionHttpsAgent = new HttpsAgent({ keepAlive: true, maxSockets: 64, maxFreeSockets: 8, timeout: 30_000 });

/** Fetch an Evolution endpoint through the exact public IP that was validated. */
export async function evolutionFetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Evolution target is invalid.');
  const body = request.body ? Buffer.from(await request.arrayBuffer()) : undefined;
  const headers = Object.fromEntries(request.headers.entries());
  const transport = url.protocol === 'https:' ? httpsRequest : httpRequest;

  return new Promise<Response>((resolve, reject) => {
    const outgoing = transport(url, {
      method: request.method,
      headers,
      signal: request.signal,
      agent: url.protocol === 'https:' ? evolutionHttpsAgent : evolutionHttpAgent,
      lookup: lookupPublicEvolutionTarget,
    }, (incoming) => {
      if (request.redirect === 'error' && incoming.statusCode && incoming.statusCode >= 300 && incoming.statusCode < 400) {
        incoming.resume();
        reject(new Error('Evolution redirects are not allowed.'));
        return;
      }
      const responseHeaders = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (Array.isArray(value)) for (const item of value) responseHeaders.append(name, item);
        else if (value !== undefined) responseHeaders.set(name, value);
      }
      const status = incoming.statusCode ?? 502;
      const responseBody = status === 204 || status === 205 || status === 304 || request.method === 'HEAD'
        ? (incoming.resume(), null)
        : Readable.toWeb(incoming) as ReadableStream<Uint8Array>;
      resolve(new Response(responseBody, { status, statusText: incoming.statusMessage, headers: responseHeaders }));
    });
    outgoing.once('error', reject);
    if (body) outgoing.write(body);
    outgoing.end();
  });
}
