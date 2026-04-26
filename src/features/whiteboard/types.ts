/**
 * Whiteboard — Excalidraw-backed sketch documents per project.
 *
 * Mirrors the `interior-os backend` web app (`@excalidraw/excalidraw`
 * v0.18) — we store the FULL serialized Excalidraw scene as a JSON
 * string on the doc, plus a small SVG thumbnail captured at save-time
 * for the grid preview.
 *
 * The previous "vector elements array" model is gone; Excalidraw owns
 * its own element schema.
 */
import type { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

export type Whiteboard = {
  id: string;
  orgId: string;
  projectId: string;
  authorId: string;
  authorName: string;
  /** Display title — auto-numbered "Sketch 1", "Sketch 2"…  */
  title: string;
  /** Full Excalidraw scene as a JSON string (output of
   *  `serializeAsJSON(elements, appState, files, 'local')`). */
  scene?: string;
  /** Cached element count — for the grid card. */
  elementCount?: number;
  /** Inline SVG snapshot captured on save — used by the grid thumbnail
   *  so we don't need to spin up a WebView per card. */
  thumbnailSvg?: string;
  createdAt: FirebaseFirestoreTypes.Timestamp | null;
  updatedAt: FirebaseFirestoreTypes.Timestamp | null;
};
