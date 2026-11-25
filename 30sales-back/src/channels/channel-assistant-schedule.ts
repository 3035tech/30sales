import { CHANNEL_ASSISTANT_SCHEDULE_MODE } from './channels.constants';
import type { ChannelAssistantScheduleMode, ChannelBusinessHourDto } from './channels.dto';

export type ChannelScheduleExceptionWindow = { localDate: string; assistantEnabled: boolean; startTime: string | null; endTime: string | null; endDayOffset?: number | null };

export function localDateAt(timeZone: string, at: Date): string | null {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
  const year = parts.find(({ type }) => type === 'year')?.value;
  const month = parts.find(({ type }) => type === 'month')?.value;
  const day = parts.find(({ type }) => type === 'day')?.value;
  return year && month && day ? `${year}-${month}-${day}` : null;
}

export function isAssistantAllowedAt(input: { mode: ChannelAssistantScheduleMode; timeZone: string; businessHours: ChannelBusinessHourDto[]; scheduleException?: ChannelScheduleExceptionWindow | null; scheduleExceptions?: ChannelScheduleExceptionWindow[]; at?: Date }): boolean {
  const at = input.at ?? new Date();
  const localDate = localDateAt(input.timeZone, at);
  const exceptions = input.scheduleExceptions ?? (input.scheduleException ? [input.scheduleException] : []);
  const currentException = localDate ? exceptions.find((exception) => exception.localDate === localDate) : undefined;
  if (currentException?.endDayOffset == null && currentException) {
    if (!currentException.assistantEnabled) return false;
    if (currentException.startTime === null && currentException.endTime === null) return true;
    if (currentException.startTime === null || currentException.endTime === null) return false;
    return isWithinSameDayWindow(input.timeZone, currentException.startTime, currentException.endTime, at);
  }
  if (currentException && !currentException.assistantEnabled) return false;
  if (currentException?.endDayOffset != null && currentException.startTime === null && currentException.endTime === null) return currentException.assistantEnabled;
  if (localDate) {
    const localMinutes = localMinutesAt(input.timeZone, at);
    if (localMinutes !== null && exceptions.some((exception) => {
      if (!exception.assistantEnabled || exception.endDayOffset == null || exception.startTime === null || exception.endTime === null) return false;
      const elapsedDays = differenceInLocalDays(exception.localDate, localDate);
      if (elapsedDays < 0 || elapsedDays > exception.endDayOffset) return false;
      const elapsedMinutes = elapsedDays * 1440 + localMinutes;
      return elapsedMinutes >= toMinutes(exception.startTime) && elapsedMinutes < exception.endDayOffset * 1440 + toMinutes(exception.endTime);
    })) return true;
    if (currentException) return false;
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

export function shiftLocalDate(localDate: string, days: number): string {
  return new Date(Date.parse(`${localDate}T00:00:00.000Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function differenceInLocalDays(fromDate: string, toDate: string): number {
  return (Date.parse(`${toDate}T00:00:00.000Z`) - Date.parse(`${fromDate}T00:00:00.000Z`)) / 86_400_000;
}

function localMinutesAt(timeZone: string, at: Date): number | null {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const hour = Number(parts.find(({ type }) => type === 'hour')?.value ?? -1);
  const minute = Number(parts.find(({ type }) => type === 'minute')?.value ?? -1);
  return hour < 0 || minute < 0 ? null : hour * 60 + minute;
}

function isWithinSameDayWindow(timeZone: string, startTime: string, endTime: string, at: Date): boolean {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const hour = Number(parts.find(({ type }) => type === 'hour')?.value ?? -1);
  const minute = Number(parts.find(({ type }) => type === 'minute')?.value ?? -1);
  if (hour < 0 || minute < 0) return false;
  const now = hour * 60 + minute;
  return now >= toMinutes(startTime) && now < toMinutes(endTime);
}
