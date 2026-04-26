/**
 * Create or edit a CRM lead — InteriorOS layout.
 *
 * Uses io.tsx primitives (Group / InputRow / PickerRow / SelectModal /
 * PrimaryButton) so the form matches the InteriorOS LeadFormScreen
 * reference and replaces the broken Alert-based dropdowns with a real
 * bottom-sheet picker.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { z } from 'zod';

import { useAuth } from '@/src/features/auth/useAuth';
import { createLead, updateLead } from '@/src/features/crm/leads';
import {
  LEAD_PRIORITIES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  PROJECT_TYPES,
  type LeadPriority,
  type LeadSource,
  type LeadStatus,
  type ProjectType,
} from '@/src/features/crm/types';
import { useLead } from '@/src/features/crm/useLeads';
import { useOrgMembers } from '@/src/features/org/useOrgMembers';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import {
  Group,
  InputRow,
  PickerRow,
  PrimaryButton,
  SelectModal,
} from '@/src/ui/io';
import { OrgMemberPickerModal } from '@/src/ui/OrgMemberPickerModal';
import { PlatformDateTimePicker } from '@/src/ui/PlatformDateTimePicker';
import { Screen } from '@/src/ui/Screen';
import { color, screenInset, space } from '@/src/theme';
import { fontFamily } from '@/src/theme/tokens';

const sourceKeys = LEAD_SOURCES.map((s) => s.key) as [LeadSource, ...LeadSource[]];
const statusKeys = LEAD_STATUSES.map((s) => s.key) as [LeadStatus, ...LeadStatus[]];
const priorityKeys = LEAD_PRIORITIES.map((s) => s.key) as [LeadPriority, ...LeadPriority[]];
const projectKeys = ['', ...PROJECT_TYPES.map((p) => p.key)] as [
  '',
  ProjectType,
  ...ProjectType[],
];

const schema = z.object({
  name: z.string().trim().min(2, 'Name required'),
  phone: z.string().trim().min(10, 'Valid phone required'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  source: z.enum(sourceKeys),
  status: z.enum(statusKeys),
  priority: z.enum(priorityKeys),
  projectType: z.enum(projectKeys),
  location: z.string().optional(),
  budget: z.string().optional(),
  requirements: z.string().optional(),
  tags: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

function fmtDateTime(d: Date | null): string | undefined {
  if (!d) return undefined;
  return d.toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export default function AddLeadScreen() {
  const { leadId } = useLocalSearchParams<{ leadId?: string }>();
  const isEdit = !!leadId;
  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const { data: existing, loading: leadLoading } = useLead(isEdit ? leadId : undefined);
  const { members } = useOrgMembers(orgId || undefined);

  const [assignedUid, setAssignedUid] = useState<string | undefined>();
  const [assignedLabel, setAssignedLabel] = useState<string | undefined>();
  const [showAssignPicker, setShowAssignPicker] = useState(false);
  const [expectedStart, setExpectedStart] = useState<Date | null>(null);
  const [followUp, setFollowUp] = useState<Date | null>(null);
  const [showExpectedPicker, setShowExpectedPicker] = useState(false);
  const [showFollowPicker, setShowFollowPicker] = useState(false);
  const [submitError, setSubmitError] = useState<string>();

  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showPriorityPicker, setShowPriorityPicker] = useState(false);
  const [showProjectPicker, setShowProjectPicker] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      phone: '',
      email: '',
      source: 'walk_in',
      status: 'new',
      priority: 'medium',
      projectType: '',
      location: '',
      budget: '',
      requirements: '',
      tags: '',
      notes: '',
    },
  });

  useEffect(() => {
    if (!existing || !isEdit) return;
    reset({
      name: existing.name,
      phone: existing.phone,
      email: existing.email ?? '',
      source: existing.source,
      status: existing.status,
      priority: existing.priority,
      projectType: (existing.projectType ?? '') as FormData['projectType'],
      location: existing.location ?? '',
      budget:
        existing.budget !== undefined && existing.budget !== null
          ? String(existing.budget)
          : '',
      requirements: existing.requirements ?? '',
      tags: existing.tags?.join(', ') ?? '',
      notes: existing.notes ?? '',
    });
    setExpectedStart(existing.expectedStartDate?.toDate() ?? null);
    setFollowUp(existing.followUpAt?.toDate() ?? null);
    if (existing.assignedTo) {
      setAssignedUid(existing.assignedTo);
      const m = members.find((x) => x.uid === existing.assignedTo);
      setAssignedLabel(m?.displayName ?? existing.assignedTo);
    } else {
      setAssignedUid(undefined);
      setAssignedLabel(undefined);
    }
  }, [existing, isEdit, reset, members]);

  const sourceOptions = useMemo(
    () => LEAD_SOURCES.map((s) => ({ key: s.key, label: s.label })),
    [],
  );
  const statusOptions = useMemo(
    () => LEAD_STATUSES.map((s) => ({ key: s.key, label: s.label })),
    [],
  );
  const priorityOptions = useMemo(
    () => LEAD_PRIORITIES.map((s) => ({ key: s.key, label: s.label })),
    [],
  );
  const projectOptions = useMemo(
    () => [
      { key: '' as const, label: 'None' },
      ...PROJECT_TYPES.map((p) => ({ key: p.key, label: p.label })),
    ],
    [],
  );

  const onSave = handleSubmit(async (values) => {
    if (!user || !orgId) {
      setSubmitError('Not signed in');
      return;
    }
    setSubmitError(undefined);
    const budgetNum = values.budget?.trim()
      ? Number(values.budget.replace(/,/g, ''))
      : undefined;
    if (values.budget?.trim() && Number.isNaN(budgetNum)) {
      setSubmitError('Budget must be a number');
      return;
    }
    const tagsArr = values.tags
      ?.split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      if (isEdit && leadId) {
        await updateLead(leadId, {
          name: values.name,
          phone: values.phone,
          email: values.email?.trim() ? values.email.trim() : null,
          source: values.source,
          status: values.status,
          priority: values.priority,
          projectType: values.projectType ? (values.projectType as ProjectType) : null,
          location: values.location?.trim() ? values.location.trim() : null,
          budget: budgetNum !== undefined && !Number.isNaN(budgetNum) ? budgetNum : null,
          requirements: values.requirements?.trim() ? values.requirements.trim() : null,
          expectedStartDate: expectedStart,
          followUpAt: followUp,
          tags: tagsArr && tagsArr.length ? tagsArr : null,
          assignedTo: assignedUid ?? null,
          notes: values.notes?.trim() ? values.notes.trim() : null,
        });
        router.replace(`/(app)/crm/lead/${leadId}` as never);
      } else {
        const id = await createLead({
          orgId,
          name: values.name,
          phone: values.phone,
          source: values.source,
          status: values.status,
          priority: values.priority,
          createdBy: user.uid,
          email: values.email?.trim() || undefined,
          projectType: values.projectType ? (values.projectType as ProjectType) : undefined,
          location: values.location?.trim() || undefined,
          budget: budgetNum !== undefined && !Number.isNaN(budgetNum) ? budgetNum : undefined,
          requirements: values.requirements?.trim() || undefined,
          expectedStartDate: expectedStart ?? undefined,
          followUpAt: followUp ?? undefined,
          tags: tagsArr && tagsArr.length ? tagsArr : undefined,
          assignedTo: assignedUid,
          notes: values.notes?.trim() || undefined,
        });
        router.replace(`/(app)/crm/lead/${id}` as never);
      }
    } catch (e) {
      console.warn(e);
      setSubmitError('Could not save lead');
    }
  });

  if (isEdit && leadLoading && !existing) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <RNText style={styles.bodyText}>Loading…</RNText>
      </Screen>
    );
  }

  if (isEdit && !existing && !leadLoading) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <RNText style={styles.bodyText}>Lead not found</RNText>
        <Pressable onPress={() => router.back()} style={{ marginTop: space.md }}>
          <RNText style={styles.linkAction}>Back</RNText>
        </Pressable>
      </Screen>
    );
  }

  return (
    <Screen bg="grouped" padded={false}>
      <Stack.Screen options={{ headerShown: false }} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Top bar — InteriorOS LeadFormScreen header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="close" size={22} color={color.textMuted} />
          </Pressable>
          <RNText style={styles.topTitle}>
            {isEdit ? 'Edit lead' : 'New lead'}
          </RNText>
          <Pressable
            onPress={onSave}
            disabled={isSubmitting}
            hitSlop={8}
            style={({ pressed }) => [
              styles.saveBtn,
              isSubmitting && { opacity: 0.5 },
              pressed && !isSubmitting && { opacity: 0.85 },
            ]}
          >
            <RNText style={styles.saveBtnText}>
              {isSubmitting ? 'Saving…' : 'Save'}
            </RNText>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Identity */}
          <Group header="Identity">
            <Controller
              control={control}
              name="name"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Name"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="Lead full name"
                />
              )}
            />
            <Controller
              control={control}
              name="phone"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Phone"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  keyboardType="phone-pad"
                  mono
                  placeholder="+91 …"
                />
              )}
            />
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Email"
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholder="name@email.com"
                />
              )}
            />
            <Controller
              control={control}
              name="location"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Location"
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="City / area"
                  last
                />
              )}
            />
          </Group>
          {(errors.name?.message || errors.phone?.message || errors.email?.message) ? (
            <RNText style={styles.fieldError}>
              {errors.name?.message ?? errors.phone?.message ?? errors.email?.message}
            </RNText>
          ) : null}

          {/* Pipeline */}
          <Group header="Pipeline">
            <Controller
              control={control}
              name="source"
              render={({ field: { value } }) => (
                <PickerRow
                  label="Source"
                  value={sourceOptions.find((x) => x.key === value)?.label}
                  placeholder="Select"
                  onPress={() => setShowSourcePicker(true)}
                />
              )}
            />
            <Controller
              control={control}
              name="status"
              render={({ field: { value } }) => (
                <PickerRow
                  label="Status"
                  value={statusOptions.find((x) => x.key === value)?.label}
                  placeholder="Select"
                  onPress={() => setShowStatusPicker(true)}
                />
              )}
            />
            <Controller
              control={control}
              name="priority"
              render={({ field: { value } }) => (
                <PickerRow
                  label="Priority"
                  value={priorityOptions.find((x) => x.key === value)?.label}
                  placeholder="Select"
                  onPress={() => setShowPriorityPicker(true)}
                />
              )}
            />
            <Controller
              control={control}
              name="projectType"
              render={({ field: { value } }) => (
                <PickerRow
                  label="Project type"
                  value={projectOptions.find((x) => x.key === value)?.label}
                  placeholder="Select"
                  onPress={() => setShowProjectPicker(true)}
                  last
                />
              )}
            />
          </Group>

          {/* Budget & requirements */}
          <Group header="Budget & requirements">
            <Controller
              control={control}
              name="budget"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Budget ₹"
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  keyboardType="decimal-pad"
                  placeholder="900000"
                  mono
                />
              )}
            />
            <Controller
              control={control}
              name="requirements"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Brief"
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="Scope, must-haves…"
                  multiline
                  last
                />
              )}
            />
          </Group>

          {/* Schedule */}
          <Group header="Schedule">
            <PickerRow
              label="Expected start"
              value={fmtDateTime(expectedStart)}
              placeholder="Tap to set"
              onPress={() => setShowExpectedPicker(true)}
            />
            <PickerRow
              label="Follow-up"
              value={fmtDateTime(followUp)}
              placeholder="Tap to set"
              onPress={() => setShowFollowPicker(true)}
              last
            />
          </Group>

          {/* Assignment & tags */}
          <Group header="Assignment & tags">
            <PickerRow
              label="Assigned to"
              value={assignedLabel}
              placeholder="Unassigned"
              onPress={() => setShowAssignPicker(true)}
            />
            <Controller
              control={control}
              name="tags"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Tags"
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="comma, separated"
                  last
                />
              )}
            />
          </Group>

          {/* Notes */}
          <Group header="Notes">
            <Controller
              control={control}
              name="notes"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Notes"
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="Context, expectations, next steps…"
                  multiline
                  last
                />
              )}
            />
          </Group>

          {submitError ? (
            <RNText style={styles.fieldError}>
              {submitError}
            </RNText>
          ) : null}

          <View style={styles.submitWrap}>
            <PrimaryButton
              label={isEdit ? 'Save changes' : 'Create lead'}
              onPress={onSave}
              loading={isSubmitting}
              disabled={isSubmitting}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Pickers */}
      <SelectModal
        visible={showSourcePicker}
        title="Select source"
        options={sourceOptions}
        onClose={() => setShowSourcePicker(false)}
        onPick={(key) => setValue('source', key as LeadSource, { shouldDirty: true })}
      />
      <SelectModal
        visible={showStatusPicker}
        title="Select status"
        options={statusOptions}
        onClose={() => setShowStatusPicker(false)}
        onPick={(key) => setValue('status', key as LeadStatus, { shouldDirty: true })}
      />
      <SelectModal
        visible={showPriorityPicker}
        title="Select priority"
        options={priorityOptions}
        onClose={() => setShowPriorityPicker(false)}
        onPick={(key) => setValue('priority', key as LeadPriority, { shouldDirty: true })}
      />
      <SelectModal
        visible={showProjectPicker}
        title="Select project type"
        options={projectOptions}
        onClose={() => setShowProjectPicker(false)}
        onPick={(key) =>
          setValue('projectType', key as FormData['projectType'], { shouldDirty: true })
        }
      />

      <PlatformDateTimePicker
        open={showExpectedPicker}
        value={expectedStart ?? new Date()}
        onChange={setExpectedStart}
        onClose={() => setShowExpectedPicker(false)}
      />
      <PlatformDateTimePicker
        open={showFollowPicker}
        value={followUp ?? new Date()}
        onChange={setFollowUp}
        onClose={() => setShowFollowPicker(false)}
      />

      <OrgMemberPickerModal
        visible={showAssignPicker}
        orgId={orgId}
        allowUnassign
        onClose={() => setShowAssignPicker(false)}
        onPick={(uid, displayName) => {
          setAssignedUid(uid || undefined);
          setAssignedLabel(uid ? displayName : undefined);
          setShowAssignPicker(false);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: screenInset,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    backgroundColor: color.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.borderStrong,
  },
  saveBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: color.primary,
  },
  // Unified type scale (matches lead detail + cards)
  topTitle: {
    fontFamily: fontFamily.sans,
    fontSize: 15,
    fontWeight: '600',
    color: color.text,
    letterSpacing: -0.1,
  },
  saveBtnText: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    fontWeight: '600',
    color: color.onPrimary,
  },
  bodyText: {
    fontFamily: fontFamily.sans,
    fontSize: 14,
    lineHeight: 20,
    color: color.textMuted,
  },
  linkAction: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    fontWeight: '500',
    color: color.primary,
  },
  scroll: {
    paddingTop: space.md,
    paddingBottom: space.xl * 2,
  },
  fieldError: {
    fontFamily: fontFamily.sans,
    fontSize: 11,
    fontWeight: '500',
    color: color.danger,
    paddingHorizontal: screenInset,
    marginTop: -16,
    marginBottom: 16,
  },
  submitWrap: {
    paddingHorizontal: 0,
    marginTop: space.sm,
  },
});
