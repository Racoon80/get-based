// French catalogue. Missing keys fall back to English (see js/i18n/index.ts).
import type { MessageKey } from './en.js';

export const fr: Partial<Record<MessageKey, string>> = {
  'settings.language.label': 'Langue',
  'settings.language.help': 'Change la langue de l’application sur cet appareil. Les données de santé ne sont pas modifiées.',
  'settings.language.failed': 'La langue n’a pas pu être enregistrée. Réessayez.',
  'settings.display.commit_failed': 'Le réglage d’affichage n’a pas pu être confirmé. Vérifiez le réglage actuel avant de réessayer.',
};
