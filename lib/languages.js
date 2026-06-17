export const LANGUAGES = [
  { code: 'en',      label: 'English',              native: 'English',        rtl: false },
  { code: 'es',      label: 'Spanish',              native: 'Español',        rtl: false },
  { code: 'ru',      label: 'Russian',              native: 'Русский',        rtl: false },
  { code: 'zh-hans', label: 'Chinese (Simplified)', native: '简体中文',        rtl: false },
  { code: 'sw',      label: 'Swahili',              native: 'Kiswahili',      rtl: false },
  { code: 'pt-br',   label: 'Portuguese (Brazil)',  native: 'Português (BR)', rtl: false },
  { code: 'ar',      label: 'Arabic',               native: 'العربية',         rtl: true  },
  { code: 'fr',      label: 'French',               native: 'Français',       rtl: false },
]

export const byCode = (code) => LANGUAGES.find((l) => l.code === code)
export const isRtl = (code) => byCode(code)?.rtl ?? false
