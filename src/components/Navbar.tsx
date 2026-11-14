import React, { useState } from 'react';
import { Globe, Menu, Moon, Sun, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { t } from '../i18n/translations';
import { BRAND_LOGO_PATH } from '../lib/utils';

export const Navbar: React.FC = () => {
  const { language, setLanguage, theme, toggleTheme, userProfile, isAdmin, appSettings, route, navigate } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { label: t(language, 'navHome'), path: '/' },
    { label: t(language, 'navClasses'), path: '/classes' },
    { label: language === 'bn' ? 'থ্রিডি ল্যাব' : 'AI 3D Lab', path: '/3d-lab' },
    { label: t(language, 'navFeatures'), path: '/features' },
    ...(isAdmin ? [{ label: t(language, 'navAdmin'), path: '/admin' }] : []),
  ];

  const handleLink = (path: string) => {
    setMobileOpen(false);
    navigate(path);
  };

  return (
    <header className="glass-nav sticky top-0 z-40 w-full">
      <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-4 px-4 py-1.5 sm:px-6 lg:px-8">
        {/* Zone 1: 5x Larger Preserved Logo + Crisp Minimal Brand Text */}
        <button
          type="button"
          onClick={() => handleLink('/')}
          className="flex items-center gap-2.5 text-left whitespace-nowrap shrink-0 rounded-xl focus-visible:outline-2 focus-visible:outline-[#263B91]"
        >
          <img
            src={appSettings.branding.logoUrl || BRAND_LOGO_PATH}
            alt="ASA,LEARN logo"
            className="h-14 w-auto sm:h-20 object-contain shrink-0"
          />
          <span className="font-display text-[11px] sm:text-sm font-extrabold tracking-tight text-[#172554] dark:text-white whitespace-nowrap shrink-0">
            {appSettings.branding.siteName || 'ASA,LEARN'}
          </span>
        </button>

        {/* Zone 2: Minimal Single-Line Desktop Nav Links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#172033]/80 dark:text-slate-200">
          {navItems.map((item) => {
            const active = route === item.path || (item.path !== '/' && route.startsWith(item.path));
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => handleLink(item.path)}
                className={`whitespace-nowrap shrink-0 pb-0.5 transition-colors focus-visible:outline-2 focus-visible:outline-[#263B91] ${
                  active
                    ? 'border-b-2 border-[#172554] font-semibold text-[#172554] dark:border-[#BFE8FF] dark:text-[#BFE8FF]'
                    : 'hover:text-[#172554] dark:hover:text-[#BFE8FF]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Quick Controls + Primary Action */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void setLanguage(language === 'bn' ? 'en' : 'bn')}
            aria-label="Switch Language"
            className="hidden sm:inline-flex items-center gap-1 rounded-xl border border-[#172554]/10 bg-white/75 px-2.5 py-2 text-xs font-semibold text-[#172554] transition hover:bg-[#E7F5FF] dark:border-white/10 dark:bg-slate-800/80 dark:text-[#BFE8FF]"
          >
            <Globe className="h-3.5 w-3.5" />
            <span>{language === 'bn' ? 'EN' : 'বাংলা'}</span>
          </button>

          <button
            type="button"
            onClick={() => void toggleTheme()}
            aria-label="Toggle Theme"
            className="hidden sm:inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#172554]/10 bg-white/75 text-[#172554] transition hover:bg-[#E7F5FF] dark:border-white/10 dark:bg-slate-800/80 dark:text-[#BFE8FF]"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={() => handleLink(userProfile ? '/dashboard' : '/login')}
            className="hidden md:inline-flex items-center justify-center rounded-xl bg-[#172554] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#263B91] focus-visible:outline-2 focus-visible:outline-[#BFE8FF] dark:bg-[#BFE8FF] dark:text-[#172554] dark:hover:bg-[#E7F5FF] whitespace-nowrap shrink-0"
          >
            {userProfile ? userProfile.fullName.split(' ')[0] : t(language, 'login')}
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle navigation menu"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#172554]/10 bg-white/70 text-[#172554] md:hidden dark:border-white/10 dark:bg-slate-800/70 dark:text-white"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Responsive Mobile Drawer */}
      {mobileOpen && (
        <div className="border-t border-[#172554]/10 bg-white/95 px-4 py-4 backdrop-blur-xl md:hidden dark:border-white/10 dark:bg-[#0A1128]/95">
          <div className="flex flex-col gap-1.5">
            {navItems.map((item) => (
              <button
                key={item.path}
                type="button"
                onClick={() => handleLink(item.path)}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[#172033] hover:bg-[#E7F5FF] dark:text-slate-100 dark:hover:bg-slate-800"
              >
                <span>{item.label}</span>
              </button>
            ))}

            <button
              type="button"
              onClick={() => handleLink('/about')}
              className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[#172033] hover:bg-[#E7F5FF] dark:text-slate-100 dark:hover:bg-slate-800"
            >
              <span>{t(language, 'navAbout')}</span>
            </button>

            <div className="my-2 h-px bg-[#172554]/10 dark:bg-white/10" />

            <div className="flex items-center justify-between gap-2 px-1">
              <button
                type="button"
                onClick={() => void setLanguage(language === 'bn' ? 'en' : 'bn')}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#172554]/15 px-3 py-2 text-xs font-semibold text-[#172554] dark:border-white/15 dark:text-[#BFE8FF]"
              >
                <Globe className="h-3.5 w-3.5" />
                <span>{language === 'bn' ? 'English' : 'বাংলা'}</span>
              </button>
              <button
                type="button"
                onClick={() => void toggleTheme()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#172554]/15 px-3 py-2 text-xs font-semibold text-[#172554] dark:border-white/15 dark:text-[#BFE8FF]"
              >
                {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
