<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue';
import { useLauncher } from '@/composables/useLauncher';
import { useShortcuts } from '@/composables/useShortcuts';
import type { MainTab } from '@/composables/types';
import AuroraBackground from '@/components/AuroraBackground.vue';
import TopBar from '@/components/TopBar.vue';
import CreateProfileModal from '@/components/CreateProfileModal.vue';
import HomeTab from '@/components/tabs/HomeTab.vue';
import ProfilesTab from '@/components/tabs/ProfilesTab.vue';
import SkinsTab from '@/components/tabs/SkinsTab.vue';
import DiscoverTab from '@/components/tabs/DiscoverTab.vue';
import SettingsTab from '@/components/tabs/SettingsTab.vue';
const { init, cleanup, accentColor, activeTab, selectedInstance, handleLaunch, authData } = useLauncher();

/** Ctrl+1…5 jump between the main tabs, in the order the navigation shows them. */
const TAB_ORDER: MainTab[] = ['home', 'profiles', 'skins', 'discover', 'settings'];

useShortcuts([
  ...TAB_ORDER.map((tab, index) => ({
    key: String(index + 1),
    ctrl: true,
    run: () => { activeTab.value = tab; },
  })),
  {
    key: ',',
    ctrl: true,
    run: () => { activeTab.value = 'settings'; },
  },
  {
    key: 'Enter',
    ctrl: true,
    run: () => {
      // Only when a profile is actually launchable; otherwise the shortcut would silently fail.
      if (!authData.value || !selectedInstance.value || selectedInstance.value.busy) return;
      if (selectedInstance.value.running) return;
      void handleLaunch(selectedInstance.value.name);
    },
  },
]);

function hexToRgb(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function deriveSecondary(hex: string): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h + 40, Math.min(s * 0.85, 1), Math.min(l * 1.05, 0.65));
}

function applyAccentColor(hex: string) {
  const root = document.documentElement;
  root.style.setProperty('--primary', hex);
  root.style.setProperty('--primary-rgb', hexToRgb(hex));
  root.style.setProperty('--secondary', deriveSecondary(hex));
}

watch(accentColor, (c) => applyAccentColor(c), { immediate: true });

onMounted(() => {
  init();
});
onBeforeUnmount(() => {
  cleanup();
});
</script>
<template>
  <div
    class="relative flex h-full w-full flex-col overflow-hidden bg-[var(--app-bg)] text-[var(--app-fg)]"
  >
    <AuroraBackground />
    <TopBar />
    <div class="relative z-10 flex flex-1 flex-col overflow-hidden">
      <HomeTab />
      <ProfilesTab />
      <SkinsTab />
      <DiscoverTab />
      <SettingsTab />
    </div>
    <CreateProfileModal />
  </div>
</template>
