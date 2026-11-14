import { createAuthClient } from 'better-auth/react'
import { organizationClient } from 'better-auth/client/plugins'
import { access, roles } from './permissions'
export const authClient = createAuthClient({ baseURL: import.meta.env.VITE_API_URL ?? '', plugins: [organizationClient({ ac: access, roles })] })
