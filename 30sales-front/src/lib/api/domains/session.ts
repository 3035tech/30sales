import { request } from '../request';
import { sessionSchema } from '../contracts';


export const sessionApi = { get: () => request('/api/v1/session', sessionSchema) };
