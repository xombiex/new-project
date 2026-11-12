import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ReactNode, useEffect } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { ActivityIndicator, type DimensionValue, Pressable, type PressableProps, ScrollView, type StyleProp, StyleSheet, TextInput, type TextInputProps, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Display, HitTarget, Radius, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

export function Screen({
  children,
  scroll = true,
  safeTop = true,
}: {
  children: ReactNode;
  scroll?: boolean;
  /** false when something (e.g. a map) already sits above the screen content */
  safeTop?: boolean;
}) {
  const theme = useTheme();
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={styles.screenContent}
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic">
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.screenContent, { flex: 1 }]}>{children}</View>
  );
  return (
    <SafeAreaView edges={safeTop ? ['top'] : []} style={{ flex: 1, backgroundColor: theme.background }}>
      {body}
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const scheme = useColorScheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        scheme === 'light' && styles.cardLight,
        style,
      ]}>
      {children}
    </View>
  );
}

type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, variant = 'primary', size = 'md', loading, icon, disabled, style, ...rest }: ButtonProps) {
  const theme = useTheme();
  const bg = {
    primary: theme.accent,
    secondary: theme.backgroundSelected,
    danger: theme.danger,
    ghost: 'transparent',
  }[variant];
  const fg = variant === 'primary' || variant === 'danger' ? theme.accentText : theme.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        size === 'lg' && styles.buttonLg,
        // A small press-down so taps feel physical.
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1, transform: [{ scale: pressed && !disabled ? 0.97 : 1 }] },
        style,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon}
          <ThemedText style={[styles.buttonLabel, size === 'lg' && styles.buttonLabelLg, { color: fg }]}>
            {label}
          </ThemedText>
        </>
      )}
    </Pressable>
  );
}

export function TextField({ label, error, style, ...rest }: TextInputProps & { label?: string; error?: string | null }) {
  const theme = useTheme();
  return (
    <View style={{ gap: Spacing.one }}>
      {label ? (
        <ThemedText type="smallBold" themeColor="textSecondary">
          {label}
        </ThemedText>
      ) : null}
      <TextInput
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          { color: theme.text, backgroundColor: theme.backgroundSelected, borderColor: error ? theme.danger : 'transparent' },
          style,
        ]}
        {...rest}
      />
      {error ? (
        <ThemedText type="small" style={{ color: theme.danger }}>
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

export function Avatar({ name, color, size = 40 }: { name: string; color: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}>
      <ThemedText style={{ color: '#fff', fontWeight: 700, fontSize: size * 0.38, lineHeight: size * 0.5 }}>
        {initials || '?'}
      </ThemedText>
    </View>
  );
}

export function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.stat}>
      <ThemedText style={[styles.statValue, color ? { color } : null]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </ThemedText>
      <ThemedText type="label" themeColor="textSecondary" numberOfLines={1}>
        {label}
      </ThemedText>
    </View>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      <ThemedText type="label" themeColor="textSecondary">
        {children}
      </ThemedText>
      {action}
    </View>
  );
}

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

/** Nothing here yet: says what would be here and how to get the first one. */
export function EmptyState({ title, body, icon, children }: { title: string; body: string; icon?: IconName; children?: ReactNode }) {
  const theme = useTheme();
  return (
    <Card style={styles.state}>
      {icon ? <MaterialCommunityIcons name={icon} size={36} color={theme.textSecondary} /> : null}
      <ThemedText style={styles.stateTitle}>{title}</ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.stateBody}>
        {body}
      </ThemedText>
      {children}
    </Card>
  );
}

/** Something failed to load: what happened, and a way to try again. */
export function ErrorState({ title = "Couldn't load this", message, onRetry, retrying }: { title?: string; message: string; onRetry?: () => void; retrying?: boolean }) {
  const theme = useTheme();
  return (
    <Card style={styles.state}>
      <MaterialCommunityIcons name="alert-circle-outline" size={36} color={theme.warning} />
      <ThemedText style={styles.stateTitle}>{title}</ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.stateBody} accessibilityRole="alert">
        {message}
      </ThemedText>
      {onRetry ? <Button label="Try again" variant="secondary" onPress={onRetry} loading={retrying} /> : null}
    </Card>
  );
}

/** Placeholder rows shaped like a list of people or drives while the real ones load. */
export function LoadingRows({ count = 3, avatar = true }: { count?: number; avatar?: boolean }) {
  return (
    <View accessibilityLabel="Loading" accessibilityRole="progressbar">
      <Card style={{ gap: Spacing.three }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.three }}>
          {avatar ? <Skeleton height={40} width={40} radius={20} /> : null}
          <View style={{ flex: 1, gap: Spacing.two }}>
            <Skeleton height={14} width={i % 2 ? '45%' : '60%'} />
            <Skeleton height={12} width={i % 2 ? '70%' : '35%'} />
          </View>
        </View>
      ))}
    </Card>
    </View>
  );
}

/** A one-line message inside a screen: a warning, a privacy note, a "you're offline". */
export function Notice({ tone = 'info', icon, children, action }: { tone?: 'info' | 'warning' | 'danger' | 'success'; icon?: IconName; children: ReactNode; action?: ReactNode }) {
  const theme = useTheme();
  const color = { info: theme.textSecondary, warning: theme.warning, danger: theme.danger, success: theme.success }[tone];
  const fallback: IconName = { info: 'information-outline', warning: 'alert-outline', danger: 'alert-circle-outline', success: 'check-circle-outline' }[tone] as IconName;
  return (
    <View style={[styles.notice, { backgroundColor: theme.backgroundSelected, borderLeftColor: color }]} accessibilityRole={tone === 'info' ? undefined : 'alert'}>
      <MaterialCommunityIcons name={icon ?? fallback} size={20} color={color} />
      <ThemedText type="small" style={{ flex: 1 }}>
        {children}
      </ThemedText>
      {action}
    </View>
  );
}

/** A button that is only an icon. The label is required: it's what a screen reader says. */
export function IconButton({
  icon,
  label,
  onPress,
  size = HitTarget.min,
  tone = 'plain',
  disabled,
  color,
  style,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  /** HitTarget.driving for anything used on the move */
  size?: number;
  tone?: 'plain' | 'filled' | 'accent' | 'danger';
  disabled?: boolean;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const bg = { plain: 'transparent', filled: theme.backgroundSelected, accent: theme.accent, danger: theme.danger }[tone];
  const fg = color ?? (tone === 'accent' || tone === 'danger' ? theme.accentText : theme.text);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.7 : 1, transform: [{ scale: pressed ? 0.94 : 1 }] },
        style,
      ]}>
      <MaterialCommunityIcons name={icon} size={Math.round(size * 0.5)} color={fg} />
    </Pressable>
  );
}

/** Pulsing placeholder shaped like the content that's loading, so screens don't pop in. */
export function Skeleton({ height = 16, width = '100%', radius = Radius.md, style }: { height?: number; width?: DimensionValue; radius?: number; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const pulse = useSharedValue(0.5);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 700 }), -1, true);
  }, [pulse]);
  const animated = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return <Animated.View style={[{ height, width, borderRadius: radius, backgroundColor: theme.backgroundSelected }, animated, style]} />;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: theme.backgroundSelected }]}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, selected && { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="label" themeColor={selected ? 'text' : 'textSecondary'}>
              {o.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    padding: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
  },
  card: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
  },
  cardLight: {
    shadowColor: '#0A0A0B',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  button: {
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  buttonLg: { minHeight: 60, borderRadius: Radius.lg },
  buttonLabel: { fontFamily: Display.bold, fontSize: 19, lineHeight: 22, letterSpacing: 0.6, textTransform: 'uppercase' },
  buttonLabelLg: { fontSize: 23, lineHeight: 26 },
  input: {
    minHeight: 50,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
    borderWidth: 1.5,
  },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  state: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.five },
  stateTitle: { fontFamily: Display.italic, fontSize: 28, lineHeight: 32, textAlign: 'center' },
  stateBody: { textAlign: 'center', maxWidth: 420 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.three, borderRadius: Radius.md, borderLeftWidth: 3 },
  stat: { flex: 1, alignItems: 'center', gap: Spacing.half },
  statValue: { fontFamily: Display.italic, fontSize: 30, lineHeight: 34, fontVariant: ['tabular-nums'] },
  sectionTitle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.two },
  segmented: { flexDirection: 'row', borderRadius: Radius.md, padding: 3 },
  segment: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md - 3 },
});
