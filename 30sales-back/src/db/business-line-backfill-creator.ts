export interface BusinessLineBackfillMember {
  userId: string;
}

export interface BusinessLineBackfillInvitation {
  inviterId: string;
}

export function selectBusinessLineBackfillCreator(
  members: readonly BusinessLineBackfillMember[],
  activeInvitations: readonly BusinessLineBackfillInvitation[],
): string | null {
  return members[0]?.userId ?? activeInvitations[0]?.inviterId ?? null;
}
