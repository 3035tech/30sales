import { CHANNEL_ASSISTANT_SCHEDULE_MODE } from './channels.constants';
import { isAssistantAllowedAt, localDateAt } from './channel-assistant-schedule';

describe('assistant schedule exceptions', () => {
  const timeZone = 'America/Sao_Paulo';

  it('uses the recurring weekly schedule when no exception applies to the local date', () => {
    const at = new Date('2026-12-25T12:00:00.000Z');

    expect(isAssistantAllowedAt({ mode: CHANNEL_ASSISTANT_SCHEDULE_MODE.businessHours, timeZone, businessHours: [{ dayOfWeek: 5, startTime: '09:00', endTime: '18:00' }], at })).toBe(true);
    expect(isAssistantAllowedAt({ mode: CHANNEL_ASSISTANT_SCHEDULE_MODE.disabled, timeZone, businessHours: [], at, scheduleException: { localDate: '2026-12-24', assistantEnabled: true, startTime: null, endTime: null } })).toBe(false);
  });

  it('lets a full-day holiday exception enable the assistant during the seller’s regular working hours', () => {
    const at = new Date('2026-12-25T12:00:00.000Z');

    expect(isAssistantAllowedAt({ mode: CHANNEL_ASSISTANT_SCHEDULE_MODE.afterHours, timeZone, businessHours: [{ dayOfWeek: 5, startTime: '09:00', endTime: '18:00' }], at, scheduleException: { localDate: '2026-12-25', assistantEnabled: true, startTime: null, endTime: null } })).toBe(true);
  });

  it('limits a custom exception to its same-day interval in the channel time zone', () => {
    const exception = { localDate: '2026-12-25', assistantEnabled: true, startTime: '09:00', endTime: '18:00' };

    expect(isAssistantAllowedAt({ mode: CHANNEL_ASSISTANT_SCHEDULE_MODE.always, timeZone, businessHours: [], scheduleException: exception, at: new Date('2026-12-25T12:00:00.000Z') })).toBe(true);
    expect(isAssistantAllowedAt({ mode: CHANNEL_ASSISTANT_SCHEDULE_MODE.always, timeZone, businessHours: [], scheduleException: exception, at: new Date('2026-12-25T22:00:00.000Z') })).toBe(false);
  });

  it('can disable the assistant for a date even when the recurring mode is always', () => {
    expect(isAssistantAllowedAt({ mode: CHANNEL_ASSISTANT_SCHEDULE_MODE.always, timeZone, businessHours: [], scheduleException: { localDate: '2026-12-25', assistantEnabled: false, startTime: null, endTime: null }, at: new Date('2026-12-25T12:00:00.000Z') })).toBe(false);
  });

  it('resolves exception dates using the channel local date rather than UTC date', () => {
    expect(localDateAt(timeZone, new Date('2026-12-25T02:30:00.000Z'))).toBe('2026-12-24');
  });
});
