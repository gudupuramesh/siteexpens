/**
 * Whiteboard tab — v2 design.
 *
 * Layout:
 *   1. Header — uppercase eyebrow + "+ New" pill
 *   2. 2-up grid of v2 surface cards. Each card:
 *      - 1:1 SVG thumbnail (sanitized) or empty-state icon
 *      - Title + element count + relative-time meta line
 *   3. Empty state with "Create your first board" CTA
 *
 * Long-press a card → Delete confirmation (kept v1 AlertSheet).
 */
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SvgXml } from 'react-native-svg';

import { useAuth } from '@/src/features/auth/useAuth';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { useOrgMembers } from '@/src/features/org/useOrgMembers';
import { AlertSheet } from '@/src/ui/io';

import type { Whiteboard } from '@/src/features/whiteboard/types';
import {
  createWhiteboard,
  deleteWhiteboard,
  updateWhiteboard,
} from '@/src/features/whiteboard/whiteboard';
import { useWhiteboards } from '@/src/features/whiteboard/useWhiteboard';
import { WhiteboardEditor } from '@/src/features/whiteboard/WhiteboardEditor';
import { sanitizeSvgXml } from '@/src/features/whiteboard/sanitizeSvg';

import { Text } from '@/src/ui/v2/Text';
import { usePullToRefresh } from '@/src/ui/v2/usePullToRefresh';
import { useThemeV2 } from '@/src/theme/v2';

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

const GUTTER = 16;
const GAP = 10;
const SCREEN_W = Dimensions.get('window').width;
const CARD_W = Math.floor((SCREEN_W - GUTTER * 2 - GAP) / 2);

export function WhiteboardTab() {
  const t = useThemeV2();
  const refresh = usePullToRefresh();
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
        refreshControl={<RefreshControl {...refresh.props} />}
      >
        <View style={styles.headerRow}>
          <Text
            variant="caption2"
            color="secondary"
            style={{ letterSpacing: 0.5 }}
          >
            {`WHITEBOARDS · ${boards.length}`}
          </Text>
          <Pressable
            onPress={openNew}
            hitSlop={6}
            style={({ pressed }) => [
              styles.newBtn,
              {
                backgroundColor: t.palette.blue.base,
                borderRadius: 999,
              },
              pressed && { opacity: 0.86 },
            ]}
          >
            <Ionicons name="add" size={14} color="#fff" />
            <Text
              variant="caption2"
              style={{
                color: '#fff',
                fontWeight: '700',
                marginLeft: 4,
                letterSpacing: 0.3,
              }}
            >
              NEW
            </Text>
          </Pressable>
        </View>

        {loading && boards.length === 0 ? (
          <View style={styles.empty}>
            <ActivityIndicator color={t.palette.blue.base} />
          </View>
        ) : boards.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="brush-outline" size={32} color={t.colors.tertiary} />
            <Text
              variant="callout"
              color="label"
              style={{ marginTop: 12, fontWeight: '600' }}
            >
              No whiteboards yet
            </Text>
            <Text
              variant="caption1"
              color="secondary"
              style={{ marginTop: 4, textAlign: 'center', paddingHorizontal: 32 }}
            >
              Sketch ideas, floor-plans, walkthroughs — full Excalidraw, save, resume.
            </Text>
            <Pressable
              onPress={openNew}
              style={({ pressed }) => [
                styles.emptyBtn,
                {
                  backgroundColor: t.palette.blue.base,
                  borderRadius: t.radii.field,
                },
                pressed && { opacity: 0.86 },
              ]}
            >
              <Ionicons name="add" size={14} color="#fff" />
              <Text
                variant="footnote"
                style={{
                  color: '#fff',
                  fontWeight: '700',
                  marginLeft: 6,
                }}
              >
                Create your first board
              </Text>
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

function BoardCard({
  board,
  onPress,
  onLongPress,
}: {
  board: Whiteboard;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const t = useThemeV2();
  const updated = board.updatedAt?.toDate();
  const ago = updated ? relTime(updated) : '—';
  const count = board.elementCount ?? 0;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: t.colors.surface,
          borderRadius: t.radii.card,
          borderColor:
            t.mode === 'dark'
              ? 'rgba(255,255,255,0.05)'
              : 'rgba(0,0,0,0.04)',
          borderWidth: t.hairline,
        },
        pressed && { opacity: 0.85 },
      ]}
    >
      <View
        style={[
          styles.thumb,
          {
            backgroundColor: t.mode === 'dark' ? '#FFFFFF' : '#FFFFFF',
            borderBottomColor: t.colors.separator,
            borderBottomWidth: t.hairline,
          },
        ]}
      >
        {board.thumbnailSvg ? (
          <SvgXml
            xml={sanitizeSvgXml(board.thumbnailSvg)}
            width="100%"
            height="100%"
          />
        ) : (
          <View style={styles.thumbEmpty}>
            <Ionicons name="brush-outline" size={20} color={t.colors.tertiary} />
          </View>
        )}
      </View>

      <View style={styles.cardFooter}>
        <Text
          variant="footnote"
          color="label"
          style={{ fontWeight: '700' }}
          numberOfLines={1}
        >
          {board.title}
        </Text>
        <View style={styles.cardMetaRow}>
          <Text
            variant="caption2"
            color="tertiary"
            style={{ letterSpacing: 0.4 }}
          >
            {count} {count === 1 ? 'ELEM' : 'ELEMS'}
          </Text>
          <Text
            variant="caption2"
            color="tertiary"
            style={{ letterSpacing: 0.4 }}
          >
            {ago.toUpperCase()}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingTop: 14, paddingBottom: 40 },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: GUTTER,
    paddingBottom: 12,
  },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: GUTTER,
    gap: GAP,
  },
  card: {
    width: CARD_W,
    overflow: 'hidden',
  },
  thumb: {
    aspectRatio: 1,
    overflow: 'hidden',
  },
  thumbEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardFooter: {
    padding: 10,
  },
  cardMetaRow: {
    marginTop: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  empty: {
    paddingVertical: 56,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  emptyBtn: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
});
