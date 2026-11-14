import { Controller, Get, Headers as RequestHeaders, UnauthorizedException } from '@nestjs/common';
import { auth } from '../auth/auth';
@Controller('api/v1')
export class SessionController { @Get('session') async getSession(@RequestHeaders() headers: Record<string,string|string[]|undefined>) { const requestHeaders = new Headers(Object.entries(headers).flatMap(([key,value]) => value === undefined ? [] : [[key, Array.isArray(value) ? value.join(', ') : value]])); const session = await auth.api.getSession({ headers: requestHeaders }); if (!session) throw new UnauthorizedException(); const organizations = await auth.api.listOrganizations({ headers: requestHeaders }); return { user: session.user, activeOrganizationId: session.session.activeOrganizationId ?? null, organizations }; } }
