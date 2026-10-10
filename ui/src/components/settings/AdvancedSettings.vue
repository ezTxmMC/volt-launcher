<script setup lang="ts">
import { onMounted, ref } from "vue";
import { Icon } from "@iconify/vue";
import { useLauncher } from "@/composables/useLauncher";
import SettingsPanel from "./SettingsPanel.vue";
import SettingsToggle from "./SettingsToggle.vue";

const {
  t,
  settings,
  directories,
  loadDirectories,
  openDirectory,
  resetSettings,
  launcherVersion,
  launcherMessage,
} = useLauncher();

const confirmingReset = ref(false);

onMounted(() => void loadDirectories());

/** Copies a short environment summary people can paste into a bug report. */
const copyDebugInfo = async () => {
  const summary = [
    `VoltLauncher ${launcherVersion.value || "0.2.0"}`,
    `UA: ${navigator.userAgent}`,
    `Language: ${settings.value.language}`,
    `Bridge: ${settings.value.curseForgeBridgeUrl}`,
    ...directories.value.map((directory) => `${directory.label}: ${directory.path}`),
  ].join("\n");

  try {
    await navigator.clipboard.writeText(summary);
    launcherMessage.value = t("settings.debugCopied");
  } catch {
    // Clipboard access can be denied; the paths are visible on screen either way.
  }
};

const performReset = async () => {
  confirmingReset.value = false;
  await resetSettings();
};
</script>

<template>
  <div class="flex flex-col gap-3">
    <SettingsPanel
      :title="t('settings.performance')"
      :description="t('settings.performanceHint')"
      icon="lucide:gauge"
    >
      <VoltSlider
        v-model="settings.maxConcurrentDownloads"
        :min="1"
        :max="16"
        :step="1"
        :label="t('settings.concurrentDownloads')"
      />
    </SettingsPanel>

    <SettingsPanel :title="t('settings.backups')" :description="t('settings.backupsHint')" icon="lucide:archive">
      <div class="flex flex-col gap-3">
        <VoltSlider
          v-model="settings.backupsToKeep"
          :min="0"
          :max="20"
          :step="1"
          :label="t('settings.backupsToKeep')"
        />
        <span class="text-[length:var(--text-2xs)] text-white/30">{{ t("settings.backupsToKeepHint") }}</span>
        <SettingsToggle
          v-model="settings.backupBeforePackUpdate"
          :label="t('settings.backupBeforePackUpdate')"
          :description="t('settings.backupBeforePackUpdateHint')"
        />
      </div>
    </SettingsPanel>

    <SettingsPanel
      :title="t('settings.directories')"
      :description="t('settings.directoriesHint')"
      icon="lucide:folder-tree"
    >
      <div class="flex flex-col gap-2">
        <div
          v-for="directory in directories"
          :key="directory.id"
          class="flex flex-wrap items-center gap-3 rounded-[10px] border border-white/10 bg-[var(--surface-input-muted)] px-[15px] py-[11px]"
        >
          <div class="min-w-0 flex-1">
            <div class="text-[length:var(--text-base-plus)] font-semibold text-white">{{ directory.label }}</div>
            <div class="truncate font-mono text-[length:var(--text-2xs)] text-white/35">{{ directory.path }}</div>
          </div>
          <button
            type="button"
            class="inline-flex shrink-0 items-center gap-1.5 rounded-[6px] border border-white/10 bg-white/5 px-2.5 py-[5px] text-[length:var(--text-sm)] font-semibold text-white/50 transition-all duration-200 hover:bg-white/10 hover:text-white/90"
            @click="openDirectory(directory.id)"
          >
            <Icon icon="lucide:folder-open" class="size-[11px]" />
            {{ t("common.open") }}
          </button>
        </div>
      </div>
    </SettingsPanel>

    <SettingsPanel :title="t('settings.debug')" :description="t('settings.debugHint')" icon="lucide:bug">
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-[7px] border border-white/10 bg-white/5 px-3.5 py-[7px] text-[length:var(--text-sm)] font-semibold text-white/50 transition-all duration-200 hover:bg-white/10 hover:text-white/90"
          @click="openDirectory('logs')"
        >
          <Icon icon="lucide:folder-open" class="size-[11px]" />{{ t("settings.openLogsFolder") }}
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-[7px] border border-white/10 bg-white/5 px-3.5 py-[7px] text-[length:var(--text-sm)] font-semibold text-white/50 transition-all duration-200 hover:bg-white/10 hover:text-white/90"
          @click="copyDebugInfo"
        >
          <Icon icon="lucide:clipboard-copy" class="size-[11px]" />{{ t("settings.copyDebugInfo") }}
        </button>
      </div>
    </SettingsPanel>

    <SettingsPanel :title="t('settings.reset')" icon="lucide:rotate-ccw">
      <div v-if="!confirmingReset">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-[7px] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3.5 py-[7px] text-[length:var(--text-sm)] font-semibold text-[var(--danger-text)] transition-all duration-200 hover:brightness-125"
          @click="confirmingReset = true"
        >
          <Icon icon="lucide:rotate-ccw" class="size-[11px]" />{{ t("settings.reset") }}
        </button>
      </div>
      <div v-else class="flex flex-wrap items-center gap-3">
        <span class="text-[length:var(--text-base)] text-white/70">{{ t("settings.resetConfirm") }}</span>
        <button
          type="button"
          class="rounded-[7px] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3.5 py-[7px] text-[length:var(--text-sm)] font-semibold text-[var(--danger-text)] transition-all duration-200 hover:brightness-125"
          @click="performReset"
        >
          {{ t("common.delete") }}
        </button>
        <button
          type="button"
          class="rounded-[7px] border border-white/10 bg-white/5 px-3.5 py-[7px] text-[length:var(--text-sm)] font-semibold text-white/60 transition-all duration-200 hover:bg-white/10"
          @click="confirmingReset = false"
        >
          {{ t("common.cancel") }}
        </button>
      </div>
    </SettingsPanel>
  </div>
</template>
