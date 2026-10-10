<script setup lang="ts">
import { Icon } from "@iconify/vue";
import InstallProgress from "@/components/discover/InstallProgress.vue";
import { useLauncher, type LauncherInstance } from "@/composables/useLauncher";

/**
 * One profile in the grid.
 *
 * Extracted from the grid itself so the same card can be rendered flat or inside a folder
 * section without the markup being duplicated once per layout.
 */
defineProps<{
  inst: LauncherInstance;
  /** Slug of the profile whose menu is open, so only one menu shows at a time. */
  openMenuSlug: string | null;
}>();

const emit = defineEmits<{
  manage: [instance: LauncherInstance];
  play: [instance: LauncherInstance];
  select: [instance: LauncherInstance];
  toggleMenu: [slug: string];
  rename: [instance: LauncherInstance];
  duplicate: [instance: LauncherInstance];
  group: [instance: LauncherInstance];
  openFolder: [instance: LauncherInstance];
  export: [instance: LauncherInstance];
  favourite: [instance: LauncherInstance];
  delete: [instance: LauncherInstance];
}>();

const {
  t,
  authData,
  isLaunching,
  selectedInstanceName,
  versionEmoji,
  formatLoaderId,
  formatRelativeDate,
  formatPlaytime,
  handleImgError,
} = useLauncher();

const versionGradientClass = (type: string) =>
  ({
    release: "bg-[linear-gradient(135deg,#0d3a18,#184d22)]",
    snapshot: "bg-[linear-gradient(135deg,#0a2040,#001535)]",
    old_beta: "bg-[linear-gradient(135deg,#3a1a08,#5a2a10)]",
    old_alpha: "bg-[linear-gradient(135deg,#4d0f0f,#7a1a1a)]",
  })[type] ?? "bg-[linear-gradient(135deg,#0a1535,#122050)]";

/** The card artwork: a user-chosen image first, then the modpack's, then the version emoji. */
const cardImage = (instance: LauncherInstance) => instance.iconUrl || instance.packIconUrl;
</script>

<template>
  <div
    class="group relative h-48 overflow-visible rounded-xl border bg-[var(--surface-panel)] text-left transition-all duration-200"
    :class="inst.busy
      ? 'border-[var(--accent-border)] cursor-progress'
      : 'border-white/10 cursor-pointer hover:-translate-y-1 hover:border-[var(--accent-border-hover)] hover:shadow-[0_12px_32px_rgba(0,0,0,.4),0_0_24px_rgba(var(--primary-rgb),.1)]'"
    @click.stop="emit('manage', inst)"
    @contextmenu.prevent.stop="!inst.busy && emit('toggleMenu', inst.slug)"
  >
    <!-- Card image area -->
    <div class="relative flex h-[100px] items-center justify-center overflow-hidden rounded-t-xl pointer-events-none">
      <template v-if="cardImage(inst)">
        <img
          :src="cardImage(inst)"
          alt=""
          class="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
          @error="handleImgError"
        />
        <div class="absolute inset-0 bg-black/25"></div>
      </template>
      <div
        v-else
        class="absolute inset-0 flex items-center justify-center text-[40px] opacity-70 transition-transform duration-300 group-hover:scale-105"
        :class="versionGradientClass(inst.versionType)"
      >
        {{ versionEmoji(inst.versionType) }}
      </div>
      <div class="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[rgba(8,18,34,.95)]"></div>

      <!-- Play overlay — pointer events re-enabled, and suppressed while installing. -->
      <div
        v-if="!inst.busy"
        class="pointer-events-auto absolute inset-0 flex items-center justify-center gap-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
      >
        <button
          type="button"
          class="h-10 inline-flex items-center gap-2 bg-[var(--primary)] rounded-[7px] px-4 py-2 text-[length:var(--text-base)] font-bold tracking-[0.08em] text-white disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="!authData || isLaunching"
          @click.stop="emit('play', inst)"
        >
          <Icon icon="lucide:play" class="size-[10px]" />{{ t("profiles.play") }}
        </button>
        <button
          v-if="selectedInstanceName !== inst.name"
          type="button"
          class="h-10 inline-flex items-center gap-2 rounded-r-[7px] bg-(--surface-input) px-4 py-2 text-[length:var(--text-base)] font-bold tracking-[0.08em] text-white disabled:opacity-50 disabled:cursor-not-allowed"
          @click.stop="emit('select', inst)"
        >
          <Icon icon="mynaui:arrow-left-right" class="size-[24px] brightness-60" />
        </button>
      </div>

      <div class="absolute left-[7px] top-[7px] flex gap-1 pointer-events-none">
        <span
          v-if="inst.busy"
          class="inline-flex items-center gap-1 rounded border border-[var(--accent-border)] bg-[var(--accent-bg-strong)] px-1.5 py-0.5 text-[8px] font-bold tracking-[0.08em] text-[var(--primary)]"
        >
          <Icon icon="lucide:loader-2" class="size-[8px] animate-spin" />INSTALLING
        </span>
        <span
          v-else-if="inst.running"
          class="rounded border border-[var(--success-border)] bg-[var(--success-bg)] px-1.5 py-0.5 text-[8px] font-bold tracking-[0.08em] text-[var(--accent)]"
          >▶ ACTIVE</span
        >
        <span
          v-else-if="selectedInstanceName === inst.name"
          class="rounded border border-[var(--primary-border)] bg-(--primary)/20 px-1.5 py-0.5 text-[8px] font-bold tracking-[0.08em] text-[var(--primary)]"
          >▶ SELECTED</span
        >
        <span
          v-if="inst.groupName"
          class="inline-flex items-center gap-1 rounded border border-white/15 bg-black/40 px-1.5 py-0.5 text-[8px] font-bold tracking-[0.08em] text-white/60 backdrop-blur-sm"
        >
          <Icon icon="lucide:folder" class="size-[8px]" />{{ inst.groupName }}
        </span>
      </div>

      <!-- Favourite star: always visible once set, on hover otherwise. -->
      <button
        v-if="!inst.busy"
        type="button"
        class="absolute left-[7px] bottom-[7px] z-10 flex size-6 items-center justify-center rounded-md border border-white/10 bg-black/40 backdrop-blur-sm transition-all duration-150 hover:bg-white/15"
        :class="inst.favourite ? 'text-amber-300 opacity-100' : 'text-white/40 opacity-0 group-hover:opacity-100 hover:!text-white'"
        :title="inst.favourite ? t('profiles.unfavourite') : t('profiles.favourite')"
        @click.stop="emit('favourite', inst)"
      >
        <Icon :icon="inst.favourite ? 'lucide:star' : 'lucide:star'" class="size-3" :class="inst.favourite ? 'fill-current' : ''" />
      </button>
    </div>

    <!-- Card info -->
    <div class="px-3 py-2.5 pointer-events-none">
      <div class="mb-1.5 truncate text-[length:var(--text-md-plus)] font-semibold leading-[1.35] text-white">
        {{ inst.name }}
      </div>
      <InstallProgress
        v-if="inst.busy"
        compact
        :stage="inst.busyStage ?? null"
        :completed="inst.busyCompleted ?? 0"
        :total="inst.busyTotal ?? 0"
        :percent="inst.busyPercent ?? -1"
      />
      <div v-else class="flex flex-wrap gap-[5px] text-[length:var(--text-2xs)] text-white/60">
        <span class="inline-flex items-center gap-1">
          <span class="size-1.5 rounded-full bg-[#4caf50]"></span>{{ formatLoaderId(inst.versionId) }}
        </span>
        <span class="inline-flex items-center gap-1">
          <span class="size-1.5 rounded-full bg-[#6c63ff]"></span>Java {{ inst.javaMajorVersion }}
        </span>
        <span class="text-white/25">{{ formatRelativeDate(inst.lastPlayedAt) }}</span>
        <span v-if="inst.totalPlaytimeMs > 0" class="inline-flex items-center gap-1 text-white/30">
          <Icon icon="lucide:timer" class="size-[9px]" />{{ formatPlaytime(inst.totalPlaytimeMs) }}
        </span>
      </div>
    </div>

    <!-- 3-dot menu -->
    <div v-if="!inst.busy" class="absolute right-[7px] top-[7px] z-10" @click.stop>
      <button
        type="button"
        class="flex size-6 items-center justify-center rounded-md border border-white/10 bg-black/40 text-white/40 opacity-0 backdrop-blur-sm transition-all duration-150 group-hover:opacity-100 hover:!text-white hover:bg-white/15"
        @click="emit('toggleMenu', inst.slug)"
      >
        <Icon icon="lucide:more-vertical" class="size-3" />
      </button>
      <div
        v-if="openMenuSlug === inst.slug"
        class="absolute right-0 top-8 z-20 min-w-[170px] overflow-hidden rounded-[9px] border border-white/10 bg-[var(--surface-panel-strong)] shadow-[0_8px_24px_rgba(0,0,0,.5)] backdrop-blur-md"
      >
        <button
          type="button"
          class="flex w-full items-center gap-2.5 px-3 py-2 text-[length:var(--text-sm)] text-white/70 transition-colors hover:bg-white/8 hover:text-white"
          @click="emit('rename', inst)"
        >
          <Icon icon="lucide:pencil" class="size-3.5 shrink-0" />{{ t("common.rename") }}
        </button>
        <button
          type="button"
          class="flex w-full items-center gap-2.5 px-3 py-2 text-[length:var(--text-sm)] text-white/70 transition-colors hover:bg-white/8 hover:text-white"
          @click="emit('duplicate', inst)"
        >
          <Icon icon="lucide:copy" class="size-3.5 shrink-0" />{{ t("profiles.duplicate") }}
        </button>
        <button
          type="button"
          class="flex w-full items-center gap-2.5 px-3 py-2 text-[length:var(--text-sm)] text-white/70 transition-colors hover:bg-white/8 hover:text-white"
          @click="emit('group', inst)"
        >
          <Icon icon="lucide:folder" class="size-3.5 shrink-0" />{{ t("profiles.group") }}
        </button>
        <button
          type="button"
          class="flex w-full items-center gap-2.5 px-3 py-2 text-[length:var(--text-sm)] text-white/70 transition-colors hover:bg-white/8 hover:text-white"
          @click="emit('openFolder', inst)"
        >
          <Icon icon="lucide:folder-open" class="size-3.5 shrink-0" />{{ t("profiles.openFolder") }}
        </button>
        <button
          type="button"
          class="flex w-full items-center gap-2.5 px-3 py-2 text-[length:var(--text-sm)] text-white/70 transition-colors hover:bg-white/8 hover:text-white"
          @click="emit('export', inst)"
        >
          <Icon icon="lucide:package-open" class="size-3.5 shrink-0" />{{ t("export.title") }}
        </button>
        <div class="mx-2 my-0.5 h-px bg-white/7"></div>
        <button
          type="button"
          class="flex w-full items-center gap-2.5 px-3 py-2 text-[length:var(--text-sm)] text-[var(--danger-text,#f87171)] transition-colors hover:bg-red-500/10"
          @click="emit('delete', inst)"
        >
          <Icon icon="lucide:trash-2" class="size-3.5 shrink-0" />{{ t("common.delete") }}
        </button>
      </div>
    </div>
  </div>
</template>
