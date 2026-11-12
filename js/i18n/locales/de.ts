// German catalogue. Missing keys fall back to English (see js/i18n/index.ts).
import type { MessageKey } from './en.js';

export const de: Partial<Record<MessageKey, string>> = {
  'settings.language.label': 'Sprache',
  'settings.language.help': 'Ändert die Sprache der App auf diesem Gerät. Gesundheitsdaten bleiben unverändert.',
  'settings.language.failed': 'Die Sprache konnte nicht gespeichert werden. Bitte erneut versuchen.',
  'settings.display.commit_failed': 'Die Anzeige-Einstellung konnte nicht bestätigt werden. Prüfe die aktuelle Einstellung, bevor du es erneut versuchst.',
};
