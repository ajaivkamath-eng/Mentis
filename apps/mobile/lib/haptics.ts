/**
 * Haptics — the mobile-only layer of the design system.
 *
 * The rule we follow (Apple HIG): haptics confirm *state changes the user
 * caused*, never decorate scrolling or navigation. So:
 *
 *   select()  → moving through a segmented control / switching role
 *   tap()     → marking attendance, toggling a checkbox  (the register's heartbeat)
 *   press()   → pressing a primary action button
 *   success() → a save that actually completed
 *   warning() → something needs attention (breach, capacity full)
 *   error()   → a rejected action or a failed sync
 *
 * Every call is fire-and-forget and swallowed: on web, on a device with the
 * capability disabled, or in a simulator, the app must behave identically minus
 * the buzz.
 */
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

let hapticsEnabled = true;

/** Respect a user preference (Settings → Haptics) without touching call sites. */
export function setHapticsEnabled(enabled: boolean) {
  hapticsEnabled = enabled;
}

export function hapticsAreEnabled() {
  return hapticsEnabled;
}

function safe(run: () => Promise<unknown>) {
  if (!hapticsEnabled || Platform.OS === 'web') return;
  try {
    void run().catch(() => {});
  } catch {
    /* device without a taptic engine */
  }
}

export const haptics = {
  /** Light tick — a discrete selection changed. */
  select: () => safe(() => Haptics.selectionAsync()),
  /** Light impact — the register tap. Fast, crisp, not fatiguing at 40 taps. */
  tap: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Medium impact — primary button press. */
  press: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** Heavy impact — destructive or irreversible confirmation. */
  heavy: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  /** Success notification — save synced, action closed, register submitted. */
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Warning notification — capacity exceeded, breach warning, degraded mode. */
  warning: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  /** Error notification — failed write, rejected action. */
  error: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
