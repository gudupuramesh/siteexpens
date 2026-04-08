/**
 * Project detail screen. Structure (per design-system.json v2):
 *   1. navBar (back + project name centered + settings kebab right)
 *   2. hero photo 200pt
 *   3. summary card (VALUE + TIMELINE cells)
 *   4. ScrollableTabBar (9 tabs: Party, Transaction, Site, Task,
 *      Attendance, Material, MOM, Design, Files)
 *   5. tab body — empty states for now, real content in phase 3+
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { useProject } from '@/src/features/projects/useProject';
import { formatDateRange, formatInr } from '@/src/lib/format';
import { ScrollableTabBar, type TabItem } from '@/src/ui/ScrollableTabBar';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { color, radius, screenInset, shadow, space } from '@/src/theme';

type TabKey =
  | 'party'
  | 'transaction'
  | 'site'
  | 'task'
  | 'attendance'
  | 'material'
  | 'mom'
  | 'design'
  | 'files';

const TABS: TabItem<TabKey>[] = [
  { key: 'party',       label: 'Party' },
  { key: 'transaction', label: 'Transaction' },
  { key: 'site',        label: 'Site' },
  { key: 'task',        label: 'Task' },
  { key: 'attendance',  label: 'Attendance' },
  { key: 'material',    label: 'Material' },
  { key: 'mom',         label: 'MOM' },
  { key: 'design',      label: 'Design' },
  { key: 'files',       label: 'Files' },
];

const TAB_EMPTY: Record<TabKey, { title: string; subtitle: string }> = {
  party:       { title: 'No parties linked',    subtitle: 'Vendors, clients and contractors associated with this project will show up here.' },
  transaction: { title: 'No transactions yet',  subtitle: 'Payments in and out, invoices and expenses live here.' },
  site:        { title: 'No site activity',     subtitle: 'Daily Progress Reports, site photos and on-site tasks will show here.' },
  task:        { title: 'No tasks yet',         subtitle: 'Break the project down into work items and track status.' },
  attendance:  { title: 'No attendance logged', subtitle: 'Mark daily attendance for your on-site team and labour contractors.' },
  material:    { title: 'No material requests', subtitle: 'Raise requests, track delivery and usage of materials.' },
  mom:         { title: 'No meetings yet',      subtitle: 'Meeting of Minutes records and decisions live here.' },
  design:      { title: 'No designs uploaded',  subtitle: '2D layouts, 3D renders and production files.' },
  files:       { title: 'No files yet',         subtitle: 'Drawings, documents and reference files for this project.' },
};

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: project, loading, error } = useProject(id);
  const [tab, setTab] = useState<TabKey>('transaction');

  if (loading) {
    return (
      <Screen bg="grouped">
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loading}>
          <ActivityIndicator color={color.primary} />
        </View>
      </Screen>
    );
  }

  if (!project) {
    return (
      <Screen bg="grouped">
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loading}>
          <Text variant="body" color="textMuted" align="center">
            {error ? `Couldn't load project:\n${error}` : 'Project not found.'}
          </Text>
        </View>
      </Screen>
    );
  }

  const startDate = project.startDate ? project.startDate.toDate() : null;
  const endDate = project.endDate ? project.endDate.toDate() : null;
  const initial = project.name.charAt(0).toUpperCase();

  return (
    <Screen bg="grouped" padded={false}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Nav bar */}
      <View style={styles.navBar}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [styles.navButton, pressed && styles.navButtonPressed]}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text variant="title" color="text" style={styles.navGlyph}>{'‹'}</Text>
        </Pressable>
        <Text variant="title" color="text" style={styles.navTitle} numberOfLines={1}>
          {project.name}
        </Text>
        <Pressable
          hitSlop={12}
          style={({ pressed }) => [styles.navButton, pressed && styles.navButtonPressed]}
          accessibilityRole="button"
          accessibilityLabel="Project settings"
        >
          <Text variant="title" color="text" style={styles.navKebab}>⋮</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero photo */}
        <View style={styles.hero}>
          {project.photoUri ? (
            <Image source={{ uri: project.photoUri }} style={styles.heroImg} resizeMode="cover" />
          ) : (
            <View style={styles.heroPlaceholder}>
              <Text variant="largeTitle" color="primary">
                {initial}
              </Text>
            </View>
          )}
        </View>

        {/* Summary card */}
        <View style={styles.summaryCard}>
          <Text variant="title" color="text" numberOfLines={2}>
            {project.name}
          </Text>
          <Text variant="meta" color="textMuted" style={styles.summaryMeta}>
            {project.siteAddress}
          </Text>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryRow}>
            <View style={styles.summaryCell}>
              <Text variant="caption" color="textMuted">VALUE</Text>
              <Text variant="rowTitle" color="primary" tabular style={styles.summaryValue}>
                {formatInr(project.value)}
              </Text>
            </View>
            <View style={styles.summaryCell}>
              <Text variant="caption" color="textMuted">TIMELINE</Text>
              <Text variant="metaStrong" color="text" style={styles.summaryValue}>
                {formatDateRange(startDate, endDate)}
              </Text>
            </View>
          </View>
        </View>

        {/* Scrollable tab bar */}
        <View style={styles.tabsWrap}>
          <ScrollableTabBar tabs={TABS} value={tab} onChange={setTab} />
        </View>

        {/* Tab body */}
        <View style={styles.tabBody}>
          <View style={styles.empty}>
            <Text variant="rowTitle" color="text" align="center">
              {TAB_EMPTY[tab].title}
            </Text>
            <Text variant="meta" color="textMuted" align="center" style={styles.emptySubtitle}>
              {TAB_EMPTY[tab].subtitle}
            </Text>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: screenInset,
  },
  navBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: screenInset,
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.hairline,
  },
  navButtonPressed: {
    opacity: 0.7,
  },
  navGlyph: {
    fontSize: 26,
    lineHeight: 26,
    marginLeft: -2,
  },
  navKebab: {
    fontSize: 22,
    lineHeight: 22,
  },
  navTitle: {
    flex: 1,
    textAlign: 'center',
    paddingHorizontal: space.md,
  },
  scroll: {
    paddingBottom: space.xxxl,
  },
  hero: {
    marginHorizontal: screenInset,
    height: 200,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadow.hairline,
    marginTop: space.md,
  },
  heroImg: {
    width: '100%',
    height: '100%',
  },
  heroPlaceholder: {
    flex: 1,
    backgroundColor: color.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCard: {
    marginHorizontal: screenInset,
    marginTop: space.md,
    padding: space.lg,
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    ...shadow.hairline,
  },
  summaryMeta: {
    marginTop: space.xxs,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: color.separator,
    marginVertical: space.md,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: space.lg,
  },
  summaryCell: {
    flex: 1,
  },
  summaryValue: {
    marginTop: space.xxs,
  },
  tabsWrap: {
    marginTop: space.lg,
    backgroundColor: color.surface,
  },
  tabBody: {
    marginHorizontal: screenInset,
    marginTop: space.md,
    minHeight: 240,
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    paddingVertical: space.xxxl,
    paddingHorizontal: space.lg,
    ...shadow.hairline,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySubtitle: {
    marginTop: space.xs,
    maxWidth: 280,
  },
});
