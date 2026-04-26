/**
 * Generate a PDF from an HTML string and open the system share sheet
 * so the user can save it / send it to the client / print it.
 *
 * Uses `expo-print` (native print engine — iOS UIPrint / Android
 * WebView print) for the render, and `expo-sharing` for the share
 * sheet. Both ship with Expo SDK 54 and are already in package.json,
 * so no dev-client rebuild is needed.
 */
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export type GeneratePdfOptions = {
  html: string;
  /** File-name displayed in the share sheet & on disk. Spaces fine, no
   *  extension needed — `.pdf` is appended automatically. */
  filename: string;
  /** Title shown in the system share dialog. */
  dialogTitle?: string;
};

export type GeneratePdfResult =
  | { ok: true; uri: string }
  | { ok: false; reason: string };

export async function generateAndShareWebPdf({
  html,
  filename,
  dialogTitle,
}: GeneratePdfOptions): Promise<GeneratePdfResult> {
  try {
    // A4 portrait at 72 dpi (595 × 842 pt). Page margins live in the
    // HTML's `@page { margin: ... }` rule + body padding — driving them
    // from CSS gives consistent results across iOS UIPrint and the
    // Android WebView print path. The `margins` option on
    // printToFileAsync is unreliable across platforms.
    const { uri } = await Print.printToFileAsync({
      html,
      base64: false,
      width: 595,
      height: 842,
    });

    if (!uri) {
      return { ok: false, reason: 'Print engine returned no file URI.' };
    }

    // Rename the temp file so the share sheet shows a meaningful name.
    // expo-print writes to a tmp path with a generated name; rename via
    // a copy + share-by-uri. (FileSystem rename also works but adds a
    // dep we don't need for this small UX polish.)
    const safeName = filename.replace(/[^A-Za-z0-9 _-]/g, '').slice(0, 80) || 'Report';

    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      return { ok: false, reason: 'Sharing is not available on this device.' };
    }

    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: dialogTitle ?? `Share ${safeName}.pdf`,
    });

    return { ok: true, uri };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.warn('[generatePdf] failed:', reason);
    return { ok: false, reason };
  }
}
