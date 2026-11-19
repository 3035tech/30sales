import { channelScheduleExceptionSchema } from './channels.dto';

describe('channelScheduleExceptionSchema', () => {
  const base = { assistantEnabled: true, startTime: null, endTime: null };

  it('accepts a multi-day holiday exception up to 31 days', () => {
    expect(channelScheduleExceptionSchema.safeParse({ ...base, fromDate: '2026-12-20', toDate: '2027-01-19' }).success).toBe(true);
  });

  it('rejects ranges longer than 31 days and reversed dates', () => {
    expect(channelScheduleExceptionSchema.safeParse({ ...base, fromDate: '2026-12-01', toDate: '2027-01-01' }).success).toBe(false);
    expect(channelScheduleExceptionSchema.safeParse({ ...base, fromDate: '2026-12-25', toDate: '2026-12-24' }).success).toBe(false);
  });

  it('rejects invalid calendar dates and intervals that cross midnight', () => {
    expect(channelScheduleExceptionSchema.safeParse({ ...base, fromDate: '2026-02-30', toDate: '2026-02-30' }).success).toBe(false);
    expect(channelScheduleExceptionSchema.safeParse({ ...base, fromDate: '2026-12-25', toDate: '2026-12-25', startTime: '18:00', endTime: '09:00' }).success).toBe(false);
  });
});
