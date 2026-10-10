<script setup lang="ts">
import { computed, onMounted } from "vue";
import { Icon } from "@iconify/vue";
import { useLauncher } from "@/composables/useLauncher";
import { accentColors } from "./settingsData";
import SettingsPanel from "./SettingsPanel.vue";
import SettingsToggle from "./SettingsToggle.vue";
import SettingsRow from "./SettingsRow.vue";

const { t, settings, accentColor, locales, discordStatus, loadDiscordStatus } = useLauncher();

/** What rich presence is actually doing right now, so the toggle does not have to be believed. */
const presenceState = computed(() => {
  const state = discordStatus.value?.state;
  if (state === "connected") return { key: "discord.connected", tone: "text-[var(--accent)]", icon: "lucide:check-circle-2" };
  if (state === "waiting_for_discord") return { key: "discord.waiting", tone: "text-white/45", icon: "lucide:loader-2" };
  if (state === "not_configured") return { key: "discord.notConfigured", tone: "text-amber-300", icon: "lucide:alert-triangle" };
  return { key: "discord.disabled", tone: "text-white/35", icon: "lucide:circle-slash" };
});

onMounted(() => void loadDiscordStatus());
</script>

<template>
  <div class="flex flex-col gap-3">
    <SettingsPanel :title="t('settings.language')" :description="t('settings.languageHint')" icon="lucide:languages">
      <SettingsRow :label="t('settings.language')">
        <div class="flex gap-2">
          <button
            v-for="option in locales"
            :key="option.id"
            type="button"
            class="rounded-lg border px-3.5 py-1.5 text-[length:var(--text-sm)] font-semibold transition-all duration-200"
            :class="settings.language === option.id
              ? 'border-[var(--accent-border-active)] bg-[var(--accent-bg-strong)] text-[var(--primary)]'
              : 'border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.07]'"
            @click="settings.language = option.id"
          >
            {{ option.label }}
          </button>
        </div>
      </SettingsRow>
    </SettingsPanel>

    <SettingsPanel :title="t('settings.accentColor')" :description="t('settings.accentColorHint')" icon="lucide:palette">
      <div class="flex flex-wrap gap-[7px]">
        <button
          v-for="colour in accentColors"
          :key="colour"
          type="button"
          class="size-[30px] rounded-[7px] border-2 transition-transform duration-200 hover:scale-110"
          :class="accentColor === colour ? 'border-white shadow-[var(--shadow-accent-sm)]' : 'border-white/20'"
          :style="{ background: colour }"
          :aria-label="colour"
          :aria-pressed="accentColor === colour"
          @click="accentColor = colour"
        />
      </div>
    </SettingsPanel>

    <SettingsPanel :title="t('settings.options')" icon="lucide:sliders-horizontal">
      <div class="grid grid-cols-1 gap-[9px] md:grid-cols-2">
        <SettingsToggle
          v-model="settings.discordPresence"
          :label="t('settings.discordPresence')"
          :description="t('settings.discordPresenceHint')"
        />
        <SettingsToggle
          v-model="settings.hideLauncherOnLaunch"
          :label="t('settings.hideLauncher')"
          :description="t('settings.hideLauncherHint')"
        />
        <SettingsToggle
          v-model="settings.openLogsOnLaunch"
          :label="t('settings.openLogs')"
          :description="t('settings.openLogsHint')"
        />
        <SettingsToggle
          v-model="settings.autoUpdate"
          :label="t('settings.autoUpdate')"
          :description="t('settings.autoUpdateHint')"
        />
        <SettingsToggle
          v-model="settings.offlineModeAllowed"
          :label="t('settings.offlineMode')"
          :description="t('settings.offlineModeHint')"
        />
      </div>
    </SettingsPanel>

    <SettingsPanel :title="t('discord.title')" icon="simple-icons:discord">
      <div class="flex flex-col gap-2">
        <div class="flex items-center gap-2">
          <Icon
            :icon="presenceState.icon"
            class="size-3.5"
            :class="[presenceState.tone, discordStatus?.state === 'waiting_for_discord' ? 'animate-spin' : '']"
          />
          <span class="text-[length:var(--text-sm)]" :class="presenceState.tone">{{ t(presenceState.key) }}</span>
          <button
            type="button"
            class="ml-auto flex size-6 items-center justify-center rounded border border-white/10 bg-white/5 text-white/40 transition-all hover:bg-white/10 hover:text-white"
            @click="loadDiscordStatus()"
          >
            <Icon icon="lucide:refresh-cw" class="size-3" />
          </button>
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-[length:var(--text-2xs)] font-bold tracking-[0.14em] text-white/40">
            {{ t("discord.applicationId").toUpperCase() }}
          </label>
          <input
            v-model="settings.discordApplicationId"
            type="text"
            inputmode="numeric"
            placeholder="000000000000000000"
            class="w-full rounded-lg border border-white/10 bg-[var(--surface-input)] px-3 py-2 font-mono text-[length:var(--text-sm)] text-white outline-none transition-colors focus:border-[var(--accent-border-focus)]"
          />
          <span class="text-[length:var(--text-2xs)] leading-[1.5] text-white/30">
            {{ t("discord.applicationIdHint") }}
          </span>
        </div>
      </div>
    </SettingsPanel>
  </div>
</template>
