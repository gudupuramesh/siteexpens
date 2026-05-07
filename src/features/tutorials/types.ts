/**
 * Tutorial Videos — shared types.
 *
 * The admin portal writes one doc at `system/tutorialVideos` with a
 * flat map of pageKey → TutorialVideoEntry. The mobile app reads this
 * once via the TutorialsContext (mounted in the authenticated layout)
 * and surfaces the matching video on each page's empty state.
 *
 * Page keys are snake_case and STABLE — never rename them once set,
 * because the admin will have saved URLs against these keys in
 * Firestore.
 */

export type TutorialVideoEntry = {
  /** Full youtube.com/watch?v=... or youtu.be/... URL. */
  youtubeUrl: string;
  /** Short label shown on the card, e.g. "How to add a project". */
  title: string;
  /** Used to group videos on the Tutorials screen. */
  category: string;
  /** Admin can hide a video without deleting its URL. */
  enabled: boolean;
};

/** Shape of the `system/tutorialVideos` Firestore document. */
export type TutorialVideosDoc = Record<string, TutorialVideoEntry>;

/**
 * Canonical page keys. These MUST stay stable — they are the keys
 * stored in Firestore by the admin portal.
 */
export const PAGE_KEYS = [
  'projects',
  'transactions',
  'tasks',
  'dpr',
  'material_requests',
  'crm_leads',
  'crm_appointments',
  'ledger',
  'finance',
  'parties',
  'material_library',
  'staff',
] as const;

export type PageKey = (typeof PAGE_KEYS)[number];

/** Human-readable label for each page key (used in the admin portal). */
export const PAGE_KEY_LABELS: Record<PageKey, string> = {
  projects: 'Projects',
  transactions: 'Project Transactions',
  tasks: 'Project Timeline / Tasks',
  dpr: 'Daily Progress Reports',
  material_requests: 'Material Requests',
  crm_leads: 'CRM Leads',
  crm_appointments: 'CRM Appointments',
  ledger: 'Ledger',
  finance: 'Finance Dashboard',
  parties: 'Parties (Clients / Vendors)',
  material_library: 'Material Library',
  staff: 'Staff',
};

/** Default category for each page key (admin can override). */
export const PAGE_KEY_DEFAULT_CATEGORY: Record<PageKey, string> = {
  projects: 'Projects',
  transactions: 'Projects',
  tasks: 'Projects',
  dpr: 'Projects',
  material_requests: 'Projects',
  crm_leads: 'CRM',
  crm_appointments: 'CRM',
  ledger: 'Finance',
  finance: 'Finance',
  parties: 'Studio',
  material_library: 'Studio',
  staff: 'Studio',
};
