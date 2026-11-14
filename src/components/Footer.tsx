import React from 'react';
import { Globe, Moon, Sun } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { t } from '../i18n/translations';
import { BRAND_LOGO_PATH } from '../lib/utils';
import { PWAInstallButton } from './PWAInstallButton';

export const Footer: React.FC = () => {
  const { language, setLanguage, theme, toggleTheme, appSettings, navigate } = useApp();

  return (
    <footer className="mt-20 border-t border-[#172554]/10 bg-white/60 backdrop-blur-md dark:border-white/10 dark:bg-[#070E24]/80">
      <div className="mx-auto max-w-[1320px] px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5">
              <img
                src={appSettings.branding.logoUrl || BRAND_LOGO_PATH}
                alt="ASA,LEARN logo"
                className="h-10 w-auto object-contain"
              />
              <span className="font-display text-xl font-extrabold text-[#172554] dark:text-white">
                {appSettings.branding.siteName}
              </span>
            </div>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-[#64748B] dark:text-slate-300">
              {language === 'bn' ? appSettings.branding.footerTextBn : appSettings.branding.footerTextEn}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setLanguage(language === 'bn' ? 'en' : 'bn')}
                className="inline-flex items-center gap-2 rounded-xl border border-[#172554]/15 bg-white/80 px-3.5 py-2 text-xs font-semibold text-[#172554] transition hover:bg-[#E7F5FF] dark:border-white/15 dark:bg-slate-800/80 dark:text-[#BFE8FF]"
              >
                <Globe className="h-3.5 w-3.5" />
                <span>{language === 'bn' ? 'Switch to English' : 'বাংলায় দেখুন'}</span>
              </button>
              <button
                type="button"
                onClick={toggleTheme}
                className="inline-flex items-center gap-2 rounded-xl border border-[#172554]/15 bg-white/80 px-3.5 py-2 text-xs font-semibold text-[#172554] transition hover:bg-[#E7F5FF] dark:border-white/15 dark:bg-slate-800/80 dark:text-[#BFE8FF]"
              >
                {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
              </button>
              <PWAInstallButton />
            </div>
          </div>

          <div>
            <h3 className="font-display text-sm font-bold text-[#172033] dark:text-white">
              {language === 'bn' ? 'প্ল্যাটফর্ম' : 'Platform'}
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-[#64748B] dark:text-slate-300">
              <li>
                <button type="button" onClick={() => navigate('/classes')} className="hover:text-[#172554] dark:hover:text-[#BFE8FF]">
                  {t(language, 'footerClasses')}
                </button>
              </li>
              <li>
                <button type="button" onClick={() => navigate('/features')} className="hover:text-[#172554] dark:hover:text-[#BFE8FF]">
                  {t(language, 'footerFeatures')}
                </button>
              </li>
              <li>
                <button type="button" onClick={() => navigate('/about')} className="hover:text-[#172554] dark:hover:text-[#BFE8FF]">
                  {t(language, 'footerAbout')}
                </button>
              </li>
              <li>
                <button type="button" onClick={() => navigate('/dashboard')} className="hover:text-[#172554] dark:hover:text-[#BFE8FF]">
                  {t(language, 'navDashboard')}
                </button>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-display text-sm font-bold text-[#172033] dark:text-white">
              {language === 'bn' ? 'সহায়তা ও নীতিমালা' : 'Legal & Support'}
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-[#64748B] dark:text-slate-300">
              <li>
                <button type="button" onClick={() => navigate('/privacy')} className="hover:text-[#172554] dark:hover:text-[#BFE8FF]">
                  {t(language, 'footerPrivacy')}
                </button>
              </li>
              <li>
                <button type="button" onClick={() => navigate('/terms')} className="hover:text-[#172554] dark:hover:text-[#BFE8FF]">
                  {t(language, 'footerTerms')}
                </button>
              </li>
              <li>
                <button type="button" onClick={() => navigate('/admin')} className="hover:text-[#172554] dark:hover:text-[#BFE8FF]">
                  {language === 'bn' ? 'অ্যাডমিন পোর্টাল' : 'Admin Portal'}
                </button>
              </li>
              <li className="pt-1 text-xs">{appSettings.branding.contactEmail}</li>
              <li className="text-xs font-mono-nums">{appSettings.branding.contactPhone}</li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-[#172554]/10 pt-6 text-xs text-[#64748B] sm:flex-row dark:border-white/10 dark:text-slate-400">
          <p>
            © {new Date().getFullYear()} {appSettings.branding.siteName}. {t(language, 'footerRights')}
          </p>
          <p>{language === 'bn' ? appSettings.branding.taglineBn : appSettings.branding.taglineEn}</p>
        </div>
      </div>
    </footer>
  );
};
