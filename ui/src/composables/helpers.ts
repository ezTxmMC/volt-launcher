import { t } from "@/i18n";
import { currentLocale } from "@/i18n";

export const versionEmoji = (type: string) =>
  ({ release: "📦", snapshot: "🔬", old_beta: "⚗️", old_alpha: "⚔️" })[type] ?? "🎮";

export const versionGradient = (type: string) =>
  ({
    release: "linear-gradient(135deg,#0d3a18,#184d22)",
    snapshot: "linear-gradient(135deg,#0a2040,#001535)",
    old_beta: "linear-gradient(135deg,#3a1a08,#5a2a10)",
    old_alpha: "linear-gradient(135deg,#4d0f0f,#7a1a1a)",
  })[type] ?? "linear-gradient(135deg,#0a1535,#122050)";

export const formatVersionType = (type: string) =>
  ({ release: "Release", snapshot: "Snapshot", old_beta: "Beta", old_alpha: "Alpha" })[type] ?? type;

/** Renders an absolute date in the active locale. */
export const formatReleaseTime = (isoDate: string) => {
  if (!isoDate) return t("common.unknown");
  const date = new Date(isoDate);
  return Number.isNaN(date.getTime())
    ? isoDate
    : date.toLocaleDateString(currentLocale.value === "de" ? "de-DE" : "en-GB");
};

/** Localised "x ago" for a timestamp in milliseconds. */
export const formatRelativeDate = (timestamp: number) => {
  if (!timestamp) return t("time.never");
  return formatRelativeFrom(Date.now() - timestamp);
};

/** Localised "x ago" for an ISO date string. */
export const formatRelativeIso = (isoDate: string) => {
  if (!isoDate) return t("common.unknown");
  const parsed = new Date(isoDate).getTime();
  return Number.isNaN(parsed) ? t("common.unknown") : formatRelativeFrom(Date.now() - parsed);
};

const formatRelativeFrom = (elapsedMs: number) => {
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 1) return t("time.justNow");
  if (minutes < 60) return t("time.minutesAgo", { n: minutes });

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("time.hoursAgo", { n: hours });

  const days = Math.floor(hours / 24);
  if (days < 7) return t("time.daysAgo", { n: days });
  if (days < 30) return t("time.weeksAgo", { n: Math.floor(days / 7) });
  if (days < 365) return t("time.monthsAgo", { n: Math.floor(days / 30) });
  return t("time.yearsAgo", { n: Math.floor(days / 365) });
};

/** `fabric:1.21.1:0.16.9` → `Fabric 0.16.9 · 1.21.1`; plain ids pass through. */
export const formatLoaderId = (id: string) => {
  const parts = id.split(":");
  if (parts.length !== 3) return id;
  const platform = parts[0] ?? "";
  const minecraftVersion = parts[1] ?? "";
  const loaderVersion = parts[2] ?? "";
  const name = platform.charAt(0).toUpperCase() + platform.slice(1);
  return `${name} ${loaderVersion} · ${minecraftVersion}`;
};

/** The Minecraft version inside a possibly loader-qualified id. */
export const minecraftVersionOf = (id: string) => {
  const parts = id.split(":");
  return parts.length >= 2 ? (parts[1] ?? id) : id;
};

/** The loader name inside a qualified id, or `null` for vanilla. */
export const loaderOf = (id: string): string | null => {
  const parts = id.split(":");
  if (parts.length < 2) return null;
  const loader = parts[0] ?? "";
  return loader && loader !== "vanilla" ? loader : null;
};

/**
 * Renders a duration the way a player thinks about it: minutes for a short session, then hours,
 * then days. Anything under a minute reads as "not played yet" rather than "0m".
 */
export const formatPlaytime = (milliseconds: number): string => {
  if (!milliseconds || milliseconds < 60_000) return t("time.noPlaytime");

  const minutes = Math.floor(milliseconds / 60_000);
  if (minutes < 60) return t("time.minutes", { n: minutes });

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) {
    return remainingMinutes === 0
      ? t("time.hours", { n: hours })
      : t("time.hoursMinutes", { h: hours, m: remainingMinutes });
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours === 0
    ? t("time.days", { n: days })
    : t("time.daysHours", { d: days, h: remainingHours });
};

/** Byte counts with one decimal place from kilobytes upward. */
export const formatBytes = (bytes: number): string => {
  if (!bytes || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

export const handleImgError = (event: Event) => {
  const image = event.target as HTMLImageElement;
  const fallback = image.dataset.fallbackSrc;
  if (fallback && image.src !== fallback) image.src = fallback;
};
