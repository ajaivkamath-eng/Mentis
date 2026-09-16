/**
 * Typography — one scale, no ad-hoc font sizes.
 *
 * Web equivalent: the `text-*` utilities in apps/web/src/app.css. Both read the
 * same `typeScale` tokens, so a 13px body on web is a 13pt body on native.
 */
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { family, type, useTheme } from '../../lib/theme';

type Variant = 'display' | 'title' | 'heading' | 'subtitle' | 'body' | 'bodyStrong' | 'label' | 'caption' | 'overline' | 'numeric';

export interface TextProps extends RNTextProps {
  variant?: Variant;
  tone?: 'ink' | 'muted' | 'faint' | 'brand' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'onBrand';
  align?: TextStyle['textAlign'];
  /** Tabular, monospaced-width figures — money, times, scores. */
  numeric?: boolean;
}

export function Text({ variant = 'body', tone = 'ink', align, numeric, style, ...props }: TextProps) {
  const { colors } = useTheme();

  const toneColor: Record<NonNullable<TextProps['tone']>, string> = {
    ink: colors.ink,
    muted: colors.inkMuted,
    faint: colors.inkFaint,
    brand: colors.brandText,
    accent: colors.accent,
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
    info: colors.info,
    onBrand: colors.brandInk,
  };

  const variants: Record<Variant, TextStyle> = {
    display: { fontFamily: family.display, fontSize: type.display.native, lineHeight: type.display.native * 1.08, letterSpacing: -1.2, fontWeight: '800' },
    title: { fontFamily: family.display, fontSize: type['2xl'].native, lineHeight: type['2xl'].native * 1.25, letterSpacing: -0.6, fontWeight: '800' },
    heading: { fontFamily: family.display, fontSize: type.xl.native, lineHeight: type.xl.native * 1.3, letterSpacing: -0.3, fontWeight: '700' },
    subtitle: { fontFamily: family.display, fontSize: type.lg.native, lineHeight: type.lg.native * 1.35, letterSpacing: -0.1, fontWeight: '700' },
    body: { fontFamily: family.sans, fontSize: type.base.native, lineHeight: type.base.native * 1.5, fontWeight: '400' },
    bodyStrong: { fontFamily: family.sans, fontSize: type.base.native, lineHeight: type.base.native * 1.5, fontWeight: '600' },
    label: { fontFamily: family.sans, fontSize: type.sm.native, lineHeight: type.sm.native * 1.4, fontWeight: '600' },
    caption: { fontFamily: family.sans, fontSize: type.xs.native, lineHeight: type.xs.native * 1.45, fontWeight: '500' },
    overline: { fontFamily: family.sans, fontSize: type['2xs'].native, lineHeight: type['2xs'].native * 1.4, letterSpacing: 1.1, fontWeight: '700', textTransform: 'uppercase' },
    numeric: { fontFamily: family.display, fontSize: type['2xl'].native, lineHeight: type['2xl'].native * 1.1, letterSpacing: -0.6, fontWeight: '800', fontVariant: ['tabular-nums'] },
  };

  return (
    <RNText
      {...props}
      style={[variants[variant], { color: toneColor[tone] }, align ? { textAlign: align } : null, numeric ? { fontVariant: ['tabular-nums'] } : null, style]}
    />
  );
}

/** Convenience wrappers so screens read like prose. */
export const Display = (p: TextProps) => <Text variant="display" {...p} />;
export const Title = (p: TextProps) => <Text variant="title" {...p} />;
export const Heading = (p: TextProps) => <Text variant="heading" {...p} />;
export const Body = (p: TextProps) => <Text variant="body" {...p} />;
export const Muted = (p: TextProps) => <Text variant="caption" tone="muted" {...p} />;
export const Overline = (p: TextProps) => <Text variant="overline" tone="faint" {...p} />;
