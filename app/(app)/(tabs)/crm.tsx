/**
 * CRM — Leads · Appointments · Quotation · Invoice.
 *
 * Layout mirrors the project detail screen: a horizontally scrollable
 * underline tab strip flush at the top feeding a swipeable pager.
 *
 * Quotation and Invoice are stubbed as "Coming soon" placeholders —
 * they're surfaced now so the navigation IA settles before we wire
 * the Firestore + PDF pipelines for either one. Adding them later as
 * full screens means swapping the `<ComingSoon/>` for the actual
 * tab component, no other navigation changes required.
 */
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
  type LayoutChangeEvent,
  type ViewToken,
} from 'react-native';

import { AppointmentsTab } from '@/src/features/crm/tabs/AppointmentsTab';
import { LeadsTab } from '@/src/features/crm/tabs/LeadsTab';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { OrgSwitcherChip } from '@/src/ui/OrgSwitcherChip';
import { Screen } from '@/src/ui/Screen';
import { color } from '@/src/theme';
import { fontFamily } from '@/src/theme/tokens';

type SegmentKey = 'leads' | 'appointments' | 'quotation' | 'invoice';

const CRM_SEGMENTS: { key: SegmentKey; label: string }[] = [
  { key: 'leads',        label: 'Leads' },
  { key: 'appointments', label: 'Appointments' },
  { key: 'quotation',    label: 'Quotation' },
  { key: 'invoice',      label: 'Invoice' },
];
const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function CrmTabScreen() {
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? undefined;
  const [segment, setSegment] = useState<SegmentKey>('leads');
  // The pagerRef is typed against the segment row shape, not the
  // narrower SegmentKey, because FlatList carries the full row.
  const pagerRef = useRef<FlatList<(typeof CRM_SEGMENTS)[number]> | null>(null);
  const tabBarRef = useRef<ScrollView>(null);
  const tabLayouts = useRef<Record<string, { x: number; width: number }>>({});
  const tabBarWidth = useRef(0);
  const isUserSwipe = useRef(true);

  const onTabBarLayout = useCallback((e: LayoutChangeEvent) => {
    tabBarWidth.current = e.nativeEvent.layout.width;
  }, []);

  const onTabLayout = useCallback((key: string, e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    tabLayouts.current[key] = { x, width };
  }, []);

  const syncTabBarToActive = useCallback((key: SegmentKey, animated = true) => {
    const layout = tabLayouts.current[key];
    if (!layout || !tabBarRef.current) return;
    const targetX = Math.max(0, layout.x - (tabBarWidth.current - layout.width) / 2);
    tabBarRef.current.scrollTo({ x: targetX, animated });
  }, []);

  const handleSegmentChange = useCallback((next: SegmentKey) => {
    setSegment(next);
    syncTabBarToActive(next, true);
    const idx = CRM_SEGMENTS.findIndex((s) => s.key === next);
    if (idx >= 0) {
      isUserSwipe.current = false;
      pagerRef.current?.scrollToIndex({ index: idx, animated: true });
    }
  }, [syncTabBarToActive]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (!isUserSwipe.current || viewableItems.length === 0) return;
    const key = viewableItems[0].item.key as SegmentKey;
    setSegment(key);

  }).current;

  const onScrollBeginDrag = useCallback(() => {
    isUserSwipe.current = true;
  }, []);

  const onMomentumScrollEnd = useCallback(() => {
    isUserSwipe.current = true;
  }, []);

  useEffect(() => {
    syncTabBarToActive(segment, true);
  }, [segment, syncTabBarToActive]);

  return (
    <Screen bg="grouped" padded={false}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Page title + studio switcher chip (universal) */}
      <View style={styles.pageHeader}>
        <RNText style={styles.pageTitle}>CRM</RNText>
        <OrgSwitcherChip />
      </View>

      <ScrollView
        ref={tabBarRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBar}
        contentContainerStyle={styles.tabBarContent}
        onLayout={onTabBarLayout}
      >
        {CRM_SEGMENTS.map((item) => {
          const active = segment === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => handleSegmentChange(item.key)}
              style={styles.tabBtn}
              onLayout={(e) => onTabLayout(item.key, e)}
            >
              <RNText
                style={[
                  styles.tabLabel,
                  { color: active ? color.text : color.textMuted, fontWeight: active ? '600' : '500' },
                ]}
              >
                {item.label}
              </RNText>
              <View style={[styles.tabUnderline, active && { backgroundColor: color.primary }]} />
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.body}>
        <FlatList
          ref={pagerRef}
          data={CRM_SEGMENTS}
          keyExtractor={(item) => item.key}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={styles.page}>
              {item.key === 'leads' ? (
                <LeadsTab orgId={orgId} />
              ) : item.key === 'appointments' ? (
                <AppointmentsTab orgId={orgId} />
              ) : item.key === 'quotation' ? (
                <ComingSoon
                  icon="document-text-outline"
                  title="Quotation"
                  message={
                    'Generate quotations from leads, send via WhatsApp, and convert won quotations to projects in one tap.\n\nAvailable in the next update.'
                  }
                />
              ) : (
                <ComingSoon
                  icon="receipt-outline"
                  title="Invoice"
                  message={
                    'GST-ready invoices linked to projects and parties — track paid · partial · pending against the project ledger.\n\nAvailable in the next update.'
                  }
                />
              )}
            </View>
          )}
          getItemLayout={(_, index) => ({
            length: SCREEN_WIDTH,
            offset: SCREEN_WIDTH * index,
            index,
          })}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          onScrollBeginDrag={onScrollBeginDrag}
          onMomentumScrollEnd={onMomentumScrollEnd}
        />
      </View>
    </Screen>
  );
}

// ── Coming-soon placeholder ──────────────────────────────────────
// Used by tabs that are surfaced in the navigation but not yet
// implemented (Quotation, Invoice). Centred icon + title +
// message + a soft-square chip stamping "COMING SOON" so users
// understand at a glance the tab works as a route but the
// feature isn't live yet.

function ComingSoon({
  icon,
  title,
  message,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  message: string;
}) {
  return (
    <View style={styles.csRoot}>
      <View style={styles.csIconWrap}>
        <Ionicons name={icon} size={28} color={color.primary} />
      </View>
      <RNText style={styles.csTitle}>{title}</RNText>
      <View style={styles.csBadge}>
        <RNText style={styles.csBadgeText}>COMING SOON</RNText>
      </View>
      <RNText style={styles.csMessage}>{message}</RNText>
    </View>
  );
}

const styles = StyleSheet.create({
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 8,
    backgroundColor: color.bgGrouped,
  },
  pageTitle: {
    fontFamily: fontFamily.sans,
    fontSize: 22,
    fontWeight: '700',
    color: color.text,
    letterSpacing: -0.4,
  },
  tabBar: {
    flexGrow: 0,
    backgroundColor: color.bgGrouped,
    borderTopWidth: 1,
    borderTopColor: color.borderStrong,
    borderBottomWidth: 1,
    borderBottomColor: color.borderStrong,
  },
  tabBarContent: {
    paddingHorizontal: 16,
  },
  tabBtn: {
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  tabLabel: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    paddingBottom: 8,
  },
  tabUnderline: {
    height: 2,
    backgroundColor: 'transparent',
    marginBottom: -StyleSheet.hairlineWidth,
  },
  body: { flex: 1 },
  page: { width: SCREEN_WIDTH, flex: 1 },

  // Coming-soon placeholder
  csRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    backgroundColor: color.bgGrouped,
    gap: 10,
  },
  csIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: color.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  csTitle: {
    fontFamily: fontFamily.sans,
    fontSize: 20,
    fontWeight: '700',
    color: color.text,
    letterSpacing: -0.3,
  },
  csBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: color.primary,
  },
  csBadgeText: {
    fontFamily: fontFamily.sans,
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 1.2,
  },
  csMessage: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    lineHeight: 19,
    color: color.textMuted,
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 320,
  },
});
