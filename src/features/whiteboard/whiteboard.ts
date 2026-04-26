/**
 * Whiteboard CRUD — `whiteboards/{boardId}`.
 *
 * Stores the full Excalidraw scene JSON + a small SVG thumbnail so the
 * grid can preview each board without spinning up a WebView per card.
 */
import firestore from '@react-native-firebase/firestore';

import { db } from '@/src/lib/firebase';

export type CreateWhiteboardInput = {
  orgId: string;
  projectId: string;
  authorId: string;
  authorName: string;
  title?: string;
  scene?: string;
  thumbnailSvg?: string;
  elementCount?: number;
};

export async function createWhiteboard(input: CreateWhiteboardInput): Promise<string> {
  const ref = db.collection('whiteboards').doc();
  const doc: Record<string, unknown> = {
    orgId: input.orgId,
    projectId: input.projectId,
    authorId: input.authorId,
    authorName: input.authorName,
    title: input.title?.trim() || 'Untitled board',
    createdAt: firestore.FieldValue.serverTimestamp(),
    updatedAt: firestore.FieldValue.serverTimestamp(),
  };
  if (input.scene) doc.scene = input.scene;
  if (input.thumbnailSvg) doc.thumbnailSvg = input.thumbnailSvg;
  if (input.elementCount !== undefined) doc.elementCount = input.elementCount;
  await ref.set(doc);
  return ref.id;
}

export type UpdateWhiteboardInput = {
  boardId: string;
  title?: string;
  scene?: string;
  thumbnailSvg?: string;
  elementCount?: number;
};

export async function updateWhiteboard(input: UpdateWhiteboardInput): Promise<void> {
  const patch: Record<string, unknown> = {
    updatedAt: firestore.FieldValue.serverTimestamp(),
  };
  if (input.title !== undefined) patch.title = input.title.trim() || 'Untitled board';
  if (input.scene !== undefined) patch.scene = input.scene;
  if (input.thumbnailSvg !== undefined) patch.thumbnailSvg = input.thumbnailSvg;
  if (input.elementCount !== undefined) patch.elementCount = input.elementCount;
  await db.collection('whiteboards').doc(input.boardId).update(patch);
}

export async function deleteWhiteboard(id: string): Promise<void> {
  await db.collection('whiteboards').doc(id).delete();
}
