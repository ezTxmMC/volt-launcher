<script setup lang="ts">
import { ref, watch } from "vue";
import { Icon } from "@iconify/vue";
import PanelShell from "./PanelShell.vue";
import { useLauncher, type LauncherInstance, type ProfileBackup } from "@/composables/useLauncher";

const props = defineProps<{ instance: LauncherInstance }>();

const {
  t,
  backups,
  isLoadingBackups,
  isBackingUp,
  isRestoring,
  backupProgress,
  loadBackups,
  createBackup,
  restoreBackup,
  deleteBackup,
  openBackupFolder,
  formatBytes,
  formatRelativeDate,
  formatLoaderId,
} = useLauncher();

const showCreate = ref(false);
const label = ref("");
const restoreTarget = ref<ProfileBackup | null>(null);
const deleteTarget = ref<ProfileBackup | null>(null);

watch(() => props.instance.name, (name) => { if (name) void loadBackups(name); }, { immediate: true });

const confirmCreate = async () => {
  showCreate.value = false;
  await createBackup(props.instance.name, label.value.trim());
  label.value = "";
};

const confirmRestore = async () => {
  const backup = restoreTarget.value;
  restoreTarget.value = null;
  if (!backup) return;
  await restoreBackup(props.instance.name, backup.id);
};

const confirmDelete = async () => {
  const backup = deleteTarget.value;
  deleteTarget.value = null;
  if (!backup) return;
  await deleteBackup(props.instance.name, backup.id);
};
</script>

<template>
  <PanelShell
    icon="lucide:archive"
    :title="t('backups.title')"
    :count="backups.length"
    :loading="isLoadingBackups"
    :loading-label="t('common.loading')"
    :empty="backups.length === 0 && !isBackingUp"
    empty-icon="lucide:archive"
    :empty-title="t('backups.empty')"
    :empty-hint="t('backups.emptyHint')"
  >
    <template #actions>
      <button
        type="button"
        :disabled="isBackingUp || isRestoring || instance.busy"
        class="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--accent-border-strong)] bg-[var(--accent-bg-strong)] px-2.5 py-1.5 text-[length:var(--text-2xs)] font-semibold tracking-[0.06em] text-[var(--primary)] transition-all hover:bg-[var(--accent-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
        @click="showCreate = true"
      >
        <Icon :icon="isBackingUp ? 'lucide:loader-2' : 'lucide:archive'" class="size-3" :class="isBackingUp ? 'animate-spin' : ''" />
        {{ isBackingUp ? t("backups.creating") : t("backups.create") }}
      </button>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-[6px] border border-white/10 bg-white/5 px-2.5 py-1.5 text-[length:var(--text-2xs)] font-semibold text-white/50 transition-all hover:bg-white/10 hover:text-white"
        @click="openBackupFolder(instance.name)"
      >
        <Icon icon="lucide:folder-open" class="size-3" />{{ t("backups.openFolder") }}
      </button>
    </template>

    <template v-if="isBackingUp" #subheader>
      <div class="flex items-center gap-2 text-[length:var(--text-2xs)] text-white/50">
        <Icon icon="lucide:loader-2" class="size-3 animate-spin text-[var(--primary)]" />
        <span>{{ t("backups.creating") }}</span>
        <div class="ml-auto h-1 w-40 overflow-hidden rounded-full bg-white/10">
          <div
            class="h-full rounded-full bg-[var(--primary)] transition-[width] duration-200"
            :style="{ width: backupProgress >= 0 ? `${backupProgress}%` : '35%' }"
          />
        </div>
      </div>
    </template>

    <div class="flex flex-col gap-1.5">
      <div
        v-for="backup in backups"
        :key="backup.id"
        class="flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2.5"
      >
        <div class="flex min-w-0 items-center gap-2.5">
          <div class="flex size-8 shrink-0 items-center justify-center rounded-[6px] border border-white/8 bg-white/5">
            <Icon icon="lucide:archive" class="size-4 text-white/30" />
          </div>
          <div class="min-w-0">
            <div class="truncate text-[length:var(--text-sm)] font-medium text-white">{{ backup.label }}</div>
            <div class="flex flex-wrap items-center gap-x-1.5 text-[length:var(--text-2xs)] text-white/35">
              <span>{{ formatRelativeDate(backup.createdAt) }}</span>
              <span>{{ formatBytes(backup.sizeBytes) }}</span>
              <span v-if="backup.fileCount">{{ t("backups.files", { n: backup.fileCount }) }}</span>
              <span v-if="backup.versionId" class="rounded-[4px] bg-white/8 px-1.5 py-px text-white/50">
                {{ formatLoaderId(backup.versionId) }}
              </span>
            </div>
          </div>
        </div>

        <div class="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            :disabled="isRestoring || instance.running || instance.busy"
            class="inline-flex items-center gap-1 rounded-[6px] border border-white/10 bg-white/5 px-2 py-1 text-[length:var(--text-2xs)] font-semibold text-white/60 transition-all hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            @click="restoreTarget = backup"
          >
            <Icon :icon="isRestoring ? 'lucide:loader-2' : 'lucide:rotate-ccw'" class="size-3" :class="isRestoring ? 'animate-spin' : ''" />
            {{ t("backups.restore") }}
          </button>
          <button
            type="button"
            class="flex size-7 items-center justify-center rounded-md border border-white/8 bg-white/[0.03] text-white/35 transition-all hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
            :title="t('common.delete')"
            @click="deleteTarget = backup"
          >
            <Icon icon="lucide:trash-2" class="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  </PanelShell>

  <Teleport to="body">
    <div
      v-if="showCreate"
      class="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 p-5 backdrop-blur-md"
      @click.self="showCreate = false"
    >
      <div class="w-full max-w-[430px] rounded-[14px] border border-[var(--accent-border)] bg-[var(--surface-panel-strong)] shadow-[var(--shadow-modal)]">
        <div class="border-b border-white/7 px-5 py-4 text-[length:var(--text-lg)] font-bold tracking-[0.1em] text-white">
          {{ t("backups.create").toUpperCase() }}
        </div>
        <div class="flex flex-col gap-4 p-5">
          <div class="flex flex-col gap-1.5">
            <label class="text-[length:var(--text-2xs)] font-bold tracking-[0.14em] text-white/40">
              {{ t("backups.label").toUpperCase() }}
            </label>
            <input
              v-model="label"
              type="text"
              :placeholder="t('backups.labelPlaceholder')"
              class="w-full rounded-lg border border-white/10 bg-[var(--surface-input)] px-3 py-2 text-[length:var(--text-sm)] text-white outline-none transition-colors focus:border-[var(--accent-border-focus)]"
              @keyup.enter="confirmCreate"
            />
          </div>
          <div class="flex justify-end gap-2">
            <button
              type="button"
              class="rounded-[7px] border border-white/10 bg-white/5 px-3.5 py-[7px] text-[length:var(--text-sm)] font-semibold text-white/45 transition-all hover:bg-white/10"
              @click="showCreate = false"
            >
              {{ t("common.cancel") }}
            </button>
            <button
              type="button"
              class="rounded-[7px] border border-[var(--accent-border-strong)] bg-[var(--accent-bg-strong)] px-3.5 py-[7px] text-[length:var(--text-sm)] font-semibold text-[var(--primary)] transition-all hover:bg-[var(--accent-bg-hover)]"
              @click="confirmCreate"
            >
              {{ t("backups.create") }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <Teleport to="body">
    <div
      v-if="restoreTarget"
      class="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 p-5 backdrop-blur-md"
      @click.self="restoreTarget = null"
    >
      <div class="w-full max-w-[440px] rounded-[14px] border border-white/10 bg-[var(--surface-panel-strong)] shadow-[var(--shadow-modal)]">
        <div class="border-b border-white/7 px-5 py-4 text-[length:var(--text-lg)] font-bold tracking-[0.1em] text-white">
          {{ t("backups.restoreTitle").toUpperCase() }}
        </div>
        <div class="flex flex-col gap-4 p-5">
          <p class="text-[length:var(--text-base)] leading-[1.5] text-white/70">{{ t("backups.restoreConfirm") }}</p>
          <div class="flex justify-end gap-2">
            <button
              type="button"
              class="rounded-[7px] border border-white/10 bg-white/5 px-3.5 py-[7px] text-[length:var(--text-sm)] font-semibold text-white/45 transition-all hover:bg-white/10"
              @click="restoreTarget = null"
            >
              {{ t("common.cancel") }}
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-[7px] border border-[var(--accent-border-strong)] bg-[var(--accent-bg-strong)] px-3.5 py-[7px] text-[length:var(--text-sm)] font-semibold text-[var(--primary)] transition-all hover:bg-[var(--accent-bg-hover)]"
              @click="confirmRestore"
            >
              <Icon icon="lucide:rotate-ccw" class="size-[11px]" />{{ t("backups.restore") }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <Teleport to="body">
    <div
      v-if="deleteTarget"
      class="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 p-5 backdrop-blur-md"
      @click.self="deleteTarget = null"
    >
      <div class="w-full max-w-[400px] rounded-[14px] border border-white/10 bg-[var(--surface-panel-strong)] shadow-[var(--shadow-modal)]">
        <div class="border-b border-white/7 px-5 py-4 text-[length:var(--text-lg)] font-bold tracking-[0.1em] text-white">
          {{ t("backups.deleteTitle").toUpperCase() }}
        </div>
        <div class="flex flex-col gap-4 p-5">
          <p class="text-[length:var(--text-base)] text-white/70">{{ t("backups.deleteConfirm") }}</p>
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
