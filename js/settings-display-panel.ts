// Settings Display adapter: services own state, Svelte owns panel contents.
import { state } from './state.js';
import { isProductRecsEnabled } from './recommendation-preferences.js';
import { getAppVersionRuntime } from './utils-runtime.js';
import { getTimeFormat } from './theme.js';
import { isDebugMode } from './utils.js';
import type { DisplayPreferences } from './settings-display-contract.js';
import DisplaySettings, { mount, unmount, flushSync } from './components/DisplaySettings.svelte.native.js';
// Each native component bundles its own Svelte runtime, so mount it with its own helpers.
import LanguageSettings, { mount as mountLanguage, unmount as unmountLanguage, flushSync as flushLanguage } from './components/LanguageSettings.svelte.native.js';
import { getLocale } from './i18n/index.js';

let mounted: { refresh(next: DisplayPreferences): void } | null = null;
// The language picker sits above the Display settings in the same tab. A
// language change reloads the app, so it never needs a live refresh.
let languageMounted: Record<string, unknown> | null = null;
let mountedTarget: HTMLElement | null = null;

function snapshot(): DisplayPreferences {
  return {
    unitSystem: state.unitSystem,
    showAltUnits: !!state.showAltUnits,
    rangeMode: state.rangeMode,
    timeFormat: getTimeFormat() === '12h' ? '12h' : '24h',
    productRecs: isProductRecsEnabled(),
    debugMode: isDebugMode(),
    version: getAppVersionRuntime(),
  };
}

export function renderDisplaySettingsPanel(active: boolean): string {
  return `<div class="settings-tab-panel${active ? ' active' : ''}" data-tab-panel="display" id="settings-tab-display" role="tabpanel" aria-label="Display"></div>`;
}

export function updateDisplaySettingsPanel(): void {
  if (mounted && mountedTarget?.isConnected) {
    flushSync(() => mounted!.refresh(snapshot()));
  }
}

export function disposeDisplaySettingsPanel(): void {
  if (mounted) {
    // No outro transitions: detach effects before the legacy shell replaces DOM.
    void unmount(mounted);
    flushSync();
  }
  if (languageMounted) {
    void unmountLanguage(languageMounted);
    flushLanguage();
  }
  mounted = null;
  languageMounted = null;
  mountedTarget = null;
}

export function mountDisplaySettingsPanel(): void {
  const target = document.getElementById('settings-tab-display');
  if (!target) return;
  if (target === mountedTarget) {
    updateDisplaySettingsPanel();
    return;
  }
  disposeDisplaySettingsPanel();
  mountedTarget = target;
  mounted = mount(DisplaySettings, { target, props: { initial: snapshot() } });
  const anchor = target.firstChild;
  languageMounted = mountLanguage(LanguageSettings, { target, ...(anchor ? { anchor } : {}), props: { current: getLocale() } });
  // Keep the legacy caller's synchronous DOM/focus and commit-receipt contract.
  flushSync();
  flushLanguage();
}
