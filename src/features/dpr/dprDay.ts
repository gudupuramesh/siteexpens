/**
 * Shared helpers for date-scoped DPR / Site views (task overlap, status labels).
 */
import type { FirebaseFirestoreTypes } from '@/src/lib/firebase';

import { DEFAULT_TASK_CATEGORIES, type Task } from '@/src/features/tasks/types';
import { color } from '@/src/theme';

export function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function parseDayBounds(dateKey: string): { dayStart: Date; dayEndExclusive: Date } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dayStart = new Date(y, mo - 1, d, 0, 0, 0, 0);
  const dayEndExclusive = new Date(y, mo - 1, d + 1, 0, 0, 0, 0);
  return { dayStart, dayEndExclusive };
}

export function getCategoryLabel(key: string | undefined): string {
  if (!key) return 'General';
  const fromDefault = DEFAULT_TASK_CATEGORIES.find((c) => c.key === key)?.label;
  if (fromDefault) return fromDefault;
  return key
    .split('_')
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

export function taskOverlapsSelectedDay(
  task: Task,
  dayStart: Date,
  dayEndExclusive: Date,
): boolean {
  const lower = task.startDate?.toDate() ?? task.createdAt?.toDate();
  if (!lower) return false;
  const taskStartDay = startOfLocalDay(lower);
  if (taskStartDay.getTime() >= dayEndExclusive.getTime()) return false;
  if (!task.endDate) return true;
  const taskEndDay = startOfLocalDay(task.endDate.toDate());
  return taskEndDay.getTime() >= dayStart.getTime();
}

export function taskStatusPill(
  task: Task,
  calendarTodayStart: Date,
): { label: string; fg: string; bg: string } {
  if (task.status === 'completed') {
    return { label: 'Done', fg: color.success, bg: color.successSoft };
  }
  const end = task.endDate?.toDate();
  if (end && startOfLocalDay(end).getTime() < calendarTodayStart.getTime()) {
    return { label: 'Overdue', fg: color.danger, bg: color.dangerSoft };
  }
  if (task.status === 'ongoing') {
    return { label: 'Ongoing', fg: color.primary, bg: color.primarySoft };
  }
  return { label: 'Not started', fg: color.textMuted, bg: color.surfaceAlt };
}

/** Minimal shape for matching timeline updates across Site / DPR / PDF. */
export type TaskUpdateDayRow = {
  taskId: string;
  id: string;
  progress: number;
  createdAt: FirebaseFirestoreTypes.Timestamp | null;
};

export function previousProgressForUpdate(
  row: TaskUpdateDayRow,
  allDayUpdates: TaskUpdateDayRow[],
): number {
  const t = row.createdAt ? row.createdAt.toMillis() : 0;
  let best: number | null = null;
  let bestProg = 0;
  for (const u of allDayUpdates) {
    if (u.taskId !== row.taskId) continue;
    const ut = u.createdAt ? u.createdAt.toMillis() : 0;
    if (ut < t && (best === null || ut > best)) {
      best = ut;
      bestProg = u.progress;
    }
  }
  return bestProg;
}
