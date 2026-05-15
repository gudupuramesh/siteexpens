/**
 * Laminate detail / preview — v2 design.
 *
 * Layout:
 *   1. Header — back · "Laminate" · edit (top-right)
 *   2. Identity hero card — brand, room, code (mono blue meta)
 *   3. Photo card (tap to zoom)
 *   4. FormGroup "Specification" — Brand · Code · Finish · Edge band
 *   5. Notes card (when present)
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLaminates } from '@/src/features/laminates/useLaminates';
import { ImageViewer } from '@/src/ui/ImageViewer';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { FormGroup } from '@/src/ui/v2/FormGroup';
import { Row } from '@/src/ui/v2/Row';
import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

export default function LaminateDetailScreen() {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  const { id: projectId, lamId } = useLocalSearchParams<{
    id: string;
    lamId: string;
  }>();
  const { data: allLaminates, loading } = useLaminates(projectId);

  const lam = useMemo(
    () => allLaminates.find((l) => l.id === lamId),
    [allLaminates, lamId],
  );

  const [previewOpen, setPreviewOpen] = useState(false);

  if (loading && !lam) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />
        <Header onBack={() => router.back()} title="Laminate" />
        <View style={styles.center}>
          <ActivityIndicator color={t.palette.blue.base} />
        </View>
      </View>
    );
  }

  if (!lam) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />
        <Header onBack={() => router.back()} title="Laminate" />
        <View style={styles.center}>
          <Text variant="body" color="secondary">Laminate not found.</Text>
        </View>
      </View>
    );
  }

  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      <Header
        onBack={() => router.back()}
        title="Laminate"
        right={
          <CircleBtn
            icon="create-outline"
            onPress={() =>
              router.push(
                `/(app)/projects/${projectId}/edit-laminate?lamId=${lam.id}` as never,
              )
            }
            tint={t.palette.blue.base}
          />
        }
      />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Identity hero */}
        <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
          <View
            style={[
              styles.heroCard,
              {
                backgroundColor: cardBg,
                borderRadius: t.radii.hero,
                borderColor: cardBorder,
                borderWidth: t.hairline,
              },
            ]}
          >
            <View
              style={[
                styles.heroIcon,
                {
                  backgroundColor: t.colors.fill3,
                },
              ]}
            >
              <Ionicons name="layers" size={20} color={t.colors.secondary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="title3" color="label" style={{ fontWeight: '700' }} numberOfLines={1}>
                {lam.brand}
              </Text>
              <Text
                variant="caption2"
                style={{
                  color: t.palette.blue.base,
                  fontWeight: '700',
                  letterSpacing: 0.6,
                  marginTop: 4,
                }}
                numberOfLines={1}
              >
                {lam.roomName.toUpperCase()}
                {lam.laminateCode ? `  ·  ${lam.laminateCode.toUpperCase()}` : ''}
              </Text>
            </View>
          </View>
        </View>

        {/* Photo */}
        <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
          {lam.photoUrl ? (
            <Pressable
              onPress={() => setPreviewOpen(true)}
              style={({ pressed }) => [
                styles.photoWrap,
                {
                  backgroundColor: cardBg,
                  borderRadius: t.radii.card,
                  borderColor: cardBorder,
                  borderWidth: t.hairline,
                },
                pressed && { opacity: 0.85 },
              ]}
              accessibilityLabel="Open photo full-screen"
            >
              <Image
                source={{ uri: lam.photoUrl }}
                style={styles.photo}
                resizeMode="cover"
              />
              <View style={styles.expandHint}>
                <Ionicons name="expand-outline" size={13} color="#fff" />
              </View>
            </Pressable>
          ) : (
            <View
              style={[
                styles.photoEmpty,
                {
                  backgroundColor: t.colors.fill3,
                  borderRadius: t.radii.card,
                },
              ]}
            >
              <Ionicons name="image-outline" size={28} color={t.colors.tertiary} />
              <Text variant="caption1" color="tertiary" style={{ marginTop: 6 }}>
                No photo attached
              </Text>
            </View>
          )}
        </View>

        {/* Specification */}
        <FormGroup header="Specification">
          <Row label="Brand" value={lam.brand} />
          <Row label="Code" value={lam.laminateCode || '—'} valueColor={lam.laminateCode ? undefined : t.colors.tertiary} />
          <Row label="Finish" value={lam.finish} />
          <Row label="Edge band" value={lam.edgeBandCode || '—'} valueColor={lam.edgeBandCode ? undefined : t.colors.tertiary} divider={false} />
        </FormGroup>

        {/* Notes */}
        {lam.notes ? (
          <View style={{ marginTop: 22 }}>
            <Text
              variant="caption2"
              color="secondary"
              style={{ letterSpacing: 0.5, paddingHorizontal: 32, paddingBottom: 8 }}
            >
              NOTES
            </Text>
            <View style={{ paddingHorizontal: 16 }}>
              <View
                style={[
                  styles.notesCard,
                  {
                    backgroundColor: cardBg,
                    borderRadius: t.radii.card,
                    borderColor: cardBorder,
                    borderWidth: t.hairline,
                  },
                ]}
              >
                <Text variant="body" color="label" style={{ lineHeight: 22 }}>
                  {lam.notes}
                </Text>
              </View>
            </View>
          </View>
        ) : null}
      </ScrollView>

      <ImageViewer
        images={lam.photoUrl ? [lam.photoUrl] : []}
        visible={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />
    </View>
  );
}

function Header({
  onBack,
  title,
  right,
}: {
  onBack: () => void;
  title: string;
  right?: React.ReactNode;
}) {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: insets.top + 8,
          borderBottomColor: t.colors.separator,
          borderBottomWidth: t.hairline,
        },
      ]}
    >
      <CircleBtn
        icon="chevron-back"
        onPress={onBack}
        tint={t.colors.label}
      />
      <Text
        variant="headline"
        color="label"
        style={{ flex: 1, textAlign: 'center', fontWeight: '600' }}
        numberOfLines={1}
      >
        {title}
      </Text>
      {right ?? <View style={{ width: 32 }} />}
    </View>
  );
}

function CircleBtn({
  icon,
  onPress,
  tint,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  tint: string;
}) {
  const t = useThemeV2();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => [
        styles.circleBtn,
        {
          backgroundColor: t.colors.surface,
          borderRadius: 999,
          borderColor:
            t.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
          borderWidth: t.hairline,
        },
        t.shadows.resting,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Ionicons name={icon} size={16} color={tint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
  },
  circleBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  scroll: {},

  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  photoWrap: { overflow: 'hidden' },
  photo: { width: '100%', height: 240 },
  photoEmpty: {
    width: '100%',
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandHint: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(15,23,42,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  notesCard: {
    padding: 14,
  },
});
