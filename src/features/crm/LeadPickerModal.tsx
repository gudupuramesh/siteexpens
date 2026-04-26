/**
 * Pick a lead from the org list (optional link for appointments).
 */
import { useMemo, useState } from 'react';
import { FlatList, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { type Lead, getLeadStatusLabel } from '@/src/features/crm/types';
import { useLeads } from '@/src/features/crm/useLeads';
import { Text } from '@/src/ui/Text';
import { color, radius, screenInset, space } from '@/src/theme';

type Props = {
  visible: boolean;
  orgId: string;
  onPick: (leadId: string, leadName: string) => void;
  onClose: () => void;
  allowClear?: boolean;
};

export function LeadPickerModal({ visible, orgId, onPick, onClose, allowClear }: Props) {
  const [search, setSearch] = useState('');
  const { data: leads, loading } = useLeads(orgId);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.phone.toLowerCase().includes(q) ||
        getLeadStatusLabel(l.status).toLowerCase().includes(q),
    );
  }, [leads, search]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View />
      </Pressable>
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text variant="bodyStrong" color="text" style={styles.title}>
          Link lead
        </Text>

        <View style={styles.search}>
          <Ionicons name="search" size={18} color={color.textMuted} />
          <TextInput
            placeholder="Search leads..."
            placeholderTextColor={color.textFaint}
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
            autoFocus
          />
        </View>

        {allowClear && (
          <Pressable
            onPress={() => {
              onPick('', '');
              setSearch('');
            }}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
          >
            <View style={[styles.avatar, { backgroundColor: color.bgGrouped }]}>
              <Ionicons name="unlink-outline" size={18} color={color.textMuted} />
            </View>
            <Text variant="body" color="textMuted" style={styles.flex}>
              No lead (standalone)
            </Text>
          </Pressable>
        )}

        <FlatList
          data={filtered}
          keyExtractor={(l: Lead) => l.id}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                onPick(item.id, item.name);
                setSearch('');
              }}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
            >
              <View style={styles.avatar}>
                <Text variant="metaStrong" style={{ color: color.primary }}>
                  {item.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.flex}>
                <Text variant="body" color="text" numberOfLines={1}>
                  {item.name}
                </Text>
                <Text variant="meta" color="textMuted" numberOfLines={1}>
                  {item.phone} · {getLeadStatusLabel(item.status)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={color.textFaint} />
            </Pressable>
          )}
          showsVerticalScrollIndicator={false}
          style={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text variant="meta" color="textMuted">
                {loading ? 'Loading…' : search ? 'No matches' : 'No leads yet'}
              </Text>
            </View>
          }
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: space.sm,
    maxHeight: '80%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.border,
    alignSelf: 'center',
    marginBottom: space.sm,
  },
  title: { textAlign: 'center', marginBottom: space.sm },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginHorizontal: screenInset,
    marginBottom: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    backgroundColor: color.bgGrouped,
    borderWidth: 1,
    borderColor: color.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: color.text,
    paddingVertical: Platform.OS === 'ios' ? space.xs : 0,
  },
  list: { paddingHorizontal: screenInset, maxHeight: 420 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: screenInset,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.separator,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: color.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { paddingVertical: space.xl, alignItems: 'center' },
});
