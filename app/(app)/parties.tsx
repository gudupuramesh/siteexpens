/**
 * Parties — v2 design.
 *
 * Layout (top → bottom):
 *   1. v2 header: back · "Parties" · count caption
 *   2. Search bar
 *   3. Type filter chip rail (All + per-type, tinted)
 *   4. Combined Total / Vendors / Clients tile (hairline-divided)
 *   5. Sectioned list — General / Vendor groups, each as a FormGroup-style card
 *   6. v2 FAB to add a new party
 *
 * Preserves `useParties` data hook and the `/(app)/add-party` and
 * `/(app)/party/[partyId]` navigation targets.
 */
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { useParties } from '@/src/features/parties/useParties';
import {
  PARTY_TYPE_GROUPS,
  getPartyTypeGroup,
  getPartyTypeLabel,
  type Party,
  type PartyType,
} from '@/src/features/parties/types';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { Text } from '@/src/ui/v2/Text';
import { usePullToRefresh } from '@/src/ui/v2/usePullToRefresh';
import { useThemeV2 } from '@/src/theme/v2';

type FilterKey = 'all' | 'general' | 'vendor';

/**
 * Party-type tone (avatars + type pill).
 *
 * Color discipline: party types (client / vendor / contractor / labour …) are
 * categorical labels, not actionable status. They all use a neutral tone
 * (fill3 + secondary) so the list reads as one calm surface. Color is
 * reserved for things that carry meaning — balance pills (red = we owe,
 * green = they owe us), action buttons (call/whatsapp), etc.
 *
 * Returns a palette-shaped object so consuming JSX (`tone.soft`, `tone.base`)
 * doesn't need branching.
 */
function partyTypeTone(
  t: ReturnType<typeof useThemeV2>,
): { base: string; soft: string; softDark: string } {
  return {
    base: t.colors.secondary,
    soft: t.colors.fill3,
    softDark: t.colors.fill3,
  };
}

export default function PartiesScreen() {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  const refresh = usePullToRefresh();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? undefined;
  const { data: parties, loading } = useParties(orgId);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');

  const onBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/(tabs)' as never);
  };

  const counts = useMemo(() => {
    let general = 0;
    let vendor = 0;
    for (const p of parties) {
      const key = (p.partyType ?? p.role) as PartyType | undefined;
      if (!key) continue;
      const group = getPartyTypeGroup(key);
      if (group === 'General') general++;
      else if (group === 'Vendor') vendor++;
    }
    return { total: parties.length, general, vendor };
  }, [parties]);

  // Filter + search
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return parties.filter((p) => {
      if (q) {
        const matchesSearch =
          p.name.toLowerCase().includes(q)
          || (p.phone ?? '').toLowerCase().includes(q)
          || (p.email ?? '').toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }
      if (filter === 'all') return true;
      const key = (p.partyType ?? p.role) as PartyType | undefined;
      if (!key) return false;
      const group = getPartyTypeGroup(key);
      return filter === 'general' ? group === 'General' : group === 'Vendor';
    });
  }, [parties, search, filter]);

  // Group by section (General / Vendor)
  const sections = useMemo(() => {
    const general: Party[] = [];
    const vendor: Party[] = [];
    for (const p of visible) {
      const key = (p.partyType ?? p.role) as PartyType | undefined;
      const group = key ? getPartyTypeGroup(key) : '';
      if (group === 'Vendor') vendor.push(p);
      else general.push(p);
    }
    general.sort((a, b) => a.name.localeCompare(b.name));
    vendor.sort((a, b) => a.name.localeCompare(b.name));
    return { general, vendor };
  }, [visible]);

  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      {/* Header — transparent so the AmbientBackground flows through */}
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          hitSlop={10}
          style={({ pressed }) => [
            styles.iconBtn,
            { backgroundColor: t.colors.fill3, borderRadius: 999 },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons name="chevron-back" size={18} color={t.colors.label} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text variant="headline" color="label">
            Parties
          </Text>
          <Text
            variant="caption2"
            color="secondary"
            style={{ letterSpacing: 0.5, marginTop: 1 }}
          >
            {parties.length} TOTAL
          </Text>
        </View>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl {...refresh.props} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Search */}
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <View
            style={[
              styles.searchBar,
              { backgroundColor: t.colors.fill3, borderRadius: t.radii.field },
            ]}
          >
            <Ionicons name="search" size={16} color={t.colors.tertiary} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search parties"
              placeholderTextColor={t.colors.tertiary}
              style={[
                styles.searchInput,
                { color: t.colors.label, ...t.type.callout },
              ]}
              returnKeyType="search"
            />
            {search ? (
              <Pressable onPress={() => setSearch('')} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={t.colors.tertiary} />
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Filter chip rail */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, gap: 6 }}
        >
          {([
            { key: 'all' as const, label: 'All' },
            { key: 'general' as const, label: 'General' },
            { key: 'vendor' as const, label: 'Vendor' },
          ]).map((f) => {
            const sel = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={({ pressed }) => [
                  styles.chip,
                  {
                    backgroundColor: sel
                      ? t.mode === 'dark'
                        ? t.palette.blue.softDark
                        : t.palette.blue.soft
                      : t.colors.fill3,
                    borderRadius: 999,
                  },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text
                  variant="footnote"
                  style={{
                    color: sel ? t.palette.blue.base : t.colors.label,
                    fontWeight: sel ? '700' : '500',
                  }}
                >
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Summary tile */}
        <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
          <View
            style={[
              styles.summaryCard,
              {
                backgroundColor: cardBg,
                borderRadius: t.radii.card,
                borderColor: cardBorder,
                borderWidth: t.hairline,
              },
            ]}
          >
            <SummaryCol label="TOTAL" value={String(counts.total)} color={t.palette.blue.base} />
            <View style={[styles.summaryDivider, { backgroundColor: t.colors.separator }]} />
            <SummaryCol label="GENERAL" value={String(counts.general)} color={t.palette.green.base} />
            <View style={[styles.summaryDivider, { backgroundColor: t.colors.separator }]} />
            <SummaryCol label="VENDOR" value={String(counts.vendor)} color={t.palette.orange.base} />
          </View>
        </View>

        {/* Lists */}
        {loading && parties.length === 0 ? (
          <View style={{ paddingVertical: 48, alignItems: 'center' }}>
            <Text variant="callout" color="secondary">
              Loading parties…
            </Text>
          </View>
        ) : parties.length === 0 ? (
          <EmptyState
            onAdd={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/(app)/add-party' as never);
            }}
          />
        ) : visible.length === 0 ? (
          <View style={{ paddingVertical: 48, alignItems: 'center' }}>
            <Text variant="callout" color="secondary">
              No parties match
            </Text>
            <Pressable
              onPress={() => {
                setSearch('');
                setFilter('all');
              }}
              hitSlop={6}
              style={({ pressed }) => [
                styles.clearBtn,
                {
                  backgroundColor:
                    t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
                  borderRadius: 999,
                },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text
                variant="footnote"
                style={{ color: t.palette.blue.base, fontWeight: '700' }}
              >
                Clear filters
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            {sections.general.length > 0 ? (
              <PartySection
                header="General"
                count={sections.general.length}
                parties={sections.general}
              />
            ) : null}
            {sections.vendor.length > 0 ? (
              <PartySection
                header="Vendor"
                count={sections.vendor.length}
                parties={sections.vendor}
              />
            ) : null}
          </>
        )}
      </ScrollView>

      {/* FAB */}
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push('/(app)/add-party' as never);
        }}
        style={({ pressed }) => [
          styles.fab,
          {
            bottom: 24 + insets.bottom,
            backgroundColor: t.palette.blue.base,
          },
          pressed && { transform: [{ scale: 0.94 }] },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Add party"
      >
        <Ionicons name="add" size={24} color="#fff" />
      </Pressable>
    </View>
  );
}

function PartySection({
  header,
  count,
  parties,
}: {
  header: string;
  count: number;
  parties: Party[];
}) {
  const t = useThemeV2();
  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
  return (
    <View style={{ marginTop: 24 }}>
      <View style={styles.sectionHeader}>
        <Text
          variant="caption2"
          color="secondary"
          style={{ letterSpacing: 0.4 }}
        >
          {header.toUpperCase()}
        </Text>
        <Text variant="caption2" color="tertiary">
          {count}
        </Text>
      </View>
      <View
        style={[
          styles.sectionCard,
          {
            backgroundColor: cardBg,
            borderRadius: t.radii.group,
            borderColor: cardBorder,
            borderWidth: t.hairline,
          },
        ]}
      >
        {parties.map((p, idx) => (
          <PartyRow
            key={p.id}
            party={p}
            divider={idx < parties.length - 1}
          />
        ))}
      </View>
    </View>
  );
}

function PartyRow({
  party,
  divider,
}: {
  party: Party;
  divider: boolean;
}) {
  const t = useThemeV2();
  const tone = partyTypeTone(t);
  const initial = party.name.charAt(0).toUpperCase();
  const typeKey = (party.partyType ?? party.role) as PartyType | undefined;
  const typeLabel = typeKey ? getPartyTypeLabel(typeKey) : '—';

  return (
    <Pressable
      onPress={() => router.push(`/(app)/party/${party.id}` as never)}
      style={({ pressed }) => [
        styles.partyRow,
        pressed && { backgroundColor: t.colors.fill3 },
      ]}
    >
      <View
        style={[
          styles.avatar,
          {
            backgroundColor:
              t.mode === 'dark' ? tone.softDark : tone.soft,
            borderRadius: t.radii.tile,
          },
        ]}
      >
        <Text
          variant="headline"
          style={{ color: tone.base, fontWeight: '700' }}
        >
          {initial}
        </Text>
      </View>

      <View style={{ flex: 1, marginLeft: 12, minWidth: 0 }}>
        <Text variant="body" color="label" numberOfLines={1}>
          {party.name}
        </Text>
        <Text
          variant="caption1"
          color="secondary"
          numberOfLines={1}
          style={{ marginTop: 2 }}
        >
          {typeLabel}
          {party.phone ? `  ·  ${party.phone}` : ''}
        </Text>
      </View>

      <View
        style={[
          styles.typePill,
          {
            backgroundColor: t.mode === 'dark' ? tone.softDark : tone.soft,
            borderRadius: 999,
          },
        ]}
      >
        <Text
          variant="caption2"
          style={{
            color: tone.base,
            fontWeight: '700',
            letterSpacing: 0.4,
          }}
          numberOfLines={1}
        >
          {typeLabel.toUpperCase()}
        </Text>
      </View>

      <Ionicons
        name="chevron-forward"
        size={14}
        color={t.colors.tertiary}
        style={{ marginLeft: 6 }}
      />

      {divider ? (
        <View
          style={[
            styles.rowDivider,
            { backgroundColor: t.colors.separator, left: 64 },
          ]}
        />
      ) : null}
    </Pressable>
  );
}

function SummaryCol({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View style={styles.summaryCol}>
      <Text variant="caption2" color="tertiary" style={{ letterSpacing: 0.4 }}>
        {label}
      </Text>
      <Text
        variant="title3"
        style={{ color, marginTop: 4, fontWeight: '700' }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  const t = useThemeV2();
  return (
    <View style={{ paddingVertical: 48, paddingHorizontal: 32, alignItems: 'center' }}>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: t.radii.tile,
          backgroundColor:
            t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="people-outline" size={28} color={t.palette.blue.base} />
      </View>
      <Text
        variant="headline"
        color="label"
        style={{ marginTop: 12, fontWeight: '600' }}
      >
        No parties yet
      </Text>
      <Text
        variant="footnote"
        color="secondary"
        style={{ marginTop: 4, textAlign: 'center' }}
      >
        Add vendors, clients, contractors and track their balances in one place.
      </Text>
      <Pressable
        onPress={onAdd}
        hitSlop={6}
        style={({ pressed }) => [
          styles.addBtn,
          {
            backgroundColor: t.palette.blue.base,
            borderRadius: 999,
          },
          pressed && { opacity: 0.85 },
        ]}
      >
        <Ionicons name="add" size={16} color="#fff" />
        <Text
          variant="footnote"
          style={{ color: '#fff', fontWeight: '700', marginLeft: 6 }}
        >
          Add your first party
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    gap: 10,
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Search
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, paddingVertical: 0, margin: 0 },

  // Filter chip
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
  },

  // Summary
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  summaryCol: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginHorizontal: 10,
  },

  // Section
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingBottom: 7,
  },
  sectionCard: {
    marginHorizontal: 16,
    overflow: 'hidden',
  },

  // Party row
  partyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 60,
    position: 'relative',
  },
  avatar: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 8,
    maxWidth: 110,
  },
  rowDivider: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    height: 0.5,
  },

  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 14,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 16,
  },

  // FAB
  fab: {
    position: 'absolute',
    right: 16,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
});
