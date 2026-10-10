<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { Icon } from "@iconify/vue";
import { useLauncher } from "@/composables/useLauncher";
import ProjectCard from "@/components/discover/ProjectCard.vue";
import ProjectDetailPanel from "@/components/discover/ProjectDetailPanel.vue";
import InstallToProfileModal from "@/components/discover/InstallToProfileModal.vue";
import type { ContentKind, ProjectSummary, ProviderId, SortIndex } from "@/composables/types";

const {
  t,
  activeTab,
  providers,
  provider,
  kind,
  query,
  sort,
  gameVersionFilter,
  loaderFilter,
  hits,
  totalHits,
  isSearching,
  searchError,
  hasMore,
  activeProvider,
  search,
  loadMore,
  clearFilters,
  openProject,
  closeProject,
  availableMinecraftVersions,
  platforms,
} = useLauncher();

const installTarget = ref<ProjectSummary | null>(null);

const KIND_TABS: Array<{ id: ContentKind; icon: string }> = [
  { id: "modpack", icon: "lucide:package" },
  { id: "mod", icon: "lucide:puzzle" },
  { id: "resourcepack", icon: "lucide:palette" },
  { id: "shader", icon: "lucide:sparkles" },
  { id: "datapack", icon: "lucide:database" },
];

const PROVIDER_STYLE: Record<ProviderId, { icon: string; colour: string }> = {
  modrinth: { icon: "simple-icons:modrinth", colour: "#00C853" },
  curseforge: { icon: "simple-icons:curseforge", colour: "#FF6D00" },
  technic: { icon: "lucide:hammer", colour: "#F0A500" },
  ftb: { icon: "lucide:box", colour: "#3AA9F5" },
};

/**
 * Technic and FTB only publish whole modpacks, so their tabs collapse to that one kind rather
 * than showing four tabs that can never return a result.
 */
const availableKindTabs = computed(() => {
  const supported = activeProvider.value?.kinds;
  if (!supported || supported.length === 0) return KIND_TABS;
  return KIND_TABS.filter((tab) => supported.includes(tab.id));
});

const SORT_OPTIONS: Array<{ id: SortIndex; labelKey: string }> = [
  { id: "relevance", labelKey: "discover.sortRelevance" },
  { id: "downloads", labelKey: "discover.sortDownloads" },
  { id: "follows", labelKey: "discover.sortFollows" },
  { id: "newest", labelKey: "discover.sortNewest" },
  { id: "updated", labelKey: "discover.sortUpdated" },
];

/** Only release versions are offered as a filter; the full list is thousands of snapshots long. */
const gameVersionOptions = computed(() =>
  availableMinecraftVersions.value.filter((version) => version.type === "release").slice(0, 60),
);

const loaderOptions = computed(() => platforms.value.filter((platform) => platform.id !== "vanilla"));

const hasFilters = computed(() => Boolean(gameVersionFilter.value || loaderFilter.value));

/** Loaders only narrow mods and modpacks; packs and shaders are loader-independent. */
const supportsLoaderFilter = computed(() => kind.value === "mod" || kind.value === "modpack");

watch(availableKindTabs, (tabs) => {
  if (tabs.length > 0 && !tabs.some((tab) => tab.id === kind.value)) {
    kind.value = tabs[0]!.id;
  }
});

watch(supportsLoaderFilter, (supported) => {
  if (!supported) loaderFilter.value = "";
});

// The first search only runs once the tab is actually opened, so the launcher does not
// hit a provider on startup for a screen the user may never visit.
let hasSearched = false;
watch(
  activeTab,
  (tab) => {
    if (tab === "discover" && !hasSearched) {
      hasSearched = true;
      void search();
    }
  },
  { immediate: true },
);

onMounted(() => {
  if (activeTab.value === "discover" && !hasSearched) {
    hasSearched = true;
    void search();
  }
});

const openInstall = (project: ProjectSummary) => {
  installTarget.value = project;
};

const closeInstall = () => {
  installTarget.value = null;
};
</script>

<template>
  <div class="flex-1 flex-col overflow-hidden" :class="activeTab === 'discover' ? 'flex' : 'hidden'">
    <!-- Kind + provider selection -->
    <div class="flex shrink-0 flex-col gap-3 border-b border-white/[0.06] px-4 pt-4 pb-3 md:px-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap gap-2">
          <button
            v-for="tab in availableKindTabs"
            :key="tab.id"
            type="button"
            class="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[length:var(--text-sm)] font-semibold tracking-[0.07em] transition-all duration-200"
            :class="kind === tab.id
              ? 'border-[var(--accent-border-active)] bg-[var(--accent-bg-strong)] text-[var(--primary)]'
              : 'border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.07] hover:text-white/80'"
            @click="kind = tab.id"
          >
            <Icon :icon="tab.icon" class="size-[11px]" />
            {{ t(`discover.kinds.${tab.id}`) }}
          </button>
        </div>

        <div class="flex gap-2">
          <button
            v-for="entry in providers"
            :key="entry.id"
            type="button"
            class="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[length:var(--text-sm)] font-semibold tracking-[0.07em] transition-all duration-200"
            :class="provider === entry.id
              ? 'border-transparent'
              : 'border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.07] hover:text-white/80'"
            :style="provider === entry.id
              ? {
                  color: PROVIDER_STYLE[entry.id].colour,
                  background: `${PROVIDER_STYLE[entry.id].colour}18`,
                  borderColor: `${PROVIDER_STYLE[entry.id].colour}30`,
                }
              : undefined"
            :title="entry.available ? entry.displayName : entry.unavailableReason"
            @click="provider = entry.id"
          >
            <Icon :icon="PROVIDER_STYLE[entry.id].icon" class="size-[11px]" />
            {{ entry.displayName }}
            <span v-if="!entry.available" class="size-1.5 rounded-full bg-white/25" />
          </button>
        </div>
      </div>

      <!-- Search + filters -->
      <div class="flex flex-wrap items-center gap-2">
        <div class="relative min-w-[220px] flex-1">
          <Icon
            icon="lucide:search"
            class="pointer-events-none absolute top-1/2 left-3 size-[13px] -translate-y-1/2 text-white/30"
          />
          <input
            v-model="query"
            type="search"
            :placeholder="t('discover.searchPlaceholder', { kind: t(`discover.kinds.${kind}`) })"
            class="w-full rounded-lg border border-white/10 bg-[var(--surface-input)] py-2 pr-3 pl-9 text-[length:var(--text-base)] text-white placeholder-white/30 outline-none transition-colors focus:border-[var(--accent-border-focus)]"
          />
        </div>

        <select
          v-model="sort"
          class="rounded-lg border border-white/10 bg-[var(--surface-input)] px-3 py-2 text-[length:var(--text-sm)] text-white/80 outline-none transition-colors focus:border-[var(--accent-border-focus)]"
        >
          <option v-for="option in SORT_OPTIONS" :key="option.id" :value="option.id">
            {{ t(option.labelKey) }}
          </option>
        </select>

        <select
          v-model="gameVersionFilter"
          class="rounded-lg border border-white/10 bg-[var(--surface-input)] px-3 py-2 text-[length:var(--text-sm)] text-white/80 outline-none transition-colors focus:border-[var(--accent-border-focus)]"
        >
          <option value="">{{ t("discover.gameVersion") }}</option>
          <option v-for="version in gameVersionOptions" :key="version.id" :value="version.id">
            {{ version.id }}
          </option>
        </select>

        <select
          v-if="supportsLoaderFilter"
          v-model="loaderFilter"
          class="rounded-lg border border-white/10 bg-[var(--surface-input)] px-3 py-2 text-[length:var(--text-sm)] text-white/80 outline-none transition-colors focus:border-[var(--accent-border-focus)]"
        >
          <option value="">{{ t("discover.loader") }}</option>
          <option v-for="platform in loaderOptions" :key="platform.id" :value="platform.id">
            {{ platform.displayName }}
          </option>
        </select>

        <button
          v-if="hasFilters"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[length:var(--text-sm)] font-semibold text-white/50 transition-colors hover:bg-white/[0.08] hover:text-white/80"
          @click="clearFilters"
        >
          <Icon icon="lucide:filter-x" class="size-[12px]" />{{ t("discover.clearFilters") }}
        </button>
      </div>
    </div>

    <!-- Results -->
    <div class="flex-1 overflow-y-auto p-4 md:p-6">
      <!-- Provider offline -->
      <div
        v-if="activeProvider && !activeProvider.available"
        class="mx-auto flex max-w-[560px] flex-col items-center gap-3 py-16 text-center"
      >
        <Icon icon="lucide:plug-zap" class="size-10 text-white/15" />
        <p class="text-[length:var(--text-md)] font-semibold text-white/40">
          {{ t("discover.providerUnavailable", { provider: activeProvider.displayName }) }}
        </p>
        <p class="text-[length:var(--text-sm)] leading-[1.6] text-white/30">
          {{ activeProvider.unavailableReason }}
        </p>
      </div>

      <div v-else-if="searchError" class="flex flex-col items-center gap-3 py-16 text-center">
        <Icon icon="lucide:circle-alert" class="size-10 text-[var(--danger-text)]/60" />
        <p class="text-[length:var(--text-md)] text-white/50">{{ searchError }}</p>
        <button
          type="button"
          class="rounded-[7px] border border-white/10 bg-white/5 px-4 py-2 text-[length:var(--text-sm)] font-semibold text-white/60 hover:bg-white/10"
          @click="search()"
        >
          {{ t("common.retry") }}
        </button>
      </div>

      <div v-else-if="isSearching && hits.length === 0" class="flex items-center justify-center gap-2 py-16 text-white/40">
        <Icon icon="lucide:loader-2" class="size-5 animate-spin" />{{ t("common.loading") }}
      </div>

      <div v-else-if="hits.length === 0" class="flex flex-col items-center gap-2 py-16 text-center">
        <Icon icon="lucide:search-x" class="size-10 text-white/15" />
        <p class="text-[length:var(--text-md)] font-semibold text-white/35">{{ t("discover.noResults") }}</p>
        <p class="text-[length:var(--text-sm)] text-white/25">{{ t("discover.noResultsHint") }}</p>
      </div>

      <template v-else>
        <p class="mb-3 text-[length:var(--text-2xs)] tracking-[0.1em] text-white/30 uppercase">
          {{ t("discover.resultCount", { n: totalHits }) }}
        </p>

        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <ProjectCard
            v-for="hit in hits"
            :key="`${hit.provider}-${hit.projectId}`"
            :project="hit"
            @open="openProject"
            @install="openInstall"
          />
        </div>

        <div v-if="hasMore" class="mt-5 flex justify-center">
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-5 py-2.5 text-[length:var(--text-sm)] font-semibold text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white/90 disabled:opacity-40"
            :disabled="isSearching"
            @click="loadMore"
          >
            <Icon v-if="isSearching" icon="lucide:loader-2" class="size-[13px] animate-spin" />
            {{ t("common.loadMore") }}
          </button>
        </div>
      </template>
    </div>

    <ProjectDetailPanel @close="closeProject" @install="openInstall" />
    <InstallToProfileModal :project="installTarget" @close="closeInstall" />
  </div>
</template>
