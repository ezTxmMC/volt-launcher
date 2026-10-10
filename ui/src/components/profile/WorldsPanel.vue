<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Icon } from "@iconify/vue";
import PanelShell from "./PanelShell.vue";
import { useLauncher, type GameWorld, type LauncherInstance } from "@/composables/useLauncher";

const props = defineProps<{ instance: LauncherInstance }>();

const {
  t,
  authData,
  instances,
  worlds,
  isLoadingWorlds,
  loadWorlds,
  deleteWorld,
  duplicateWorld,
  copyWorldToInstance,
  renameWorld,
  worldIconUrl,
  handleLaunchWorld,
  formatBytes,
  formatRelativeDate,
  minecraftVersionOf,
} = useLauncher();

/**
 * Quick play into a world exists from Minecraft 1.20 onwards; on anything older the button would
 * silently do nothing, so it is not offered.
 */
const QUICK_PLAY_MIN_MINOR = 20;

const supportsQuickPlay = computed(() => {
  const parts = minecraftVersionOf(props.instance.versionId).split(".");
  const major = Number(parts[0]);
  const minor = Number(parts[1]);
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return false;
  return major > 1 || (major === 1 && minor >= QUICK_PLAY_MIN_MINOR);
});

const otherInstances = computed(() =>
  instances.value.filter((entry) => entry.name !== props.instance.name && !entry.busy),
);

const renameTarget = ref<GameWorld | null>(null);
const renameValue = ref("");
const copyTarget = ref<GameWorld | null>(null);
const copyInstance = ref("");
const deleteTarget = ref<GameWorld | null>(null);
const busyWorld = ref("");

watch(() => props.instance.name, (name) => { if (name) void loadWorlds(name); }, { immediate: true });

const gameModeLabel = (world: GameWorld) => {
  if (world.hardcore) return t("worlds.hardcore");
  if (!world.gameMode) return "";
  return t(`worlds.${world.gameMode}`);
};

const startRename = (world: GameWorld) => {
  renameTarget.value = world;
  renameValue.value = world.name;
};

const confirmRename = async () => {
  const world = renameTarget.value;
  if (!world || !renameValue.value.trim()) return;
  busyWorld.value = world.folderName;
  await renameWorld(props.instance.name, world.folderName, renameValue.value.trim());
  busyWorld.value = "";
  renameTarget.value = null;
};

const startCopy = (world: GameWorld) => {
  copyTarget.value = world;
  copyInstance.value = otherInstances.value[0]?.name ?? "";
};

const confirmCopy = async () => {
  const world = copyTarget.value;
  if (!world || !copyInstance.value) return;
  busyWorld.value = world.folderName;
  await copyWorldToInstance(props.instance.name, world.folderName, copyInstance.value);
  busyWorld.value = "";
  copyTarget.value = null;
};

const confirmDelete = async () => {
  const world = deleteTarget.value;
  if (!world) return;
  busyWorld.value = world.folderName;
  await deleteWorld(props.instance.name, world.folderName);
  busyWorld.value = "";
  deleteTarget.value = null;
};

const onDuplicate = async (world: GameWorld) => {
  busyWorld.value = world.folderName;
  await duplicateWorld(props.instance.name, world.folderName);
  busyWorld.value = "";
};
</script>

<template>
  <PanelShell
    icon="lucide:globe"
    :title="t('worlds.title')"
    :count="worlds.length"
    :loading="isLoadingWorlds"
    :loading-label="t('common.loading')"
    :empty="worlds.length === 0"
    empty-icon="lucide:globe"
    :empty-title="t('worlds.empty')"
    :empty-hint="t('worlds.emptyHint')"
  >
    <template #actions>
      <button
        type="button"
        class="flex size-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/40 transition-all hover:bg-white/10 hover:text-white"
        :title="t('common.retry')"
        @click="loadWorlds(instance.name)"
      >
        <Icon icon="lucide:refresh-cw" class="size-3" />
      </button>
    </template>

    <div class="flex flex-col gap-1.5">
      <div
        v-for="world in worlds"
        :key="world.folderName"
        class="group flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2.5"
        :class="world.readable ? '' : 'border-amber-500/25 bg-amber-500/[0.04]'"
      >
        <div class="flex min-w-0 items-center gap-2.5">
          <img
            v-if="world.hasIcon"
            :src="worldIconUrl(instance.name, world)"
            alt=""
            class="size-9 shrink-0 rounded-[6px] border border-white/10 object-cover [image-rendering:pixelated]"
            loading="lazy"
          />
          <div
            v-else
            class="flex size-9 shrink-0 items-center justify-center rounded-[6px] border border-white/8 bg-white/5"
          >
            <Icon icon="lucide:globe" class="size-4 text-white/30" />
          </div>

          <div class="min-w-0">
            <div class="truncate text-[length:var(--text-sm)] font-medium text-white">{{ world.name }}</div>
            <div class="flex flex-wrap items-center gap-x-1.5 text-[length:var(--text-2xs)] text-white/35">
              <span v-if="gameModeLabel(world)" class="rounded-[4px] bg-white/8 px-1.5 py-px text-white/55">
                {{ gameModeLabel(world) }}
              </span>
              <span v-if="world.versionName">{{ world.versionName }}</span>
              <span>{{ formatBytes(world.sizeBytes) }}</span>
              <span>{{ t("worlds.lastPlayed", { when: formatRelativeDate(world.lastPlayed) }) }}</span>
              <span v-if="!world.readable" class="text-amber-400">{{ world.problem }}</span>
            </div>
          </div>
        </div>

        <div class="flex shrink-0 items-center gap-1.5">
          <button
            v-if="supportsQuickPlay && world.readable"
            type="button"
            :disabled="!authData || instance.running || busyWorld === world.folderName"
            class="inline-flex items-center gap-1 rounded-[6px] border border-[var(--accent-border-strong)] bg-[var(--accent-bg-strong)] px-2 py-1 text-[length:var(--text-2xs)] font-semibold text-[var(--primary)] transition-all hover:bg-[var(--accent-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
            :title="t('worlds.play')"
            @click="handleLaunchWorld(instance.name, world.folderName)"
          >
            <Icon icon="lucide:play" class="size-3" />{{ t("profiles.play") }}
          </button>
          <button
            type="button"
            :disabled="busyWorld === world.folderName"
            class="flex size-7 items-center justify-center rounded-md border border-white/8 bg-white/[0.03] text-white/35 transition-all hover:bg-white/10 hover:text-white disabled:opacity-40"
            :title="t('worlds.rename')"
            @click="startRename(world)"
          >
            <Icon icon="lucide:pencil" class="size-3.5" />
          </button>
          <button
            type="button"
            :disabled="busyWorld === world.folderName"
            class="flex size-7 items-center justify-center rounded-md border border-white/8 bg-white/[0.03] text-white/35 transition-all hover:bg-white/10 hover:text-white disabled:opacity-40"
            :title="t('worlds.duplicate')"
            @click="onDuplicate(world)"
          >
            <Icon icon="lucide:copy" class="size-3.5" />
          </button>
          <button
            v-if="otherInstances.length > 0"
            type="button"
            :disabled="busyWorld === world.folderName"
            class="flex size-7 items-center justify-center rounded-md border border-white/8 bg-white/[0.03] text-white/35 transition-all hover:bg-white/10 hover:text-white disabled:opacity-40"
            :title="t('worlds.copyTo')"
            @click="startCopy(world)"
          >
            <Icon icon="lucide:folder-input" class="size-3.5" />
          </button>
          <button
            type="button"
            :disabled="busyWorld === world.folderName"
            class="flex size-7 items-center justify-center rounded-md border border-white/8 bg-white/[0.03] text-white/35 transition-all hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
            :title="t('common.delete')"
            @click="deleteTarget = world"
          >
            <Icon icon="lucide:trash-2" class="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  </PanelShell>

  <!-- Rename -->
  <Teleport to="body">
    <div
      v-if="renameTarget"
      class="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 p-5 backdrop-blur-md"
      @click.self="renameTarget = null"
    >
      <div class="w-full max-w-[420px] rounded-[14px] border border-[var(--accent-border)] bg-[var(--surface-panel-strong)] shadow-[var(--shadow-modal)]">
        <div class="border-b border-white/7 px-5 py-4 text-[length:var(--text-lg)] font-bold tracking-[0.1em] text-white">
          {{ t("worlds.rename").toUpperCase() }}
        </div>
        <div class="flex flex-col gap-4 p-5">
          <input
            v-model="renameValue"
            type="text"
            maxlength="64"
            :placeholder="t('worlds.renamePlaceholder')"
            class="w-full rounded-lg border border-white/10 bg-[var(--surface-input)] px-[13px] py-2.5 text-[length:var(--text-md)] text-white outline-none transition-colors focus:border-[var(--accent-border-focus)]"
            @keyup.enter="confirmRename"
          />
          <div class="flex justify-end gap-2">
            <button
              type="button"
              class="rounded-[7px] border border-white/10 bg-white/5 px-3.5 py-[7px] text-[length:var(--text-sm)] font-semibold text-white/45 transition-all hover:bg-white/10"
              @click="renameTarget = null"
            >
              {{ t("common.cancel") }}
            </button>
            <button
              type="button"
              :disabled="!renameValue.trim()"
              class="rounded-[7px] border border-[var(--accent-border-strong)] bg-[var(--accent-bg-strong)] px-3.5 py-[7px] text-[length:var(--text-sm)] font-semibold text-[var(--primary)] transition-all hover:bg-[var(--accent-bg-hover)] disabled:opacity-50"
              @click="confirmRename"
            >
              {{ t("common.save") }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Copy to another profile -->
  <Teleport to="body">
    <div
      v-if="copyTarget"
      class="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 p-5 backdrop-blur-md"
      @click.self="copyTarget = null"
    >
      <div class="w-full max-w-[440px] rounded-[14px] border border-[var(--accent-border)] bg-[var(--surface-panel-strong)] shadow-[var(--shadow-modal)]">
        <div class="border-b border-white/7 px-5 py-4 text-[length:var(--text-lg)] font-bold tracking-[0.1em] text-white">
          {{ t("worlds.copyToTitle").toUpperCase() }}
        </div>
        <div class="flex flex-col gap-4 p-5">
          <select
            v-model="copyInstance"
            class="w-full rounded-lg border border-white/10 bg-[var(--surface-input)] px-3 py-2.5 text-[length:var(--text-sm)] text-white outline-none focus:border-[var(--accent-border-focus)]"
          >
            <option v-for="entry in otherInstances" :key="entry.slug" :value="entry.name">
              {{ entry.name }}
            </option>
          </select>
          <p class="text-[length:var(--text-2xs)] leading-[1.5] text-white/40">{{ t("worlds.copyToHint") }}</p>
          <div class="flex justify-end gap-2">
            <button
              type="button"
              class="rounded-[7px] border border-white/10 bg-white/5 px-3.5 py-[7px] text-[length:var(--text-sm)] font-semibold text-white/45 transition-all hover:bg-white/10"
              @click="copyTarget = null"
            >
              {{ t("common.cancel") }}
            </button>
            <button
              type="button"
              :disabled="!copyInstance"
              class="rounded-[7px] border border-[var(--accent-border-strong)] bg-[var(--accent-bg-strong)] px-3.5 py-[7px] text-[length:var(--text-sm)] font-semibold text-[var(--primary)] transition-all hover:bg-[var(--accent-bg-hover)] disabled:opacity-50"
              @click="confirmCopy"
            >
              {{ t("worlds.copyTo") }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Delete confirmation -->
  <Teleport to="body">
    <div
      v-if="deleteTarget"
      class="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 p-5 backdrop-blur-md"
      @click.self="deleteTarget = null"
    >
      <div class="w-full max-w-[420px] rounded-[14px] border border-white/10 bg-[var(--surface-panel-strong)] shadow-[var(--shadow-modal)]">
        <div class="border-b border-white/7 px-5 py-4 text-[length:var(--text-lg)] font-bold tracking-[0.1em] text-white">
          {{ t("worlds.deleteTitle").toUpperCase() }}
        </div>
        <div class="flex flex-col gap-4 p-5">
          <p class="text-[length:var(--text-base)] leading-[1.5] text-white/70">
            {{ t("worlds.deleteConfirm", { name: deleteTarget.name }) }}
          </p>
          <div class="flex justify-end gap-2">
            <button
              type="button"
              class="rounded-[7px] border border-white/10 bg-white/5 px-3.5 py-[7px] text-[length:var(--text-sm)] font-semibold text-white/45 transition-all hover:bg-white/10"
              @click="deleteTarget = null"
            >
              {{ t("common.cancel") }}
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-[7px] border border-red-500/40 bg-red-500/20 px-3.5 py-[7px] text-[length:var(--text-sm)] font-semibold text-red-400 transition-all hover:bg-red-500/30"
              @click="confirmDelete"
            >
              <Icon icon="lucide:trash-2" class="size-[11px]" />{{ t("common.delete") }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
