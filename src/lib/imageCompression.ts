/**
 * Image compression — single entry point for shrinking a picked image
 * before uploading to R2.
 *
 * We use `expo-image-manipulator` (Expo's official image API, ships with
 * the SDK — no native module to add). Resize on the longest edge and
 * re-encode as JPEG at the chosen quality. Strips EXIF as a side effect.
 *
 * For non-images (e.g. PDF receipts) the helper returns the input
 * unchanged so callers can use one code path for everything.
 *
 * Sizing math for context:
 *   - A typical 12MP smartphone photo is 4032×3024 ≈ 3–4 MB JPEG (or
 *     8–12 MB if HEIC was converted to JPEG at full quality).
 *   - Resizing to 1920px long edge + JPEG 0.75 yields ~300–500 KB —
 *     visually identical on phone screens & printed reports.
 */
import * as ImageManipulator from 'expo-image-manipulator';

import { guessImageMimeType } from './r2Upload';

/** Tunable presets. Single source of truth — tweak the numbers here
 *  and every photo-bearing feature follows. */
export const COMPRESSION_PRESETS = {
  balanced:   { longEdge: 1920, quality: 0.75 },
  aggressive: { longEdge: 1280, quality: 0.65 },
  high:       { longEdge: 2560, quality: 0.85 },
} as const;

export type CompressionPreset = keyof typeof COMPRESSION_PRESETS;
export const DEFAULT_PRESET: CompressionPreset = 'balanced';

export type CompressImageArgs = {
  /** Local file URI (`file://...`). */
  uri: string;
  /** Optional MIME hint. Inferred from the URI extension if absent. */
  contentType?: string;
  /** Compression aggressiveness. Default `balanced`. */
  preset?: CompressionPreset;
};

export type CompressImageResult = {
  /** URI of the compressed (or original, if skipped) file. */
  uri: string;
  /** Final size in bytes. */
  sizeBytes: number;
  /** MIME type to send to R2 (always `image/jpeg` for compressed
   *  images; original MIME for non-images). */
  contentType: string;
  /** True when the file was actually re-encoded; false when we passed
   *  the original through (PDFs, files we can't read, etc.). */
  compressed: boolean;
  /** Size of the original input (post-pick). Useful for logging
   *  "saved 9.7 MB" type telemetry. */
  originalBytes: number;
};

/** Compress an image. Returns a result safe to feed straight into
 *  `uploadToR2()`. PDFs and unknown formats pass through untouched. */
export async function compressImage(
  args: CompressImageArgs,
): Promise<CompressImageResult> {
  const { uri, preset = DEFAULT_PRESET } = args;
  const inputContentType = args.contentType ?? guessImageMimeType(uri);

  // Always probe the original size so the caller can show a savings
  // figure (and so we have an honest "originalBytes" in storage events).
  const originalBytes = await readByteLength(uri);

  // Skip non-images entirely.
  if (!inputContentType.startsWith('image/')) {
    return {
      uri,
      sizeBytes: originalBytes,
      contentType: inputContentType,
      compressed: false,
      originalBytes,
    };
  }

  const { longEdge, quality } = COMPRESSION_PRESETS[preset];

  // expo-image-manipulator picks the long edge automatically when only
  // one dimension is supplied — pass the larger of width/height.
  // We don't know the source dimensions cheaply, so we send BOTH
  // width + height as `undefined` and only constrain via { resize: { width: longEdge } }
  // — this respects aspect ratio AND clamps the longest edge in one
  // call regardless of orientation.
  let manipulated;
  try {
    manipulated = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: longEdge } }],
      {
        compress: quality,
        format: ImageManipulator.SaveFormat.JPEG,
      },
    );
  } catch (e) {
    // If the manipulator can't read the file (e.g. unusual format),
    // fall back to the original — better to upload an oversized file
    // than to fail the user's flow.
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[compressImage] fell back to original: ${msg}`);
    return {
      uri,
      sizeBytes: originalBytes,
      contentType: inputContentType,
      compressed: false,
      originalBytes,
    };
  }

  // For portrait photos, expo-image-manipulator resizing by `width`
  // could end up TALLER than `longEdge`. Re-clamp by height if so.
  if (manipulated.height > longEdge) {
    try {
      manipulated = await ImageManipulator.manipulateAsync(
        manipulated.uri,
        [{ resize: { height: longEdge } }],
        { compress: quality, format: ImageManipulator.SaveFormat.JPEG },
      );
    } catch {
      // keep the previous result
    }
  }

  const finalBytes = await readByteLength(manipulated.uri);

  return {
    uri: manipulated.uri,
    sizeBytes: finalBytes,
    contentType: 'image/jpeg',
    compressed: true,
    originalBytes,
  };
}

/** Read the byte length of a local file by issuing a HEAD-equivalent
 *  via fetch + reading the Blob size. Works on iOS and Android for
 *  `file://` URIs in React Native. */
async function readByteLength(uri: string): Promise<number> {
  try {
    const resp = await fetch(uri);
    const blob = await resp.blob();
    return blob.size ?? 0;
  } catch {
    return 0;
  }
}
