<script lang="ts">
  import { t, LOCALE_NAMES, SUPPORTED_LOCALES, type Locale } from '../i18n/index.js';

  let { current }: { current: Locale } = $props();

  // Same compact toggle styling as the Display settings below it.
  const control = 'gb:display:focus-visible:outline-2 gb:display:focus-visible:outline-offset-2 gb:display:focus-visible:outline-accent gb:display:motion-reduce:transition-none gb:display:[@media(pointer:coarse)]:min-h-11 gb:display:[@media(pointer:coarse)]:min-w-11';
</script>

<div class="settings-row">
  <div class="settings-section">
    <div id="display-language-label" class="settings-label">{t('settings.language.label')}</div>
    <div class="unit-toggle" role="group" aria-labelledby="display-language-label" aria-describedby="display-language-help">
      {#each SUPPORTED_LOCALES as code (code)}
        <button type="button" class="unit-toggle-btn{current === code ? ' active' : ''} {control}" aria-pressed={current === code} lang={code} data-i18n-skip data-locale={code} data-settings-action="set-locale">{LOCALE_NAMES[code]}</button>
      {/each}
    </div>
    <div id="display-language-help" class="settings-copy-desc">{t('settings.language.help')}</div>
  </div>
</div>
