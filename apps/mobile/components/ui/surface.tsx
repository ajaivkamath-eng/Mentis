/**
 * Surfaces — Screen, Card, CardHeader, Divider, AuroraBackdrop.
 *
 * Every surface is composed from the same primitives as web: a hairline border,
 * a radius from the token table, an elevation preset, and an optional glass
 * treatment (BlurView) for headers and sheets.
 */
import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, View, type ScrollViewProps, type ViewProps, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { Pressable } from 'react-native';
import { r, s, shadow, useTheme } from '../../lib/theme';
import { curve, springSwift } from '../../lib/motion';
import { Text } from './text';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/* -------------------------------------------------------------------------- */
/* Card                                                                       */
/* -------------------------------------------------------------------------- */

export interface CardProps extends ViewProps {
  variant?: 'default' | 'glass' | 'raised' | 'brand' | 'inset';
  /** Adds press feedback (0.98 scale) and an accessibility role of button. */
  onPress?: () => void;
  children: ReactNode;
  padded?: boolean;
}

export function Card({ variant = 'default', onPress, children, padded = true, style, ...rest }: CardProps) {
  const { colors, isDark, scheme } = useTheme();
  const scale = useSharedValue(1);

  const base: ViewStyle = {
    borderRadius: r.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: variant === 'brand' ? 'transparent' : colors.border,
    backgroundColor:
      variant === 'brand' ? colors.brandSoft : variant === 'inset' ? colors.surfaceInset : variant === 'raised' ? colors.surfaceRaised : colors.surface,
    padding: padded ? s[4] : 0,
    overflow: 'hidden',
    ...(variant === 'raised' ? shadow('e3', scheme) : shadow('e1', scheme)),
  };

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  if (!onPress) {
    return (
      <View style={[base, style]} {...rest}>
        {children}
      </View>
    );
  }

  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPressIn={() => {
        scale.value = withTiming(0.985, { duration: 90, easing: curve.standard });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, springSwift);
      }}
      onPress={onPress}
      style={[base, animatedStyle, style]}
      {...rest}
    >
      {variant === 'glass' ? (
        <BlurView
          intensity={isDark ? 40 : 60}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
          experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
        />
      ) : null}
      {children}
    </AnimatedPressable>
  );
}

export function CardHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: s[3] }}>
      <View style={{ flex: 1 }}>
        <Text variant="subtitle" numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Screen scaffolding                                                         */
/* -------------------------------------------------------------------------- */

export interface ScreenProps extends ScrollViewProps {
  children: ReactNode;
  /** Large title block. Pass `hero` for the gradient header treatment. */
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  /** Fixed content below the scroll area (action bars, FABs). */
  footer?: ReactNode;
  scroll?: boolean;
  contentStyle?: ViewStyle;
}

export function Screen({ children, title, subtitle, right, footer, scroll = true, contentStyle, ...rest }: ScreenProps) {
  const { colors } = useTheme();

  const header =
    title || right ? (
      <View style={{ paddingHorizontal: s[5], paddingTop: s[2], paddingBottom: s[3], flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: s[3] }}>
        <View style={{ flex: 1 }}>
          {subtitle ? (
            <Animated.Text style={{ fontSize: 11, letterSpacing: 1.1, textTransform: 'uppercase', fontWeight: '700', color: colors.inkFaint, marginBottom: 2 }}>
              {subtitle}
            </Animated.Text>
          ) : null}
          {title ? (
            <Animated.Text style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 26, fontWeight: '800', letterSpacing: -0.7, color: colors.ink }}>{title}</Animated.Text>
          ) : null}
        </View>
        {right}
      </View>
    ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AuroraBackdrop />
      {scroll ? (
        <ScrollView
          contentContainerStyle={[{ paddingBottom: s[16] }, contentStyle]}
          showsVerticalScrollIndicator={false}
          {...rest}
        >
          {header}
          {children}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          {header}
          {children}
        </View>
      )}
      {footer}
    </View>
  );
}

/** Ambient brand light behind every screen — the native twin of the web aurora. */
export function AuroraBackdrop() {
  const { isDark } = useTheme();
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View
        style={{
          position: 'absolute',
          top: -140,
          left: -110,
          width: 340,
          height: 340,
          borderRadius: 999,
          backgroundColor: isDark ? 'rgba(20,184,166,0.20)' : 'rgba(13,148,136,0.14)',
          opacity: 0.9,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: -170,
          right: -130,
          width: 320,
          height: 320,
          borderRadius: 999,
          backgroundColor: isDark ? 'rgba(99,102,241,0.18)' : 'rgba(79,70,229,0.10)',
        }}
      />
    </View>
  );
}

export function Divider({ style }: { style?: ViewStyle }) {
  const { colors } = useTheme();
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: s[3] }, style]} />;
}

export function Row({ children, style, ...rest }: ViewProps & { children: ReactNode }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: s[2] }, style]} {...rest}>
      {children}
    </View>
  );
}
