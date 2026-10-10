<script setup lang="ts">
import { ref, watch } from "vue";
import { Icon } from "@iconify/vue";
import PanelShell from "./PanelShell.vue";
import { useLauncher, type LauncherInstance, type Screenshot } from "@/composables/useLauncher";

const props = defineProps<{ instance: LauncherInstance }>();

const {
  t,
  screenshots,
  isLoadingScreenshots,
  loadScreenshots,
  deleteScreenshot,
  openScreenshotFolder,
  screenshotUrl,
  copyScreenshotToClipboard,
  formatBytes,
  formatRelativeDate,
} = useLauncher();

const preview = ref<Screenshot | null>(null);

watch(() => props.instance.name, (name) => { if (name) void loadScreenshots(name); }, { immediate: true });

const onDelete = async (screenshot: Screenshot) => {
  await deleteScreenshot(props.instance.name, screenshot.fileName);
  if (preview.value?.fileName === screenshot.fileName) preview.value = null;
};
</script>

<template>
  <PanelShell
    icon="lucide:image"
    :title="t('screenshots.title')"
    :count="screenshots.length"
    :loading="isLoadingScreenshots"
    :loading-label="t('common.loading')"
    :empty="screenshots.length === 0"
    empty-icon="lucide:image"
    :empty-title="t('screenshots.empty')"
    :empty-hint="t('screenshots.emptyHint')"
  >
    <template #actions>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-[6px] border border-white/10 bg-white/5 px-2.5 py-1.5 text-[length:var(--text-2xs)] font-semibold tracking-[0.06em] text-white/50 transition-all hover:bg-white/10 hover:text-white"
        @click="openScreenshotFolder(instance.name)"
      >
        <Icon icon="lucide:folder-open" class="size-3" />{{ t("screenshots.openFolder") }}
      </button>
      <button
        type="button"
        class="flex size-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/40 transition-all hover:bg-white/10 hover:text-white"
        @click="loadScreenshots(instance.name)"
      >
        <Icon icon="lucide:refresh-cw" class="size-3" />
      </button>
    </template>

    <div class="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2">
      <div
        v-for="screenshot in screenshots"
        :key="screenshot.fileName"
        class="group relative overflow-hidden rounded-lg border border-white/8 bg-black/20"
      >
        <button type="button" class="block w-full" @click="preview = screenshot">
          <img
            :src="screenshotUrl(instance.name, screenshot.fileName)"
            alt=""
            loading="lazy"
            class="aspect-video w-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
        </button>
        <div class="flex items-center justify-between gap-1 px-2 py-1.5">
          <div class="min-w-0">
            <div class="truncate text-[length:var(--text-2xs)] text-white/60">
              {{ t("screenshots.takenAt", { when: formatRelativeDate(screenshot.takenAt) }) }}
            </div>
            <div class="text-[10px] text-white/25">{{ formatBytes(screenshot.sizeBytes) }}</div>
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <button
              type="button"
              class="flex size-6 items-center justify-center rounded border border-white/8 text-white/35 transition-all hover:bg-white/10 hover:text-white"
              :title="t('screenshots.copy')"
              @click="copyScreenshotToClipboard(instance.name, screenshot.fileName)"
            >
              <Icon icon="lucide:clipboard-copy" class="size-3" />
            </button>
            <button
              type="button"
              class="flex size-6 items-center justify-center rounded border border-white/8 text-white/35 transition-all hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
              :title="t('common.delete')"
              @click="onDelete(screenshot)"
            >
              <Icon icon="lucide:trash-2" class="size-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </PanelShell>

  <Teleport to="body">
    <div
      v-if="preview"
      class="fixed inset-0 z-[210] flex items-center justify-center bg-black/80 p-8 backdrop-blur-sm"
      @click.self="preview = null"
    >
      <div class="flex max-h-full max-w-full flex-col items-center gap-3">
        <img
          :src="screenshotUrl(instance.name, preview.fileName)"
          alt=""
          class="max-h-[80vh] max-w-full rounded-lg border border-white/10 object-contain"
        />
        <div class="flex items-center gap-2">
          <span class="text-[length:var(--text-2xs)] text-white/50">{{ preview.fileName }}</span>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-[6px] border border-white/10 bg-white/5 px-2.5 py-1.5 text-[length:var(--text-2xs)] font-semibold text-white/60 transition-all hover:bg-white/10 hover:text-white"
            @click="copyScreenshotToClipboard(instance.name, preview.fileName)"
          >
            <Icon icon="lucide:clipboard-copy" class="size-3" />{{ t("screenshots.copy") }}
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-[6px] border border-white/10 bg-white/5 px-2.5 py-1.5 text-[length:var(--text-2xs)] font-semibold text-white/60 transition-all hover:bg-white/10 hover:text-white"
            @click="preview = null"
          >
            <Icon icon="lucide:x" class="size-3" />{{ t("common.close") }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
