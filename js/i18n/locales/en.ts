// English source catalogue. Keys are grouped by UI area: "<area>.<item>".
// Placeholders use {name}. Plurals use "<key>.one" / "<key>.other".
export const en = {
  'settings.language.label': 'Language',
  'settings.language.help': 'Changes the language of the app on this device. Health data is not changed.',
  'settings.language.failed': 'The language could not be saved. Try again.',
  'settings.display.commit_failed': 'The display preference could not be confirmed. Check the current setting before trying again.',
} as const;

export type MessageKey = keyof typeof en;
