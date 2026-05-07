/**
 * OrgSwitcherSheet — bottom-sheet card list for switching active org.
 *
 * Primary entry: tap the studio-name pill at the top-left of the
 * Overview tab (`app/(app)/(tabs)/overview.tsx`). The sheet shows
 * every org the signed-in user is in as a card with:
 *   - Avatar (initials, accent-coloured)
 *   - Studio name
 *   - "Yours" / "Team" badge
 *   - Role label + active-state hint
 *   - Active studio gets a primary checkmark
 *
 * Tap any card → `setActiveOrg` (callable + token claims refresh) →
 * sheet auto-dismisses; the calling screen re-renders against the
 * new org via `useTokenClaims` / `usePermissions`. Perceived
 * latency is sub-second (the slow Firestore-snapshot chain that
 * old switching used is bypassed by the auth-claims fast path).
 *
 * Footer "+ Create your studio" appears ONLY when the user does
 * not already own a studio — matches the one-owned-studio-per-user
 * product rule (server-side enforced by `createOrganization`
 * Cloud Function; this is the UX layer).
 *
 * Reused by Profile screen indirectly: Profile keeps its own
 * inline switcher modal as a settings-style fallback, but the
 * OrgPill on Overview is the primary entry now.
 */
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '@/src/features/auth/useAuth';
import { db } from '@/src/lib/firebase';

import { useCurrentOrganization } from './useCurrentOrganization';
import { useMyOrganizations } from './useMyOrganizations';
import { useTokenClaims } from './useTokenClaims';
import { setActiveOrg } from './setActiveOrg';
import { Text } from '@/src/ui/Text';
import { color, screenInset, space } from '@/src/theme';

export type OrgSwitcherSheetProps = {
  visible: boolean;
  onClose: () => void;
};

export function OrgSwitcherSheet({ visible, onClose }: OrgSwitcherSheetProps) {
  const { data: currentOrg } = useCurrentOrganization();
  const { orgs: myOrgs, loading: orgsLoading } = useMyOrganizations();
  const { refresh: refreshClaims } = useTokenClaims();
  const { user } = useAuth();

  const [busy, setBusy] = useState(false);
  const [pendingTargetId, setPendingTargetId] = useState<string | null>(null);

  const activeOrgId = currentOrg?.id ?? null;
  const ownsAnOrg = myOrgs.some((o) => o.isYourStudio);

  const onPickOrg = useCallback(
    async (targetId: string) => {
      if (targetId === activeOrgId) {
        onClose();
        return;
      }
      if (!user) return;
      setPendingTargetId(targetId);
      setBusy(true);
      try {
        // Wire a one-shot listener that resolves when the local
        // `users/{uid}` snapshot reflects the new primaryOrgId. The
        // server write + snapshot delivery typically lands in
        // ~150 ms; setActiveOrg awaits this barrier so the next
        // render past `onClose()` sees the correct primaryOrgId
        // everywhere (usePermissions then routes through the
        // new-org fallback role immediately, instead of trusting
        // the 1–2 s stale token claims).
        const waitForUserDoc = () =>
          new Promise<void>((resolve) => {
            const unsub = db
              .collection('users')
              .doc(user.uid)
              .onSnapshot(
                (snap) => {
                  const next = snap.data() as
                    | { primaryOrgId?: string }
                    | undefined;
                  if (next?.primaryOrgId === targetId) {
                    unsub();
                    resolve();
                  }
                },
                () => {
                  // Snapshot error — fall through; the timeout
                  // inside setActiveOrg will release us anyway.
                  unsub();
                  resolve();
                },
              );
          });

        await setActiveOrg(targetId, {
          refresh: refreshClaims,
          waitForUserDoc,
        });

        // After a successful switch, drop the user back at the home
        // tab. The previous deep route (e.g. a CRM or Finance screen)
        // may not be accessible in the new role; rendering it with
        // the new permissions can flash an empty / "no access" view.
        // Replacing the stack avoids the flash and is symmetric to
        // first-sign-in landing behaviour.
        router.replace('/(app)/(tabs)' as never);
        onClose();
      } catch (err) {
        // Don't auto-close on failure so the user can read the
        // status & retry. (Errors here are rare — usually network or
        // permission-denied for an org the caller no longer belongs
        // to.) Previously this just console.warn'd, which made the
        // bug invisible — the spinner stopped and the sheet stayed
        // open with no feedback. Surfacing as an Alert so the user
        // knows something went wrong AND so future regressions of
        // this kind don't ship silently.
        console.warn('[OrgSwitcherSheet] switch failed:', err);
        const msg = (err as { message?: string })?.message
          ?? 'Could not switch studio. Check your connection and try again.';
        Alert.alert('Switch failed', msg);
      } finally {
        setBusy(false);
        setPendingTargetId(null);
      }
    },
    [activeOrgId, onClose, refreshClaims, user],
  );

  const onCreateStudio = useCallback(() => {
    if (busy) return;
    onClose();
    // Onboarding screen accepts ?mode=add to bypass the "already
    // onboarded" redirect. Server-side createOrganization rejects
    // a second create — we hide this row when ownsAnOrg, but
    // belt-and-braces.
    router.push('/(onboarding)/organization?mode=add' as never);
  }, [busy, onClose]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      presentationStyle="overFullScreen"
      onRequestClose={() => {
        if (!busy) onClose();
      }}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => {
            if (!busy) onClose();
          }}
        />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <Text variant="title" color="text">
              Switch studio
            </Text>
            <Pressable
              hitSlop={12}
              onPress={() => {
                if (!busy) onClose();
              }}
            >
              <Ionicons name="close" size={22} color={color.textMuted} />
            </Pressable>
          </View>

          <Text variant="caption" color="textMuted" style={styles.hint}>
            Choose where projects, transactions and tasks load from. You stay signed in.
          </Text>

          {orgsLoading ? (
            <View style={styles.loadingBlock}>
              <ActivityIndicator color={color.primary} />
            </View>
          ) : (
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {myOrgs.map((row) => {
                const active = row.id === activeOrgId;
                const accent = orgAccentColor(row.name);
                const initials = orgShortName(row.name);
                return (
                  <Pressable
                    key={row.id}
                    onPress={() => void onPickOrg(row.id)}
                    disabled={busy}
                    style={({ pressed }) => [
                      styles.card,
                      active && styles.cardActive,
                      pressed && !active && { opacity: 0.85 },
                    ]}
                  >
                    <View style={[styles.avatar, { backgroundColor: accent }]}>
                      <Text style={styles.avatarText}>{initials}</Text>
                    </View>
                    <View style={styles.cardBody}>
                      <View style={styles.titleRow}>
                        <Text variant="bodyStrong" color="text" numberOfLines={1} style={styles.name}>
                          {row.name}
                        </Text>
                        <View
                          style={[
                            styles.kindBadge,
                            row.isYourStudio ? styles.kindBadgeYours : styles.kindBadgeTeam,
                          ]}
                        >
                          <Text
                            variant="metaStrong"
                            color={row.isYourStudio ? 'success' : 'textMuted'}
                            style={styles.kindBadgeText}
                          >
                            {row.isYourStudio ? 'YOURS' : 'TEAM'}
                          </Text>
                        </View>
                      </View>
                      <Text variant="caption" color="textMuted">
                        {row.roleLabel}
                        {active ? ' · Active' : ' · Tap to switch'}
                      </Text>
                    </View>
                    {busy && pendingTargetId === row.id ? (
                      <ActivityIndicator color={color.primary} />
                    ) : active ? (
                      <Ionicons name="checkmark-circle" size={22} color={color.primary} />
                    ) : (
                      <Ionicons name="chevron-forward" size={18} color={color.textFaint} />
                    )}
                  </Pressable>
                );
              })}

              {/* "+ Create your studio" — only when the user has no
                  owned studio yet. One-owned-studio-per-user rule
                  enforced server-side by createOrganization too. */}
              {!ownsAnOrg ? (
                <Pressable
                  onPress={onCreateStudio}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.createRow,
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <View style={styles.createIcon}>
                    <Ionicons name="add" size={20} color={color.primary} />
                  </View>
                  <View style={styles.cardBody}>
                    <Text variant="bodyStrong" color="primary">
                      Create your studio
                    </Text>
                    <Text variant="caption" color="textMuted">
                      Set up your own workspace · You stay signed in
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={color.primary} />
                </Pressable>
              ) : null}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ── Avatar helpers ───────────────────────────────────────────────
//
// Lifted from `app/(app)/(tabs)/overview.tsx` so the avatar in the
// sheet matches the avatar in the OrgPill exactly. Inline here to
// avoid creating a shared util for two callers.

const ACCENT_PALETTE = [
  '#0EA5E9', '#22C55E', '#F97316', '#A855F7', '#E11D48',
  '#0891B2', '#84CC16', '#EA580C', '#7C3AED', '#DB2777',
];

function orgAccentColor(name: string): string {
  if (!name) return ACCENT_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return ACCENT_PALETTE[hash % ACCENT_PALETTE.length];
}

function orgShortName(name: string): string {
  if (!name) return '·';
  const words = name.trim().split(/\s+/).slice(0, 2);
  return words.map((w) => w.charAt(0).toUpperCase()).join('');
}

// ── Styles ───────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: color.bg,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingBottom: 28,
    maxHeight: '76%',
  },
  handle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 4,
    backgroundColor: color.borderStrong,
    marginTop: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: screenInset,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  hint: {
    paddingHorizontal: screenInset,
    paddingBottom: space.sm,
  },
  loadingBlock: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { maxHeight: 480 },
  listContent: {
    paddingHorizontal: screenInset,
    paddingBottom: space.md,
    gap: 10,
  },

  // Card row
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: color.bg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: color.borderStrong,
  },
  cardActive: {
    borderColor: color.primary,
    backgroundColor: color.primarySoft,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  cardBody: { flex: 1, minWidth: 0, gap: 4 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  name: { flex: 1, minWidth: 0 },

  kindBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    flexShrink: 0,
  },
  kindBadgeYours: {
    backgroundColor: color.successSoft,
  },
  kindBadgeTeam: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.borderStrong,
  },
  kindBadgeText: { fontSize: 10, letterSpacing: 0.6 },

  // "+ Create your studio" footer
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: color.bg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: color.primary,
    borderStyle: 'dashed',
    marginTop: 4,
  },
  createIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: color.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
