/**
 * DPR — Daily Progress Report form. One doc per project+date (`${projectId}_${date}`).
 * Auto-aggregates attendance + material counts from the same date at save time
 * so older reports retain historical snapshots even if raw data changes later.
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAttendance } from '@/src/features/attendance/useAttendance';
import { useAuth } from '@/src/features/auth/useAuth';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { deleteDpr, dprDocId, upsertDpr } from '@/src/features/dpr/dpr';
import { useDpr } from '@/src/features/dpr/useDpr';
import { WEATHER_OPTIONS, type Weather } from '@/src/features/dpr/types';
import { useMaterials } from '@/src/features/materials/useMaterials';
import { Button } from '@/src/ui/Button';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { TextField } from '@/src/ui/TextField';
import { color, radius, screenInset, space } from '@/src/theme';

function parseDate(s: string): Date {
  // 'YYYY-MM-DD' → Date (local)
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function prettyDate(s: string): string {
  try {
    return parseDate(s).toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return s;
  }
}

export default function DprScreen() {
  const { id: projectId, date: dateStr } = useLocalSearchParams<{ id: string; date: string }>();
  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';

  const { data: existing, loading } = useDpr(projectId, dateStr);
  const { summary: attSummary } = useAttendance(projectId, dateStr, orgId || undefined);
  const { data: receivedMats } = useMaterials(projectId, 'received');
  const { data: usedMats } = useMaterials(projectId, 'used');

  const [workDone, setWorkDone] = useState('');
  const [weather, setWeather] = useState<Weather>('clear');
  const [weatherNote, setWeatherNote] = useState('');
  const [issues, setIssues] = useState('');
  const [tomorrowPlan, setTomorrowPlan] = useState('');
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate once when existing loads.
  useEffect(() => {
    if (hydrated) return;
    if (loading) return;
    if (existing) {
      setWorkDone(existing.workDone);
      setWeather(existing.weather);
      setWeatherNote(existing.weatherNote ?? '');
      setIssues(existing.issues);
      setTomorrowPlan(existing.tomorrowPlan);
      setPhotoUris(existing.photoUris ?? []);
    }
    setHydrated(true);
  }, [existing, loading, hydrated]);

  const pickPhotos = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Photo access is required to attach images.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.7,
    });
    if (!res.canceled) {
      setPhotoUris((prev) => [...prev, ...res.assets.map((a) => a.uri)]);
    }
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Camera access is required.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!res.canceled) {
      setPhotoUris((prev) => [...prev, ...res.assets.map((a) => a.uri)]);
    }
  };

  const onSave = async () => {
    if (!user || !orgId || !projectId || !dateStr) return;
    setSaving(true);
    try {
      await upsertDpr({
        orgId,
        projectId,
        date: dateStr,
        workDone: workDone.trim(),
        weather,
        weatherNote: weatherNote.trim(),
        issues: issues.trim(),
        tomorrowPlan: tomorrowPlan.trim(),
        photoUris,
        staffPresent: attSummary.present,
        staffTotal: attSummary.total,
        materialReceivedCount: receivedMats.length,
        materialUsedCount: usedMats.length,
        createdBy: user.uid,
      });
      router.back();
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const onDelete = () => {
    if (!existing) return;
    Alert.alert('Delete report?', 'This will remove the DPR for this date.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDpr(dprDocId(projectId, dateStr));
            router.back();
          } catch (err) {
            Alert.alert('Error', (err as Error).message);
          }
        },
      },
    ]);
  };

  return (
    <Screen bg="grouped" padded={false} style={{ backgroundColor: color.surface }}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.navBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.navBtn}>
          <Ionicons name="chevron-back" size={22} color={color.text} />
        </Pressable>
        <View style={styles.navTitleWrap}>
          <Text variant="bodyStrong" color="text">DPR</Text>
          <Text variant="caption" color="textMuted">{prettyDate(dateStr)}</Text>
        </View>
        {existing ? (
          <Pressable onPress={onDelete} hitSlop={12} style={styles.navBtn}>
            <Ionicons name="trash-outline" size={20} color={color.danger} />
          </Pressable>
        ) : (
          <View style={styles.navBtn} />
        )}
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {/* Snapshot cards */}
          <Text variant="caption" color="textMuted" style={styles.label}>TODAY&apos;S SNAPSHOT</Text>
          <View style={styles.snapRow}>
            <View style={styles.snapCard}>
              <Ionicons name="people" size={18} color={color.primary} />
              <Text variant="title" color="text">{attSummary.present}</Text>
              <Text variant="caption" color="textMuted">Staff Present</Text>
            </View>
            <View style={styles.snapCard}>
              <Ionicons name="arrow-down-circle" size={18} color={color.success} />
              <Text variant="title" color="text">{receivedMats.length}</Text>
              <Text variant="caption" color="textMuted">Material In</Text>
            </View>
            <View style={styles.snapCard}>
              <Ionicons name="arrow-up-circle" size={18} color={color.danger} />
              <Text variant="title" color="text">{usedMats.length}</Text>
              <Text variant="caption" color="textMuted">Material Used</Text>
            </View>
          </View>

          <TextField
            label="Work Done Today"
            placeholder="Describe what was completed on site today…"
            multiline
            value={workDone}
            onChangeText={setWorkDone}
          />

          {/* Weather */}
          <Text variant="caption" color="textMuted" style={styles.label}>WEATHER</Text>
          <View style={styles.chipRow}>
            {WEATHER_OPTIONS.map((w) => {
              const active = weather === w.key;
              return (
                <Pressable
                  key={w.key}
                  onPress={() => setWeather(w.key)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Ionicons
                    name={w.icon as never}
                    size={14}
                    color={active ? '#fff' : color.textMuted}
                  />
                  <Text variant="caption" style={{ color: active ? '#fff' : color.text }}>
                    {w.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <TextField
            label="Weather note (optional)"
            placeholder="e.g. Heavy rain after 3pm, stopped work"
            value={weatherNote}
            onChangeText={setWeatherNote}
          />

          <TextField
            label="Issues / Delays"
            placeholder="Manpower shortage, material delay, etc."
            multiline
            value={issues}
            onChangeText={setIssues}
          />

          <TextField
            label="Tomorrow's Plan"
            placeholder="Planned activities for the next working day"
            multiline
            value={tomorrowPlan}
            onChangeText={setTomorrowPlan}
          />

          {/* Photos */}
          <Text variant="caption" color="textMuted" style={styles.label}>SITE PHOTOS</Text>
          <View style={styles.photoRow}>
            {photoUris.map((uri) => (
              <View key={uri} style={styles.photoThumbWrap}>
                <Image source={{ uri }} style={styles.photoThumb} />
                <Pressable
                  onPress={() => setPhotoUris((prev) => prev.filter((u) => u !== uri))}
                  style={styles.photoClose}
                  hitSlop={6}
                >
                  <Ionicons name="close" size={14} color="#fff" />
                </Pressable>
              </View>
            ))}
            <Pressable onPress={pickPhotos} style={styles.photoAdd}>
              <Ionicons name="images-outline" size={20} color={color.primary} />
              <Text variant="caption" color="primary">Gallery</Text>
            </Pressable>
            <Pressable onPress={takePhoto} style={styles.photoAdd}>
              <Ionicons name="camera-outline" size={20} color={color.primary} />
              <Text variant="caption" color="primary">Camera</Text>
            </Pressable>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Button label={existing ? 'Update DPR' : 'Save DPR'} onPress={onSave} loading={saving} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenInset,
    paddingBottom: space.xs,
    backgroundColor: color.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.separator,
  },
  navBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  navTitleWrap: { flex: 1, alignItems: 'center' },
  scroll: { paddingHorizontal: screenInset, paddingTop: space.md, paddingBottom: space.xl },
  label: { marginTop: space.md, marginBottom: space.xs },
  snapRow: { flexDirection: 'row', gap: space.sm, marginBottom: space.sm },
  snapCard: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: space.sm,
    backgroundColor: color.bgGrouped,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.separator,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
  },
  chipActive: { backgroundColor: color.primary, borderColor: color.primary },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  photoThumbWrap: { position: 'relative' },
  photoThumb: { width: 88, height: 88, borderRadius: radius.sm, backgroundColor: color.bgGrouped },
  photoClose: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: color.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoAdd: {
    width: 88,
    height: 88,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.primary,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.primarySoft,
    gap: 2,
  },
  footer: {
    paddingHorizontal: screenInset,
    paddingVertical: space.sm,
    backgroundColor: color.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.separator,
  },
});
