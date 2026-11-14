export class SessionUserDto {
  constructor(readonly id: string, readonly name: string, readonly email: string) {}
}
export class SessionOrganizationDto {
  constructor(readonly id: string, readonly name: string, readonly slug: string) {}
}
export class SessionResponseDto {
  constructor(readonly user: SessionUserDto, readonly activeOrganizationId: string | null, readonly organizations: SessionOrganizationDto[]) {}
}
