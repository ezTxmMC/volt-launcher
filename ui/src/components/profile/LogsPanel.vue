<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { Icon } from "@iconify/vue";
import PanelShell from "./PanelShell.vue";
import { useLauncher, type LauncherInstance } from "@/composables/useLauncher";

const props = defineProps<{ instance: LauncherInstance }>();

const {
  t,
  logSources,
  selectedLogId,
  selectedLog,
  logText,
  logTruncated,
  isLoadingLogs,
  isFollowing,
  loadLogSources,
  openLog,
  startFollowingLog,
  stopFollowingLog,
  toggleFollowing,
  clearLog,
  openLogFolder,
  copyLogToClipboard,
  loadLatestCrash,
  formatBytes,
  formatRelativeDate,
} = useLauncher();

const consoleRef = ref<HTMLElement | null>(null);
const filter = ref("");
/** Whether the view is pinned to the bottom; scrolling up detaches it. */
const stickToBottom = ref(true);

/** Lines matching the filter, kept as text so the console stays cheap to render. */
const visibleText = computed(() => {
  const needle = filter.value.trim().toLowerCase();
  if (!needle) return logText.value;
  return logText.value
    .split("\n")
    .filter((line) => line.toLowerCase().includes(needle))
    .join("\n");
});

const lineCount = computed(() => (logText.value ? logText.value.split("\n").length : 0));

const kindLabel = (kind: string) =>
  kind === "launcher" ? t("logs.kindLauncher") : kind === "crash" ? t("logs.kindCrash") : t("logs.kindGame");

const scrollToBottom = async () => {
  await nextTick();
  const element = consoleRef.value;
  if (element) element.scrollTop = element.scrollHeight;
};

const onScroll = () => {
  const element = consoleRef.value;
  if (!element) return;
  // A small tolerance: a browser's fractional scroll heights never land exactly on the bottom.
  stickToBottom.value = element.scrollHeight - element.scrollTop - element.clientHeight < 24;
};

watch(visibleText, () => {
  if (stickToBottom.value) void scrollToBottom();
});

watch(
  () => props.instance.name,
  async (name) => {
    if (!name) return;
    stopFollowingLog();
    await loadLogSources(name);

    // A profile that just crashed should land on the crash report rather than on the console:
    // that is the file with the actual cause in it.
    if (props.instance.launchPhase === "failed") {
      const crash = await loadLatestCrash(name);
      if (crash) {
        await openLog(name, crash.id);
        await scrollToBottom();
        return;
      }
    }
    if (selectedLogId.value) await openLog(name, selectedLogId.value);
    startFollowingLog(name);
    await scrollToBottom();
  },
  { immediate: true },
);

const onSelect = async (logId: string) => {
  await openLog(props.instance.name, logId);
  stickToBottom.value = true;
  await scrollToBottom();
};

onBeforeUnmount(() => stopFollowingLog());
</script>

<template>
  <PanelShell
    icon="lucide:terminal"
    :title="t('logs.title')"
    :count="null"
    :loading="isLoadingLogs"
    :loading-label="t('common.loading')"
    :empty="logSources.length === 0"
    empty-icon="lucide:terminal"
    :empty-title="t('logs.empty')"
    :empty-hint="t('logs.emptyHint')"
  >
    <template #actions>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-[6px] border px-2.5 py-1.5 text-[length:var(--text-2xs)] font-semibold tracking-[0.06em] transition-all"
        :class="isFollowing
          ? 'border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--accent)]'
          : 'border-white/10 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'"
        @click="toggleFollowing(instance.name)"
      >
        <Icon :icon="isFollowing ? 'lucide:activity' : 'lucide:pause'" class="size-3" />
        {{ isFollowing ? t("logs.following") : t("logs.paused") }}
      </button>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-[6px] border border-white/10 bg-white/5 px-2.5 py-1.5 text-[length:var(--text-2xs)] font-semibold text-white/50 transition-all hover:bg-white/10 hover:text-white"
        @click="copyLogToClipboard()"
      >
        <Icon icon="lucide:clipboard-copy" class="size-3" />{{ t("logs.copy") }}
      </button>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-[6px] border border-white/10 bg-white/5 px-2.5 py-1.5 text-[length:var(--text-2xs)] font-semibold text-white/50 transition-all hover:bg-white/10 hover:text-white"
        @click="openLogFolder(instance.name)"
      >
        <Icon icon="lucide:folder-open" class="size-3" />{{ t("logs.openFolder") }}
      </button>
      <button
        v-if="selectedLog?.kind === 'launcher'"
        type="button"
        class="flex size-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/40 transition-all hover:bg-white/10 hover:text-white"
        :title="t('logs.clear')"
        @click="clearLog(instance.name)"
      >
        <Icon icon="lucide:eraser" class="size-3" />
      </button>
      <button
        type="button"
        class="flex size-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/40 transition-all hover:bg-white/10 hover:text-white"
        @click="loadLogSources(instance.name)"
      >
        <Icon icon="lucide:refresh-cw" class="size-3" />
      </button>
    </template>

    <template #subheader>
      <div class="flex flex-wrap items-center gap-2">
        <select
          :value="selectedLogId"
          class="max-w-[280px] rounded-md border border-white/10 bg-[var(--surface-input)] px-2 py-1 text-[length:var(--text-2xs)] text-white outline-none focus:border-[var(--accent-border-focus)]"
          @change="onSelect(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="source in logSources" :key="source.id" :value="source.id">
            {{ kindLabel(source.kind) }} · {{ source.label }}
          </option>
        </select>

        <div class="relative">
          <Icon icon="lucide:search" class="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-white/30" />
          <input
            v-model="filter"
            type="text"
            :placeholder="t('common.search')"
            class="w-[200px] rounded-md border border-white/10 bg-[var(--surface-input)] py-1 pl-7 pr-2 text-[length:var(--text-2xs)] text-white outline-none focus:border-[var(--accent-border-focus)]"
          />
        </div>

        <div class="ml-auto flex items-center gap-2 text-[length:var(--text-2xs)] text-white/30">
          <span v-if="selectedLog">{{ formatBytes(selectedLog.sizeBytes) }}</span>
          <span v-if="selectedLog">{{ formatRelativeDate(selectedLog.modifiedAt) }}</span>
          <span>{{ lineCount }}</span>
        </div>
      </div>
      <div v-if="logTruncated" class="mt-1 text-[length:var(--text-2xs)] text-white/30">
        {{ t("logs.truncated") }}
      </div>
    </template>

    <pre
      ref="consoleRef"
      class="h-full overflow-auto rounded-lg border border-white/8 bg-black/40 p-3 font-mono text-[11px] leading-[1.55] text-white/70 selection:bg-[var(--primary)]/30"
      @scroll="onScroll"
    >{{ visibleText }}</pre>
  </PanelShell>
</template>
