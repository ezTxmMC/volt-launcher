<script setup lang="ts">
import { computed, onMounted } from "vue";
import { Icon } from "@iconify/vue";
import { useLauncher } from "@/composables/useLauncher";
import SettingsPanel from "./SettingsPanel.vue";
import SettingsToggle from "./SettingsToggle.vue";

const {
  t,
  settings,
  launcherVersion,
  updateInfo,
  updateAvailable,
  isCheckingUpdate,
  isDownloadingUpdate,
  downloadedUpdatePath,
  checkForUpdates,
  downloadUpdate,
  openReleasePage,
  openDirectory,
  formatBytes,
  formatRelativeIso,
} = useLauncher();

const currentVersion = computed(() => updateInfo.value?.currentVersion || launcherVersion.value || "0.2.0");

/** GitHub release notes are Markdown; the panel shows them as plain text rather than raw markup. */
const notes = computed(() => (updateInfo.value?.notes ?? "").trim());

onMounted(() => {
  if (!updateInfo.value) void checkForUpdates(false);
});
</script>

<template>
  <div class="flex flex-col gap-3">
    <SettingsPanel
      :title="t('settings.updateChannel')"
      :description="t('settings.updateChannelHint')"
      icon="lucide:download"
    >
      <div class="grid grid-cols-1 gap-[9px] md:grid-cols-2">
        <SettingsToggle
          v-model="settings.autoUpdate"
          :label="t('settings.autoUpdate')"
          :description="t('settings.autoUpdateHint')"
        />
        <SettingsToggle
          v-model="settings.betaUpdates"
          :label="t('settings.betaUpdates')"
          :description="t('settings.betaUpdatesHint')"
        />
      </div>

      <div class="mt-3 flex flex-col gap-1.5">
        <label class="text-[length:var(--text-2xs)] font-bold tracking-[0.14em] text-white/40">
          {{ t("updates.repository").toUpperCase() }}
        </label>
        <input
          v-model="settings.updateRepository"
          type="text"
          placeholder="owner/repo"
          class="w-full rounded-lg border border-white/10 bg-[var(--surface-input)] px-3 py-2 font-mono text-[length:var(--text-sm)] text-white outline-none transition-colors focus:border-[var(--accent-border-focus)]"
        />
        <span class="text-[length:var(--text-2xs)] text-white/30">{{ t("updates.repositoryHint") }}</span>
      </div>
    </SettingsPanel>

    <SettingsPanel :title="t('updates.title')" icon="lucide:refresh-cw">
      <div class="flex flex-col gap-3">
        <div class="flex flex-wrap items-center gap-3">
          <button
            type="button"
            :disabled="isCheckingUpdate"
            class="inline-flex items-center gap-1.5 rounded-[7px] border border-[var(--accent-border-strong)] bg-[var(--accent-bg-strong)] px-3.5 py-[7px] text-[length:var(--text-sm)] font-semibold tracking-[0.07em] text-[var(--primary)] transition-all duration-200 hover:bg-[var(--accent-bg-hover)] hover:shadow-[var(--shadow-accent-md)] disabled:cursor-not-allowed disabled:opacity-50"
            @click="checkForUpdates(true)"
          >
            <Icon
              :icon="isCheckingUpdate ? 'lucide:loader-2' : 'lucide:refresh-cw'"
              class="size-[11px]"
              :class="isCheckingUpdate ? 'animate-spin' : ''"
            />
            {{ isCheckingUpdate ? t("updates.checking") : t("updates.check") }}
          </button>

          <span class="text-[length:var(--text-2xs)] text-white/40">
            {{ t("updates.current", { version: currentVersion }) }}
          </span>
        </div>

        <!-- The result of the last check, stated plainly rather than as a silent no-op. -->
        <div
          v-if="updateAvailable && updateInfo"
          class="flex flex-col gap-2 rounded-lg border border-[var(--accent-border-strong)] bg-[var(--accent-bg-soft)] px-3.5 py-3"
        >
          <div class="flex flex-wrap items-center gap-2">
            <Icon icon="lucide:arrow-up-circle" class="size-4 shrink-0 text-[var(--primary)]" />
            <span class="text-[length:var(--text-sm)] font-semibold text-white">
              {{ t("updates.available", { version: updateInfo.latestVersion }) }}
            </span>
            <span
              v-if="updateInfo.prerelease"
              class="rounded-[5px] border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[length:var(--text-2xs)] font-bold text-amber-300"
            >
              {{ t("updates.prerelease") }}
            </span>
            <span v-if="updateInfo.publishedAt" class="text-[length:var(--text-2xs)] text-white/35">
              {{ formatRelativeIso(updateInfo.publishedAt) }}
            </span>
          </div>

          <p v-if="notes" class="max-h-[160px] overflow-y-auto whitespace-pre-wrap rounded bg-black/20 p-2.5 text-[length:var(--text-2xs)] leading-[1.6] text-white/55">
            {{ notes }}
          </p>

          <div class="flex flex-wrap items-center gap-2">
            <button
              v-if="updateInfo.downloadable"
              type="button"
              :disabled="isDownloadingUpdate"
              class="inline-flex items-center gap-1.5 rounded-[7px] border border-[var(--accent-border-strong)] bg-[var(--accent-bg-strong)] px-3 py-1.5 text-[length:var(--text-sm)] font-semibold text-[var(--primary)] transition-all hover:bg-[var(--accent-bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              @click="downloadUpdate()"
            >
              <Icon
                :icon="isDownloadingUpdate ? 'lucide:loader-2' : 'lucide:download'"
                class="size-3"
                :class="isDownloadingUpdate ? 'animate-spin' : ''"
              />
              {{ isDownloadingUpdate ? t("updates.downloading") : t("updates.download") }}
              <span v-if="updateInfo.assetSize > 0" class="font-normal text-white/40">
                ({{ formatBytes(updateInfo.assetSize) }})
              </span>
            </button>
            <span v-else class="text-[length:var(--text-2xs)] text-white/40">{{ t("updates.noAsset") }}</span>

            <button
              v-if="downloadedUpdatePath"
              type="button"
              class="inline-flex items-center gap-1.5 rounded-[7px] border border-white/10 bg-white/5 px-3 py-1.5 text-[length:var(--text-sm)] font-semibold text-white/60 transition-all hover:bg-white/10 hover:text-white"
              @click="openDirectory('updates')"
            >
              <Icon icon="lucide:folder-open" class="size-3" />{{ t("updates.openFolder") }}
            </button>

            <button
              v-if="updateInfo.releaseUrl"
              type="button"
              class="inline-flex items-center gap-1.5 rounded-[7px] border border-white/10 bg-white/5 px-3 py-1.5 text-[length:var(--text-sm)] font-semibold text-white/60 transition-all hover:bg-white/10 hover:text-white"
              @click="openReleasePage()"
            >
              <Icon icon="lucide:external-link" class="size-3" />{{ t("updates.openRelease") }}
            </button>
          </div>
        </div>

        <div
          v-else-if="updateInfo"
          class="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.03] px-3.5 py-2.5"
        >
          <Icon icon="lucide:check-circle-2" class="size-4 shrink-0 text-[var(--accent)]" />
          <span class="text-[length:var(--text-sm)] text-white/70">{{ t("updates.upToDate") }}</span>
          <span v-if="updateInfo.reason" class="text-[length:var(--text-2xs)] text-white/35">
            · {{ updateInfo.reason }}
          </span>
        </div>
      </div>
    </SettingsPanel>
  </div>
</template>
