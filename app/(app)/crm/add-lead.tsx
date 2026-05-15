/**
 * Create or edit a CRM lead — v2 design.
 *
 * Layout (top → bottom):
 *   1. SheetHeader: Cancel · "New lead" / "Edit lead" · Save
 *   2. ScrollView (KeyboardAvoidingView wraps it so the keyboard NEVER
 *      overlaps the focused input — the screen pushes content up by
 *      the keyboard height on iOS).
 *      a. Big editable name input (the lead's name, prominent)
 *      b. Status pill row (segmented chips — most-changed field stays visible)
 *      c. FormGroup "Identity" — Phone, Email, Location
 *      d. FormGroup "Pipeline" — Source · Priority · Project type (pickers)
 *      e. FormGroup "Budget & requirements" — Budget ₹ · Brief
 *      f. FormGroup "Schedule" — Expected start · Follow-up (DateTimeSheet)
 *      g. FormGroup "Assignment & tags" — Assigned to · Tags
 *      h. FormGroup "Notes" — multiline notes
 *
 * Date pickers use `<DateTimeSheet>` which gives them a proper Cancel /
 * **Done** header. Selecting a date doesn't auto-commit — only Done does.
 *
 * Source/Priority/Project pickers use `<SelectSheet>` (bottom sheet).
 * Status uses an inline segmented pill row at the top of the form so the
 * field is visible at-a-glance.
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
  TextInput,
  View,
} from 'react-native';

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
import { OrgMemberPickerModal } from '@/src/ui/OrgMemberPickerModal';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { DateTimeSheet } from '@/src/ui/v2/DateTimeSheet';
import { FormGroup } from '@/src/ui/v2/FormGroup';
import { InputRow } from '@/src/ui/v2/InputRow';
import { Row } from '@/src/ui/v2/Row';
import { SelectSheet } from '@/src/ui/v2/SelectSheet';
import { SheetHeader } from '@/src/ui/v2/SheetHeader';
import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

import { z } from 'zod';

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

// 90/10 colour discipline: lead stages are pipeline labels, not actionable
// status. The selected stage in this picker reads in interactive blue
// (matches every other selected-pill in the app); the lone "lost" outcome
// keeps red because it's a problem state.
function statusTone(t: ReturnType<typeof useThemeV2>, k: LeadStatus) {
  if (k === 'lost') return { fg: t.palette.red.base, bg: t.palette.red.soft };
  return { fg: t.palette.blue.base, bg: t.palette.blue.soft };
}

export default function AddLeadScreen() {
  const t = useThemeV2();
  const { leadId } = useLocalSearchParams<{ leadId?: string }>();
  const isEdit = !!leadId;
  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const { data: existing, loading: leadLoading } = useLead(isEdit ? leadId : undefined);
  const { members } = useOrgMembers(orgId || undefined);

  // Picker visibility
  const [assignedUid, setAssignedUid] = useState<string | undefined>();
  const [assignedLabel, setAssignedLabel] = useState<string | undefined>();
  const [showAssignPicker, setShowAssignPicker] = useState(false);
  const [expectedStart, setExpectedStart] = useState<Date | null>(null);
  const [followUp, setFollowUp] = useState<Date | null>(null);
  const [showExpectedPicker, setShowExpectedPicker] = useState(false);
  const [showFollowPicker, setShowFollowPicker] = useState(false);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [showPriorityPicker, setShowPriorityPicker] = useState(false);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [submitError, setSubmitError] = useState<string>();

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
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

  // Hydrate when editing
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

  // Picker option lists
  const sourceOptions = useMemo(
    () => LEAD_SOURCES.map((s) => ({ key: s.key, label: s.label })),
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

  // Live values for picker rows
  const watchedSource = watch('source');
  const watchedPriority = watch('priority');
  const watchedProject = watch('projectType');
  const watchedStatus = watch('status');

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
      .map((tag) => tag.trim())
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

  // Loading / not-found shells (edit flow)
  if (isEdit && leadLoading && !existing) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />
        <SheetHeader
          title="Edit lead"
          onCancel={() => router.back()}
          onSave={() => undefined}
          saveDisabled
        />
        <View style={styles.centered}>
          <Text variant="body" color="secondary">Loading…</Text>
        </View>
      </View>
    );
  }
  if (isEdit && !existing && !leadLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />
        <SheetHeader
          title="Edit lead"
          onCancel={() => router.back()}
          onSave={() => undefined}
          saveDisabled
        />
        <View style={styles.centered}>
          <Text variant="body" color="secondary">Lead not found</Text>
          <Pressable onPress={() => router.back()} hitSlop={6} style={{ marginTop: 12 }}>
            <Text variant="footnote" style={{ color: t.palette.blue.base, fontWeight: '600' }}>
              Back
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />

      <AmbientBackground />

      {/* Top: Cancel · Title · Save */}
      <SheetHeader
        title={isEdit ? 'Edit lead' : 'New lead'}
        cancelLabel="Cancel"
        saveLabel={isEdit ? 'Save' : 'Create'}
        saveLoading={isSubmitting}
        onCancel={() => router.back()}
        onSave={() => void onSave()}
      />

      {/*
        KeyboardAvoidingView + ScrollView keeps the focused input above
        the keyboard. iOS uses 'padding' so the layout shrinks under
        the keyboard; Android relies on `windowSoftInputMode: adjustResize`
        in app.json (already set).
      */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {/* Big editable name */}
          <View style={styles.titleBlock}>
            <Text
              variant="caption2"
              color="tertiary"
              style={{ letterSpacing: 0.5 }}
            >
              LEAD NAME
            </Text>
            <Controller
              control={control}
              name="name"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="Aakash Bansal"
                  placeholderTextColor={t.colors.tertiary}
                  autoCapitalize="words"
                  style={[
                    styles.bigName,
                    {
                      color: t.colors.label,
                      ...t.type.title1,
                      // Big editable lead-name style — keep prominent like the design
                    },
                  ]}
                  returnKeyType="next"
                />
              )}
            />
            {errors.name?.message ? (
              <Text variant="caption2" style={{ color: t.palette.red.base, marginTop: 4 }}>
                {errors.name.message}
              </Text>
            ) : null}
          </View>

          {/* Status pill row — most-changed field stays visible at the top */}
          <View style={styles.statusBlock}>
            <Text
              variant="caption2"
              color="tertiary"
              style={[styles.statusLabel, { letterSpacing: 0.5 }]}
            >
              STATUS
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.statusRow}
            >
              {LEAD_STATUSES.map((s) => {
                const sel = watchedStatus === s.key;
                const tone = statusTone(t, s.key);
                return (
                  <Pressable
                    key={s.key}
                    onPress={() => setValue('status', s.key, { shouldDirty: true })}
                    hitSlop={6}
                    style={({ pressed }) => [
                      styles.statusChip,
                      {
                        backgroundColor: sel ? tone.bg : t.colors.fill3,
                        borderRadius: t.radii.pill,
                        borderColor: sel ? tone.fg : 'transparent',
                        borderWidth: sel ? 1 : 0,
                      },
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <View
                      style={[
                        styles.statusDot,
                        { backgroundColor: sel ? tone.fg : t.colors.tertiary },
                      ]}
                    />
                    <Text
                      variant="footnote"
                      style={{
                        color: sel ? tone.fg : t.colors.secondary,
                        fontWeight: sel ? '700' : '500',
                        marginLeft: 5,
                      }}
                    >
                      {s.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Identity */}
          <FormGroup header="Identity">
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
                  placeholder="+91 9876543210"
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
                  autoCapitalize="words"
                  divider={false}
                />
              )}
            />
          </FormGroup>
          {errors.phone?.message || errors.email?.message ? (
            <Text variant="caption2" style={{ color: t.palette.red.base, paddingHorizontal: 32, marginTop: 6 }}>
              {errors.phone?.message ?? errors.email?.message}
            </Text>
          ) : null}

          {/* Pipeline */}
          <FormGroup header="Pipeline">
            <Row
              label="Source"
              value={sourceOptions.find((x) => x.key === watchedSource)?.label}
              chevron
              onPress={() => setShowSourcePicker(true)}
            />
            <Row
              label="Priority"
              value={priorityOptions.find((x) => x.key === watchedPriority)?.label}
              chevron
              onPress={() => setShowPriorityPicker(true)}
            />
            <Row
              label="Project type"
              value={projectOptions.find((x) => x.key === watchedProject)?.label}
              chevron
              onPress={() => setShowProjectPicker(true)}
              divider={false}
            />
          </FormGroup>

          {/* Budget & requirements */}
          <FormGroup header="Budget & requirements">
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
                  autoCapitalize="none"
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
                  divider={false}
                />
              )}
            />
          </FormGroup>

          {/* Schedule — DateTimeSheet has the Done button */}
          <FormGroup header="Schedule">
            <Row
              label="Expected start"
              value={fmtDateTime(expectedStart)}
              chevron
              onPress={() => setShowExpectedPicker(true)}
            />
            <Row
              label="Follow-up"
              value={fmtDateTime(followUp)}
              chevron
              onPress={() => setShowFollowPicker(true)}
              divider={false}
            />
          </FormGroup>

          {/* Assignment & tags */}
          <FormGroup header="Assignment & tags">
            <Row
              label="Assigned to"
              value={assignedLabel ?? 'Unassigned'}
              chevron
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
                  autoCapitalize="none"
                  divider={false}
                />
              )}
            />
          </FormGroup>

          {/* Notes */}
          <FormGroup header="Notes">
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
                  divider={false}
                />
              )}
            />
          </FormGroup>

          {submitError ? (
            <Text
              variant="caption2"
              style={{
                color: t.palette.red.base,
                paddingHorizontal: 32,
                marginTop: 12,
              }}
            >
              {submitError}
            </Text>
          ) : null}

          {/* Trailing space so the last field clears the keyboard / safe area */}
          <View style={{ height: 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Pickers */}
      <SelectSheet
        open={showSourcePicker}
        title="Select source"
        options={sourceOptions}
        selected={watchedSource}
        onPick={(key) => setValue('source', key as LeadSource, { shouldDirty: true })}
        onClose={() => setShowSourcePicker(false)}
      />
      <SelectSheet
        open={showPriorityPicker}
        title="Select priority"
        options={priorityOptions}
        selected={watchedPriority}
        onPick={(key) => setValue('priority', key as LeadPriority, { shouldDirty: true })}
        onClose={() => setShowPriorityPicker(false)}
      />
      <SelectSheet
        open={showProjectPicker}
        title="Select project type"
        options={projectOptions}
        selected={watchedProject}
        onPick={(key) =>
          setValue('projectType', key as FormData['projectType'], { shouldDirty: true })
        }
        onClose={() => setShowProjectPicker(false)}
      />

      <DateTimeSheet
        open={showExpectedPicker}
        value={expectedStart ?? new Date()}
        onChange={setExpectedStart}
        onClose={() => setShowExpectedPicker(false)}
        title="Expected start"
      />
      <DateTimeSheet
        open={showFollowPicker}
        value={followUp ?? new Date()}
        onChange={setFollowUp}
        onClose={() => setShowFollowPicker(false)}
        title="Follow-up"
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
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    paddingTop: 8,
    paddingBottom: 40,
  },

  // Big editable name
  titleBlock: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 4,
  },
  bigName: {
    paddingTop: 4,
    paddingBottom: 0,
    margin: 0,
    fontWeight: '700',
  },

  // Status pill row
  statusBlock: {
    paddingTop: 18,
    paddingBottom: 4,
  },
  statusLabel: {
    paddingHorizontal: 32,
    paddingBottom: 8,
  },
  statusRow: {
    paddingHorizontal: 16,
    gap: 7,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
