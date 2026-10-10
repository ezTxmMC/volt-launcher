<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import { Icon } from "@iconify/vue";
import { useLauncher } from '@/composables/useLauncher';
import TaskCenter from '@/components/TaskCenter.vue';
const {
  t,
  authData,
  isAuthenticating,
  activeTab,
  playerAvatarUrl,
  playerAvatarFallback,
  notifications,
  unreadCount,
  formatNotifTime,
  clearNotification,
  clearAllNotifications,
  handleLogin,
  handleLogout,
  handleImgError,
  handleWindowMinimize,
  handleWindowMaximize,
  handleWindowClose,
} = useLauncher();

const showAccountMenu = ref(false);
const accountMenuRef = ref<HTMLElement | null>(null);
const showNotifMenu = ref(false);
const notifMenuRef = ref<HTMLElement | null>(null);

const toggleAccountMenu = () => {
  if (authData.value) {
    showAccountMenu.value = !showAccountMenu.value;
  } else {
    handleLogin();
  }
};

const onClickOutside = (e: MouseEvent) => {
  if (accountMenuRef.value && !accountMenuRef.value.contains(e.target as Node)) {
    showAccountMenu.value = false;
  }
  if (notifMenuRef.value && !notifMenuRef.value.contains(e.target as Node)) {
    showNotifMenu.value = false;
  }
};

onMounted(() => document.addEventListener('click', onClickOutside));
onBeforeUnmount(() => document.removeEventListener('click', onClickOutside));

const navItems = computed(() => [
  { id: 'home', label: t('nav.home'), icon: 'lucide:play' },
  { id: 'profiles', label: t('nav.profiles'), icon: 'lucide:layers' },
  { id: 'skins', label: t('nav.skins'), icon: 'lucide:shirt' },
  { id: 'discover', label: t('nav.discover'), icon: 'lucide:search' },
  { id: 'settings', label: t('nav.settings'), icon: 'lucide:settings' },
]);

const isMac = navigator.userAgent.toLowerCase().includes('mac');
</script>
<template>
  <div class="relative">
    <div v-if="isMac" class="h-8" style="-webkit-app-region: drag"></div>
    <BaseHeader class="flex items-center w-full px-4 pt-1" style="-webkit-app-region: drag">

      <!-- Navigation -->
      <nav class="flex gap-2" style="-webkit-app-region: no-drag">
        <NavButton
          v-for="item in navItems"
          :key="item.id"
          :item="item"
          :active-tab="activeTab"
          @select="activeTab = $event"
        />
      </nav>
      <div class="ml-auto flex items-center gap-2" style="-webkit-app-region: no-drag">
        <TaskCenter />
        <div ref="notifMenuRef" class="relative">
          <button
            type="button"
            class="relative flex size-8 items-center justify-center rounded-[7px] border border-white/10 bg-white/5 text-white/40 transition-all duration-200 hover:bg-white/10 hover:text-white"
            title="Notifications"
            @click="showNotifMenu = !showNotifMenu"
          >
            <Icon icon="lucide:bell" class="size-[14px]" />
            <span
              v-if="unreadCount > 0"
              class="absolute -right-[3px] -top-[3px] flex size-[16px] items-center justify-center rounded-full bg-[var(--primary)] text-[9px] font-bold leading-none text-white shadow-[var(--shadow-accent-md)]"
            >{{ unreadCount > 9 ? '9+' : unreadCount }}</span>
          </button>
          <Transition
            enter-active-class="transition duration-150 ease-out"
            enter-from-class="scale-95 opacity-0"
            enter-to-class="scale-100 opacity-100"
            leave-active-class="transition duration-100 ease-in"
            leave-from-class="scale-100 opacity-100"
            leave-to-class="scale-95 opacity-0"
          >
            <div
              v-if="showNotifMenu"
              class="absolute right-0 top-full z-50 mt-2 w-[300px] origin-top-right overflow-hidden rounded-lg border border-white/10 bg-[var(--header-bg)] shadow-xl backdrop-blur-2xl"
            >
              <div class="flex items-center justify-between border-b border-white/5 px-3 py-2.5">
                <span class="text-[length:var(--text-base)] font-semibold text-white">Notifications</span>
                <button
                  v-if="notifications.length > 0"
                  type="button"
                  class="text-[11px] text-white/40 transition-colors hover:text-white/70"
                  @click="clearAllNotifications()"
                >Clear all</button>
              </div>
              <div class="max-h-[280px] overflow-y-auto">
                <div v-if="notifications.length === 0" class="px-3 py-6 text-center text-[length:var(--text-base)] text-white/30">
                  No notifications
                </div>
                <div
                  v-for="notif in notifications"
                  :key="notif.id"
                  class="group flex items-start gap-2.5 border-b border-white/5 px-3 py-2.5 last:border-0"
                >
                  <div class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full" :class="notif.type === 'error' ? 'bg-[var(--danger)]/15 text-[var(--danger)]' : 'bg-[var(--primary)]/15 text-[var(--primary)]'">
                    <Icon :icon="notif.type === 'error' ? 'lucide:alert-circle' : 'lucide:info'" class="size-3" />
                  </div>
                  <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span class="break-words text-[length:var(--text-base)] leading-snug text-white/80">{{ notif.message }}</span>
                    <span class="text-[11px] text-white/30">{{ formatNotifTime(notif.timestamp) }}</span>
                  </div>
                  <button
                    type="button"
                    class="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded text-white/20 opacity-0 transition-all hover:text-white/60 group-hover:opacity-100"
                    @click="clearNotification(notif.id)"
                  >
                    <Icon icon="lucide:x" class="size-3" />
                  </button>
                </div>
              </div>
            </div>
          </Transition>
        </div>
        <div ref="accountMenuRef" class="relative">
          <button
            type="button"
            class="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-[11px] py-[5px] pl-[6px] transition-all duration-200 hover:bg-white/10"
            @click="toggleAccountMenu"
          >
            <img
              :src="playerAvatarUrl"
              :data-fallback-src="playerAvatarFallback"
              alt=""
              class="size-6 rounded-[4px] object-cover [image-rendering:pixelated]"
              @error="handleImgError"
            />
            <span class="text-[length:var(--text-base)] font-semibold tracking-[0.07em] text-white">
              {{ authData ? authData.username.toUpperCase() : (isAuthenticating ? 'WAITING…' : 'LOGIN') }}
            </span>
            <Icon icon="lucide:chevron-down" class="size-[9px] text-white/40 transition-transform duration-200" :class="showAccountMenu ? 'rotate-180' : ''" />
          </button>
          <Transition
            enter-active-class="transition duration-150 ease-out"
            enter-from-class="scale-95 opacity-0"
            enter-to-class="scale-100 opacity-100"
            leave-active-class="transition duration-100 ease-in"
            leave-from-class="scale-100 opacity-100"
            leave-to-class="scale-95 opacity-0"
          >
            <div
              v-if="showAccountMenu"
              class="absolute right-0 top-full z-50 mt-2 min-w-[180px] origin-top-right overflow-hidden rounded-lg border border-white/10 bg-[var(--header-bg)] shadow-xl backdrop-blur-2xl"
            >
              <div class="flex items-center gap-2.5 border-b border-white/5 px-3 py-2.5">
                <img
                  :src="playerAvatarUrl"
                  :data-fallback-src="playerAvatarFallback"
                  alt=""
                  class="size-7 rounded-[4px] object-cover [image-rendering:pixelated]"
                  @error="handleImgError"
                />
                <div class="flex flex-col">
                  <span class="text-[length:var(--text-base)] font-semibold leading-tight text-white">{{ authData?.username }}</span>
                  <span class="text-[11px] leading-tight text-white/40">Microsoft Account</span>
                </div>
              </div>
              <div class="py-1">
                <button
                  type="button"
                  class="flex w-full items-center gap-2.5 px-3 py-2 text-[length:var(--text-base)] text-white/70 transition-colors duration-150 hover:bg-white/5 hover:text-white"
                  @click="showAccountMenu = false; handleLogin()"
                >
                  <Icon icon="lucide:repeat" class="size-[14px]" />
                  Switch Account
                </button>
                <button
                  type="button"
                  class="flex w-full items-center gap-2.5 px-3 py-2 text-[length:var(--text-base)] text-[var(--danger)] transition-colors duration-150 hover:bg-white/5"
                  @click="showAccountMenu = false; handleLogout()"
                >
                  <Icon icon="lucide:log-out" class="size-[14px]" />
                  Logout
                </button>
              </div>
            </div>
          </Transition>
        </div>

        <!-- Windows controls (Right aligned) -->
        <div v-if="!isMac" class="ml-1 flex items-center gap-[3px]" style="-webkit-app-region: no-drag">
          <button type="button" class="group cursor-pointer flex size-[30px] items-center justify-center rounded-[6px] transition-colors duration-150 hover:bg-white/10" title="Minimize" @click="handleWindowMinimize">
            <Icon icon="lucide:minus" class="size-[13px] text-white/40 transition-colors group-hover:text-white/80" />
          </button>
          <button type="button" class="group cursor-pointer flex size-[30px] items-center justify-center rounded-[6px] transition-colors duration-150 hover:bg-white/10" title="Maximize" @click="handleWindowMaximize">
            <Icon icon="lucide:square" class="size-[11px] text-white/40 transition-colors group-hover:text-white/80" />
          </button>
          <button type="button" class="group cursor-pointer flex size-[30px] items-center justify-center rounded-[6px] transition-colors duration-150 hover:bg-[#e81123]/80" title="Close" @click="handleWindowClose">
            <Icon icon="lucide:x" class="size-[13px] text-white/40 transition-colors group-hover:text-white" />
          </button>
        </div>
      </div>
    </BaseHeader>
  </div>
</template>
