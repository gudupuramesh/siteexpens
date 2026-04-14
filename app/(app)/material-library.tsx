/**
 * Material Library — org-scoped master catalog of materials.
 * Add, edit, delete items. Shared across all projects.
 * Category-specific form fields per material type.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { router, Stack } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { z } from 'zod';

import { useAuth } from '@/src/features/auth/useAuth';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { useMaterialLibrary } from '@/src/features/materialLibrary/useMaterialLibrary';
import {
  createLibraryItem,
  updateLibraryItem,
  deleteLibraryItem,
} from '@/src/features/materialLibrary/materialLibrary';
import type { MaterialLibraryItem, MaterialCategory } from '@/src/features/materialLibrary/types';
import { MATERIAL_CATEGORIES, getCategoryConfig } from '@/src/features/materialLibrary/types';
import { Button } from '@/src/ui/Button';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { TextField } from '@/src/ui/TextField';
import { color, radius, screenInset, shadow, space } from '@/src/theme';

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
  const catConfig = getCategoryConfig(item.category);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
    >
      <View style={[styles.rowIcon, { backgroundColor: catConfig.color + '18' }]}>
        <Ionicons name={catConfig.icon as any} size={20} color={catConfig.color} />
      </View>
      <View style={styles.rowBody}>
        <Text variant="rowTitle" color="text" numberOfLines={1}>{item.name}</Text>
        <View style={styles.rowMeta}>
          <Text variant="caption" color="textMuted" numberOfLines={1}>{catConfig.label}</Text>
          {item.brand ? <Text variant="caption" color="textMuted" numberOfLines={1}> · {item.brand}</Text> : null}
          {item.variety ? <Text variant="caption" color="textMuted" numberOfLines={1}> · {item.variety}</Text> : null}
          {item.size ? <Text variant="caption" color="textMuted" numberOfLines={1}> · {item.size}</Text> : null}
        </View>
      </View>
      <View style={styles.rowRight}>
        <Text variant="caption" color="textMuted">{item.unit}</Text>
        {item.defaultRate ? (
          <Text variant="metaStrong" color="text">₹{item.defaultRate}</Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={color.textFaint} />
    </Pressable>
  );
}

export default function MaterialLibraryScreen() {
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
    <Screen bg="grouped" padded={false} style={{ backgroundColor: color.surface }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Nav */}
      <View style={styles.navBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.navBtn}>
          <Ionicons name="arrow-back" size={22} color={color.text} />
        </Pressable>
        <Text variant="bodyStrong" color="text" style={styles.navTitle}>
          Material Library
        </Text>
        <View style={styles.navBtn} />
      </View>

      {/* Search */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={color.textMuted} />
        <TextInput
          placeholder="Search materials..."
          placeholderTextColor={color.textFaint}
          value={search}
          onChangeText={setSearch}
          style={styles.searchInput}
        />
        {search ? (
          <Pressable onPress={() => setSearch('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={color.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {/* Category filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.catFilterRow}
      >
        {CATEGORY_FILTER_OPTIONS.map((opt) => {
          const active = opt.key === categoryFilter;
          return (
            <Pressable
              key={opt.key}
              onPress={() => setCategoryFilter(opt.key)}
              style={[styles.catChip, active && styles.catChipActive]}
            >
              <Text
                variant="metaStrong"
                style={{ color: active ? color.onPrimary : color.textMuted }}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Count */}
      <View style={styles.countBar}>
        <Text variant="caption" color="textMuted">
          {items.length} material{items.length !== 1 ? 's' : ''}
          {search ? ` matching "${search}"` : ''}
        </Text>
      </View>

      {/* List */}
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => <ItemRow item={item} onPress={() => openEdit(item)} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={items.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={
          loading ? (
            <Text variant="meta" color="textMuted">Loading...</Text>
          ) : (
            <View style={styles.empty}>
              <Ionicons name="cube-outline" size={36} color={color.textFaint} />
              <Text variant="bodyStrong" color="text" style={{ marginTop: space.xs }}>
                No materials yet
              </Text>
              <Text variant="meta" color="textMuted" align="center" style={{ maxWidth: 260 }}>
                Add materials to your library. They'll be available across all projects.
              </Text>
            </View>
          )
        }
      />

      {/* FAB */}
      <Pressable
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); openAdd(); }}
        style={({ pressed }) => [styles.fab, pressed && { transform: [{ scale: 0.94 }] }]}
      >
        <Ionicons name="add" size={24} color={color.onPrimary} />
      </Pressable>

      {/* Add/Edit Modal */}
      <ItemFormModal
        visible={showForm}
        editItem={editItem}
        orgId={orgId}
        userId={user?.uid ?? ''}
        onClose={() => { setShowForm(false); setEditItem(null); }}
        defaultCategory={activeCat}
      />
    </Screen>
  );
}

// ── Category-specific field chips ──

function FieldChips({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.fieldChipGrid}>
      {options.map((opt) => {
        const active = value === opt;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(active ? '' : opt)}
            style={[styles.fieldChip, active && styles.fieldChipActive]}
          >
            <Text variant="caption" style={{ color: active ? color.onPrimary : color.text }}>
              {opt}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Add/Edit Form Modal ──

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
  const isEdit = !!editItem;

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

  // Reset form when editItem changes
  useState(() => {
    if (visible) {
      reset({
        category: editItem?.category ?? defaultCategory ?? '',
        name: editItem?.name ?? '',
        brand: editItem?.brand ?? '',
        variety: editItem?.variety ?? '',
        make: editItem?.make ?? '',
        size: editItem?.size ?? '',
        unit: editItem?.unit ?? editItem?.category ? getCategoryConfig(editItem?.category as MaterialCategory).defaultUnit : '',
        defaultRate: editItem?.defaultRate ? String(editItem.defaultRate) : '',
      });
    }
  });

  const selectedUnit = watch('unit');
  const selectedCategory = watch('category') as MaterialCategory | '';
  const catConfig = selectedCategory ? getCategoryConfig(selectedCategory as MaterialCategory) : null;

  function handleCategoryChange(cat: MaterialCategory) {
    setValue('category', cat, { shouldValidate: true });
    const config = getCategoryConfig(cat);
    setValue('unit', config.defaultUnit, { shouldValidate: true });
    // Clear category-specific fields when switching
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
    Alert.alert('Delete Material', `Remove "${editItem.name}" from library?`, [
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
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}><View /></Pressable>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalSheet}
      >
        <View style={styles.modalHandle} />
        <View style={styles.modalHeader}>
          <Text variant="bodyStrong" color="text">
            {isEdit ? 'Edit Material' : 'Add Material'}
          </Text>
          {isEdit && (
            <Pressable onPress={handleDelete} hitSlop={12}>
              <Ionicons name="trash-outline" size={20} color={color.danger} />
            </Pressable>
          )}
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.formScroll}
          keyboardDismissMode="on-drag"
        >
          {/* Category selector */}
          <Text variant="caption" color="textMuted" style={styles.sectionLabel}>CATEGORY *</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.catGrid}
          >
            {MATERIAL_CATEGORIES.map((cat) => {
              const active = selectedCategory === cat.key;
              return (
                <Pressable
                  key={cat.key}
                  onPress={() => handleCategoryChange(cat.key)}
                  style={[styles.catOption, active && { borderColor: cat.color, backgroundColor: cat.color + '15' }]}
                >
                  <Ionicons name={cat.icon as any} size={18} color={active ? cat.color : color.textMuted} />
                  <Text
                    variant="caption"
                    style={{ color: active ? cat.color : color.textMuted, fontWeight: active ? '600' : '400' }}
                  >
                    {cat.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {errors.category?.message && (
            <Text variant="caption" color="danger" style={{ marginTop: 2 }}>{errors.category.message}</Text>
          )}

          {/* Name */}
          <Controller control={control} name="name" render={({ field: { onChange, onBlur, value } }) => (
            <TextField label="Material Name *" placeholder="e.g. Cement, Plywood, Sand" autoCapitalize="words" value={value} onChangeText={onChange} onBlur={onBlur} error={errors.name?.message} containerStyle={{ marginTop: space.sm }} />
          )} />

          {/* Category-specific fields */}
          {catConfig && catConfig.fields.map((field) => (
            <Controller
              key={field.key}
              control={control}
              name={field.key as keyof FormData}
              render={({ field: { onChange, value } }) => (
                <View style={{ marginTop: space.xs }}>
                  <Text variant="caption" color="textMuted" style={styles.sectionLabel}>
                    {field.label.toUpperCase()}
                  </Text>
                  {field.type === 'chips' && field.options ? (
                    <FieldChips
                      options={field.options}
                      value={(value as string) ?? ''}
                      onChange={(v) => onChange(v)}
                    />
                  ) : (
                    <TextField
                      placeholder={field.placeholder}
                      autoCapitalize="words"
                      value={(value as string) ?? ''}
                      onChangeText={onChange}
                    />
                  )}
                </View>
              )}
            />
          ))}

          {/* Rate */}
          <View style={[styles.rowFields, { marginTop: space.xs }]}>
            <View style={styles.halfField}>
              <Controller control={control} name="defaultRate" render={({ field: { onChange, onBlur, value } }) => (
                <TextField label="Rate (₹)" placeholder="0" keyboardType="numeric" value={value ?? ''} onChangeText={(t) => onChange(t.replace(/[^\d.]/g, ''))} onBlur={onBlur} />
              )} />
            </View>
            <View style={styles.halfField} />
          </View>

          {/* Unit chips */}
          <Text variant="caption" color="textMuted" style={styles.sectionLabel}>UNIT *</Text>
          <View style={styles.unitGrid}>
            {UNITS.map((u) => {
              const active = selectedUnit === u;
              return (
                <Pressable
                  key={u}
                  onPress={() => setValue('unit', active ? '' : u, { shouldValidate: true })}
                  style={[styles.unitChip, active && styles.unitChipActive]}
                >
                  <Text variant="caption" style={{ color: active ? color.onPrimary : color.text }}>{u}</Text>
                </Pressable>
              );
            })}
          </View>
          {errors.unit?.message && (
            <Text variant="caption" color="danger" style={{ marginTop: 2 }}>{errors.unit.message}</Text>
          )}
        </ScrollView>

        <View style={styles.formFooter}>
          <Button
            label={isEdit ? 'Update' : 'Add to Library'}
            onPress={handleSubmit(onSubmit)}
            loading={isSubmitting}
            disabled={!isValid}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  navBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: screenInset, paddingBottom: space.xs, backgroundColor: color.surface },
  navBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  navTitle: { flex: 1, textAlign: 'center' },

  searchBar: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginHorizontal: screenInset, marginBottom: space.xs, paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.sm, backgroundColor: color.bgGrouped, borderWidth: 1, borderColor: color.border },
  searchInput: { flex: 1, fontSize: 15, color: color.text, paddingVertical: Platform.OS === 'ios' ? space.xs : 0 },

  catFilterRow: { gap: space.xs, paddingHorizontal: screenInset, paddingBottom: space.sm },
  catChip: { paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill, borderWidth: 1, borderColor: color.borderStrong, backgroundColor: color.surface },
  catChipActive: { backgroundColor: color.primary, borderColor: color.primary },

  countBar: { paddingHorizontal: screenInset, paddingBottom: space.xs },

  listContent: { paddingBottom: 80 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { alignItems: 'center', gap: space.xs, paddingHorizontal: screenInset * 2 },

  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: screenInset, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.separator, backgroundColor: color.surface },
  rowIcon: { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1 },
  rowMeta: { flexDirection: 'row', flexWrap: 'wrap' },
  rowRight: { alignItems: 'flex-end', gap: 2 },

  fab: { position: 'absolute', right: screenInset, bottom: space.xl, width: 48, height: 48, borderRadius: 24, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center', ...shadow.fab },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  modalSheet: { backgroundColor: color.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingTop: space.sm, maxHeight: '85%' },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: color.border, alignSelf: 'center', marginBottom: space.sm },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: screenInset, marginBottom: space.sm },

  formScroll: { paddingHorizontal: screenInset, paddingBottom: space.md },
  formFooter: { paddingHorizontal: screenInset, paddingVertical: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.separator },

  sectionLabel: { marginTop: space.sm, marginBottom: space.xs },

  catGrid: { gap: space.xs },
  catOption: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface },

  fieldChipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  fieldChip: { paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface },
  fieldChipActive: { backgroundColor: color.primary, borderColor: color.primary },

  rowFields: { flexDirection: 'row', gap: space.sm },
  halfField: { flex: 1 },

  unitGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  unitChip: { paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface },
  unitChipActive: { backgroundColor: color.primary, borderColor: color.primary },
});
