import { CHANNEL_ASSISTANT_SCHEDULE_MODE } from './channels.constants';
import type { ChannelAssistantScheduleMode, ChannelBusinessHourDto } from './channels.dto';

export type ChannelScheduleExceptionWindow = { localDate: string; assistantEnabled: boolean; startTime: string | null; endTime: string | null };

export function localDateAt(timeZone: string, at: Date): string | null {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
  const year = parts.find(({ type }) => type === 'year')?.value;
  const month = parts.find(({ type }) => type === 'month')?.value;
  const day = parts.find(({ type }) => type === 'day')?.value;
  return year && month && day ? `${year}-${month}-${day}` : null;
}

export function isAssistantAllowedAt(input: { mode: ChannelAssistantScheduleMode; timeZone: string; businessHours: ChannelBusinessHourDto[]; scheduleException?: ChannelScheduleExceptionWindow | null; at?: Date }): boolean {
  const at = input.at ?? new Date();
  const localDate = localDateAt(input.timeZone, at);
  if (localDate && input.scheduleException?.localDate === localDate) {
    if (!input.scheduleException.assistantEnabled) return false;
    if (input.scheduleException.startTime === null && input.scheduleException.endTime === null) return true;
    if (input.scheduleException.startTime === null || input.scheduleException.endTime === null) return false;
    return isWithinSameDayWindow(input.timeZone, input.scheduleException.startTime, input.scheduleException.endTime, at);
  }
  if (input.mode === CHANNEL_ASSISTANT_SCHEDULE_MODE.always) return true;
  if (input.mode === CHANNEL_ASSISTANT_SCHEDULE_MODE.disabled) return false;
  const isOpen = isWithinBusinessHours({ timeZone: input.timeZone, businessHours: input.businessHours, at });
  return input.mode === CHANNEL_ASSISTANT_SCHEDULE_MODE.businessHours ? isOpen : !isOpen;
}

export function isWithinBusinessHours(input: { timeZone: string; businessHours: ChannelBusinessHourDto[]; at?: Date }): boolean {
  if (input.businessHours.length === 0) return true;
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: input.timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(input.at ?? new Date());
  const weekday = new Map([['Sun', 0], ['Mon', 1], ['Tue', 2], ['Wed', 3], ['Thu', 4], ['Fri', 5], ['Sat', 6]]).get(parts.find(({ type }) => type === 'weekday')?.value ?? '');
  const hour = Number(parts.find(({ type }) => type === 'hour')?.value ?? -1);
  const minute = Number(parts.find(({ type }) => type === 'minute')?.value ?? -1);
  if (weekday === undefined || hour < 0 || minute < 0) return false;
  const now = hour * 60 + minute;
  const isOpen = input.businessHours.some((window) => {
    const start = toMinutes(window.startTime); const end = toMinutes(window.endTime);
    if (window.dayOfWeek === weekday) return start < end ? now >= start && now < end : now >= start;
    return window.dayOfWeek === (weekday + 6) % 7 && start > end && now < end;
  });
  return isOpen;
}

function toMinutes(value: string): number { const [hours, minutes] = value.split(':').map(Number); return hours * 60 + minutes; }

function isWithinSameDayWindow(timeZone: string, startTime: string, endTime: string, at: Date): boolean {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const hour = Number(parts.find(({ type }) => type === 'hour')?.value ?? -1);
  const minute = Number(parts.find(({ type }) => type === 'minute')?.value ?? -1);
  if (hour < 0 || minute < 0) return false;
  const now = hour * 60 + minute;
  return now >= toMinutes(startTime) && now < toMinutes(endTime);
}
