// Public boundary for the generated native-browser component bundle.
// svelte-check validates the original component and these props separately.
import type { Component } from 'svelte';
import type { Locale } from '../i18n/index.js';
declare const LanguageSettings: Component<{ current: Locale }>;
export default LanguageSettings;
export { mount, unmount, flushSync } from 'svelte';
