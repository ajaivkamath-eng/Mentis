/**
 * Badge & StatusPill — the mobile end of the shared status vocabulary.
 * `toneForStatus` lives in `@mentis/core`, so "breached" is the same red as web.
 */
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { humanStatus, toneForStatus, type StatusTone } from '@mentis/core';
import { r, s, useTheme } from '../../lib/theme';
import { Text } from './text';

/** Tone → colours, resolved against the active theme once per render. */
function useTones() {
  const { colors } = useTheme();
  return {
    neutral: { fg: colors.inkMuted, bg: colors.surfaceHover },
    brand: { fg: colors.brandText, bg: colors.brandSoft },
    success: { fg: colors.success, bg: colors.successSoft },
    warning: { fg: colors.warning, bg: colors.warningSoft },
    danger: { fg: colors.danger, bg: colors.dangerSoft },
    info: { fg: colors.info, bg: colors.infoSoft },
    accent: { fg: colors.accent, bg: colors.accentSoft },
  } satisfies Record<StatusTone, { fg: string; bg: string }>;
}

export function Badge({
  label,
  tone = 'neutral',
  dot = false,
  style,
}: {
  label: string;
  tone?: StatusTone;
  dot?: boolean;
  style?: ViewStyle;
}) {
  const tones = useTones();
  const t = tones[tone];

  return (
    <View style={[styles.pill, { backgroundColor: t.bg }, style]}>
      {dot ? <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: t.fg }} /> : null}
      <Text variant="overline" style={{ color: t.fg, letterSpacing: 0.4 }}>
        {label}
      </Text>
    </View>
  );
}

export function StatusPill({ status, style }: { status: string | null | undefined; style?: ViewStyle }) {
  const tones = useTones();
  if (!status) {
    return (
      <Text variant="caption" tone="faint">
        —
      </Text>
    );
  }
  const t = tones[toneForStatus(status)];

  return (
    <View style={[styles.pill, { backgroundColor: t.bg }, style]}>
      <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: t.fg }} />
      <Text variant="overline" style={{ color: t.fg, letterSpacing: 0.4 }}>
        {humanStatus(status)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s[1],
    paddingHorizontal: s[2],
    paddingVertical: 3,
    borderRadius: r.full,
  },
});
