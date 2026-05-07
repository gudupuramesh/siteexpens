import { firestore } from '@/src/lib/firebase';
import { db } from '@/src/lib/firebase';
import type { TaskCategory, TaskPriority, TaskStatus } from './types';

export type CreateTaskInput = {
  orgId: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority?: TaskPriority;
  category: TaskCategory;
  startDate: Date;
  endDate: Date | null;
  assignedTo: string;
  assignedToName: string;
  photoUris: string[];
  createdBy: string;
};

export async function createTask(input: CreateTaskInput): Promise<string> {
  const ref = db.collection('tasks').doc();
  await ref.set({
    orgId: input.orgId,
    projectId: input.projectId,
    title: input.title,
    description: input.description,
    status: input.status,
    priority: input.priority ?? 'medium',
    category: input.category,
    startDate: firestore.Timestamp.fromDate(input.startDate),
    endDate: input.endDate ? firestore.Timestamp.fromDate(input.endDate) : null,
    progress: 0,
    assignedTo: input.assignedTo,
    assignedToName: input.assignedToName,
    photoUris: input.photoUris,
    createdBy: input.createdBy,
    createdAt: firestore.FieldValue.serverTimestamp(),
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });
  return ref.id;
}

export type UpdateTaskPatch = Partial<{
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  category: TaskCategory;
  startDate: Date | null;
  endDate: Date | null;
  assignedTo: string;
  assignedToName: string;
  photoUris: string[];
}>;

export async function updateTask(taskId: string, patch: UpdateTaskPatch): Promise<void> {
  const updates: Record<string, unknown> = { ...patch };
  if ('startDate' in patch) {
    updates.startDate = patch.startDate ? firestore.Timestamp.fromDate(patch.startDate) : null;
  }
  if ('endDate' in patch) {
    updates.endDate = patch.endDate ? firestore.Timestamp.fromDate(patch.endDate) : null;
  }
  updates.updatedAt = firestore.FieldValue.serverTimestamp();
  await db.collection('tasks').doc(taskId).update(updates);
}

export async function updateTaskStatus(taskId: string, status: TaskStatus): Promise<void> {
  await db.collection('tasks').doc(taskId).update({
    status,
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });
}

export async function deleteTask(taskId: string): Promise<void> {
  // Firestore does not cascade — best-effort clean up known subcollections.
  const ref = db.collection('tasks').doc(taskId);
  for (const sub of ['updates', 'comments'] as const) {
    try {
      const snap = await ref.collection(sub).get();
      await Promise.all(snap.docs.map((d) => d.ref.delete()));
    } catch (err) {
      console.warn(`[deleteTask] ${sub} cleanup failed:`, err);
    }
  }
  await ref.delete();
}

export type AddTaskUpdateInput = {
  authorId: string;
  authorName: string;
  progress: number; // 0–100
  text: string;
  photoUris: string[];
};

/**
 * Append an update to the task's activity feed and bump the task's rolled-up
 * progress. If progress hits 100, auto-complete the task. If progress moves
 * above 0 from a fresh task, auto-flip to ongoing.
 */
export async function addTaskUpdate(taskId: string, input: AddTaskUpdateInput): Promise<string> {
  const pct = Math.max(0, Math.min(100, Math.round(input.progress)));

  const ref = db.collection('tasks').doc(taskId).collection('updates').doc();
  // Client timestamp so day-range queries in Site/DPR match immediately;
  // serverTimestamp can be pending locally and miss `createdAt` filters.
  await ref.set({
    authorId: input.authorId,
    authorName: input.authorName,
    progress: pct,
    text: input.text,
    photoUris: input.photoUris,
    createdAt: firestore.Timestamp.now(),
  });

  // Roll up to task
  const taskRef = db.collection('tasks').doc(taskId);
  const patch: Record<string, unknown> = {
    progress: pct,
    updatedAt: firestore.FieldValue.serverTimestamp(),
  };

  // Auto-status transitions based on progress change
  const snap = await taskRef.get();
  const prev = snap.data() as { status?: TaskStatus } | undefined;
  if (pct >= 100) patch.status = 'completed';
  else if (pct > 0 && prev?.status === 'not_started') patch.status = 'ongoing';

  await taskRef.update(patch);
  return ref.id;
}
