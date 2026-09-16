/**
 * More — profile, role switching and device preferences.
 *
 * Every control here has a native behaviour: role switch fires a selection
 * haptic and a toast-style confirmation; the theme control follows the OS by
 * default (the `System` option) instead of forcing dark; the haptics switch
 * respects people who hate vibration.
 */
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Bell, Building2, ChevronRight, LogOut, MonitorSmartphone, Palette, ScrollText, ShieldCheck, Vibrate } from 'lucide-react-native';
import { switchableRoles, type Role } from '@mentis/core';
import { useAuth } from '../../lib/auth';
import { haptics, hapticsAreEnabled, setHapticsEnabled } from '../../lib/haptics';
import { r, s, useTheme, type ColorScheme } from '../../lib/theme';
import { enterUp } from '../../lib/motion';
import { Avatar, Card, FeedbackBanner, ListRow, Screen, SegmentedControl, StatusPill, Text } from '../../components/ui';

export default function More() {
  const { staff, roles, role, setRole, signOut } = useAuth();
  const { colors, scheme, setScheme, override } = useTheme();
  const [hapticsOn, setHapticsOn] = useState(hapticsAreEnabled());
  const [feedback, setFeedback] = useState<string | null>(null);

  const switchable = switchableRoles(roles as Role[]);

  const pickRole = (next: Role) => {
    haptics.select();
    setRole(next);
    setFeedback(`Active role: ${next}`);
  };

  const themeMode: ColorScheme | 'system' = override ?? 'system';

  return (
    <Screen title="More" subtitle={staff?.display_name ?? 'Account'} contentStyle={{ paddingBottom: s[20] }}>
      {feedback ? <FeedbackBanner message={feedback} tone="success" onDismiss={() => setFeedback(null)} /> : null}

      {/* Profile */}
      <Animated.View entering={enterUp(0)} style={{ paddingHorizontal: s[4], marginBottom: s[4] }}>
        <Card padded>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s[3] }}>
            <Avatar name={staff?.display_name} size={54} />
            <View style={{ flex: 1 }}>
              <Text variant="subtitle" numberOfLines={1}>
                {staff?.display_name ?? 'Signed in'}
              </Text>
              <Text variant="caption" tone="muted" numberOfLines={1}>
                Kingfisher Table Tennis Club
              </Text>
              <View style={{ flexDirection: 'row', gap: s[2], marginTop: s[2], flexWrap: 'wrap' }}>
                {roles.map((r) => (
                  <StatusPill key={r} status={r === role ? 'active' : 'paused'} />
                ))}
              </View>
            </View>
          </View>
        </Card>
      </Animated.View>

      {/* Role switching */}
      {switchable.length > 1 ? (
        <Animated.View entering={enterUp(1)} style={{ paddingHorizontal: s[4], marginBottom: s[4] }}>
          <Text variant="overline" tone="faint" style={{ marginBottom: s[2], marginLeft: s[1] }}>
            Active role
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s[2] }}>
            {switchable.map((r) => {
              const active = r === role;
              return (
                <Pressable
                  key={r}
                  onPress={() => pickRole(r)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [
                    styles.roleChip,
                    {
                      backgroundColor: active ? colors.brand : colors.surface,
                      borderColor: active ? 'transparent' : colors.border,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <ShieldCheck size={14} color={active ? colors.brandInk : colors.inkMuted} />
                  <Text variant="label" style={{ color: active ? colors.brandInk : colors.ink }}>
                    {r}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text variant="caption" tone="faint" style={{ marginTop: s[2], marginLeft: s[1] }}>
            Roles change what you can see and do on every screen.
          </Text>
        </Animated.View>
      ) : null}

      {/* Appearance */}
      <Animated.View entering={enterUp(2)} style={{ paddingHorizontal: s[4], marginBottom: s[4] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s[2], marginBottom: s[2], marginLeft: s[1] }}>
          <Palette size={14} color={colors.inkFaint} />
          <Text variant="overline" tone="faint">
            Appearance
          </Text>
        </View>
        <SegmentedControl
          value={themeMode}
          onChange={(next) => {
            haptics.select();
            setScheme(next);
          }}
          segments={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
        <Text variant="caption" tone="faint" style={{ marginTop: s[2], marginLeft: s[1] }}>
          {scheme === 'dark' ? 'Dark' : 'Light'} in use
          {override ? ' (pinned)' : ' (following your device)'}.
        </Text>
      </Animated.View>

      {/* Feedback & device */}
      <Animated.View entering={enterUp(3)} style={{ paddingHorizontal: s[4], marginBottom: s[4] }}>
        <Card padded={false}>
          <ListRow
            title="Haptics"
            meta="Vibrate on marks, saves and errors"
            accent={hapticsOn ? colors.brand : colors.inkFaint}
            leading={<Vibrate size={18} color={colors.inkMuted} />}
            trailing={
              <Switch
                value={hapticsOn}
                onValueChange={(next) => {
                  setHapticsEnabled(next);
                  setHapticsOn(next);
                  if (next) haptics.success();
                }}
                trackColor={{ false: colors.surfaceInset, true: colors.brandSoft }}
                thumbColor={hapticsOn ? colors.brand : colors.inkFaint}
                accessibilityLabel="Haptic feedback"
              />
            }
          />
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
          <ListRow
            title="Notifications"
            meta="OneSignal push for session changes and breaches"
            leading={<Bell size={18} color={colors.inkMuted} />}
            trailing={<ChevronRight size={16} color={colors.inkFaint} />}
            onPress={() => Alert.alert('Push notifications', 'Managed by your device settings for Mentis.')}
          />
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
          <ListRow
            title="Sessions on other devices"
            meta="Revoke a lost phone from the web console"
            leading={<MonitorSmartphone size={18} color={colors.inkMuted} />}
            trailing={<ChevronRight size={16} color={colors.inkFaint} />}
            onPress={() => Alert.alert('Device sessions', 'Open Mentis on the web console → Devices to revoke access.')}
          />
        </Card>
      </Animated.View>

      {/* Admin links */}
      <Animated.View entering={enterUp(4)} style={{ paddingHorizontal: s[4], marginBottom: s[4] }}>
        <Text variant="overline" tone="faint" style={{ marginBottom: s[2], marginLeft: s[1] }}>
          Console
        </Text>
        <Card padded={false}>
          <ListRow
            title="Organisation settings"
            meta="Action types, broadcasts, term dates"
            leading={<Building2 size={18} color={colors.inkMuted} />}
            trailing={<ChevronRight size={16} color={colors.inkFaint} />}
            onPress={() => Alert.alert('Settings', 'Open Mentis on the web console for organisation settings.')}
          />
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
          <ListRow
            title="Audit log"
            meta="Who read medical notes, who changed rates"
            leading={<ScrollText size={18} color={colors.inkMuted} />}
            trailing={<ChevronRight size={16} color={colors.inkFaint} />}
            onPress={() => Alert.alert('Audit log', 'Available in the web console under Admin → Audit log.')}
          />
        </Card>
      </Animated.View>

      {/* Sign out */}
      <Animated.View entering={enterUp(5)} style={{ paddingHorizontal: s[4] }}>
        <Card padded={false}>
          <ListRow
            title="Sign out"
            meta="Clears the local register cache on this device"
            accent={colors.danger}
            leading={<LogOut size={18} color={colors.danger} />}
            onPress={() =>
              Alert.alert('Sign out of Mentis?', 'Queued attendance marks will be uploaded first if you have signal.', [
                { text: 'Stay signed in', style: 'cancel' },
                {
                  text: 'Sign out',
                  style: 'destructive',
                  onPress: () => {
                    haptics.heavy();
                    void signOut();
                  },
                },
              ])
            }
          />
        </Card>
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s[2],
    paddingHorizontal: s[3],
    paddingVertical: s[2] + 2,
    borderRadius: r.full,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
});
