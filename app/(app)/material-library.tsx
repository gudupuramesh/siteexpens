/**
 * Material Library — v2 design.
 *
 * Org-scoped master catalog of materials. Add, edit, delete items.
 *
 * Layout:
 *   1. Header — back · "Material library"
 *   2. Search field
 *   3. Category chip rail (All + per-category)
 *   4. List of material cards (icon · name · meta · unit · rate)
 *   5. FAB — Add material
 *   6. Add/Edit form — bottom sheet with v2 SheetHeader, FormGroups,
 *      category picker chip rail, and v2 SelectSheet for unit
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { router, Stack } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
import { z } from 'zod';

import { useAuth } from '@/src/features/auth/useAuth';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { useMaterialLibrary } from '@/src/features/materialLibrary/useMaterialLibrary';
import {
  createLibraryItem,
  updateLibraryItem,
  deleteLibraryItem,
} from '@/src/features/materialLibrary/materialLibrary';
import type {
  MaterialLibraryItem,
  MaterialCategory,
} from '@/src/features/materialLibrary/types';
import {
  MATERIAL_CATEGORIES,
  getCategoryConfig,
} from '@/src/features/materialLibrary/types';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { FAB } from '@/src/ui/v2/FAB';
import { FormGroup } from '@/src/ui/v2/FormGroup';
import { InputRow } from '@/src/ui/v2/InputRow';
import { Row } from '@/src/ui/v2/Row';
import { SelectSheet } from '@/src/ui/v2/SelectSheet';
import { SheetHeader } from '@/src/ui/v2/SheetHeader';
import { Text } from '@/src/ui/v2/Text';
import { usePullToRefresh } from '@/src/ui/v2/usePullToRefresh';
import { useThemeV2 } from '@/src/theme/v2';

const UNITS = ['pcs', 'kg', 'bags', 'sqft', 'rft', 'cft', 'litres', 'meters', 'tons', 'sets'];

type CategoryFilter = 'all' | MaterialCategory;

const CATEGORY_FILTER_OPTIONS: { key: CategoryFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  ...MATERIAL_CATEGORIES.map((c) => ({ key: c.key as CategoryFilter, label: c.label })),
];

const schema = z.object({
  category: z.string().min(1, 'Select category'),
  name: z.string().trim().min(2, 'Name required'),
  brand: z.string().trim().optional().or(z.literal('')),
  variety: z.string().trim().optional().or(z.literal('')),
  make: z.string().trim().optional().or(z.literal('')),
  size: z.string().trim().optional().or(z.literal('')),
  unit: z.string().min(1, 'Select unit'),
  defaultRate: z.string().optional().or(z.literal('')),
});

type FormData = z.infer<typeof schema>;

function ItemRow({
  item,
  onPress,
}: {
  item: MaterialLibraryItem;
  onPress: () => void;
}) {
  const t = useThemeV2();
  const catConfig = getCategoryConfig(item.category);
  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: cardBg,
          borderRadius: t.radii.card,
          borderColor: cardBorder,
          borderWidth: t.hairline,
        },
        pressed && { opacity: 0.85 },
      ]}
    >
      <View
        style={[
          styles.rowIcon,
          {
            backgroundColor: t.colors.fill3,
            borderRadius: t.radii.tile,
          },
        ]}
      >
        <Ionicons
          name={catConfig.icon as keyof typeof Ionicons.glyphMap}
          size={18}
          color={t.colors.secondary}
        />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="callout" color="label" numberOfLines={1}>
          {item.name}
        </Text>
        <Text variant="caption1" color="secondary" numberOfLines={1} style={{ marginTop: 2 }}>
          {[catConfig.label, item.brand, item.variety, item.size]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <Text
          variant="caption2"
          color="tertiary"
          style={{ letterSpacing: 0.4 }}
        >
          {item.unit.toUpperCase()}
        </Text>
        {item.defaultRate ? (
          <Text
            variant="footnote"
            color="label"
            style={{ fontWeight: '700', marginTop: 2, fontVariant: ['tabular-nums'] }}
          >
            ₹{item.defaultRate}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={14} color={t.colors.tertiary} />
    </Pressable>
  );
}

export default function MaterialLibraryScreen() {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  const refresh = usePullToRefresh();
  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');

  const activeCat = categoryFilter === 'all' ? undefined : categoryFilter;
  const { data: items, loading } = useMaterialLibrary(orgId, search, activeCat);

  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<MaterialLibraryItem | null>(null);

  const openAdd = useCallback(() => {
    setEditItem(null);
    setShowForm(true);
  }, []);

  const openEdit = useCallback((item: MaterialLibraryItem) => {
    setEditItem(item);
    setShowForm(true);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      {/* Header — transparent so the AmbientBackground flows through */}
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 8 },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
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
          <Ionicons name="chevron-back" size={16} color={t.colors.label} />
        </Pressable>
        <Text
          variant="headline"
          color="label"
          style={{ flex: 1, textAlign: 'center', fontWeight: '600' }}
          numberOfLines={1}
        >
          Material library
        </Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Search */}
      <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: t.colors.surface,
              borderRadius: t.radii.field,
              borderColor:
                t.mode === 'dark'
                  ? 'rgba(255,255,255,0.06)'
                  : 'rgba(0,0,0,0.05)',
              borderWidth: t.hairline,
            },
          ]}
        >
          <Ionicons name="search" size={16} color={t.colors.tertiary} />
          <TextInput
            placeholder="Search materials…"
            placeholderTextColor={t.colors.tertiary}
            value={search}
            onChangeText={setSearch}
            style={[styles.searchInput, { color: t.colors.label, ...t.type.callout }]}
            autoCapitalize="none"
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={t.colors.tertiary} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Category chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.catChipScroll}
        style={styles.catChipScrollWrap}
      >
        {CATEGORY_FILTER_OPTIONS.map((opt) => {
          const active = opt.key === categoryFilter;
          return (
            <Pressable
              key={opt.key}
              onPress={() => setCategoryFilter(opt.key)}
              hitSlop={6}
              style={({ pressed }) => [
                styles.catChip,
                {
                  backgroundColor: active
                    ? (t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft)
                    : t.colors.fill3,
                  borderRadius: 999,
                  borderColor: active ? t.palette.blue.base + '33' : 'transparent',
                  borderWidth: active ? 1 : 0,
                },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text
                variant="caption2"
                style={{
                  color: active ? t.palette.blue.base : t.colors.secondary,
                  fontWeight: '700',
                  letterSpacing: 0.4,
                }}
              >
                {opt.label.toUpperCase()}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Count */}
      <Text
        variant="caption2"
        color="tertiary"
        style={{ paddingHorizontal: 32, paddingBottom: 8, letterSpacing: 0.5 }}
      >
        {items.length} MATERIAL{items.length !== 1 ? 'S' : ''}
        {search ? ` MATCHING "${search.toUpperCase()}"` : ''}
      </Text>

      {/* List */}
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => <ItemRow item={item} onPress={() => openEdit(item)} />}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl {...refresh.props} />}
        contentContainerStyle={items.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={
          loading ? (
            <Text variant="footnote" color="secondary">Loading…</Text>
          ) : (
            <View style={styles.empty}>
              <Ionicons name="cube-outline" size={32} color={t.colors.tertiary} />
              <Text variant="callout" color="label" style={{ marginTop: 12, fontWeight: '600' }}>
                No materials yet
              </Text>
              <Text
                variant="caption1"
                color="secondary"
                style={{ marginTop: 4, textAlign: 'center', paddingHorizontal: 32 }}
              >
                Add materials to your library — they'll be available across all projects.
              </Text>
            </View>
          )
        }
      />

      <FAB
        icon="add"
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          openAdd();
        }}
        bottomOffset={24}
        accessibilityLabel="Add material"
      />

      <ItemFormModal
        visible={showForm}
        editItem={editItem}
        orgId={orgId}
        userId={user?.uid ?? ''}
        onClose={() => {
          setShowForm(false);
          setEditItem(null);
        }}
        defaultCategory={activeCat}
      />
    </View>
  );
}

// ── Add/Edit form modal ───────────────────────────────────────────────

function ItemFormModal({
  visible,
  editItem,
  orgId,
  userId,
  onClose,
  defaultCategory,
}: {
  visible: boolean;
  editItem: MaterialLibraryItem | null;
  orgId: string;
  userId: string;
  onClose: () => void;
  defaultCategory?: MaterialCategory;
}) {
  const t = useThemeV2();
  const isEdit = !!editItem;
  const [showUnitPicker, setShowUnitPicker] = useState(false);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting, isValid },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      category: editItem?.category ?? defaultCategory ?? '',
      name: editItem?.name ?? '',
      brand: editItem?.brand ?? '',
      variety: editItem?.variety ?? '',
      make: editItem?.make ?? '',
      size: editItem?.size ?? '',
      unit: editItem?.unit ?? '',
      defaultRate: editItem?.defaultRate ? String(editItem.defaultRate) : '',
    },
    mode: 'onChange',
  });

  useEffect(() => {
    if (!visible) return;
    const fallbackUnit = editItem?.category
      ? getCategoryConfig(editItem.category).defaultUnit
      : '';
    reset({
      category: editItem?.category ?? defaultCategory ?? '',
      name: editItem?.name ?? '',
      brand: editItem?.brand ?? '',
      variety: editItem?.variety ?? '',
      make: editItem?.make ?? '',
      size: editItem?.size ?? '',
      unit: editItem?.unit ?? fallbackUnit,
      defaultRate: editItem?.defaultRate ? String(editItem.defaultRate) : '',
    });
  }, [defaultCategory, editItem, reset, visible]);

  const selectedUnit = watch('unit');
  const selectedCategory = watch('category') as MaterialCategory | '';
  const catConfig = selectedCategory ? getCategoryConfig(selectedCategory as MaterialCategory) : null;

  function handleCategoryChange(cat: MaterialCategory) {
    setValue('category', cat, { shouldValidate: true });
    const config = getCategoryConfig(cat);
    setValue('unit', config.defaultUnit, { shouldValidate: true });
    setValue('brand', '');
    setValue('variety', '');
    setValue('make', '');
    setValue('size', '');
  }

  async function onSubmit(data: FormData) {
    try {
      const category = data.category as MaterialCategory;
      if (isEdit && editItem) {
        await updateLibraryItem(editItem.id, {
          category,
          name: data.name,
          brand: data.brand || '',
          variety: data.variety || '',
          make: data.make || '',
          size: data.size || '',
          unit: data.unit,
          defaultRate: data.defaultRate ? parseFloat(data.defaultRate) : 0,
        });
      } else {
        await createLibraryItem({
          orgId,
          category,
          name: data.name,
          brand: data.brand || '',
          variety: data.variety || '',
          make: data.make || '',
          size: data.size || '',
          unit: data.unit,
          defaultRate: data.defaultRate ? parseFloat(data.defaultRate) : undefined,
          createdBy: userId,
        });
      }
      reset();
      onClose();
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    }
  }

  function handleDelete() {
    if (!editItem) return;
    Alert.alert('Delete material', `Remove "${editItem.name}" from library?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteLibraryItem(editItem.id);
            onClose();
          } catch (err) {
            Alert.alert('Error', (err as Error).message);
          }
        },
      },
    ]);
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <AmbientBackground />
        <SheetHeader
          title={isEdit ? 'Edit material' : 'Add material'}
          cancelLabel="Cancel"
          saveLabel="Save"
          saveLoading={isSubmitting}
          saveDisabled={!isValid}
          onCancel={onClose}
          onSave={() => void handleSubmit(onSubmit)()}
        />

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={{ paddingTop: 8, paddingBottom: 60 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            {/* Category picker */}
            <View style={{ paddingTop: 18 }}>
              <Text
                variant="caption2"
                color="secondary"
                style={{ letterSpacing: 0.5, paddingHorizontal: 32, paddingBottom: 8 }}
              >
                CATEGORY
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.catChipScroll}
              >
                {MATERIAL_CATEGORIES.map((cat) => {
                  const active = selectedCategory === cat.key;
                  return (
                    <Pressable
                      key={cat.key}
                      onPress={() => handleCategoryChange(cat.key)}
                      hitSlop={6}
                      style={({ pressed }) => [
                        styles.catOption,
                        {
                          backgroundColor: active
                            ? (t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft)
                            : t.colors.fill3,
                          borderRadius: 999,
                          borderColor: active ? t.palette.blue.base + '33' : 'transparent',
                          borderWidth: active ? 1 : 0,
                        },
                        pressed && { opacity: 0.85 },
                      ]}
                    >
                      <Ionicons
                        name={cat.icon as keyof typeof Ionicons.glyphMap}
                        size={13}
                        color={active ? t.palette.blue.base : t.colors.secondary}
                      />
                      <Text
                        variant="caption2"
                        style={{
                          color: active ? t.palette.blue.base : t.colors.secondary,
                          fontWeight: '700',
                          letterSpacing: 0.4,
                          marginLeft: 4,
                        }}
                      >
                        {cat.label.toUpperCase()}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
            {errors.category?.message ? (
              <FieldNote text={errors.category.message} tone={t.palette.red.base} />
            ) : null}

            {/* Material */}
            <FormGroup header="Material">
              <Controller
                control={control}
                name="name"
                render={({ field: { onChange, onBlur, value } }) => (
                  <InputRow
                    label="Name"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    placeholder="e.g. Cement, Plywood, Sand"
                    autoCapitalize="words"
                  />
                )}
              />
              {catConfig
                ? catConfig.fields.map((field, idx) => (
                    <Controller
                      key={field.key}
                      control={control}
                      name={field.key as keyof FormData}
                      render={({ field: { onChange, value } }) => (
                        <InputRow
                          label={field.label}
                          value={value ?? ''}
                          onChangeText={onChange}
                          placeholder={field.placeholder ?? ''}
                          autoCapitalize="words"
                          divider={idx < catConfig.fields.length - 1}
                        />
                      )}
                    />
                  ))
                : null}
            </FormGroup>
            {errors.name?.message ? (
              <FieldNote text={errors.name.message} tone={t.palette.red.base} />
            ) : null}

            {/* Pricing */}
            <FormGroup header="Pricing">
              <Row
                label="Unit"
                value={selectedUnit || 'Pick a unit'}
                valueColor={selectedUnit ? undefined : t.colors.tertiary}
                chevron
                onPress={() => setShowUnitPicker(true)}
              />
              <Controller
                control={control}
                name="defaultRate"
                render={({ field: { onChange, onBlur, value } }) => (
                  <InputRow
                    label="Default rate"
                    value={value ?? ''}
                    onChangeText={(txt) => onChange(txt.replace(/[^\d.]/g, ''))}
                    onBlur={onBlur}
                    placeholder="₹0"
                    keyboardType="decimal-pad"
                    divider={false}
                  />
                )}
              />
            </FormGroup>
            {errors.unit?.message ? (
              <FieldNote text={errors.unit.message} tone={t.palette.red.base} />
            ) : null}

            {isEdit ? (
              <View style={{ paddingHorizontal: 16, marginTop: 26 }}>
                <Pressable
                  onPress={handleDelete}
                  hitSlop={6}
                  style={({ pressed }) => [
                    styles.deleteBtn,
                    {
                      backgroundColor:
                        t.mode === 'dark' ? t.palette.red.softDark : t.palette.red.soft,
                      borderRadius: t.radii.field,
                      borderColor: t.palette.red.base + '33',
                      borderWidth: t.hairline,
                    },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Ionicons name="trash-outline" size={16} color={t.palette.red.base} />
                  <Text
                    variant="footnote"
                    style={{ color: t.palette.red.base, fontWeight: '700', marginLeft: 6 }}
                  >
                    Delete material
                  </Text>
                </Pressable>
              </View>
            ) : null}

            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>

        <SelectSheet
          open={showUnitPicker}
          title="Unit"
          options={UNITS.map((u) => ({ key: u, label: u }))}
          selected={selectedUnit}
          onPick={(k) => setValue('unit', k, { shouldValidate: true })}
          onClose={() => setShowUnitPicker(false)}
        />
      </View>
    </Modal>
  );
}

function FieldNote({ text, tone }: { text: string; tone: string }) {
  return (
    <Text
      variant="caption2"
      style={{ color: tone, paddingHorizontal: 32, marginTop: 8 }}
    >
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
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

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, paddingVertical: 0, margin: 0 },

  catChipScrollWrap: {
    flexGrow: 0,
    paddingTop: 12,
    paddingBottom: 12,
  },
  catChipScroll: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
  },
  catChip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  catOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 6,
  },

  // List
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 100,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rowIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowRight: {
    alignItems: 'flex-end',
  },

  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
});
