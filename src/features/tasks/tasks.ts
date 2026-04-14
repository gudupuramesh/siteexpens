import firestore from '@react-native-firebase/firestore';
import { db } from '@/src/lib/firebase';
import type { TaskStatus } from './types';

export type CreateTaskInput = {
  orgId: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  startDate: Date;
  endDate: Date | null;
  quantity: number;
  completedQuantity: number;
  unit: string;
  assignedTo: string;
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
    startDate: firestore.Timestamp.fromDate(input.startDate),
    endDate: input.endDate ? firestore.Timestamp.fromDate(input.endDate) : null,
    quantity: input.quantity,
    completedQuantity: input.completedQuantity,
    unit: input.unit,
    assignedTo: input.assignedTo,
    createdBy: input.createdBy,
    createdAt: firestore.FieldValue.serverTimestamp(),
  });
  return ref.id;
}

export async function updateTaskStatus(taskId: string, status: TaskStatus): Promise<void> {
  await db.collection('tasks').doc(taskId).update({ status });
}

export async function updateTaskProgress(taskId: string, completedQuantity: number): Promise<void> {
  await db.collection('tasks').doc(taskId).update({ completedQuantity });
}
