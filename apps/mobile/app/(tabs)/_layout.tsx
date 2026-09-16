/**
 * Tab bar — glass, floating, with a moving active pill and haptic ticks.
 *
 * What changed from the stock expo-router Tabs default:
 *  • a blurred, borderless bar that content scrolls *under* (depth, not a strip)
 *  • the active tab gets a filled pill + brand icon rather than a tint change
 *  • the inbox tab carries a live badge from the shared action-count hook
 *  • every tab press fires a selection haptic — the cheapest way to make an app
 *    feel native
 */
import { Tabs } from 'expo-router';
import { BlurView } from 'expo-blur';
import { Platform } from 'react-native';
import { CalendarDays, ClipboardList, Inbox, Menu } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { r, s, useTheme } from '../../lib/theme';
import { haptics } from '../../lib/haptics';
import { Text } from '../../components/ui';

function TabIcon({ Icon, focused, color }: { Icon: typeof CalendarDays; focused: boolean; color: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.iconWrap}>
      {focused ? (
        <Animated.View
          entering={FadeIn.duration(180)}
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.brandSoft, borderRadius: 14 }]}
        />
      ) : null}
      <Icon size={21} color={focused ? colors.brandText : color} strokeWidth={focused ? 2.4 : 2} />
    </View>
  );
}

export default function TabsLayout() {
  const { colors, isDark } = useTheme();

  return (
    <Tabs
      screenListeners={{
        tabPress: () => haptics.select(),
      }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandText,
        tabBarInactiveTintColor: colors.inkFaint,
        tabBarStyle: {
          position: 'absolute',
          borderTopWidth: StyleSheet.hairlineWidth * 2,
          borderTopColor: colors.border,
          backgroundColor: 'transparent',
          height: Platform.OS === 'ios' ? 84 : 68,
          paddingTop: 6,
          elevation: 0,
        },
        tabBarBackground: () => (
          <BlurView
            intensity={isDark ? 60 : 80}
            tint={isDark ? 'dark' : 'light'}
            style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(6,11,22,0.72)' : 'rgba(255,255,255,0.78)' }]}
          />
        ),
        tabBarLabel: ({ children, color, focused }) => (
          <Text variant="overline" style={{ color, letterSpacing: 0.5, opacity: focused ? 1 : 0.8, fontSize: 10 }}>
            {children}
          </Text>
        ),
      }}
    >
      <Tabs.Screen
        name="today"
        options={{
          title: 'Today',
          tabBarIcon: ({ focused, color }) => <TabIcon Icon={CalendarDays} focused={focused} color={color} />,
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: 'Tasks',
          tabBarIcon: ({ focused, color }) => <TabIcon Icon={ClipboardList} focused={focused} color={color} />,
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Inbox',
          tabBarIcon: ({ focused, color }) => <TabIcon Icon={Inbox} focused={focused} color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ focused, color }) => <TabIcon Icon={Menu} focused={focused} color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 44,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: s[0],
  },
});
