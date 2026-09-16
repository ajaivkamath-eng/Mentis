/**
 * Avatar — deterministic gradient per person, initials fallback.
 * Same hash and palette as web, so Ana is teal on every platform.
 */
import { View, type ViewStyle } from 'react-native';
import { r, useTheme } from '../../lib/theme';
import { Text } from './text';

const GRADIENTS = [
  ['#2dd4bf', '#0d9488'],
  ['#818cf8', '#4f46e5'],
  ['#fbbf24', '#d97706'],
  ['#60a5fa', '#2563eb'],
  ['#f87171', '#dc2626'],
  ['#34d399', '#059669'],
] as const;

function hash(input: string) {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) h = (h * 31 + input.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function initialsOf(name: string | null | undefined) {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
  name,
  size = 40,
  style,
}: {
  name?: string | null;
  size?: number;
  style?: ViewStyle;
}) {
  const { isDark } = useTheme();
  const [from, to] = GRADIENTS[hash(name ?? 'anonymous') % GRADIENTS.length];

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: r.full,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: to,
          borderWidth: 1,
          borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.08)',
        },
        style,
      ]}
      accessibilityLabel={name ?? 'Unknown person'}
    >
      {/* Two stacked halves fake the linear gradient without another dependency. */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', inset: 0, borderTopLeftRadius: r.full, borderBottomLeftRadius: r.full, backgroundColor: from, opacity: 0.85 }}
      />
      <Text variant="label" style={{ color: '#fff', fontSize: size * 0.34, letterSpacing: 0 }}>
        {initialsOf(name)}
      </Text>
    </View>
  );
}
