export enum InputType {
  TEXT = 'TEXT',
  TEXTAREA = 'TEXTAREA',
  DATE = 'DATE', // Custom Day/Month/Year picker
  BOOLEAN_PASS_FAIL = 'BOOLEAN_PASS_FAIL', // Sim/Não
  RATING_10 = 'RATING_10', // 0-10
  HEADER = 'HEADER', // Section header
  INFO = 'INFO', // Informational text
}

export interface ChecklistItem {
  id: string;
  text: string;
  type: InputType;
  required?: boolean;
  helpText?: string;
}

export interface ChecklistSection {
  id: string;
  title: string;
  items: ChecklistItem[];
}

export interface ChecklistDefinition {
  id: string;
  title: string;
  description: string;
  sections: ChecklistSection[];
}

export interface ChecklistImages {
  [key: string]: string[]; // Array of base64 strings
}

export interface ChecklistData {
  [key: string]: string | number | boolean | null;
}

export interface StockConferenceSummary {
  total: number;
  matched: number;
  divergent: number;
  pending: number;
  percent: number;
  signatures?: {
    pharmacist?: string | null;
    manager?: string | null;
  };
  duration_ms?: number;
  durationMs?: number;
  startedAt?: string;
  started_at?: string;
  endedAt?: string;
  ended_at?: string;
}

// --- NEW SHARED TYPES ---

export type ThemeColor = 'red' | 'green' | 'blue' | 'yellow';

export interface AppConfig {
  pharmacyName: string;
  logo: string | null;
}

export type UserRole = 'MASTER' | 'ADMINISTRATIVO' | 'USER';

export interface User {
  email: string;
  password: string;
  name: string;
  phone: string;
  role: UserRole;
  approved: boolean;
  rejected?: boolean;
  photo?: string;
  preferredTheme?: ThemeColor;
  company_id?: string | null;
  area?: string | null;
  filial?: string | null;
}

export interface ReportHistoryItem {
  id: string;
  userEmail: string;
  userName: string;
  date: string; // ISO string
  pharmacyName: string;
  score: string;
  formData: Record<string, ChecklistData>;
  images: Record<string, ChecklistImages>;
  signatures: Record<string, Record<string, string>>;
  ignoredChecklists: string[]; // IDs
  empresa_avaliada?: string;
  companyName?: string; // Alias para compatibilidade
  area?: string;
  filial?: string;
  gestor?: string;
  createdAt?: string; // Alias para compatibilidade
}

export interface StockConferenceHistoryItem {
  id: string;
  userEmail: string;
  userName: string;
  branch: string;
  area: string;
  pharmacist: string;
  manager: string;
  total: number;
  matched: number;
  divergent: number;
  pending: number;
  percent: number;
  pharmacistSignature?: string | null;
  managerSignature?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  durationMs?: number | null;
  createdAt: string;
}

export interface CompanyArea {
  name: string;
  branches: string[];
}

export type AccessLevelId = 'MASTER' | 'ADMINISTRATIVO' | 'USER';

export interface AccessModule {
  id: string;
  label: string;
  note?: string;
}

export interface AccessLevelMeta {
  id: AccessLevelId;
  title: string;
  description: string;
  badgeLabel: string;
  badgeClasses: string;
}

export interface ActiveSession {
  client_id: string;
  user_email: string;
  user_name: string | null;
  branch: string | null;
  area: string | null;
  current_view: string | null;
  last_ping: string;
  command: 'FORCE_LOGOUT' | 'RELOAD' | null;
  updated_at: string;
}
