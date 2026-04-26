/**
 * WhiteboardEditor — the real Excalidraw, embedded in a WebView.
 *
 * Mirrors `interior-os backend`'s `WhiteboardPage.tsx` (which uses
 * `@excalidraw/excalidraw` directly). Since Excalidraw is a web-only
 * library that needs HTML canvas, we host it in a <WebView> and bridge
 * save / load via `postMessage`. See `excalidrawHtml.ts` for the host.
 *
 *   • Header — title (editable), Save (asks Excalidraw for the scene
 *     and the thumbnail SVG, then persists via `onSave`).
 *   • Canvas — full-screen Excalidraw, all native tools (resize,
 *     rotate, library, lock, group, copy/paste, laser via "L" key,
 *     pan & zoom, dark / paper backgrounds, text, image, shapes,
 *     stroke styles, fill, opacity, sloppiness, …).
 *   • Close — prompts to save when there are unsaved changes.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { color, fontFamily } from '@/src/theme/tokens';
import { AlertSheet } from '@/src/ui/io';

import { buildExcalidrawHtml } from './excalidrawHtml';

export type WhiteboardEditorProps = {
  visible: boolean;
  onClose: () => void;
  /** Persist the saved scene + thumbnail. Throws on failure (the editor
   *  surfaces it, keeps the modal open, lets the user retry). */
  onSave: (payload: {
    scene: string;
    title: string;
    thumbnailSvg?: string;
    elementCount: number;
  }) => Promise<void> | void;
  initialTitle?: string;
  initialScene?: string;
};

/** Bridge messages the host HTML emits. */
type IncomingMessage =
  | { type: 'boot'; stage: string }
  | { type: 'ready' }
  | { type: 'change'; count: number; dirty: boolean }
  | { type: 'save'; data: string }
  | { type: 'export'; svg: string }
  | { type: 'error'; stage: string; message: string };

export function WhiteboardEditor({
  visible,
  onClose,
  onSave,
  initialTitle = 'Untitled board',
  initialScene,
}: WhiteboardEditorProps) {
  const webRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [elementCount, setElementCount] = useState(0);
  const [title, setTitle] = useState(initialTitle);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [bootStage, setBootStage] = useState<string>('starting');
  const [bootError, setBootError] = useState<string | null>(null);

  // Pending payload waiting for export — set on Save, cleared after persist.
  const pending = useRef<{ scene: string; count: number } | null>(null);
  // Mirror of `saving` for use inside async timers (avoids stale-closure bugs).
  const savingRef = useRef(false);
  // Set when the user picked "Save & close" — persist() resolves it by
  // calling onClose(). Far simpler & more reliable than polling state via
  // setInterval (which captured stale `saving`/`dirty` and never closed).
  const closeAfterSaveRef = useRef(false);

  // Re-build HTML only when initial scene actually changes (string compare).
  const html = useMemo(
    () => buildExcalidrawHtml({ data: initialScene }),
    [initialScene],
  );

  useEffect(() => {
    if (visible) {
      setReady(false);
      setDirty(false);
      setElementCount(0);
      setTitle(initialTitle);
      setBootStage('starting');
      setBootError(null);
      setSaveError(null);
      pending.current = null;
      savingRef.current = false;
      closeAfterSaveRef.current = false;
    }
  }, [visible, initialTitle]);

  // Keep savingRef in sync so timers/closures can read the live value.
  useEffect(() => { savingRef.current = saving; }, [saving]);

  function postToWeb(msg: object) {
    webRef.current?.postMessage(JSON.stringify(msg));
  }

  function onMessage(e: WebViewMessageEvent) {
    let msg: IncomingMessage;
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'boot') {
      setBootStage(msg.stage);
    } else if (msg.type === 'ready') {
      setReady(true);
      setBootError(null);
    } else if (msg.type === 'change') {
      setElementCount(msg.count);
      // Trust the web's authoritative dirty value (computed by comparing
      // current scene snapshot against the last reported one). Previously
      // we only escalated to true and never cleared, which left the editor
      // permanently "dirty" after any edit -- so the close prompt would
      // appear even AFTER a successful save.
      setDirty(msg.dirty);
    } else if (msg.type === 'save') {
      const count = elementCount;
      pending.current = { scene: msg.data, count };
      postToWeb({ type: 'requestExport' });
    } else if (msg.type === 'export') {
      const stash = pending.current;
      pending.current = null;
      if (!stash) return;
      void persist(stash.scene, msg.svg, stash.count);
    } else if (msg.type === 'error') {
      console.warn(`[whiteboard webview ${msg.stage}]`, msg.message);
      setBootError(`${msg.stage}: ${msg.message}`);
      setSaving(false);
      pending.current = null;
    }
  }

  function reload() {
    setReady(false);
    setBootError(null);
    setBootStage('reloading');
    webRef.current?.reload();
  }

  async function persist(scene: string, svg: string, count: number) {
    try {
      await onSave({
        scene,
        title: title.trim() || 'Untitled board',
        thumbnailSvg: svg,
        elementCount: count,
      });
      setDirty(false);
      setSaveError(null);
      // If this save was triggered by "Save & close", finish the close now
      // that the round-trip succeeded. (Previously a setInterval polled
      // stale `saving`/`dirty` state and never resolved.)
      if (closeAfterSaveRef.current) {
        closeAfterSaveRef.current = false;
        onClose();
      }
    } catch (e) {
      // Surface the failure so the user sees something happened. Cancels
      // any pending "close after save" intent — they need to react first.
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[whiteboard] save failed', e);
      setSaveError(msg || 'Save failed');
      closeAfterSaveRef.current = false;
    } finally {
      setSaving(false);
    }
  }

  function handleSave() {
    if (saving || !ready) return;
    setSaveError(null);
    setSaving(true);
    postToWeb({ type: 'requestSave' });
    // Watchdog — if nothing comes back in 8 s, surface an error. Reads
    // `savingRef` so the timeout sees the live value, not a stale closure.
    setTimeout(() => {
      if (savingRef.current) {
        console.warn('[whiteboard] save timed out');
        setSaving(false);
        setSaveError('Save timed out — check your connection and try again.');
        closeAfterSaveRef.current = false;
      }
    }, 8000);
  }

  function handleClose() {
    if (dirty) {
      setConfirmCloseOpen(true);
    } else {
      onClose();
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent={false}
    >
      <View style={styles.root}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={handleClose} hitSlop={12} style={styles.headerBtn}>
            <Ionicons name="close" size={22} color={color.textMuted} />
          </Pressable>

          <View style={styles.headerTitleWrap}>
            <RNText style={styles.headerEyebrow}>
              WHITEBOARD{elementCount ? ` · ${elementCount} ELEM` : ''}
            </RNText>
            <TextInput
              value={title}
              onChangeText={(t) => {
                setTitle(t);
                setDirty(true);
              }}
              placeholder="Untitled board"
              placeholderTextColor={color.textFaint}
              style={styles.headerTitle}
              maxLength={60}
            />
          </View>

          <Pressable
            onPress={handleSave}
            disabled={saving || !ready}
            hitSlop={6}
            style={({ pressed }) => [
              styles.saveBtn,
              (saving || !ready) && { opacity: 0.5 },
              pressed && ready && !saving && { opacity: 0.85 },
            ]}
          >
            <RNText style={styles.saveText}>
              {saving ? '…' : ready ? 'Save' : 'Loading'}
            </RNText>
          </Pressable>
        </View>

        {/* Save error banner — surfaces failures the user would otherwise
            never see (silent permission-denied, network drops, etc.). */}
        {saveError ? (
          <View style={styles.saveErrorBar}>
            <Ionicons name="alert-circle" size={14} color={color.danger} />
            <RNText style={styles.saveErrorText} numberOfLines={2}>
              {saveError}
            </RNText>
            <Pressable onPress={() => setSaveError(null)} hitSlop={8}>
              <Ionicons name="close" size={14} color={color.danger} />
            </Pressable>
          </View>
        ) : null}

        {/* WebView host */}
        <View style={styles.webWrap}>
          <WebView
            ref={webRef}
            source={{ html, baseUrl: 'https://localhost' }}
            onMessage={onMessage}
            javaScriptEnabled
            domStorageEnabled
            originWhitelist={['*']}
            allowFileAccess
            allowUniversalAccessFromFileURLs
            mixedContentMode="always"
            scalesPageToFit={false}
            setSupportMultipleWindows={false}
            style={styles.web}
            // Defense-in-depth: refuse any nav request that isn't the
            // initial document. Belt-and-braces against Excalidraw (or
            // any future addition) opening github.com / discord.gg /
            // twitter.com etc. inside our WebView. CDN script loads
            // happen via <script src> -- they're not navigations, so
            // this doesn't break Excalidraw's bootstrap.
            onShouldStartLoadWithRequest={(req) => {
              const ok =
                req.url === 'about:blank' ||
                req.url.startsWith('data:') ||
                req.url === 'https://localhost/' ||
                req.url === 'https://localhost';
              if (!ok) console.warn('[whiteboard] blocked external nav:', req.url);
              return ok;
            }}
            // Surface WebView-level errors (no internet, blocked URL, …)
            onError={(e) =>
              setBootError(`webview: ${e.nativeEvent.description}`)
            }
            onHttpError={(e) =>
              setBootError(`http ${e.nativeEvent.statusCode}: ${e.nativeEvent.url}`)
            }
          />

          {/* RN-side loading / error overlay — sits on top of the WebView
              until Excalidraw posts its `ready` message. */}
          {!ready ? (
            <View style={styles.loadingWrap} pointerEvents="box-none">
              <RNText style={styles.loadingText}>Loading whiteboard…</RNText>
              <RNText style={styles.stageText}>{bootStage}</RNText>
              {bootError ? (
                <>
                  <RNText style={styles.errorText}>{bootError}</RNText>
                  <Pressable onPress={reload} style={styles.retryBtn}>
                    <RNText style={styles.retryText}>Retry</RNText>
                  </Pressable>
                </>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>

      {/* Save-before-close prompt */}
      <AlertSheet
        visible={confirmCloseOpen}
        onClose={() => setConfirmCloseOpen(false)}
        tone="warning"
        title={`Save "${title.trim() || 'Untitled board'}"?`}
        message="You have unsaved changes on this whiteboard. Save before closing, or discard them."
        actions={[
          {
            label: 'Discard',
            variant: 'destructive',
            onPress: () => {
              setConfirmCloseOpen(false);
              onClose();
            },
          },
          {
            label: 'Save & close',
            variant: 'primary',
            onPress: () => {
              setConfirmCloseOpen(false);
              // Mark intent — persist() will close once the save round-trip
              // completes successfully. No polling, no closure-stale bugs.
              closeAfterSaveRef.current = true;
              handleSave();
            },
          },
        ]}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgGrouped },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 50,
    paddingBottom: 10,
    backgroundColor: color.bgGrouped,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.borderStrong,
    gap: 6,
  },
  headerBtn: {
    width: 32, height: 32, alignItems: 'center', justifyContent: 'center',
  },
  headerTitleWrap: { flex: 1, minWidth: 0 },
  headerEyebrow: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    fontWeight: '600',
    color: color.textFaint,
    letterSpacing: 1.4,
  },
  headerTitle: {
    fontFamily: fontFamily.sans,
    fontSize: 16,
    fontWeight: '700',
    color: color.text,
    letterSpacing: -0.2,
    padding: 0,
    marginTop: 1,
  },
  saveBtn: {
    height: 32, paddingHorizontal: 14,
    backgroundColor: color.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  saveText: {
    fontFamily: fontFamily.sans,
    fontSize: 13, fontWeight: '600', color: '#fff',
  },
  saveErrorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#FEF2F2',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.danger,
  },
  saveErrorText: {
    flex: 1,
    fontFamily: fontFamily.sans,
    fontSize: 12,
    color: color.danger,
  },

  webWrap: {
    flex: 1,
    backgroundColor: color.surface,
  },
  web: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loadingWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: color.surface,
    gap: 6,
    paddingHorizontal: 24,
  },
  loadingText: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    fontWeight: '600',
    color: color.textMuted,
  },
  stageText: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
    color: color.textFaint,
    letterSpacing: 0.4,
  },
  errorText: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
    color: color.danger,
    textAlign: 'center',
    marginTop: 8,
  },
  retryBtn: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: color.primary,
  },
  retryText: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
});
