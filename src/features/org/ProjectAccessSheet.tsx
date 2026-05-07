/**
 * ProjectAccessSheet — bottom sheet for picking which projects a member
 * can access. Shown after the role is chosen in the Team and Roles
 * flow. Mirrors the screenshot: title row with back arrow + "Select
 * all" toggle, scrollable checkbox list, full-width Save footer.
 *
 * The parent owns the `onSave` mutation (project doc updates or invite
 * upsert). This component is a pure picker with no Firestore I/O.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '@/src/ui/Text';
import { color, radius, screenInset, space } from '@/src/theme';

export type ProjectOption = {
  id: string;
  name: string;
};

export type ProjectAccessSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Header title. Defaults to "Project access". */
  title?: string;
  /** Header subtitle (e.g. member name). */
  subtitle?: string;
  /** All projects in the org. */
  projects: ProjectOption[];
  /** Pre-selected ids. */
  selectedIds: string[];
  /** Save handler. Receives the new selected list. */
  onSave: (ids: string[]) => Promise<void> | void;
  /** Save button copy. Defaults to "Save". */
  saveLabel?: string;
  /**
   * Minimum number of projects that MUST be selected for Save to be
   * enabled. Defaults to 0. Set to 1 for the Client role flow — clients
   * can only see specific projects, never the whole studio, so an
   * empty selection is meaningless and would be rejected by the
   * caller's validation anyway. Disabling Save up-front avoids the
   * dead `Alert.alert` (which is invisible on iOS when fired behind
   * an overFullScreen modal — see team-roles.tsx comment).
   */
  minSelected?: number;
};

export function ProjectAccessSheet({
  visible,
  onClose,
  title = 'Project access',
  subtitle,
  projects,
  selectedIds,
  onSave,
  saveLabel = 'Save',
  minSelected = 0,
}: ProjectAccessSheetProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedIds));
  const [busy, setBusy] = useState(false);

  // Save is disabled when:
  //   - the sheet is busy (mid-save), OR
  //   - the studio has zero projects (nothing to invite a client to), OR
  //   - selection is below the caller-supplied minimum (e.g. clients
  //     must have at least one project).
  const belowMin = selected.size < minSelected;
  const noProjects = projects.length === 0;
  const saveDisabled = busy || belowMin || noProjects;

  // Reset selection when the sheet opens with a new context.
  useEffect(() => {
    if (visible) setSelected(new Set(selectedIds));
  }, [visible, selectedIds]);

  const allChecked = useMemo(
    () => projects.length > 0 && projects.every((p) => selected.has(p.id)),
    [projects, selected],
  );

  const toggleAll = () => {
    if (allChecked) {
      setSelected(new Set());
    } else {
      setSelected(new Set(projects.map((p) => p.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onSave([...selected]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Pressable onPress={onClose} hitSlop={12} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={20} color={color.text} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong" color="text">{title}</Text>
              {subtitle ? (
                <Text variant="caption" color="textMuted" numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={toggleAll}
              hitSlop={8}
              style={({ pressed }) => [styles.selectAll, pressed && { opacity: 0.7 }]}
            >
              <Checkbox checked={allChecked} />
              <Text variant="metaStrong" color="text">Select all</Text>
            </Pressable>
          </View>

          {projects.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="folder-open-outline" size={32} color={color.textFaint} />
              <Text variant="bodyStrong" color="text" style={styles.emptyTitle}>
                No projects yet
              </Text>
              <Text variant="meta" color="textMuted" align="center" style={styles.emptySub}>
                Create a project first, then come back to invite your client. Clients can only see specific projects.
              </Text>
            </View>
          ) : (
            <FlatList
              data={projects}
              keyExtractor={(p) => p.id}
              ItemSeparatorComponent={() => <View style={styles.sep} />}
              renderItem={({ item }) => {
                const checked = selected.has(item.id);
                return (
                  <Pressable
                    onPress={() => toggleOne(item.id)}
                    style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
                  >
                    <Checkbox checked={checked} />
                    <Text variant="body" color="text" numberOfLines={1} style={{ flex: 1 }}>
                      {item.name}
                    </Text>
                  </Pressable>
                );
              }}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          )}

          <View style={styles.footer}>
            <Pressable
              onPress={handleSave}
              disabled={saveDisabled}
              style={({ pressed }) => [
                styles.saveBtn,
                saveDisabled && { opacity: 0.45 },
                pressed && !saveDisabled && { opacity: 0.85 },
              ]}
            >
              {busy ? (
                <ActivityIndicator color={color.onPrimary} />
              ) : (
                <Text variant="bodyStrong" style={{ color: color.onPrimary }}>
                  {noProjects
                    ? 'Create a project first'
                    : belowMin
                      ? `Pick at least ${minSelected} project${minSelected === 1 ? '' : 's'}`
                      : saveLabel}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
      {checked ? <Ionicons name="checkmark" size={14} color={color.onPrimary} /> : null}
    </View>
  );
}

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
    paddingTop: 8,
    height: '88%',
  },
  handle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 4,
    backgroundColor: color.borderStrong,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenInset,
    paddingTop: space.md,
    paddingBottom: space.sm,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: color.borderStrong,
  },
  backBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  selectAll: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  listContent: { paddingHorizontal: screenInset, paddingVertical: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 48,
    paddingVertical: 8,
  },
  sep: { height: 1, backgroundColor: color.borderStrong, marginLeft: 28 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: color.borderStrong,
    backgroundColor: color.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: color.primary,
    borderColor: color.primary,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
    gap: space.xs,
  },
  emptyTitle: { marginTop: space.sm },
  emptySub: { textAlign: 'center', maxWidth: 280, marginTop: 2 },
  footer: {
    paddingHorizontal: screenInset,
    paddingTop: space.md,
    paddingBottom: space.lg,
    borderTopWidth: 1,
    borderTopColor: color.borderStrong,
  },
  saveBtn: {
    minHeight: 48,
    borderRadius: radius.sm,
    backgroundColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
