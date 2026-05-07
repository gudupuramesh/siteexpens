/**
 * Add Transaction — Payment In / Payment Out form.
 * Receives `type` from query params. Party picker shows project parties first,
 * then all org parties. Users can add a new party from contacts inline.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import * as Contacts from 'expo-contacts';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useGuardedRoute } from '@/src/features/org/useGuardedRoute';
import { Controller, useForm } from 'react-hook-form';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  InteractionManager,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { z } from 'zod';

import { guessImageMimeType, recordStorageEvent } from '@/src/lib/r2Upload';
import { commitStagedFiles, type StagedFile } from '@/src/lib/commitStagedFiles';
import { auth, db } from '@/src/lib/firebase';

import { useAuth } from '@/src/features/auth/useAuth';
import { usePermissions } from '@/src/features/org/usePermissions';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { useParties } from '@/src/features/parties/useParties';
import { createParty, InvalidPhoneError } from '@/src/features/parties/parties';
import { normalizeIndianPhoneE164 } from '@/src/lib/phone';
import {
  PARTY_TYPE_GROUPS,
  getPartyTypeLabel,
  type PartyType,
  type Party,
} from '@/src/features/parties/types';
import { useTransactions } from '@/src/features/transactions/useTransactions';
import { createTransaction } from '@/src/features/transactions/transactions';
import {
  TRANSACTION_CATEGORIES,
  PAYMENT_METHODS,
  type TransactionCategory,
  type PaymentMethod,
  type TransactionSubmissionKind,
} from '@/src/features/transactions/types';
import { formatDate } from '@/src/lib/format';
import { Button } from '@/src/ui/Button';
import { DatePickerModal } from '@/src/ui/DatePickerModal';
import { Screen } from '@/src/ui/Screen';
import { SubmitProgressOverlay } from '@/src/ui/SubmitProgressOverlay';
import { Text } from '@/src/ui/Text';
import { TextField } from '@/src/ui/TextField';
import { color, radius, screenInset, space } from '@/src/theme';

// ── Schema ──

const schema = z.object({
  type: z.enum(['payment_in', 'payment_out']),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Enter a valid amount'),
  description: z.string().trim().max(200).optional().or(z.literal('')),
  partyName: z.string().trim().min(1, 'Select or enter party'),
  partyId: z.string().optional(),
  category: z.string().optional(),
  paymentMethod: z.string().optional(),
  referenceNumber: z.string().optional(),
  status: z.enum(['paid', 'pending', 'partial']),
  date: z.date(),
});

type FormData = z.infer<typeof schema>;

// ── Diagnostics ──
//
// Capture the exact rule inputs Firestore evaluated when the
// transaction create fails. We intentionally read the org doc here
// (one extra request, only on failure) so we can see whether the
// caller's uid is in `memberIds` and what `roles[uid]` resolves to
// from the perspective of THIS device's auth context. That's the
// smallest reliable way to tell apart:
//   - empty/wrong orgId at submit (race)
//   - uid missing from memberIds (org-doc shape bug)
//   - roles[uid] outside the allowlist (backfill / mutation bug)
//   - rules drift between the repo and what's deployed
// Without this, all four show up as "permission-denied" with no
// way to tell which one is firing.
type AddTxnFailureContext = {
  err: { code?: string; message?: string };
  projectId: string;
  orgId: string;
  createdByPassed: string;
  authUid: string | null;
  primaryOrgId: string | null;
  roleFromHook: string | null;
  workflowStatus: 'posted' | 'pending_approval';
};

async function logAddTxnFailure(ctx: AddTxnFailureContext): Promise<string> {
  let orgDocSnapshot: {
    exists: boolean;
    ownerId?: string;
    isInMemberIds?: boolean;
    rolesMapEntry?: string | null;
    memberCount?: number;
  } = { exists: false };
  try {
    const snap = await db.collection('organizations').doc(ctx.orgId).get();
    if (snap.exists) {
      const data = snap.data() as Record<string, unknown> | undefined;
      const memberIds = Array.isArray(data?.memberIds)
        ? (data!.memberIds as string[])
        : [];
      const roles = (data?.roles ?? null) as Record<string, string> | null;
      orgDocSnapshot = {
        exists: true,
        ownerId: typeof data?.ownerId === 'string' ? (data!.ownerId as string) : undefined,
        isInMemberIds: ctx.authUid ? memberIds.includes(ctx.authUid) : false,
        rolesMapEntry: ctx.authUid ? (roles?.[ctx.authUid] ?? null) : null,
        memberCount: memberIds.length,
      };
    }
  } catch (orgErr) {
    // Reading the org doc itself can fail (rules / network). Don't
    // mask the original error — record the read failure inline.
    orgDocSnapshot = {
      exists: false,
      rolesMapEntry: `org-read-failed: ${(orgErr as Error).message}`,
    };
  }
  const payload = {
    code: ctx.err.code ?? 'unknown',
    message: ctx.err.message ?? 'unknown',
    projectId: ctx.projectId,
    orgId: ctx.orgId,
    createdByPassed: ctx.createdByPassed,
    authUid: ctx.authUid,
    uidsMatch: ctx.createdByPassed === ctx.authUid,
    primaryOrgId: ctx.primaryOrgId,
    primaryOrgMatchesPayload: ctx.primaryOrgId === ctx.orgId,
    roleFromHook: ctx.roleFromHook,
    workflowStatus: ctx.workflowStatus,
    orgDoc: orgDocSnapshot,
  };
  // console.warn is stripped by Hermes in release builds, so the
  // logcat path is dead in production APKs. Always return the
  // payload as a string so the caller can render it on-screen
  // (the only reliable diagnostic surface in a release build).
  console.warn('[add-txn:fail]', payload);
  return formatDiagnostic(payload);
}

/** Compact one-line summary of the rule inputs, suitable for
 *  inclusion in an on-screen error message. Truncates uids to
 *  6 chars so the line stays readable. */
function formatDiagnostic(p: {
  code: string;
  uidsMatch: boolean;
  primaryOrgMatchesPayload: boolean;
  roleFromHook: string | null;
  authUid: string | null;
  primaryOrgId: string | null;
  orgId: string;
  orgDoc: {
    exists: boolean;
    isInMemberIds?: boolean;
    rolesMapEntry?: string | null;
  };
}): string {
  const short = (s: string | null | undefined) =>
    s ? `${s.slice(0, 6)}…` : '∅';
  return (
    `code=${p.code} ` +
    `role=${p.roleFromHook ?? 'null'} ` +
    `uidsMatch=${p.uidsMatch} ` +
    `primaryMatchesPayload=${p.primaryOrgMatchesPayload} ` +
    `orgExists=${p.orgDoc.exists} ` +
    `inMemberIds=${p.orgDoc.isInMemberIds ?? '∅'} ` +
    `rolesMap=${p.orgDoc.rolesMapEntry ?? '∅'} ` +
    `auth=${short(p.authUid)} ` +
    `primary=${short(p.primaryOrgId)} ` +
    `payloadOrg=${short(p.orgId)}`
  );
}

// ── Component ──

export default function AddTransactionScreen() {
  // Site Engineer / Supervisor get the submit-only pending path;
  // everyone else with finance.write goes straight to posted.
  // Either capability is sufficient to render this screen.
  useGuardedRoute({ anyOf: ['transaction.write', 'transaction.submit'] });

  const params = useLocalSearchParams<{ id: string; type?: string }>();
  const projectId = params.id;

  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const { can, role, loading: permLoading } = usePermissions();
  const postsTxnDirectly = can('transaction.write');
  const mayAddTxn = postsTxnDirectly || can('transaction.submit');
  // Trust the URL on initial mount. We previously gated this on
  // `postsTxnDirectly` (= can('transaction.write')) to coerce
  // submit-only roles back to `payment_out`, but that introduced a
  // race: `can()` returns `false` on the first render while
  // `usePermissions` is still loading, which collapsed
  // `?type=payment_in` to `payment_out`. React Hook Form captures
  // `defaultValues` once on mount, so the form was stuck on the
  // wrong type even after permissions arrived.
  //
  // The role guard now lives in a post-mount useEffect (below) — it
  // runs once permissions are real and only coerces if the role
  // genuinely cannot post Payment In. Submit-only roles also don't
  // see the Payment In button in the UI, and the server-side
  // create rule rejects `payment_in` for them, so this is purely a
  // UX fallback for hand-edited URLs.
  const initialType: 'payment_in' | 'payment_out' =
    params.type === 'payment_in' ? 'payment_in' : 'payment_out';
  const { data: allParties } = useParties(orgId || undefined);
  const { data: transactions } = useTransactions(projectId);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showPartyPicker, setShowPartyPicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showMoreDetail, setShowMoreDetail] = useState(false);
  const [partySearch, setPartySearch] = useState('');
  const [submitError, setSubmitError] = useState<string>();
  // Receipt is staged locally on pick — R2 upload runs during Save
  // (see onSubmit) so abandoning the form leaves nothing in R2.
  const [stagedReceipt, setStagedReceipt] = useState<StagedFile | null>(null);
  const [savePhase, setSavePhase] = useState<string>();
  // Only meaningful for submit-only roles submitting payment_out — drives
  // the wording of the eventual "Cleared" notification (reimbursement vs
  // party payment). Defaults to 'expense_reimbursement' which is the most
  // common case for site supervisors paying out-of-pocket.
  const [submissionKind, setSubmissionKind] =
    useState<TransactionSubmissionKind>('expense_reimbursement');

  useEffect(() => {
    if (permLoading || !user) return;
    if (!mayAddTxn) {
      Alert.alert('No access', 'You cannot add transactions for this studio.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    }
  }, [permLoading, mayAddTxn, user]);

  // New party from contact flow
  const [showNewPartyType, setShowNewPartyType] = useState(false);
  const [newPartyName, setNewPartyName] = useState('');
  const [newPartyPhone, setNewPartyPhone] = useState('');
  const [creatingParty, setCreatingParty] = useState(false);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting, isValid },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: initialType,
      amount: '',
      description: '',
      partyName: '',
      partyId: '',
      category: '',
      paymentMethod: '',
      referenceNumber: '',
      status: 'paid',
      date: new Date(),
    },
    mode: 'onChange',
  });

  const selectedType = watch('type');
  const selectedDate = watch('date');
  const selectedPartyName = watch('partyName');
  const selectedCategory = watch('category');
  const selectedPaymentMethod = watch('paymentMethod');

  const isPaymentIn = selectedType === 'payment_in';
  const navTitle = isPaymentIn ? 'Payment In' : 'Payment Out';

  // Post-mount safety coercion: once permissions are real, if the
  // role cannot post Payment In and the form is sitting on
  // `payment_in` (deep link / hand-edited URL), flip it to
  // `payment_out` so the user sees the form they're allowed to
  // submit. The button rail in TransactionTab already hides the
  // Payment In affordance for these roles, so this only fires for
  // edge cases like a shared URL.
  useEffect(() => {
    if (permLoading) return;
    if (!postsTxnDirectly && selectedType === 'payment_in') {
      setValue('type', 'payment_out');
    }
  }, [permLoading, postsTxnDirectly, selectedType, setValue]);

  // ── Party sections: project parties first, then rest ──

  const partySections = useMemo(() => {
    // Get unique party names from this project's transactions
    const projectPartyNames = new Set(
      transactions.map((t) => t.partyName).filter(Boolean),
    );

    const projectParties: Party[] = [];
    const otherParties: Party[] = [];

    const search = partySearch.toLowerCase();

    for (const p of allParties) {
      if (search && !p.name.toLowerCase().includes(search)) continue;
      if (projectPartyNames.has(p.name)) {
        projectParties.push(p);
      } else {
        otherParties.push(p);
      }
    }

    const sections: { title: string; data: Party[] }[] = [];
    if (projectParties.length > 0) {
      sections.push({ title: 'Project Parties', data: projectParties });
    }
    if (otherParties.length > 0) {
      sections.push({ title: 'All Parties', data: otherParties });
    }
    return sections;
  }, [allParties, transactions, partySearch]);

  const categoryLabel = TRANSACTION_CATEGORIES.find((c) => c.key === selectedCategory)?.label;

  // ── Handlers ──

  const selectParty = useCallback((party: Party) => {
    setValue('partyName', party.name, { shouldValidate: true });
    setValue('partyId', party.id);
    setShowPartyPicker(false);
    setPartySearch('');
  }, [setValue]);

  // Pick from phone contacts → show party type picker → create party
  const pickContactAndAdd = useCallback(async () => {
    Keyboard.dismiss();
    // Dismiss the party sheet before opening the system contact picker. On iOS,
    // expo-contacts presents from currentViewController(); with our transparent
    // Modal still mounted (or mid-unmount after hiding it abruptly), that VC is
    // often nil so `present` never runs and the JS promise never resolves.
    setShowPartyPicker(false);
    try {
      await new Promise<void>((resolve) => {
        InteractionManager.runAfterInteractions(() => setTimeout(resolve, 500));
      });
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow contacts access to pick a contact.');
        return;
      }
      const result = await Contacts.presentContactPickerAsync();
      if (!result) return;

      const contactName =
        (result.name ?? '').trim() ||
        [result.firstName, result.lastName].filter(Boolean).join(' ').trim() ||
        (result.company ?? '').trim() ||
        '';
      // Walk every phone on the contact and pick the first one that
      // normalises to a valid Indian +91 number. Old logic only
      // looked at digit count which let foreign numbers through —
      // the strict normaliser rejects them up front so the rest of
      // the flow can assume a clean E.164 value.
      const rawNumbers =
        result.phoneNumbers?.map((p) => p.number ?? p.digits ?? '') ?? [];
      let normalizedPhone: string | null = null;
      for (const candidate of rawNumbers) {
        const n = normalizeIndianPhoneE164(candidate);
        if (n) {
          normalizedPhone = n;
          break;
        }
      }

      if (!contactName) {
        Alert.alert(
          'Missing name',
          'That contact has no name or company. Add a name in Contacts and try again.',
        );
        return;
      }
      if (!normalizedPhone) {
        Alert.alert(
          'Phone not supported',
          'That contact needs a 10-digit Indian mobile number (we currently support +91 only).',
        );
        return;
      }

      setNewPartyName(contactName);
      setNewPartyPhone(normalizedPhone);
      setShowPartyPicker(false);
      // iOS: presenting a second RN Modal in the same tick as closing the first
      // often drops the role sheet; defer until the party sheet is gone.
      InteractionManager.runAfterInteractions(() => {
        setTimeout(() => setShowNewPartyType(true), 120);
      });
    } catch (e) {
      Alert.alert(
        'Contacts',
        e instanceof Error ? e.message : 'Could not open the contact picker.',
      );
    }
  }, []);

  const createNewPartyAndSelect = useCallback(async (partyType: PartyType) => {
    if (!user || !orgId || !newPartyName.trim()) {
      Alert.alert('Party', 'Missing party name. Try picking the contact again.');
      return;
    }
    // Re-validate at the create step in case the field was edited
    // after the contact was picked. createParty also validates
    // server-adjacent in the helper, but failing here gives a
    // clearer UX than catching InvalidPhoneError post-hoc.
    const normalizedPhone = normalizeIndianPhoneE164(newPartyPhone);
    if (!normalizedPhone) {
      Alert.alert('Party', 'Enter a valid 10-digit Indian phone number.');
      return;
    }
    setCreatingParty(true);
    try {
      const partyId = await createParty({
        orgId,
        name: newPartyName.trim(),
        phone: normalizedPhone,
        partyType,
        createdBy: user.uid,
      });
      setValue('partyName', newPartyName.trim(), { shouldValidate: true });
      setValue('partyId', partyId);
      setShowNewPartyType(false);
      setNewPartyName('');
      setNewPartyPhone('');
    } catch (err) {
      const msg =
        err instanceof InvalidPhoneError
          ? err.message
          : (err as Error).message;
      Alert.alert('Error', msg);
    } finally {
      setCreatingParty(false);
    }
  }, [user, orgId, newPartyName, newPartyPhone, setValue]);

  async function pickReceipt(source: 'camera' | 'library') {
    const perm = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Permission needed',
        source === 'camera'
          ? 'Allow camera access to capture a receipt.'
          : 'Allow photo library access to attach a receipt.',
      );
      return;
    }
    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    };
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts);
    if (result.canceled || !result.assets[0]) return;

    // Stage locally — upload happens during Save.
    const asset = result.assets[0];
    setStagedReceipt({
      id: 'receipt',
      localUri: asset.uri,
      contentType: asset.mimeType || guessImageMimeType(asset.uri),
    });
  }

  function clearReceipt() {
    setStagedReceipt(null);
  }

  async function onSubmit(data: FormData) {
    // Belt-and-braces guards. The submit button is disabled while
    // these aren't satisfied, but a stale render could still send
    // a tap through — surface the cause instead of silently
    // returning, which would look like a frozen Save button.
    if (!user) {
      setSubmitError('Not signed in. Please sign in again.');
      return;
    }
    if (!projectId) {
      setSubmitError('Project not loaded. Please reopen the project.');
      return;
    }
    if (!orgId) {
      setSubmitError('Studio not loaded yet — try again in a moment.');
      return;
    }
    setSubmitError(undefined);
    try {
      // Step 1 — upload the staged receipt (if any).
      let receiptUrl: string | undefined;
      let receiptKey: string | undefined;
      let receiptSize = 0;
      let receiptContentType = '';
      if (stagedReceipt) {
        setSavePhase('Uploading receipt…');
        const { uploaded, failed } = await commitStagedFiles({
          files: [stagedReceipt],
          kind: 'transaction',
          refId: projectId,
          compress: 'balanced',
        });
        if (failed.length > 0) {
          setSubmitError(`Receipt upload failed: ${failed[0].error}`);
          setSavePhase(undefined);
          return;
        }
        receiptUrl = uploaded[0].publicUrl;
        receiptKey = uploaded[0].key;
        receiptSize = uploaded[0].sizeBytes;
        receiptContentType = uploaded[0].contentType;
      }

      // Step 2 — create the transaction.
      setSavePhase('Saving transaction…');
      const workflowStatus = postsTxnDirectly ? 'posted' : 'pending_approval';
      let txnId: string;
      try {
        txnId = await createTransaction({
          projectId,
          orgId,
          type: data.type,
          amount: parseFloat(data.amount),
          description: data.description || '',
          partyId: data.partyId || undefined,
          partyName: data.partyName,
          category: (data.category as TransactionCategory) || undefined,
          paymentMethod: (data.paymentMethod as PaymentMethod) || undefined,
          referenceNumber: data.referenceNumber || undefined,
          status: data.status,
          date: data.date,
          createdBy: user.uid,
          photoUrl: receiptUrl,
          photoStoragePath: receiptKey,
          workflowStatus,
          // Only attach for submit-only roles submitting payment_out —
          // approvers posting directly don't need this distinction
          // (no settlement notification fires for direct posts).
          submissionKind:
            !postsTxnDirectly && data.type === 'payment_out' ? submissionKind : undefined,
        });
      } catch (err) {
        // Diagnostic: capture the exact rule inputs Firestore saw,
        // not just the surfaced error message. Permission-denied
        // here is almost always one of: orgId mismatch, uid not in
        // memberIds, role mismatch, or rules drift. The returned
        // string is appended to the on-screen error because
        // console.warn is stripped by Hermes in release builds —
        // logcat is silent in production APKs. The on-screen line
        // is the ONLY reliable diagnostic surface for users who
        // aren't running a Metro debug build.
        const e = err as { code?: string; message?: string };
        const diag = await logAddTxnFailure({
          err: e,
          projectId,
          orgId,
          createdByPassed: user.uid,
          authUid: auth.currentUser?.uid ?? null,
          primaryOrgId: userDoc?.primaryOrgId ?? null,
          roleFromHook: role,
          workflowStatus,
        });
        const friendlyHead =
          e.code === 'permission-denied'
            ? "Couldn't save — you don't have permission for this studio."
            : e.message ?? 'Could not save the transaction.';
        setSubmitError(`${friendlyHead}\n\nDiagnostic: ${diag}`);
        setSavePhase(undefined);
        return;
      }

      // Step 3 — attribute the upload to project storage totals.
      if (receiptKey) {
        void recordStorageEvent({
          projectId,
          kind: 'transaction',
          refId: txnId,
          key: receiptKey,
          sizeBytes: receiptSize,
          contentType: receiptContentType,
          action: 'upload',
        });
      }
      await new Promise((r) => setTimeout(r, 150));
      router.replace(`/(app)/projects/${projectId}/transaction/${txnId}` as never);
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSavePhase(undefined);
    }
  }

  // ── Render ──

  return (
    <Screen bg="grouped" padded={false} style={{ backgroundColor: color.surface }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Nav */}
      <View style={styles.navBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.navBtn}>
          <Ionicons name="arrow-back" size={22} color={color.text} />
        </Pressable>
        <View style={styles.navCenter}>
          <Text variant="caption" color="textMuted" style={styles.navEyebrow}>EXPENSE</Text>
          <Text variant="bodyStrong" color="text" style={styles.navTitle}>
            {navTitle}
          </Text>
        </View>
        <View style={styles.navBtn} />
      </View>

      {/* Amount hero + date */}
      <View style={styles.hero}>
        <Text variant="caption" color="textMuted" style={styles.heroLabel}>
          AMOUNT - INR
        </Text>
        <View style={styles.heroAmountRow}>
          <Text
            variant="title"
            style={{ color: isPaymentIn ? color.success : color.primary }}
          >
            {isPaymentIn ? '+ Rs' : '- Rs'}
          </Text>
          <Controller
            control={control}
            name="amount"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                value={value}
                onChangeText={(t) => onChange(t.replace(/[^\d.]/g, ''))}
                onBlur={onBlur}
                placeholder="0"
                keyboardType="numeric"
                style={styles.heroAmountInput}
                placeholderTextColor={color.textFaint}
              />
            )}
          />
        </View>
        <Pressable
          onPress={() => setShowDatePicker(true)}
          style={styles.dateChip}
        >
          <Text variant="metaStrong" color="text">{formatDate(selectedDate)}</Text>
          <Ionicons name="chevron-down" size={14} color={color.textMuted} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Submission kind — only for submit-only roles on payment_out.
              Approvers post directly; no clearing/reimbursement flow runs
              for them, so the toggle would be noise. */}
          {!postsTxnDirectly && selectedType === 'payment_out' ? (
            <View style={styles.kindCard}>
              <Text variant="caption" color="textMuted" style={styles.kindLabel}>
                THIS IS A
              </Text>
              <View style={styles.kindRow}>
                <Pressable
                  onPress={() => setSubmissionKind('expense_reimbursement')}
                  style={[
                    styles.kindOption,
                    submissionKind === 'expense_reimbursement' && styles.kindOptionActive,
                  ]}
                >
                  <Ionicons
                    name="wallet-outline"
                    size={16}
                    color={
                      submissionKind === 'expense_reimbursement'
                        ? color.primary
                        : color.textMuted
                    }
                  />
                  <Text
                    variant="metaStrong"
                    color={submissionKind === 'expense_reimbursement' ? 'primary' : 'textMuted'}
                  >
                    Personal Expense
                  </Text>
                  <Text variant="caption" color="textFaint" numberOfLines={2}>
                    I paid out-of-pocket — please reimburse me
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setSubmissionKind('party_payment')}
                  style={[
                    styles.kindOption,
                    submissionKind === 'party_payment' && styles.kindOptionActive,
                  ]}
                >
                  <Ionicons
                    name="people-outline"
                    size={16}
                    color={
                      submissionKind === 'party_payment' ? color.primary : color.textMuted
                    }
                  />
                  <Text
                    variant="metaStrong"
                    color={submissionKind === 'party_payment' ? 'primary' : 'textMuted'}
                  >
                    Payment to Party
                  </Text>
                  <Text variant="caption" color="textFaint" numberOfLines={2}>
                    Studio owes the party — please clear it
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {/* To Party */}
          <Pressable
            onPress={() => {
              Keyboard.dismiss();
              setPartySearch('');
              setShowPartyPicker(true);
            }}
            style={styles.partySelector}
          >
            <Ionicons name="people-outline" size={20} color={color.textMuted} />
            <Text
              variant="body"
              color={selectedPartyName ? 'text' : 'textFaint'}
              style={styles.flex}
              numberOfLines={1}
            >
              {selectedPartyName || `${isPaymentIn ? 'From' : 'To'} Party *`}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={color.textMuted} />
          </Pressable>

          {/* Description */}
          <Controller
            control={control}
            name="description"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Description"
                placeholder="e.g. Cement purchase, Labour payment"
                autoCapitalize="sentences"
                value={value ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
                square
                strongBorder
              />
            )}
          />
          {errors.amount?.message ? (
            <Text variant="caption" color="danger" style={{ marginTop: 2 }}>
              {errors.amount.message}
            </Text>
          ) : null}

          {/* Reference Number */}
          <Controller
            control={control}
            name="referenceNumber"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Reference Number"
                placeholder="Bill / Invoice / Cheque number"
                value={value ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
                square
                strongBorder
              />
            )}
          />

          {/* Payment Method */}
          <Text variant="caption" color="textMuted" style={styles.sectionLabel}>
            PAYMENT METHOD
          </Text>
          <View style={styles.methodRow}>
            {PAYMENT_METHODS.map((m) => {
              const active = selectedPaymentMethod === m.key;
              return (
                <Pressable
                  key={m.key}
                  onPress={() => setValue('paymentMethod', active ? '' : m.key)}
                  style={[styles.methodChip, active && styles.methodChipActive]}
                >
                  <Ionicons
                    name={m.icon as any}
                    size={16}
                    color={active ? color.onPrimary : color.textMuted}
                  />
                  <Text
                    variant="caption"
                    style={{ color: active ? color.onPrimary : color.text, textAlign: 'center' }}
                  >
                    {m.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Category / Cost Code */}
          <Text variant="caption" color="textMuted" style={styles.sectionLabel}>
            COST CODE
          </Text>
          <Pressable
            onPress={() => setShowCategoryPicker(true)}
            style={styles.dropdownField}
          >
            <Text variant="body" color={categoryLabel ? 'text' : 'textFaint'}>
              {categoryLabel ?? 'Select category'}
            </Text>
            <Ionicons name="chevron-down" size={18} color={color.textMuted} />
          </Pressable>

          {/* Add More Detail */}
          <Pressable
            onPress={() => setShowMoreDetail(!showMoreDetail)}
            style={styles.moreDetailHeader}
          >
            <Text variant="bodyStrong" color="text">Add More Detail</Text>
            <Ionicons
              name={showMoreDetail ? 'remove' : 'add'}
              size={20}
              color={color.primary}
            />
          </Pressable>

          {showMoreDetail && (
            <View style={styles.moreDetailContent}>
              <Text variant="caption" color="textMuted" style={styles.sectionLabel}>
                PAYMENT STATUS
              </Text>
              <View style={styles.methodRow}>
                {(['paid', 'pending', 'partial'] as const).map((s) => {
                  const active = watch('status') === s;
                  return (
                    <Pressable
                      key={s}
                      onPress={() => setValue('status', s)}
                      style={[styles.statusChip, active && styles.statusChipActive]}
                    >
                      <Text
                        variant="caption"
                        style={{ color: active ? color.onPrimary : color.textMuted }}
                      >
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {submitError && (
            <Text variant="caption" color="danger" style={{ marginTop: space.sm }}>
              {submitError}
            </Text>
          )}
        </ScrollView>

        <DatePickerModal
          visible={showDatePicker}
          value={selectedDate}
          onClose={() => setShowDatePicker(false)}
          onConfirm={(d) => setValue('date', d)}
        />

        {/* Receipt preview row — shown above the footer once a photo
            has been picked. Pure local preview; upload runs only on
            Save, so backing out leaves nothing in R2. */}
        {stagedReceipt ? (
          <View style={styles.receiptRow}>
            <View style={styles.receiptThumbWrap}>
              <Image
                source={{ uri: stagedReceipt.localUri }}
                style={styles.receiptThumb}
                resizeMode="cover"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="metaStrong" color="text">Receipt attached</Text>
              <Text variant="caption" color="textMuted">
                Will upload when you tap Save.
              </Text>
            </View>
            <Pressable onPress={clearReceipt} hitSlop={8}>
              <Ionicons name="close-circle" size={20} color={color.textFaint} />
            </Pressable>
          </View>
        ) : null}

        {!postsTxnDirectly ? (
          <Text variant="caption" color="textMuted" style={styles.submitHint}>
            Submitted expenses stay pending until an Admin approves. Project totals update after
            approval.
          </Text>
        ) : null}

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerLeft}>
            <Pressable
              style={styles.footerIcon}
              accessibilityLabel="Take photo"
              onPress={() => pickReceipt('camera')}
            >
              <Ionicons name="camera-outline" size={22} color={color.primary} />
            </Pressable>
            <View style={styles.footerDivider} />
            <Pressable
              style={styles.footerIcon}
              accessibilityLabel="Upload file"
              onPress={() => pickReceipt('library')}
            >
              <Ionicons name="cloud-upload-outline" size={22} color={color.primary} />
            </Pressable>
          </View>
          <View style={styles.footerSave}>
            <Button
              label={savePhase ?? (postsTxnDirectly ? 'Save' : 'Submit for approval')}
              onPress={handleSubmit(onSubmit)}
              loading={isSubmitting}
              disabled={!isValid || !orgId}
            />
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* ── Party Picker Modal ── */}
      <Modal
        visible={showPartyPicker}
        animationType="slide"
        transparent
        presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
        onRequestClose={() => setShowPartyPicker(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => {
              Keyboard.dismiss();
              setShowPartyPicker(false);
            }}
          >
            <View />
          </Pressable>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text variant="bodyStrong" color="text" style={styles.modalTitle}>
              Select Party
            </Text>

            {/* Search — avoid autoFocus on iOS or the keyboard covers "Add from Contact" */}
            <View style={styles.searchBar}>
              <Ionicons name="search" size={18} color={color.textMuted} />
              <TextInput
                placeholder="Search party name..."
                placeholderTextColor={color.textFaint}
                value={partySearch}
                onChangeText={setPartySearch}
                style={styles.searchInput}
                autoFocus={Platform.OS !== 'ios'}
                returnKeyType="search"
              />
            </View>

            {/* Sectioned party list */}
            <SectionList
              keyboardShouldPersistTaps="handled"
              sections={partySections}
              keyExtractor={(p) => p.id}
            renderSectionHeader={({ section: { title } }) => (
              <View style={styles.sectionHeader}>
                <Text variant="caption" color="textMuted">{title.toUpperCase()}</Text>
              </View>
            )}
            renderItem={({ item }) => {
              const typeLabel = item.partyType ? getPartyTypeLabel(item.partyType) : null;
              return (
                <Pressable
                  onPress={() => selectParty(item)}
                  style={({ pressed }) => [styles.partyOption, pressed && { opacity: 0.7 }]}
                >
                  <View style={styles.partyAvatar}>
                    <Text variant="metaStrong" style={{ color: color.primary }}>
                      {item.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.flex}>
                    <View style={styles.partyRowTop}>
                      <Text variant="body" color="text" numberOfLines={1} style={styles.flex}>
                        {item.name}
                      </Text>
                      {typeLabel && (
                        <View style={styles.partyTypeTag}>
                          <Text variant="caption" color="primary">{typeLabel}</Text>
                        </View>
                      )}
                    </View>
                    {item.phone ? (
                      <Text variant="meta" color="textMuted">{item.phone}</Text>
                    ) : null}
                  </View>
                  {selectedPartyName === item.name && (
                    <Ionicons name="checkmark-circle" size={20} color={color.primary} />
                  )}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyList}>
                <Text variant="meta" color="textMuted">
                  {partySearch ? 'No matching parties' : 'No parties added yet'}
                </Text>
              </View>
            }
            showsVerticalScrollIndicator={false}
            style={styles.modalList}
          />

          {/* Bottom actions: Add from Contact + Manual entry */}
          <View style={styles.partyActions}>
            <Pressable
              onPress={() => {
                Keyboard.dismiss();
                pickContactAndAdd();
              }}
              style={styles.partyActionBtn}
            >
              <Ionicons name="person-add-outline" size={18} color={color.primary} />
              <Text variant="metaStrong" color="primary">Add from Contact</Text>
            </Pressable>

            <View style={styles.partyActionDivider} />

            <Pressable
              onPress={() => {
                const name = partySearch.trim();
                if (!name) {
                  Alert.alert('Party name required', 'Type the party name in the search box first.');
                  return;
                }
                Keyboard.dismiss();
                setNewPartyName(name);
                setNewPartyPhone('');
                setShowPartyPicker(false);
                setPartySearch('');
                InteractionManager.runAfterInteractions(() => {
                  setTimeout(() => setShowNewPartyType(true), 120);
                });
              }}
              style={styles.partyActionBtn}
            >
              <Ionicons name="create-outline" size={18} color={color.primary} />
              <Text variant="metaStrong" color="primary">
                {partySearch.trim()
                  ? `Add "${partySearch.trim()}"`
                  : 'Enter manually'}
              </Text>
            </Pressable>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── New Party Type Picker Modal ── */}
      <Modal
        visible={showNewPartyType}
        animationType="slide"
        transparent
        presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
        onRequestClose={() => setShowNewPartyType(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
          keyboardVerticalOffset={0}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setShowNewPartyType(false)}
          >
            <View />
          </Pressable>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text variant="bodyStrong" color="text" style={styles.modalTitle}>
              Select Party Type
            </Text>
            <Text variant="meta" color="textMuted" align="center" style={{ marginBottom: space.sm }}>
              Adding: {newPartyName}{newPartyPhone ? ` (${newPartyPhone})` : ''}
            </Text>

            <ScrollView
              showsVerticalScrollIndicator={false}
              style={styles.modalList}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
            {PARTY_TYPE_GROUPS.map((group) => (
              <View key={group.label} style={styles.typeGroup}>
                <Text variant="caption" color="textMuted" style={styles.typeGroupLabel}>
                  {group.label.toUpperCase()}
                </Text>
                {group.types.map((t) => (
                  <Pressable
                    key={t.key}
                    onPress={() => createNewPartyAndSelect(t.key)}
                    disabled={creatingParty}
                    style={({ pressed }) => [
                      styles.typeOption,
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <View style={styles.typeIconWrap}>
                      <Ionicons name={t.icon as any} size={18} color={color.textMuted} />
                    </View>
                    <Text variant="body" color="text">{t.label}</Text>
                  </Pressable>
                ))}
              </View>
            ))}
          </ScrollView>

          {creatingParty && (
            <View style={styles.creatingOverlay}>
              <Text variant="meta" color="textMuted">Creating party...</Text>
            </View>
          )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Category Picker Modal ── */}
      <Modal
        visible={showCategoryPicker}
        animationType="slide"
        transparent
        presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
        onRequestClose={() => setShowCategoryPicker(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
          keyboardVerticalOffset={0}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setShowCategoryPicker(false)}
          >
            <View />
          </Pressable>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text variant="bodyStrong" color="text" style={styles.modalTitle}>
              Cost Code
            </Text>

            <ScrollView
              showsVerticalScrollIndicator={false}
              style={styles.modalList}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
            {TRANSACTION_CATEGORIES.map((c) => {
              const active = selectedCategory === c.key;
              return (
                <Pressable
                  key={c.key}
                  onPress={() => {
                    setValue('category', active ? '' : c.key);
                    setShowCategoryPicker(false);
                  }}
                  style={({ pressed }) => [
                    styles.categoryOption,
                    active && styles.categoryOptionActive,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text
                    variant="body"
                    color={active ? 'primary' : 'text'}
                    style={active ? { fontWeight: '600' } : undefined}
                  >
                    {c.label}
                  </Text>
                  {active && (
                    <Ionicons name="checkmark-circle" size={20} color={color.primary} />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <SubmitProgressOverlay
        visible={isSubmitting}
        intent="submitTransaction"
        phaseLabel={savePhase}
      />
    </Screen>
  );
}

// ── Styles ──

const styles = StyleSheet.create({
  flex: { flex: 1 },

  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenInset,
    paddingTop: 2,
    paddingBottom: 8,
    backgroundColor: color.bgGrouped,
  },
  navBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navEyebrow: { letterSpacing: 1.2 },
  navTitle: { textAlign: 'center' },

  // Hero
  hero: {
    paddingHorizontal: screenInset,
    paddingTop: 10,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: color.borderStrong,
    backgroundColor: color.bgGrouped,
  },
  heroLabel: {
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  heroAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  heroAmountInput: {
    flex: 1,
    fontSize: 34,
    // lineHeight must exceed fontSize on iOS or descenders/ascenders
    // (the round top of "0", the tail of "9") clip at the box edge.
    // 42 ≈ 1.24× fontSize lands clean on both platforms.
    lineHeight: 42,
    fontWeight: '700',
    color: color.text,
    paddingVertical: 4,
  },
  dateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.borderStrong,
  },

  scroll: {
    paddingHorizontal: screenInset,
    paddingTop: 12,
    paddingBottom: space.xl,
    backgroundColor: color.bgGrouped,
  },

  // Party selector
  partySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: color.bg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.borderStrong,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: 50,
    marginBottom: space.sm,
  },
  kindCard: {
    marginBottom: space.sm,
  },
  kindLabel: {
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: space.xs,
  },
  kindRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  kindOption: {
    flex: 1,
    backgroundColor: color.bg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.borderStrong,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    gap: 4,
    alignItems: 'flex-start',
  },
  kindOptionActive: {
    borderColor: color.primary,
    backgroundColor: color.primarySoft,
  },

  // Section label — bumped top margin so the caps label has clear
  // breathing room above (otherwise it reads as "stuck" to the
  // field above it). Bottom kept tight so it groups visually with
  // the field below.
  sectionLabel: {
    marginTop: space.lg,
    marginBottom: 6,
    letterSpacing: 0.8,
  },

  // Payment method
  methodRow: {
    flexDirection: 'row',
    gap: space.xs,
    marginBottom: space.sm,
  },
  methodChip: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.bg,
  },
  methodChipActive: {
    backgroundColor: color.primary,
    borderColor: color.primary,
  },

  // Status
  statusChip: {
    flex: 1,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
  },
  statusChipActive: {
    backgroundColor: color.primary,
    borderColor: color.primary,
  },

  // Dropdown
  dropdownField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: color.bg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.borderStrong,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: 48,
    marginBottom: space.sm,
  },

  // More detail
  moreDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.sm,
    marginTop: space.xs,
  },
  moreDetailContent: {
    paddingBottom: space.sm,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenInset,
    paddingVertical: space.sm,
    backgroundColor: color.bgGrouped,
    borderTopWidth: 1,
    borderTopColor: color.borderStrong,
    gap: space.sm,
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  footerIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerDivider: {
    width: 1,
    height: 24,
    backgroundColor: color.separator,
  },
  footerSave: {
    flex: 1,
  },
  submitHint: {
    paddingHorizontal: screenInset,
    paddingTop: space.xs,
    paddingBottom: 2,
    lineHeight: 18,
  },

  // Receipt preview row — sits between the form ScrollView and the
  // sticky footer. Hairline-bordered, dense, matches the InteriorOS
  // sharp-corner language used elsewhere.
  receiptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: screenInset,
    paddingVertical: space.sm,
    backgroundColor: color.bg,
    borderTopWidth: 1,
    borderTopColor: color.borderStrong,
  },
  receiptThumbWrap: {
    width: 44, height: 44,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.surface,
    overflow: 'hidden',
  },
  receiptThumb: { width: '100%', height: '100%' },
  receiptOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalSheet: {
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: space.sm,
    paddingBottom: space.xxl,
    maxHeight: '75%',
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.border,
    alignSelf: 'center',
    marginBottom: space.sm,
  },
  modalTitle: {
    textAlign: 'center',
    marginBottom: space.sm,
  },
  modalList: {
    paddingHorizontal: screenInset,
    maxHeight: 350,
  },

  // Search
  searchBar: {
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
    lineHeight: 20,
    color: color.text,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
  },

  // Section header
  sectionHeader: {
    paddingVertical: space.xs,
    paddingHorizontal: space.xxs,
    backgroundColor: color.bgGrouped,
    borderRadius: radius.xs,
    marginTop: space.xs,
    marginBottom: space.xxs,
  },

  // Party option
  partyOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.separator,
  },
  partyAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  partyRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  partyTypeTag: {
    paddingHorizontal: space.xs,
    paddingVertical: 1,
    borderRadius: radius.xs,
    backgroundColor: color.primarySoft,
  },
  emptyList: {
    paddingVertical: space.xxl,
    alignItems: 'center',
  },

  // Party actions at bottom
  partyActions: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.separator,
    marginHorizontal: screenInset,
  },
  partyActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingVertical: space.md,
  },
  partyActionDivider: {
    width: 1,
    backgroundColor: color.separator,
    marginVertical: space.xs,
  },

  // Category option
  categoryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.separator,
  },
  categoryOptionActive: {
    backgroundColor: color.primarySoft,
    borderRadius: radius.sm,
  },

  // New party type picker
  typeGroup: {
    marginBottom: space.md,
  },
  typeGroupLabel: {
    marginBottom: space.xs,
    letterSpacing: 0.5,
  },
  typeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    borderRadius: radius.sm,
  },
  typeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.bgGrouped,
    alignItems: 'center',
    justifyContent: 'center',
  },
  creatingOverlay: {
    alignItems: 'center',
    paddingVertical: space.sm,
  },
});
