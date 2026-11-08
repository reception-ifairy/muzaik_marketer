// App identity and locale: the one file to edit when starting a new project from this template.
// Shared by the server (prompts, web-search location, storage) and the client (UI copy).

export const APP = {
  /** Shown in the nav rail, login screen and browser tab. */
  name: 'MuzaIK Marketer',
  /** One line under the name on the login screen. */
  tagline: 'Zwiastuny i materiały wideo kanału MuzaIK',
  /** What the assistant calls itself in replies and in the activity timeline ("Co robi …"). */
  assistantName: 'DJ MuzaIK',
  /** Short id used for storage: table prefix (`<id>_settings`), settings file (`data/<id>-settings.json`), cookie name. */
  id: 'muzaik_marketer',
  /** UI language and date formatting. Prompts are written in Polish; change them together with this. */
  locale: 'pl-PL',
  timezone: 'Europe/Warsaw',
  /** Where web searches are localised (Claude web_search / OpenAI web_search user_location). */
  userLocation: { type: 'approximate', country: 'PL', city: 'Warszawa', timezone: 'Europe/Warsaw' },
} as const;

export type Effort = 'low' | 'medium' | 'high';
