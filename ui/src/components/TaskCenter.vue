<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { Icon } from "@iconify/vue";
import { useLauncher, type LauncherTask } from "@/composables/useLauncher";

/**
 * A single view of everything the launcher is doing.
 *
 * Each feature used to report progress only on its own screen, so a backup started from a profile
 * became invisible the moment the user navigated away. This reads the shared task registry, so
 * the work stays visible wherever they are.
 */
const {
  t,
  tasks,
  runningTasks,
  runningCount,
  hasFailedTasks,
  overallPercent,
  cancelTask,
  dismissTask,
  clearFinishedTasks,
  formatRelativeDate,
} = useLauncher();

const open = ref(false);
const menuRef = ref<HTMLElement | null>(null);

const KIND_ICONS: Record<string, string> = {
  backup: "lucide:archive",
  restore: "lucide:rotate-ccw",
  duplicate: "lucide:copy",
  verify: "lucide:shield-check",
  repair: "lucide:wrench",
  update: "lucide:download",
  install: "lucide:package",
  java: "lucide:coffee",
};

const iconFor = (task: LauncherTask) => KIND_ICONS[task.kind] ?? "lucide:activity";

/** Falls back to the raw identifier so an unmapped stage still says something. */
const stageLabel = (task: LauncherTask) => {
  if (!task.stage) return "";
  const key = `tasks.stage.${task.stage}`;
  const translated = t(key);
  return translated === key ? task.stage : translated;
};

const stateLabel = (task: LauncherTask) => t(`tasks.state.${task.state}`);

const finishedTasks = computed(() => tasks.value.filter((task) => task.state !== "running"));

const onClickOutside = (event: MouseEvent) => {
  if (menuRef.value && !menuRef.value.contains(event.target as Node)) open.value = false;
};

onMounted(() => document.addEventListener("click", onClickOutside));
onBeforeUnmount(() => document.removeEventListener("click", onClickOutside));
</script>

<template>
  <div ref="menuRef" class="relative">
    <button
      type="button"
      class="relative flex size-8 items-center justify-center rounded-[7px] border border-white/10 bg-white/5 text-white/40 transition-all duration-200 hover:bg-white/10 hover:text-white"
      :title="t('tasks.title')"
      @click="open = !open"
    >
      <Icon
        :icon="runningCount > 0 ? 'lucide:loader-2' : 'lucide:activity'"
        class="size-[14px]"
        :class="runningCount > 0 ? 'animate-spin text-[var(--primary)]' : ''"
      />
      <span
        v-if="runningCount > 0"
        class="absolute -right-[3px] -top-[3px] flex size-[16px] items-center justify-center rounded-full bg-[var(--primary)] text-[9px] font-bold leading-none text-white shadow-[var(--shadow-accent-md)]"
        >{{ runningCount > 9 ? "9+" : runningCount }}</span
      >
      <span
        v-else-if="hasFailedTasks"
        class="absolute -right-[3px] -top-[3px] size-[8px] rounded-full bg-[var(--danger)]"
      />
    </button>

    <!-- A thin progress line under the button, so the overall state reads at a glance. -->
    <div
      v-if="runningCount > 0 && overallPercent >= 0"
      class="pointer-events-none absolute inset-x-1 -bottom-1 h-[2px] overflow-hidden rounded-full bg-white/10"
    >
      <div class="h-full rounded-full bg-[var(--primary)] transition-[width] duration-300" :style="{ width: `${overallPercent}%` }" />
    </div>

    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="scale-95 opacity-0"
      enter-to-class="scale-100 opacity-100"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="scale-100 opacity-100"
      leave-to-class="scale-95 opacity-0"
    >
      <div
        v-if="open"
        class="absolute right-0 top-full z-50 mt-2 w-[340px] origin-top-right overflow-hidden rounded-lg border border-white/10 bg-[var(--header-bg)] shadow-xl backdrop-blur-2xl"
      >
        <div class="flex items-center justify-between border-b border-white/5 px-3 py-2.5">
          <span class="text-[length:var(--text-base)] font-semibold text-white">{{ t("tasks.title") }}</span>
          <button
            v-if="finishedTasks.length > 0"
            type="button"
            class="text-[11px] text-white/40 transition-colors hover:text-white/70"
            @click="clearFinishedTasks()"
          >
            {{ t("tasks.clearFinished") }}
          </button>
        </div>

        <div class="max-h-[320px] overflow-y-auto">
          <div v-if="tasks.length === 0" class="px-3 py-6 text-center text-[length:var(--text-base)] text-white/30">
            {{ t("tasks.empty") }}
          </div>

          <div
            v-for="task in tasks"
            :key="task.id"
            class="group flex items-start gap-2.5 border-b border-white/5 px-3 py-2.5 last:border-0"
          >
            <div
              class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full"
              :class="task.state === 'failed'
                ? 'bg-[var(--danger)]/15 text-[var(--danger)]'
                : task.state === 'done'
                  ? 'bg-[var(--success-bg)] text-[var(--accent)]'
                  : 'bg-[var(--primary)]/15 text-[var(--primary)]'"
            >
              <Icon :icon="iconFor(task)" class="size-3" :class="task.state === 'running' ? 'animate-pulse' : ''" />
            </div>

            <div class="flex min-w-0 flex-1 flex-col gap-1">
              <span class="truncate text-[length:var(--text-base)] leading-snug text-white/80">{{ task.title }}</span>

              <div v-if="task.state === 'running'" class="flex flex-col gap-1">
                <div class="h-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    class="h-full rounded-full bg-[var(--primary)]"
                    :class="task.percent < 0 ? 'w-1/3 animate-[shimmer_1.6s_ease-in-out_infinite]' : 'transition-[width] duration-200'"
                    :style="task.percent >= 0 ? { width: `${task.percent}%` } : undefined"
                  />
                </div>
                <span class="text-[11px] text-white/35">
                  {{ stageLabel(task) }}
                  <template v-if="task.total > 0"> · {{ task.completed }} / {{ task.total }}</template>
                </span>
              </div>

              <span v-else class="text-[11px]" :class="task.state === 'failed' ? 'text-[var(--danger-text,#f87171)]' : 'text-white/35'">
                {{ stateLabel(task) }}
                <template v-if="task.message"> · {{ task.message }}</template>
                <template v-else-if="task.finishedAt"> · {{ formatRelativeDate(task.finishedAt) }}</template>
              </span>
            </div>

            <button
              v-if="task.state === 'running' && task.cancellable"
              type="button"
              class="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded text-white/20 transition-all hover:text-white/60"
              :title="t('tasks.cancel')"
              @click="cancelTask(task.id)"
            >
              <Icon icon="lucide:x" class="size-3" />
            </button>
            <button
              v-else-if="task.state !== 'running'"
              type="button"
              class="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded text-white/20 opacity-0 transition-all hover:text-white/60 group-hover:opacity-100"
              :title="t('tasks.dismiss')"
              @click="dismissTask(task.id)"
            >
              <Icon icon="lucide:x" class="size-3" />
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
