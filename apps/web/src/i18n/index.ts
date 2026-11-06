import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import ur from './locales/ur.json';

export const LANGUAGES = {
  en: { dir: 'ltr' },
  ur: { dir: 'rtl' },
} as const;

export type Language = keyof typeof LANGUAGES;

export const resources = {
  en: { translation: en },
  ur: { translation: ur },
} as const;

/** Keeps <html lang/dir> in sync with the active language (RTL for Urdu). */
function applyDocumentLanguage(lng: string): void {
  const lang: Language = lng in LANGUAGES ? (lng as Language) : 'en';
  document.documentElement.lang = lang;
  document.documentElement.dir = LANGUAGES[lang].dir;
}

i18n.on('languageChanged', applyDocumentLanguage);

void i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
