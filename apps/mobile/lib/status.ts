/**
 * Status → colour, using the shared vocabulary in `@mentis/core/status`.
 *
 * The tone decision (is "outstandingDebit" bad? yes) lives in core so web and
 * native cannot disagree; this file only translates tones into the mobile
 * palette.
 */
import { toneForStatus, type StatusTone } from '@mentis/core';
import type { Theme } from '@mentis/core';

export interface StatusStyle {
  label: string;
  fg: string;
  bg: string;
}

export function statusStyle(status: string | null | undefined, colors: Theme): StatusStyle {
  const tone: StatusTone = toneForStatus(status);
  const map: Record<StatusTone, StatusStyle> = {
    neutral: { label: '', fg: colors.inkMuted, bg: colors.surfaceHover },
    brand: { label: '', fg: colors.brandText, bg: colors.brandSoft },
    success: { label: '', fg: colors.success, bg: colors.successSoft },
    warning: { label: '', fg: colors.warning, bg: colors.warningSoft },
    danger: { label: '', fg: colors.danger, bg: colors.dangerSoft },
    info: { label: '', fg: colors.info, bg: colors.infoSoft },
    accent: { label: '', fg: colors.accent, bg: colors.accentSoft },
  };
  return map[tone];
}

export { humanStatus, toneForStatus } from '@mentis/core';
