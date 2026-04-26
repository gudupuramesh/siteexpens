import type { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

export type TaskStatus = 'not_started' | 'ongoing' | 'completed';
export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskCategory = string;

export type TaskCategoryOption = { key: TaskCategory; label: string };

export const DEFAULT_TASK_CATEGORIES: TaskCategoryOption[] = [
  { key: 'electrical', label: 'Electrical' },
  { key: 'plumbing', label: 'Plumbing' },
  { key: 'woodwork', label: 'Woodwork' },
  { key: 'design', label: 'Design' },
  { key: 'cleaning', label: 'Cleaning' },
  { key: 'floor_cleaning', label: 'Floor Cleaning' },
  { key: 'floor_matting', label: 'Floor Matting' },
  { key: 'painting', label: 'Painting' },
  { key: 'false_ceiling', label: 'False Ceiling' },
  { key: 'tiling', label: 'Tiling' },
  { key: 'general', label: 'General' },
];

export type Task = {
  id: string;
  orgId: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  /** Task bucket for quick filtering/context in timeline and detail. */
  category?: TaskCategory;
  startDate: FirebaseFirestoreTypes.Timestamp | null;
  endDate: FirebaseFirestoreTypes.Timestamp | null;
  /** Progress percent 0–100. Mirrors the most recent TaskUpdate.progress. */
  progress: number;
  /** partyId of the assignee (empty string when unassigned). */
  assignedTo: string;
  /** Denormalized party name for cheap list rendering. */
  assignedToName: string;
  /** Task-level reference photos (added at create/edit time, not per-update). */
  photoUris: string[];
  createdBy: string;
  createdAt: FirebaseFirestoreTypes.Timestamp | null;
  updatedAt: FirebaseFirestoreTypes.Timestamp | null;
};

/**
 * A progress post on a task. Append-only feed: members write a note + photos +
 * the new % after this update. Whoever posts the latest update defines
 * `task.progress`. Bumping to 100 auto-completes the task.
 */
export type TaskUpdate = {
  id: string;
  authorId: string;
  authorName: string;
  /** New progress percent after this post (0–100). */
  progress: number;
  /** Optional narrative. */
  text: string;
  /** Optional photo attachments. */
  photoUris: string[];
  createdAt: FirebaseFirestoreTypes.Timestamp | null;
};
