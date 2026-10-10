<script setup lang="ts">
import { Icon } from "@iconify/vue";

/**
 * The frame every profile panel shares: a titled header with an action slot, and a scrolling
 * body. Extracted so the panels stay about their own content rather than repeating chrome.
 */
defineProps<{
  icon: string;
  title: string;
  count?: number | null;
  /** Shown centred in the body when there is nothing to list. */
  empty?: boolean;
  emptyIcon?: string;
  emptyTitle?: string;
  emptyHint?: string;
  loading?: boolean;
  loadingLabel?: string;
}>();
</script>

<template>
  <div class="flex flex-1 flex-col overflow-hidden rounded-xl border border-white/8 bg-[var(--surface-panel)]">
    <div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/7 px-4 py-3">
      <div class="flex items-center gap-2 text-[length:var(--text-sm)] font-bold tracking-[0.1em] text-white">
        <Icon :icon="icon" class="size-3.5 text-white/40" />
        {{ title.toUpperCase() }}
        <span v-if="count !== null && count !== undefined" class="font-medium text-white/35">({{ count }})</span>
      </div>
      <div class="flex flex-wrap items-center gap-1.5">
        <slot name="actions" />
      </div>
    </div>

    <div v-if="$slots.subheader" class="shrink-0 border-b border-white/7 px-4 py-2">
      <slot name="subheader" />
    </div>

    <div class="flex-1 overflow-y-auto p-2.5">
      <div v-if="loading" class="py-10 text-center text-[length:var(--text-sm)] text-white/40">
        {{ loadingLabel ?? "…" }}
      </div>
      <div
        v-else-if="empty"
        class="flex h-full min-h-[160px] flex-col items-center justify-center gap-2 text-center"
      >
        <Icon :icon="emptyIcon ?? 'lucide:inbox'" class="size-8 text-white/20" />
        <div class="text-[length:var(--text-sm)] text-white/40">{{ emptyTitle }}</div>
        <div class="text-[length:var(--text-2xs)] text-white/25">{{ emptyHint }}</div>
      </div>
      <slot v-else />
    </div>
  </div>
</template>
