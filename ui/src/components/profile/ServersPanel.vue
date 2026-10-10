<script setup lang="ts">
import { ref, watch } from "vue";
import { Icon } from "@iconify/vue";
import PanelShell from "./PanelShell.vue";
import { useLauncher, type LauncherInstance } from "@/composables/useLauncher";

const props = defineProps<{ instance: LauncherInstance }>();

const {
  t,
  authData,
  servers,
  isLoadingServers,
  loadServers,
  addServer,
  removeServer,
  handleLaunchServer,
} = useLauncher();

const showAdd = ref(false);
const newName = ref("");
const newAddress = ref("");
const isSaving = ref(false);

watch(() => props.instance.name, (name) => { if (name) void loadServers(name); }, { immediate: true });

const confirmAdd = async () => {
  if (!newAddress.value.trim()) return;
  isSaving.value = true;
  const ok = await addServer(props.instance.name, newName.value.trim(), newAddress.value.trim());
  isSaving.value = false;
  if (ok) {
    showAdd.value = false;
    newName.value = "";
    newAddress.value = "";
  }
};

/** The icon a server sent back, already base64 in servers.dat. */
const iconSrc = (icon: string) =>
  icon.startsWith("data:") ? icon : `data:image/png;base64,${icon}`;
</script>

<template>
  <PanelShell
    icon="lucide:server"
    :title="t('servers.title')"
    :count="servers.length"
    :loading="isLoadingServers"
    :loading-label="t('common.loading')"
    :empty="servers.length === 0"
    empty-icon="lucide:server"
    :empty-title="t('servers.empty')"
    :empty-hint="t('servers.emptyHint')"
  >
    <template #actions>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--accent-border-strong)] bg-[var(--accent-bg-strong)] px-2.5 py-1.5 text-[length:var(--text-2xs)] font-semibold tracking-[0.06em] text-[var(--primary)] transition-all hover:bg-[var(--accent-bg-hover)]"
        @click="showAdd = true"
      >
        <Icon icon="lucide:plus" class="size-3" />{{ t("servers.add") }}
      </button>
      <button
        type="button"
        class="flex size-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/40 transition-all hover:bg-white/10 hover:text-white"
        @click="loadServers(instance.name)"
      >
        <Icon icon="lucide:refresh-cw" class="size-3" />
      </button>
    </template>

    <div class="flex flex-col gap-1.5">
      <div
        v-for="server in servers"
        :key="server.index"
        class="flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2.5"
      >
        <div class="flex min-w-0 items-center gap-2.5">
          <img
            v-if="server.icon"
            :src="iconSrc(server.icon)"
            alt=""
            class="size-9 shrink-0 rounded-[6px] border border-white/10 object-cover [image-rendering:pixelated]"
          />
          <div
            v-else
            class="flex size-9 shrink-0 items-center justify-center rounded-[6px] border border-white/8 bg-white/5"
          >
            <Icon icon="lucide:server" class="size-4 text-white/30" />
          </div>
          <div class="min-w-0">
            <div class="truncate text-[length:var(--text-sm)] font-medium text-white">{{ server.name }}</div>
            <div class="truncate font-mono text-[length:var(--text-2xs)] text-white/35">{{ server.address }}</div>
          </div>
        </div>

        <div class="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            :disabled="!authData || instance.running"
            class="inline-flex items-center gap-1 rounded-[6px] border border-[var(--accent-border-strong)] bg-[var(--accent-bg-strong)] px-2 py-1 text-[length:var(--text-2xs)] font-semibold text-[var(--primary)] transition-all hover:bg-[var(--accent-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
            :title="t('servers.joinHint')"
            @click="handleLaunchServer(instance.name, server.address)"
          >
            <Icon icon="lucide:play" class="size-3" />{{ t("servers.join") }}
          </button>
          <button
            type="button"
            class="flex size-7 items-center justify-center rounded-md border border-white/8 bg-white/[0.03] text-white/35 transition-all hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
            :title="t('servers.remove')"
            @click="removeServer(instance.name, server.index)"
          >
            <Icon icon="lucide:trash-2" class="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  </PanelShell>

  <Teleport to="body">
    <div
      v-if="showAdd"
      class="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 p-5 backdrop-blur-md"
      @click.self="showAdd = false"
    >
      <div class="w-full max-w-[440px] rounded-[14px] border border-[var(--accent-border)] bg-[var(--surface-panel-strong)] shadow-[var(--shadow-modal)]">
        <div class="border-b border-white/7 px-5 py-4 text-[length:var(--text-lg)] font-bold tracking-[0.1em] text-white">
          {{ t("servers.addTitle").toUpperCase() }}
        </div>
        <div class="flex flex-col gap-4 p-5">
          <div class="flex flex-col gap-1.5">
            <label class="text-[length:var(--text-2xs)] font-bold tracking-[0.14em] text-white/40">
              {{ t("servers.name").toUpperCase() }}
            </label>
            <input
              v-model="newName"
              type="text"
              :placeholder="t('servers.namePlaceholder')"
              class="w-full rounded-lg border border-white/10 bg-[var(--surface-input)] px-3 py-2 text-[length:var(--text-sm)] text-white outline-none transition-colors focus:border-[var(--accent-border-focus)]"
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-[length:var(--text-2xs)] font-bold tracking-[0.14em] text-white/40">
              {{ t("servers.address").toUpperCase() }}
            </label>
            <input
              v-model="newAddress"
              type="text"
              :placeholder="t('servers.addressPlaceholder')"
              class="w-full rounded-lg border border-white/10 bg-[var(--surface-input)] px-3 py-2 font-mono text-[length:var(--text-sm)] text-white outline-none transition-colors focus:border-[var(--accent-border-focus)]"
              @keyup.enter="confirmAdd"
            />
          </div>
          <div class="flex justify-end gap-2">
            <button
              type="button"
              class="rounded-[7px] border border-white/10 bg-white/5 px-3.5 py-[7px] text-[length:var(--text-sm)] font-semibold text-white/45 transition-all hover:bg-white/10"
              @click="showAdd = false"
            >
              {{ t("common.cancel") }}
            </button>
            <button
              type="button"
              :disabled="!newAddress.trim() || isSaving"
              class="rounded-[7px] border border-[var(--accent-border-strong)] bg-[var(--accent-bg-strong)] px-3.5 py-[7px] text-[length:var(--text-sm)] font-semibold text-[var(--primary)] transition-all hover:bg-[var(--accent-bg-hover)] disabled:opacity-50"
              @click="confirmAdd"
            >
              {{ t("common.add") }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
