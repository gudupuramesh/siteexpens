/**
 * WhiteboardTab — grid of Excalidraw whiteboards for the project.
 *
 * Mirrors `interior-os backend`'s `WhiteboardListPage.tsx` — same flow:
 * grid of saved boards, tap to resume editing, "+ New" to start blank.
 * Each board card shows the board's saved SVG snapshot as a true vector
 * thumbnail (no WebView needed for previews).
 */
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SvgXml } from 'react-native-svg';

import { useAuth } from '@/src/features/auth/useAuth';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { useOrgMembers } from '@/src/features/org/useOrgMembers';
import { Spinner } from '@/src/ui/Spinner';
import { AlertSheet } from '@/src/ui/io';
import { color, fontFamily } from '@/src/theme/tokens';

import type { Whiteboard } from '@/src/features/whiteboard/types';
import {
  createWhiteboard,
  deleteWhiteboard,
  updateWhiteboard,
} from '@/src/features/whiteboard/whiteboard';
import { useWhiteboards } from '@/src/features/whiteboard/useWhiteboard';
import { WhiteboardEditor } from '@/src/features/whiteboard/WhiteboardEditor';
import { sanitizeSvgXml } from '@/src/features/whiteboard/sanitizeSvg';

function relTime(d: Date): string {
  const ms = Date.now() - d.getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

// ── Component ─────────────────────────────────────────────────────────

export function WhiteboardTab() {
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const { members } = useOrgMembers(orgId || undefined);
  const { data: boards, loading } = useWhiteboards(projectId, orgId || undefined);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Whiteboard | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const me = useMemo(() => {
    if (!user) return null;
    const member = members.find((m) => m.uid === user.uid);
    return {
      uid: user.uid,
      name: member?.displayName ?? user.email ?? 'You',
    };
  }, [user, members]);

  const nextTitle = useMemo(() => {
    let n = 1;
    while (boards.some((b) => b.title === `Sketch ${n}`)) n++;
    return `Sketch ${n}`;
  }, [boards]);

  function openNew() {
    setEditing(null);
    setEditorOpen(true);
  }
  function openExisting(b: Whiteboard) {
    setEditing(b);
    setEditorOpen(true);
  }

  async function handleSave(payload: {
    scene: string;
    title: string;
    thumbnailSvg?: string;
    elementCount: number;
  }) {
    // Throw (not silent return) so the editor's persist() catches it,
    // surfaces a banner, and leaves the board "dirty" for the user to
    // retry. Silent returns previously made the editor *think* the save
    // succeeded -- so dirty got cleared and nothing was ever written.
    if (!projectId) {
      throw new Error('No project selected — cannot save whiteboard.');
    }
    if (!me || !orgId) {
      throw new Error('Not signed in to an organization — cannot save.');
    }
    try {
      if (editing) {
        await updateWhiteboard({
          boardId: editing.id,
          title: payload.title,
          scene: payload.scene,
          thumbnailSvg: payload.thumbnailSvg,
          elementCount: payload.elementCount,
        });
      } else {
        const newId = await createWhiteboard({
          orgId,
          projectId,
          authorId: me.uid,
          authorName: me.name,
          title: payload.title,
          scene: payload.scene,
          thumbnailSvg: payload.thumbnailSvg,
          elementCount: payload.elementCount,
        });
        // Switch into "edit mode" on the new doc so subsequent saves
        // update instead of duplicating.
        setEditing({
          id: newId,
          orgId,
          projectId,
          authorId: me.uid,
          authorName: me.name,
          title: payload.title,
          scene: payload.scene,
          thumbnailSvg: payload.thumbnailSvg,
          elementCount: payload.elementCount,
          createdAt: null,
          updatedAt: null,
        });
      }
    } catch (e) {
      console.warn('[whiteboard] save failed', e);
      throw e;
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      await deleteWhiteboard(deleteId);
    } catch (e) {
      console.warn(e);
    } finally {
      setDeleteId(null);
    }
  }

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <RNText style={styles.eyebrow}>
            WHITEBOARDS · {boards.length}
          </RNText>
          <Pressable onPress={openNew} style={styles.newBtn} hitSlop={6}>
            <Ionicons name="add" size={14} color="#fff" />
            <RNText style={styles.newBtnText}>New</RNText>
          </Pressable>
        </View>

        {loading && boards.length === 0 ? (
          <View style={styles.empty}>
            <Spinner size={24} />
          </View>
        ) : boards.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="brush-outline" size={28} color={color.textFaint} />
            <RNText style={styles.emptyTitle}>No whiteboards yet.</RNText>
            <RNText style={styles.emptySub}>
              Sketch ideas, floor-plans, walkthroughs — full Excalidraw,
              save, resume.
            </RNText>
            <Pressable onPress={openNew} style={styles.emptyBtn}>
              <Ionicons name="add" size={14} color="#fff" />
              <RNText style={styles.newBtnText}>Create your first board</RNText>
            </Pressable>
          </View>
        ) : (
          <View style={styles.grid}>
            {boards.map((b) => (
              <BoardCard
                key={b.id}
                board={b}
                onPress={() => openExisting(b)}
                onLongPress={() => setDeleteId(b.id)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <WhiteboardEditor
        visible={editorOpen}
        onClose={() => {
          setEditorOpen(false);
          setEditing(null);
        }}
        onSave={handleSave}
        initialTitle={editing?.title ?? nextTitle}
        initialScene={editing?.scene}
      />

      <AlertSheet
        visible={!!deleteId}
        onClose={() => setDeleteId(null)}
        tone="danger"
        icon="trash"
        title="Delete whiteboard?"
        message="This permanently removes the saved board. This can't be undone."
        actions={[
          { label: 'Cancel', variant: 'default' },
          { label: 'Delete', variant: 'destructive', onPress: () => void handleDelete() },
        ]}
      />
    </View>
  );
}

// ── Card ─────────────────────────────────────────────────────────────

function BoardCard({
  board,
  onPress,
  onLongPress,
}: {
  board: Whiteboard;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const updated = board.updatedAt?.toDate();
  const ago = updated ? relTime(updated) : '—';
  const count = board.elementCount ?? 0;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
    >
      {/* Thumbnail — saved SVG snapshot from Excalidraw, falls back to
          a placeholder when the board is empty or missing a snapshot.
          Sanitised before render: Excalidraw output commonly contains
          anonymous `<mask>` / `<clipPath>` elements (no `id`) which
          crash react-native-svg's iOS renderer. The sanitiser
          synthesises ids for those and drops `<foreignObject>`. */}
      <View style={styles.thumb}>
        {board.thumbnailSvg ? (
          <SvgXml
            xml={sanitizeSvgXml(board.thumbnailSvg)}
            width="100%"
            height="100%"
          />
        ) : (
          <View style={styles.thumbEmpty}>
            <Ionicons name="brush-outline" size={20} color={color.textFaint} />
          </View>
        )}
      </View>

      <View style={styles.cardFooter}>
        <RNText style={styles.cardTitle} numberOfLines={1}>
          {board.title}
        </RNText>
        <View style={styles.cardMetaRow}>
          <RNText style={styles.cardMeta}>
            {count} {count === 1 ? 'ELEM' : 'ELEMS'}
          </RNText>
          <RNText style={styles.cardMeta}>{ago.toUpperCase()}</RNText>
        </View>
      </View>
    </Pressable>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const GUTTER = 16;
const GAP = 10;
// Compute card width from real screen width so two cards reliably fit
// per row -- percentage-based widths combined with `gap` were rounding
// the second card to a new row on some devices.
const SCREEN_W = Dimensions.get('window').width;
const CARD_W = Math.floor((SCREEN_W - GUTTER * 2 - GAP) / 2);

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bgGrouped },
  scroll: { paddingTop: 14, paddingBottom: 40 },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: GUTTER,
    paddingBottom: 12,
  },
  eyebrow: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    fontWeight: '600',
    color: color.textFaint,
    letterSpacing: 1.4,
  },
  newBtn: {
    height: 28,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: color.primary,
    borderRadius: 8,
  },
  newBtnText: {
    fontFamily: fontFamily.sans,
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: GUTTER,
    gap: GAP,
  },
  card: {
    width: CARD_W,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    borderRadius: 10,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  thumb: {
    // 1:1 reads cleaner in a 2-col grid than 4:3 (which made cards
    // taller than wide and wasted vertical space).
    aspectRatio: 1,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border,
    overflow: 'hidden',
  },
  thumbEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardFooter: { padding: 10 },
  cardTitle: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    fontWeight: '600',
    color: color.text,
    letterSpacing: -0.1,
  },
  cardMetaRow: {
    marginTop: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardMeta: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    color: color.textFaint,
    letterSpacing: 0.8,
  },

  empty: {
    paddingVertical: 50,
    paddingHorizontal: 32,
    alignItems: 'center',
    gap: 6,
  },
  emptyTitle: {
    fontFamily: fontFamily.sans,
    fontSize: 14,
    fontWeight: '600',
    color: color.text,
    marginTop: 4,
  },
  emptySub: {
    fontFamily: fontFamily.sans,
    fontSize: 12,
    color: color.textMuted,
    textAlign: 'center',
  },
  emptyBtn: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 32,
    paddingHorizontal: 14,
    backgroundColor: color.primary,
  },
});
