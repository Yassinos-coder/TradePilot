import type {
  ForexActivityLevel,
  ForexSession,
  ForexSessionSegment,
  ForexSessionStatus,
  ForexTimezoneOption,
} from '@/interfaces/forexSessions';

const MINUTES_PER_DAY = 1440;
const VOLUME_SAMPLES = 96;
const SAMPLE_MINUTES = MINUTES_PER_DAY / VOLUME_SAMPLES;
const SESSION_LENGTH_MINUTES = 9 * 60;

export const FOREX_SESSIONS: ReadonlyArray<ForexSession> = [
  { key: 'SYDNEY', city: 'Sydney', label: 'Sydney Session', timeZone: 'Australia/Sydney', openHour: 7, closeHour: 16, weight: 0.35, textClass: 'text-session-sydney', barClass: 'bg-session-sydney' },
  { key: 'TOKYO', city: 'Tokyo', label: 'Tokyo Session', timeZone: 'Asia/Tokyo', openHour: 9, closeHour: 18, weight: 0.55, textClass: 'text-session-asian', barClass: 'bg-session-asian' },
  { key: 'LONDON', city: 'London', label: 'London Session', timeZone: 'Europe/London', openHour: 8, closeHour: 17, weight: 1, textClass: 'text-session-london', barClass: 'bg-session-london' },
  { key: 'NEW_YORK', city: 'New York', label: 'New York Session', timeZone: 'America/New_York', openHour: 8, closeHour: 17, weight: 1, textClass: 'text-session-newyork', barClass: 'bg-session-newyork' },
];

const SYDNEY_SESSION = FOREX_SESSIONS.find((session) => session.key === 'SYDNEY') as ForexSession;
const NEW_YORK_SESSION = FOREX_SESSIONS.find((session) => session.key === 'NEW_YORK') as ForexSession;

export const FOREX_TIMEZONE_OPTIONS: ReadonlyArray<ForexTimezoneOption> = [
  { value: 'local', label: 'My local time' },
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'New York' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Asia/Dubai', label: 'Dubai' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
  { value: 'Australia/Sydney', label: 'Sydney' },
];

export class ForexSessionUtils {
  static resolveTimeZone(choice: string): string {
    if (choice !== 'local') return choice;
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  static offsetMinutes(timeZone: string, date: Date): number {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    }).formatToParts(date);
    const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
    const asUtc = Date.UTC(read('year'), read('month') - 1, read('day'), read('hour'), read('minute'), read('second'));
    const truncated = Math.floor(date.getTime() / 1000) * 1000;
    return Math.round((asUtc - truncated) / 60000);
  }

  static minuteOfDay(date: Date, timeZone: string): number {
    return this.mod(date.getUTCHours() * 60 + date.getUTCMinutes() + this.offsetMinutes(timeZone, date));
  }

  static formatTime(date: Date, timeZone: string): string {
    return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
  }

  static formatWeekday(date: Date, timeZone: string): string {
    return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(date);
  }

  static formatDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
  }

  static formatHour(minuteOfDay: number): string {
    const hour = Math.floor(this.mod(minuteOfDay) / 60);
    const mins = this.mod(minuteOfDay) % 60;
    return `${String(hour).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }

  static getOpenUtcMinute(session: ForexSession, now: Date): number {
    return this.mod(session.openHour * 60 - this.offsetMinutes(session.timeZone, now));
  }

  static isWeekend(now: Date): boolean {
    const day = now.getUTCDay();
    const utcMinute = now.getUTCHours() * 60 + now.getUTCMinutes();
        const fridayCloseUtc = this.mod(NEW_YORK_SESSION.closeHour * 60 - this.offsetMinutes(NEW_YORK_SESSION.timeZone, now));
        const sundayOpenUtc = this.getOpenUtcMinute(SYDNEY_SESSION, now);
    if (day === 6) return true;
    if (day === 5) return utcMinute >= fridayCloseUtc;
    if (day === 0) return utcMinute < sundayOpenUtc;
    return false;
  }

  static getStatus(session: ForexSession, now: Date): ForexSessionStatus {
    const utcMinute = now.getUTCHours() * 60 + now.getUTCMinutes();
    const sinceOpen = this.mod(utcMinute - this.getOpenUtcMinute(session, now));
    const isOpen = !this.isWeekend(now) && sinceOpen < SESSION_LENGTH_MINUTES;
    const minutesToChange = isOpen ? SESSION_LENGTH_MINUTES - sinceOpen : MINUTES_PER_DAY - sinceOpen;
    return { isOpen, minutesToChange };
  }

  static getOpenSessions(now: Date): ForexSession[] {
    return FOREX_SESSIONS.filter((session) => this.getStatus(session, now).isOpen);
  }

  static getSegments(session: ForexSession, now: Date, viewTimeZone: string): ForexSessionSegment[] {
    const viewOffset = this.offsetMinutes(viewTimeZone, now);
    const start = this.mod(this.getOpenUtcMinute(session, now) + viewOffset);
    const end = start + SESSION_LENGTH_MINUTES;
    if (end <= MINUTES_PER_DAY) return [this.toSegment(start, SESSION_LENGTH_MINUTES)];
    return [
      this.toSegment(start, MINUTES_PER_DAY - start),
      this.toSegment(0, end - MINUTES_PER_DAY),
    ];
  }

  static getViewHours(session: ForexSession, now: Date, viewTimeZone: string): string {
    const start = this.mod(this.getOpenUtcMinute(session, now) + this.offsetMinutes(viewTimeZone, now));
    return `${this.formatHour(start)} - ${this.formatHour(start + SESSION_LENGTH_MINUTES)}`;
  }

  static getOverlaps(now: Date, viewTimeZone: string): ForexSessionSegment[] {
    const overlaps: ForexSessionSegment[] = [];
    for (let first = 0; first < FOREX_SESSIONS.length; first += 1) {
      for (let second = first + 1; second < FOREX_SESSIONS.length; second += 1) {
        const firstSegments = this.getSegments(FOREX_SESSIONS[first] as ForexSession, now, viewTimeZone);
        const secondSegments = this.getSegments(FOREX_SESSIONS[second] as ForexSession, now, viewTimeZone);
        for (const a of firstSegments) {
          for (const b of secondSegments) {
            const left = Math.max(a.leftPct, b.leftPct);
            const right = Math.min(a.leftPct + a.widthPct, b.leftPct + b.widthPct);
            if (right - left > 0.01) overlaps.push({ leftPct: left, widthPct: right - left });
          }
        }
      }
    }
    return overlaps;
  }

  static getVolumeProfile(now: Date, viewTimeZone: string): number[] {
    const viewOffset = this.offsetMinutes(viewTimeZone, now);
    const raw = Array.from({ length: VOLUME_SAMPLES + 1 }, (_, index) =>
      this.rawActivity(this.mod(index * SAMPLE_MINUTES - viewOffset), now),
    );
    const max = this.maxActivity(now);
    return raw.map((value) => value / max);
  }

  static getCurrentActivity(now: Date): number {
    const utcMinute = now.getUTCHours() * 60 + now.getUTCMinutes();
    return this.rawActivity(utcMinute, now) / this.maxActivity(now);
  }

  static getActivityLevel(now: Date): ForexActivityLevel {
    if (this.isWeekend(now)) return 'Closed';
    const activity = this.getCurrentActivity(now);
    if (activity >= 0.66) return 'High';
    if (activity >= 0.33) return 'Medium';
    return 'Low';
  }

  private static rawActivity(utcMinute: number, now: Date): number {
    return FOREX_SESSIONS.reduce((total, session) => {
      const progress = this.mod(utcMinute - this.getOpenUtcMinute(session, now)) / SESSION_LENGTH_MINUTES;
      if (progress >= 1) return total;
      return total + session.weight * Math.pow(Math.sin(Math.PI * progress), 0.6);
    }, 0);
  }

  private static maxActivity(now: Date): number {
    let max = 0;
    for (let index = 0; index < VOLUME_SAMPLES; index += 1) {
      max = Math.max(max, this.rawActivity(index * SAMPLE_MINUTES, now));
    }
    return max;
  }

  private static toSegment(startMinute: number, durationMinutes: number): ForexSessionSegment {
    return {
      leftPct: (startMinute / MINUTES_PER_DAY) * 100,
      widthPct: (durationMinutes / MINUTES_PER_DAY) * 100,
    };
  }

  private static mod(minutes: number): number {
    return ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  }
}
