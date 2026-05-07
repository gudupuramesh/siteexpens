/**
 * InteriorOS shared list / form primitives.
 *
 * Pixel-perfect ports of the prototype's Group, Row, InputRow, PickerRow,
 * and PrimaryButton — see `interior os/src/primitives.jsx`. These are
 * meant to be the foundation for every redesigned form / settings screen.
 *
 * Visual contract (compact density):
 *   - Row min-height 52, padding `0 16px`, hairline bottom divider that
 *     starts at 16 (or 16+32 if a left slot is present)
 *   - Group: optional uppercase 11/500 header, hairline top + bottom
 *     borders on the body, 22px gap below
 *   - InputRow: 100px label + flex input, hairline bottom
 *   - PickerRow: icon + label + value (or placeholder) + chevron
 *   - PrimaryButton: 48 tall, blue accent, sharp 8px corner, optional icon
 */
import {
  ActivityIndicator,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
  type LayoutChangeEvent,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRef, useState, type ComponentProps, type ReactNode } from 'react';

import { color, fontFamily } from '@/src/theme/tokens';

const GUTTER = 16;
const ROW_H = 52;
const ROW_H_TIGHT = 44;

// ── Group ───────────────────────────────────────────────────────────

export type GroupProps = {
  header?: string;
  footer?: string;
  children: ReactNode;
  style?: ViewStyle;
};

export function Group({ header, footer, children, style }: GroupProps) {
  return (
    <View style={[styles.group, style]}>
      {header ? (
        <RNText style={styles.groupHeader}>{header.toUpperCase()}</RNText>
      ) : null}
      <View style={styles.groupBody}>{children}</View>
      {footer ? <RNText style={styles.groupFooter}>{footer}</RNText> : null}
    </View>
  );
}

// ── Row ─────────────────────────────────────────────────────────────

export type RowProps = {
  title: string;
  subtitle?: string;
  meta?: string;
  left?: ReactNode;
  right?: ReactNode;
  chevron?: boolean;
  onPress?: () => void;
  destructive?: boolean;
  dense?: boolean;
  last?: boolean;
};

export function Row({
  title,
  subtitle,
  meta,
  left,
  right,
  chevron,
  onPress,
  destructive,
  dense,
  last,
}: RowProps) {
  const Body = (
    <View
      style={[
        styles.row,
        { minHeight: dense ? ROW_H_TIGHT : ROW_H },
      ]}
    >
      {left ? <View style={styles.rowLeft}>{left}</View> : null}
      <View style={styles.rowMain}>
        <RNText
          style={[styles.rowTitle, destructive && { color: color.danger }]}
          numberOfLines={1}
        >
          {title}
        </RNText>
        {subtitle ? (
          <RNText style={styles.rowSubtitle} numberOfLines={1}>
            {subtitle}
          </RNText>
        ) : null}
      </View>
      {meta ? <RNText style={styles.rowMeta}>{meta}</RNText> : null}
      {right ? <View style={styles.rowRight}>{right}</View> : null}
      {chevron ? (
        <Ionicons
          name="chevron-forward"
          size={16}
          color={color.textFaint}
          style={styles.rowChevron}
        />
      ) : null}
      {!last ? (
        <View
          style={[
            styles.rowDivider,
            { left: left ? GUTTER + 32 : GUTTER },
          ]}
        />
      ) : null}
    </View>
  );

  if (!onPress) return Body;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [pressed && { backgroundColor: color.surfaceAlt }]}
    >
      {Body}
    </Pressable>
  );
}

// ── InputRow ────────────────────────────────────────────────────────

export type InputRowProps = {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  last?: boolean;
  mono?: boolean;
  right?: ReactNode;
} & Pick<TextInputProps,
  | 'autoCapitalize'
  | 'keyboardType'
  | 'editable'
  | 'maxLength'
  | 'multiline'
  | 'onBlur'
  | 'returnKeyType'
  | 'secureTextEntry'
>;

export function InputRow({
  label,
  value,
  onChangeText,
  placeholder,
  last,
  mono,
  right,
  multiline,
  ...inputProps
}: InputRowProps) {
  return (
    <View style={[styles.row, { minHeight: ROW_H }]}>
      <RNText style={styles.inputLabel}>{label}</RNText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={color.textMuted}
        multiline={multiline}
        style={[
          styles.input,
          mono && {
            fontFamily: fontFamily.mono,
            fontVariant: ['tabular-nums'],
          },
          // Multiline (e.g. site address) reads better left-aligned and
          // top-anchored so longer text wraps naturally.
          multiline && {
            textAlign: 'left',
            paddingTop: 14,
            lineHeight: Platform.OS === 'ios' ? 20 : 22,
            textAlignVertical: 'top',
          },
        ]}
        {...inputProps}
      />
      {right}
      {!last ? (
        <View style={[styles.rowDivider, { left: GUTTER }]} />
      ) : null}
    </View>
  );
}

// ── PickerRow ───────────────────────────────────────────────────────

export type PickerRowProps = {
  label: string;
  value?: string;
  placeholder?: string;
  icon?: ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  last?: boolean;
};

export function PickerRow({
  label,
  value,
  placeholder,
  icon,
  onPress,
  last,
}: PickerRowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { minHeight: ROW_H },
        pressed && { backgroundColor: color.surfaceAlt },
      ]}
    >
      {icon ? (
        <View style={styles.rowLeft}>
          <Ionicons name={icon} size={18} color={color.textMuted} />
        </View>
      ) : null}
      <RNText style={styles.pickerLabel}>{label}</RNText>
      <View style={{ flex: 1 }} />
      <RNText
        style={[
          styles.pickerValue,
          { color: value ? color.text : color.textFaint },
        ]}
        numberOfLines={1}
      >
        {value || placeholder}
      </RNText>
      <Ionicons
        name="chevron-forward"
        size={14}
        color={color.textFaint}
        style={{ marginLeft: 6 }}
      />
      {!last ? (
        <View
          style={[
            styles.rowDivider,
            { left: icon ? GUTTER + 32 : GUTTER },
          ]}
        />
      ) : null}
    </Pressable>
  );
}

// ── PrimaryButton ───────────────────────────────────────────────────

export type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: ComponentProps<typeof Ionicons>['name'];
  style?: ViewStyle;
};

export function PrimaryButton({
  label,
  onPress,
  loading,
  disabled,
  icon,
  style,
}: PrimaryButtonProps) {
  const isOff = disabled || loading;
  return (
    <Pressable
      onPress={isOff ? undefined : onPress}
      style={({ pressed }) => [
        styles.primaryBtn,
        isOff && styles.primaryBtnDisabled,
        pressed && !isOff && { opacity: 0.85 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <>
          {icon ? (
            <Ionicons name={icon} size={18} color="#fff" style={{ marginRight: 8 }} />
          ) : null}
          <RNText style={styles.primaryBtnLabel}>{label}</RNText>
        </>
      )}
    </Pressable>
  );
}

// ── SecondaryButton ─────────────────────────────────────────────────

export function SecondaryButton({
  label,
  onPress,
  icon,
  style,
}: PrimaryButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryBtn,
        pressed && { backgroundColor: color.surfaceAlt },
        style,
      ]}
    >
      {icon ? (
        <Ionicons name={icon} size={18} color={color.text} style={{ marginRight: 8 }} />
      ) : null}
      <RNText style={styles.secondaryBtnLabel}>{label}</RNText>
    </Pressable>
  );
}

// ── Slider ──────────────────────────────────────────────────────────

export type SliderProps = {
  /** Current value 0–100. */
  value: number;
  onChange: (next: number) => void;
  /** Snap step in % (default 1). Pass 5 for 0/5/10/… */
  step?: number;
  /** Optional override for the accent color (defaults to color.primary). */
  trackColor?: string;
};

/**
 * Horizontal 0–100 slider with a draggable thumb. Built on PanResponder
 * so it has zero native deps. Tap or drag anywhere on the row to set
 * the value; the live percent is shown to the right.
 */
export function Slider({ value, onChange, step = 1, trackColor }: SliderProps) {
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);

  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const snap = (v: number) => Math.round(v / step) * step;

  const handleLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setWidth(w);
    widthRef.current = w;
  };

  const setFromX = (x: number) => {
    const w = widthRef.current;
    if (w <= 0) return;
    const pct = clamp((x / w) * 100);
    const next = snap(pct);
    if (next !== value) onChange(next);
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => setFromX(e.nativeEvent.locationX),
      onPanResponderMove: (e) => setFromX(e.nativeEvent.locationX),
    }),
  ).current;

  const pct = clamp(value);
  const fillColor = trackColor ?? color.primary;

  return (
    <View style={sliderStyles.row}>
      <View
        {...responder.panHandlers}
        onLayout={handleLayout}
        style={sliderStyles.hitArea}
      >
        <View style={sliderStyles.track}>
          <View
            style={[
              sliderStyles.fill,
              { width: `${pct}%`, backgroundColor: fillColor },
            ]}
          />
        </View>
        {width > 0 ? (
          <View
            pointerEvents="none"
            style={[
              sliderStyles.thumb,
              { left: (width * pct) / 100 - 9, borderColor: fillColor },
            ]}
          />
        ) : null}
      </View>
      <RNText style={sliderStyles.valueText}>{Math.round(pct)}%</RNText>
    </View>
  );
}

const sliderStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
  },
  hitArea: {
    flex: 1,
    height: 32,
    justifyContent: 'center',
    position: 'relative',
  },
  track: {
    height: 4,
    backgroundColor: color.border,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
  thumb: {
    position: 'absolute',
    top: 7,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#fff',
    borderWidth: 2,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  valueText: {
    fontFamily: fontFamily.mono,
    fontSize: 12,
    fontWeight: '600',
    color: color.text,
    fontVariant: ['tabular-nums'],
    minWidth: 36,
    textAlign: 'right',
  },
});

// ── AlertSheet ──────────────────────────────────────────────────────

export type AlertSheetTone = 'info' | 'success' | 'warning' | 'danger';

export type AlertSheetAction = {
  label: string;
  /** Optional press handler. When omitted the action just dismisses. */
  onPress?: () => void;
  /** Tone — defaults to "default" (cancel-style). Use "primary" for the
   *  main action and "destructive" for irreversible ones. */
  variant?: 'default' | 'primary' | 'destructive';
};

export type AlertSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Tone drives the icon + accent color. Defaults to "info". */
  tone?: AlertSheetTone;
  /** Optional Ionicons name override. Falls back to a per-tone default. */
  icon?: ComponentProps<typeof Ionicons>['name'];
  title: string;
  /** Body — accepts a string or a node (for richer layouts). */
  message: string | ReactNode;
  /** Up to two actions. Rendered side-by-side. Defaults to a single OK. */
  actions?: AlertSheetAction[];
};

const ALERT_TONE: Record<
  AlertSheetTone,
  { fg: string; bg: string; icon: ComponentProps<typeof Ionicons>['name'] }
> = {
  info:    { fg: color.primary, bg: color.primarySoft, icon: 'information-circle' },
  success: { fg: color.success, bg: color.successSoft, icon: 'checkmark-circle' },
  warning: { fg: color.warning, bg: color.warningSoft, icon: 'time' },
  danger:  { fg: color.danger,  bg: color.dangerSoft,  icon: 'alert-circle' },
};

/**
 * InteriorOS-styled replacement for `Alert.alert`. Centered card with a
 * tone-tinted icon, title, message body, and 1–2 action buttons. Sharp
 * corners, hairline border, soft shadow — matches the rest of the app.
 */
export function AlertSheet({
  visible,
  onClose,
  tone = 'info',
  icon,
  title,
  message,
  actions,
}: AlertSheetProps) {
  const t = ALERT_TONE[tone];
  const finalActions: AlertSheetAction[] =
    actions && actions.length > 0 ? actions : [{ label: 'OK', variant: 'primary' }];

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={alertStyles.overlay} onPress={onClose}>
        <Pressable style={alertStyles.card} onPress={() => {}}>
          {/* Icon header */}
          <View style={[alertStyles.iconWrap, { backgroundColor: t.bg }]}>
            <Ionicons name={icon ?? t.icon} size={26} color={t.fg} />
          </View>

          {/* Title + message */}
          <RNText style={alertStyles.title}>{title}</RNText>
          {typeof message === 'string' ? (
            <RNText style={alertStyles.message}>{message}</RNText>
          ) : (
            <View style={alertStyles.messageBlock}>{message}</View>
          )}

          {/* Actions */}
          <View style={alertStyles.actions}>
            {finalActions.map((a, i) => {
              const isPrimary = a.variant === 'primary';
              const isDestructive = a.variant === 'destructive';
              const bg = isPrimary
                ? color.primary
                : isDestructive
                ? color.danger
                : color.surface;
              const fg = isPrimary || isDestructive ? '#fff' : color.text;
              const border = isPrimary || isDestructive
                ? 'transparent'
                : color.borderStrong;
              return (
                <Pressable
                  key={`${a.label}-${i}`}
                  onPress={() => {
                    a.onPress?.();
                    onClose();
                  }}
                  style={({ pressed }) => [
                    alertStyles.actionBtn,
                    { backgroundColor: bg, borderColor: border },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <RNText style={[alertStyles.actionText, { color: fg }]}>
                    {a.label}
                  </RNText>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const alertStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 14,
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontFamily: fontFamily.sans,
    fontSize: 16,
    fontWeight: '700',
    color: color.text,
    letterSpacing: -0.2,
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    lineHeight: 18,
    color: color.textMuted,
    textAlign: 'center',
    marginBottom: 18,
  },
  messageBlock: {
    width: '100%',
    marginBottom: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  actionBtn: {
    flex: 1,
    height: 42,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    fontFamily: fontFamily.sans,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
});

// ── SelectModal ─────────────────────────────────────────────────────

export type SelectOption<T extends string> = { key: T; label: string };

export type SelectModalProps<T extends string> = {
  visible: boolean;
  title: string;
  options: SelectOption<T>[];
  value?: T;
  onPick: (key: T) => void;
  onClose: () => void;
};

export function SelectModal<T extends string>({
  visible,
  title,
  options,
  value,
  onPick,
  onClose,
}: SelectModalProps<T>) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={selectStyles.overlay} onPress={onClose}>
        <View />
      </Pressable>
      <View style={selectStyles.sheet}>
        <View style={selectStyles.handle} />
        <View style={selectStyles.titleRow}>
          <RNText style={selectStyles.title}>{title}</RNText>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={20} color={color.textMuted} />
          </Pressable>
        </View>
        <View style={selectStyles.body}>
          {options.map((opt, i) => {
            const active = opt.key === value;
            return (
              <Pressable
                key={opt.key}
                onPress={() => {
                  onPick(opt.key);
                  onClose();
                }}
                style={({ pressed }) => [
                  selectStyles.option,
                  i === options.length - 1 && { borderBottomWidth: 0 },
                  pressed && { backgroundColor: color.surfaceAlt },
                ]}
              >
                <RNText
                  style={[
                    selectStyles.optionLabel,
                    active && { color: color.primary, fontWeight: '600' },
                  ]}
                >
                  {opt.label}
                </RNText>
                {active ? (
                  <Ionicons
                    name="checkmark"
                    size={18}
                    color={color.primary}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

const selectStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  sheet: {
    backgroundColor: color.surface,
    paddingTop: 8,
    paddingBottom: 32,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.border,
    alignSelf: 'center',
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border,
  },
  title: {
    fontFamily: fontFamily.sans,
    fontSize: 15,
    fontWeight: '600',
    color: color.text,
    letterSpacing: -0.2,
  },
  body: {
    backgroundColor: color.surface,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border,
  },
  optionLabel: {
    fontFamily: fontFamily.sans,
    fontSize: 15,
    color: color.text,
  },
});

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Group
  group: {
    marginBottom: 22,
  },
  groupHeader: {
    fontFamily: fontFamily.sans,
    fontSize: 11,
    fontWeight: '500',
    color: color.textFaint,
    letterSpacing: 0.8,
    paddingHorizontal: GUTTER,
    paddingBottom: 8,
  },
  groupBody: {
    // White interior so each row inside reads as a clear strip
    // separated by visible dividers (instead of grey-tinted bands
    // that blur together). Bounded card pattern: 4-side hairline
    // border + 10px corners + horizontal margin.
    backgroundColor: color.bg,
    marginHorizontal: GUTTER,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    overflow: 'hidden',
  },
  groupFooter: {
    fontFamily: fontFamily.sans,
    fontSize: 12,
    color: color.textFaint,
    paddingHorizontal: GUTTER,
    paddingTop: 8,
  },

  // Row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: GUTTER,
    // White, not surface — pairs with the white groupBody so a
    // stack of rows reads as separate strips with crisp dividers
    // between them.
    backgroundColor: color.bg,
    position: 'relative',
  },
  rowLeft: {
    marginRight: 12,
    width: 20,
    alignItems: 'center',
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontFamily: fontFamily.sans,
    fontSize: 14,
    fontWeight: '600',
    color: color.text,
    letterSpacing: -0.2,
    lineHeight: 18,
  },
  rowSubtitle: {
    fontFamily: fontFamily.sans,
    fontSize: 12,
    fontWeight: '400',
    color: color.textMuted,
    marginTop: 2,
    lineHeight: 14,
  },
  rowMeta: {
    fontFamily: fontFamily.sans,
    fontSize: 12,
    color: color.textMuted,
    fontVariant: ['tabular-nums'],
  },
  rowRight: {
    marginLeft: 8,
  },
  rowChevron: {
    marginLeft: 6,
  },
  rowDivider: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    // Stronger divider so the boundary between consecutive rows
    // is unambiguous on a white surface — was `color.border`
    // (#EEF2F7) which is almost invisible on white.
    backgroundColor: color.borderStrong,
  },

  // InputRow
  inputLabel: {
    fontFamily: fontFamily.sans,
    fontSize: 14,
    color: color.text,
    fontWeight: '600',
    letterSpacing: -0.2,
    width: 84,
    flexShrink: 0,
  },
  input: {
    flex: 1,
    paddingLeft: 8,
    fontFamily: fontFamily.sans,
    fontSize: 15, // intentionally one step larger for keyboard input comfort
    color: color.text,
    textAlign: 'left',
    ...Platform.select({
      ios: {
        lineHeight: 20,
        paddingTop: 9,
        paddingBottom: 10,
      },
      android: {
        lineHeight: 22,
        paddingVertical: 8,
        textAlignVertical: 'center',
      },
    }),
  },

  // PickerRow
  pickerLabel: {
    fontFamily: fontFamily.sans,
    fontSize: 14,
    color: color.text,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  pickerValue: {
    fontFamily: fontFamily.sans,
    fontSize: 14,
    marginRight: 6,
    maxWidth: 200,
  },

  // Buttons
  primaryBtn: {
    height: 48,
    borderRadius: 10,
    backgroundColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    paddingHorizontal: 18,
  },
  primaryBtnDisabled: {
    backgroundColor: color.border,
  },
  primaryBtnLabel: {
    color: '#fff',
    fontFamily: fontFamily.sans,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  secondaryBtn: {
    height: 48,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    paddingHorizontal: 18,
  },
  secondaryBtnLabel: {
    color: color.text,
    fontFamily: fontFamily.sans,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
});
