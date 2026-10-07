export type ForexSessionKey = 'SYDNEY' | 'TOKYO' | 'LONDON' | 'NEW_YORK';

export interface ForexSession {
  key: ForexSessionKey;
  city: string;
  label: string;
  timeZone: string;
  openHour: number;
  closeHour: number;
  weight: number;
  textClass: string;
  barClass: string;
}

export interface ForexSessionSegment {
  leftPct: number;
  widthPct: number;
}

export interface ForexSessionStatus {
  isOpen: boolean;
  minutesToChange: number;
}

export type ForexActivityLevel = 'High' | 'Medium' | 'Low' | 'Closed';

export interface ForexTimezoneOption {
  value: string;
  label: string;
}
