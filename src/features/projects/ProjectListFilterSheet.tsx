/**
 * Shared project list filters (status + deadline) for Projects tab and previews.
 */
import { useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';

import type { ProjectStatus } from '@/src/features/projects/types';
import { Text } from '@/src/ui/Text';
import { color, fontFamily } from '@/src/theme/tokens';

const FILTER_STATUSES: { key: ProjectStatus; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'on_hold', label: 'On Hold' },
  { key: 'completed', label: 'Completed' },
];

export function ProjectListFilterSheet({
  visible,
  onClose,
  filterStatus,
  onStatusChange,
  filterDate,
  onDateChange,
  onClear,
}: {
  visible: boolean;
  onClose: () => void;
  filterStatus: ProjectStatus | null;
  onStatusChange: (s: ProjectStatus | null) => void;
  filterDate: Date | null;
  onDateChange: (d: Date | null) => void;
  onClear: () => void;
}) {
  const [showDatePicker, setShowDatePicker] = useState(false);

  const handleDateChange = (_: unknown, date?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (date) onDateChange(date);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={sheetStyles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={sheetStyles.sheet}>
          <View style={sheetStyles.handle} />
          <View style={sheetStyles.sheetHeader}>
            <Text style={sheetStyles.sheetTitle}>Filters</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={color.textMuted} />
            </Pressable>
          </View>

          <ScrollView style={sheetStyles.body} showsVerticalScrollIndicator={false}>
            <Text style={sheetStyles.sectionLabel}>STATUS</Text>
            <View style={sheetStyles.statusRow}>
              {FILTER_STATUSES.map((s) => {
                const sel = filterStatus === s.key;
                return (
                  <Pressable
                    key={s.key}
                    onPress={() => onStatusChange(sel ? null : s.key)}
                    style={[sheetStyles.statusChip, sel ? sheetStyles.statusChipActive : undefined]}
                  >
                    <Text style={sel ? [sheetStyles.statusChipText, { color: '#fff' }] : sheetStyles.statusChipText}>
                      {s.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[sheetStyles.sectionLabel, { marginTop: 20 }]}>
              DEADLINE BY
            </Text>
            <Pressable
              onPress={() => setShowDatePicker(true)}
              style={sheetStyles.dateBtn}
            >
              <Ionicons name="calendar-outline" size={16} color={color.primary} />
              <Text style={sheetStyles.dateBtnText}>
                {filterDate
                  ? filterDate.toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })
                  : 'Select a date'}
              </Text>
              {filterDate ? (
                <Pressable
                  onPress={() => onDateChange(null)}
                  hitSlop={8}
                  style={{ marginLeft: 'auto' }}
                >
                  <Ionicons name="close-circle" size={18} color={color.textFaint} />
                </Pressable>
              ) : null}
            </Pressable>

            {showDatePicker ? (
              <DateTimePicker
                value={filterDate ?? new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={handleDateChange}
              />
            ) : null}
          </ScrollView>

          <View style={sheetStyles.footer}>
            <Pressable
              onPress={() => {
                onClear();
                onClose();
              }}
              style={sheetStyles.clearBtn}
            >
              <Text style={sheetStyles.clearBtnText}>Clear all</Text>
            </Pressable>
            <Pressable
              onPress={onClose}
              style={sheetStyles.applyBtn}
            >
              <Text style={sheetStyles.applyBtnText}>Apply</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: color.bg,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: '80%',
  },
  handle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 4,
    backgroundColor: color.borderStrong,
    marginTop: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  sheetTitle: {
    fontFamily: fontFamily.sans,
    fontSize: 18,
    fontWeight: '700',
    color: color.text,
  },
  body: {
    paddingHorizontal: 20,
  },
  sectionLabel: {
    fontFamily: fontFamily.sans,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: color.textMuted,
    marginBottom: 10,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  statusChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: color.bg,
  },
  statusChipActive: {
    backgroundColor: color.primary,
    borderColor: color.primary,
  },
  statusChipText: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    fontWeight: '600',
    color: color.text,
  },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: color.bg,
  },
  dateBtnText: {
    fontFamily: fontFamily.sans,
    fontSize: 14,
    color: color.text,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  clearBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  clearBtnText: {
    fontFamily: fontFamily.sans,
    fontSize: 14,
    fontWeight: '600',
    color: color.textMuted,
  },
  applyBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: color.primary,
    alignItems: 'center',
  },
  applyBtnText: {
    fontFamily: fontFamily.sans,
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});
