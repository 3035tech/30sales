import { selectBusinessLineBackfillCreator } from './business-line-backfill-creator';

describe('selectBusinessLineBackfillCreator', () => {
  it('uses the first organization member when one exists', () => {
    expect(selectBusinessLineBackfillCreator([{ userId: 'member-1' }], [{ inviterId: 'inviter-1' }])).toBe('member-1');
  });

  it('uses an active invitation inviter while the organization has no members', () => {
    expect(selectBusinessLineBackfillCreator([], [{ inviterId: 'inviter-1' }])).toBe('inviter-1');
  });

  it('returns null when the organization has neither members nor active invitations', () => {
    expect(selectBusinessLineBackfillCreator([], [])).toBeNull();
  });
});
