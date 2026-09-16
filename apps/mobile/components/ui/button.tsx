/**
 * Button — the same five intents as web, plus the two things only native can do:
 * a spring press response and a haptic tick.
 *
 * Parity notes
 *   • press scale 0.97, 90ms in, spring out — identical numbers to web
 *   • minHeight 44/48 so every target clears the HIG/Material minimum
 *   • `loading` swaps the label for a spinner in place (no layout jump)
 */
import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import type { ReactNode } from 'react';
import { r, s, shadow, useTheme } from '../../lib/theme';
import { usePressScale } from '../../lib/motion';
import { haptics } from '../../lib/haptics';
import { Text } from './text';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type ButtonIntent = 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  intent?: ButtonIntent;
  size?: ButtonSize;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
  block?: boolean;
  /** Haptic fired on press-in. `false` for dense lists (the register taps). */
  haptic?: boolean;
  style?: ViewStyle;
}

export function Button({
  label,
  intent = 'secondary',
  size = 'md',
  iconLeft,
  iconRight,
  loading = false,
  block = false,
  haptic = true,
  disabled,
  onPress,
  style,
  ...rest
}: ButtonProps) {
  const { colors, scheme } = useTheme();
  const isDisabled = disabled || loading;
  const { animatedStyle, onPressIn, onPressOut } = usePressScale(0.97, !!isDisabled);

  const height = size === 'sm' ? 34 : size === 'lg' ? 50 : 42;
  const radius = size === 'lg' ? r.lg : r.md;
  const labelVariant = size === 'sm' ? 'caption' : 'label';

  const intents: Record<ButtonIntent, { bg: string; fg: string; border: string; elevation?: ViewStyle }> = {
    primary: { bg: colors.brand, fg: colors.brandInk, border: 'transparent', elevation: shadow('glowBrand', scheme) },
    secondary: { bg: colors.surfaceRaised, fg: colors.ink, border: colors.border, elevation: shadow('e1', scheme) },
    soft: { bg: colors.brandSoft, fg: colors.brandText, border: 'transparent' },
    ghost: { bg: 'transparent', fg: colors.inkMuted, border: 'transparent' },
    danger: { bg: colors.dangerSoft, fg: colors.danger, border: 'transparent' },
  };
  const tone = intents[intent];

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: loading }}
      accessibilityLabel={label}
      disabled={isDisabled}
      onPressIn={(e) => {
        onPressIn();
        if (haptic) haptics.press();
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        onPressOut();
        rest.onPressOut?.(e);
      }}
      onPress={onPress}
      style={[
        styles.base,
        {
          height,
          borderRadius: radius,
          paddingHorizontal: size === 'sm' ? s[3] : s[4],
          backgroundColor: tone.bg,
          borderColor: tone.border,
          borderWidth: StyleSheet.hairlineWidth * 2,
          opacity: isDisabled ? 0.5 : 1,
          alignSelf: block ? 'stretch' : 'flex-start',
        },
        intent === 'primary' ? tone.elevation : null,
        animatedStyle,
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator size="small" color={tone.fg} />
      ) : (
        <View style={styles.content}>
          {iconLeft}
          <Text variant={labelVariant} style={{ color: tone.fg }} numberOfLines={1}>
            {label}
          </Text>
          {iconRight}
        </View>
      )}
    </AnimatedPressable>
  );
}

/** Circular icon button — header actions, row affordances. */
export function IconButton({
  children,
  onPress,
  accessibilityLabel,
  size = 40,
  intent = 'ghost',
  badge,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  accessibilityLabel: string;
  size?: number;
  intent?: 'ghost' | 'surface' | 'brand';
  badge?: number;
  style?: ViewStyle;
}) {
  const { colors, scheme } = useTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressScale(0.92);
  const bg = intent === 'brand' ? colors.brand : intent === 'surface' ? colors.surfaceRaised : 'transparent';

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      onPressIn={() => {
        onPressIn();
        haptics.select();
      }}
      onPressOut={onPressOut}
      onPress={onPress}
      style={[
        { width: size, height: size, borderRadius: r.md, alignItems: 'center', justifyContent: 'center', backgroundColor: bg },
        intent === 'surface' ? shadow('e1', scheme) : null,
        animatedStyle,
        style,
      ]}
    >
      {children}
      {badge != null && badge > 0 ? (
        <View
          style={{
            position: 'absolute',
            top: 2,
            right: 2,
            minWidth: 16,
            height: 16,
            borderRadius: 999,
            paddingHorizontal: 3,
            backgroundColor: colors.danger,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text variant="overline" style={{ color: '#fff', fontSize: 10, letterSpacing: 0 }}>
            {badge > 99 ? '99+' : String(badge)}
          </Text>
        </View>
      ) : null}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  content: { flexDirection: 'row', alignItems: 'center', gap: s[2] },
});
