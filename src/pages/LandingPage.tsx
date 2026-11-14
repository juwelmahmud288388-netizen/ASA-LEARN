import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Bot,
  Box,
  Compass,
  GraduationCap,
  Layers,
  Play,
  Search,
  Sparkles,
  Zap,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { t } from '../i18n/translations';
import { getYouTubeThumbnail } from '../lib/utils';

export const LandingPage: React.FC = () => {
  const {
    language,
    appSettings,
    categories,
    classes,
    subjects,
    chapters,
    lessons,
    navigate,
    openAiWithLesson,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const results: Array<{ id: string; title: string; subtitle: string; path: string }> = [];

    for (const c of classes) {
      if (c.title.toLowerCase().includes(q) || c.titleBn.toLowerCase().includes(q)) {
        results.push({
          id: c.classId,
          title: language === 'bn' ? c.titleBn : c.title,
          subtitle: language === 'bn' ? 'শ্রেণি' : 'Class',
          path: `/classes/${c.classId}`,
        });
      }
    }
    for (const s of subjects) {
      if (s.title.toLowerCase().includes(q) || s.titleBn.toLowerCase().includes(q)) {
        const cls = classes.find((c) => c.classId === s.classId);
        results.push({
          id: s.subjectId,
          title: language === 'bn' ? s.titleBn : s.title,
          subtitle: cls ? (language === 'bn' ? cls.titleBn : cls.title) : s.classId,
          path: `/classes/${s.classId}/${s.subjectId}`,
        });
      }
    }
    for (const ch of chapters) {
      if (ch.title.toLowerCase().includes(q) || ch.titleBn.toLowerCase().includes(q)) {
        results.push({
          id: ch.chapterId,
          title: language === 'bn' ? ch.titleBn : ch.title,
          subtitle: language === 'bn' ? 'অধ্যায়' : 'Chapter',
          path: `/classes/${ch.classId}/${ch.subjectId}`,
        });
      }
    }
    for (const l of lessons) {
      if (l.title.toLowerCase().includes(q) || l.titleBn.toLowerCase().includes(q)) {
        results.push({
          id: l.lessonId,
          title: language === 'bn' ? l.titleBn : l.title,
          subtitle: l.has3dMode ? 'Video + 3D' : l.category,
          path: `/lesson/${l.lessonId}`,
        });
      }
    }
    return results.slice(0, 7);
  }, [searchQuery, classes, subjects, chapters, lessons, language]);

  const featuredLessons = useMemo(() => {
    const picked = lessons.filter((l) => l.featured);
    return (picked.length > 0 ? picked : lessons).slice(0, 6);
  }, [lessons]);

  const classIcons = [BookOpen, Compass, Layers, GraduationCap, Sparkles];

  const getCategoryIcon = (iconName?: string) => {
    if (iconName === 'zap') return Zap;
    if (iconName === 'box') return Box;
    return Layers;
  };

  return (
    <div className="mx-auto max-w-[1280px] px-4 pb-12 sm:px-6 lg:px-8">
      {/* Subtle Single-Line Announcement */}
      {appSettings.homepageSettings.showAnnouncementBanner && (
        <div className="mt-4 rounded-2xl border border-[#172554]/10 bg-[#E7F5FF]/75 px-4 py-2 text-center text-xs font-medium text-[#172554] backdrop-blur-md dark:border-[#BFE8FF]/15 dark:bg-slate-900/70 dark:text-[#BFE8FF]">
          {language === 'bn'
            ? appSettings.homepageSettings.announcementBannerBn
            : appSettings.homepageSettings.announcementBannerEn}
        </div>
      )}

      {/* Calm Minimal Hero Section */}
      <section className="mt-6 glass-surface rounded-3xl p-6 sm:p-10">
        <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <p className="text-xs font-semibold tracking-wide text-[#263B91] dark:text-[#BFE8FF]">
              {t(language, 'heroBadge')}
            </p>
            <h1 className="font-display mt-2 text-3xl font-extrabold leading-[1.15] text-[#172033] sm:text-4xl dark:text-white text-balance">
              {language === 'bn'
                ? appSettings.homepageSettings.heroTitleBn
                : appSettings.homepageSettings.heroTitleEn}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#64748B] sm:text-base dark:text-slate-300">
              {language === 'bn'
                ? appSettings.homepageSettings.heroSubtitleBn
                : appSettings.homepageSettings.heroSubtitleEn}
            </p>

            {/* Instant Search */}
            <div className="relative mt-6 max-w-xl">
              <div className="flex items-center rounded-2xl border border-[#172554]/15 bg-white/95 px-4 py-2.5 shadow-xs focus-within:border-[#263B91] dark:border-white/15 dark:bg-slate-900/90">
                <Search className="mr-3 h-4 w-4 shrink-0 text-[#64748B]" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t(language, 'searchPlaceholder')}
                  className="w-full bg-transparent text-sm text-[#172033] placeholder:text-[#64748B] focus:outline-none dark:text-white"
                />
              </div>

              {searchQuery.trim().length > 0 && (
                <div className="absolute left-0 right-0 top-full z-30 mt-2 rounded-2xl border border-[#172554]/10 bg-white/95 p-2 shadow-xl backdrop-blur-xl dark:border-white/15 dark:bg-slate-900/95">
                  {searchResults.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-[#64748B]">{t(language, 'noResults')}</p>
                  ) : (
                    searchResults.map((res) => (
                      <button
                        key={`${res.path}-${res.id}`}
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          navigate(res.path);
                        }}
                        className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-[#E7F5FF] dark:hover:bg-slate-800"
                      >
                        <span className="font-medium text-[#172033] dark:text-white">{res.title}</span>
                        <span className="text-xs text-[#64748B] dark:text-slate-400">{res.subtitle}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => navigate('/classes')}
                className="inline-flex items-center gap-2 rounded-xl bg-[#172554] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#263B91] dark:bg-[#BFE8FF] dark:text-[#172554]"
              >
                <span>{t(language, 'heroCtaPrimary')}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => navigate('/lesson/les-sample-3d-demo')}
                className="inline-flex items-center gap-2 rounded-xl border border-[#172554]/20 bg-white/85 px-5 py-3 text-sm font-semibold text-[#172554] transition hover:bg-[#E7F5FF] dark:border-white/15 dark:bg-slate-800/80 dark:text-white dark:hover:bg-slate-800"
              >
                <Box className="h-4 w-4" />
                <span>{t(language, 'heroCtaSecondary')}</span>
              </button>
            </div>
          </div>

          {/* Right Quick Highlight Card */}
          <div className="lg:col-span-5">
            <button
              type="button"
              onClick={() => navigate('/lesson/les-sample-3d-demo')}
              className="group relative block w-full overflow-hidden rounded-2xl border border-[#172554]/10 bg-[#091332] text-left shadow-md"
            >
              <img
                src="/src/assets/images/hero_learning_workspace_1794668388489.jpg"
                alt="Interactive Video & 3D Lab Demo"
                referrerPolicy="no-referrer"
                className="h-60 w-full object-cover opacity-80 transition duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#091332] via-[#091332]/40 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#BFE8FF] px-2.5 py-1 text-[11px] font-bold text-[#172554]">
                  <Box className="h-3.5 w-3.5" />
                  <span>{language === 'bn' ? 'লাইভ ডেমো + থ্রিডি মোড' : 'Live Demo Video + 3D Lab'}</span>
                </span>
                <p className="font-display mt-2 text-base font-bold">
                  {language === 'bn'
                    ? 'ত্রিকোণমিতি ও নিউটনের গতিসূত্র থ্রিডি মোডে পরীক্ষা করুন'
                    : 'Test Interactive Trigonometry & Orbit Mechanics in 3D'}
                </p>
              </div>
            </button>
          </div>
        </div>
      </section>

      {/* Dynamic Categories Strip */}
      {categories.length > 0 && (
        <section className="mt-10">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {categories.map((cat) => {
              const Icon = getCategoryIcon(cat.icon);
              const count = lessons.filter((l) => l.category === cat.categoryId).length;
              return (
                <button
                  key={cat.categoryId}
                  type="button"
                  onClick={() => navigate(`/classes?cat=${encodeURIComponent(cat.categoryId)}`)}
                  className="glass-surface flex items-start gap-3.5 rounded-2xl p-5 text-left transition hover:-translate-y-0.5 hover:border-[#263B91]/40"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E7F5FF] text-[#172554] dark:bg-slate-800 dark:text-[#BFE8FF]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-display text-sm font-bold text-[#172033] dark:text-white">
                      {language === 'bn' ? cat.titleBn : cat.title}
                    </h2>
                    <p className="mt-1 line-clamp-2 text-xs text-[#64748B] dark:text-slate-400">
                      {language === 'bn' ? cat.descriptionBn || cat.description : cat.description}
                    </p>
                    <p className="mt-2 font-mono-nums text-[11px] font-semibold text-[#263B91] dark:text-[#BFE8FF]">
                      {count} {language === 'bn' ? 'টি পাঠ' : 'lessons'} →
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Class Selection Cards (Class 6 - 10) */}
      <section className="mt-12">
        <div className="flex items-end justify-between gap-2">
          <div>
            <h2 className="font-display text-xl font-bold text-[#172033] sm:text-2xl dark:text-white">
              {t(language, 'classesTitle')}
            </h2>
            <p className="mt-1 text-xs text-[#64748B] sm:text-sm dark:text-slate-400">{t(language, 'classesSubtitle')}</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/classes')}
            className="text-xs font-semibold text-[#263B91] hover:underline dark:text-[#BFE8FF] whitespace-nowrap"
          >
            {language === 'bn' ? 'সব শ্রেণি' : 'All Classes'} →
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {classes.map((cls, idx) => {
            const Icon = classIcons[idx % classIcons.length];
            const subjCount = subjects.filter((s) => s.classId === cls.classId).length;
            const lesCount = lessons.filter((l) => l.classId === cls.classId).length;
            return (
              <button
                key={cls.classId}
                type="button"
                onClick={() => navigate(`/classes/${cls.classId}`)}
                className="glass-surface group flex flex-col justify-between rounded-2xl p-4 sm:p-5 text-left transition duration-200 hover:-translate-y-0.5 hover:border-[#263B91]/40"
              >
                <div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E7F5FF] text-[#172554] transition group-hover:bg-[#172554] group-hover:text-white dark:bg-slate-800 dark:text-[#BFE8FF]">
                    <Icon className="h-4 w-4" />
                  </div>
                  <h3 className="font-display mt-3 text-base font-bold text-[#172033] dark:text-white">
                    {language === 'bn' ? cls.titleBn : cls.title}
                  </h3>
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs font-medium text-[#263B91] tabular-nums dark:text-[#BFE8FF]">
                  <span>{subjCount} {language === 'bn' ? 'বিষয়' : 'subj'}</span>
                  <span aria-hidden="true">·</span>
                  <span>{lesCount} {language === 'bn' ? 'পাঠ' : 'les'}</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Featured & 3D Lessons */}
      {featuredLessons.length > 0 && (
        <section className="mt-12">
          <h2 className="font-display text-xl font-bold text-[#172033] sm:text-2xl dark:text-white">
            {t(language, 'featuredLessons')}
          </h2>
          <p className="mt-1 text-xs text-[#64748B] sm:text-sm dark:text-slate-400">{t(language, 'featuredLessonsSub')}</p>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featuredLessons.map((les) => {
              const cls = classes.find((c) => c.classId === les.classId);
              const subj = subjects.find((s) => s.subjectId === les.subjectId);
              return (
                <button
                  key={les.lessonId}
                  type="button"
                  onClick={() => navigate(`/lesson/${les.lessonId}`)}
                  className="glass-surface group overflow-hidden rounded-2xl text-left transition hover:-translate-y-0.5"
                >
                  <div className="relative aspect-video w-full overflow-hidden bg-[#091332]">
                    <img
                      src={getYouTubeThumbnail(les.youtubeUrl, les.thumbnailUrl)}
                      alt={language === 'bn' ? les.titleBn : les.title}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover opacity-90 transition duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent" />
                    <div className="absolute bottom-3 left-3 flex items-center gap-2 text-[11px] font-semibold text-white">
                      {les.has3dMode && (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-[#BFE8FF] px-2 py-0.5 text-[#172554]">
                          <Box className="h-3 w-3" />
                          3D Mode
                        </span>
                      )}
                    </div>
                    <div className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-xl bg-white/95 text-[#172554] shadow-md">
                      <Play className="h-3.5 w-3.5 fill-current" />
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="flex items-center gap-2 text-xs text-[#64748B] dark:text-slate-400">
                      <span>{cls ? (language === 'bn' ? cls.titleBn : cls.title) : les.classId}</span>
                      <span aria-hidden="true">·</span>
                      <span>{subj ? (language === 'bn' ? subj.titleBn : subj.title) : ''}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{les.durationMinutes || 15} {t(language, 'minutes')}</span>
                    </div>
                    <h3 className="font-display mt-1.5 line-clamp-2 text-sm font-bold text-[#172033] dark:text-white">
                      {language === 'bn' ? les.titleBn : les.title}
                    </h3>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Minimal AI Tutor Strip */}
      {appSettings.homepageSettings.showAiIntro && (
        <section className="glass-surface mt-12 flex flex-col items-start justify-between gap-6 rounded-3xl p-6 sm:flex-row sm:items-center sm:p-8">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold text-[#263B91] dark:text-[#BFE8FF]">
              {language === 'bn' ? 'এআই পার্সোনাল টিউটর' : 'AI Personal Tutor'}
            </p>
            <h2 className="font-display mt-1 text-xl font-bold text-[#172033] sm:text-2xl dark:text-white">
              {t(language, 'aiTutorIntroTitle')}
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-[#64748B] sm:text-sm dark:text-slate-300">
              {t(language, 'aiTutorIntroSub')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => openAiWithLesson(null)}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#172554] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#263B91] dark:bg-[#BFE8FF] dark:text-[#172554]"
          >
            <Bot className="h-4 w-4" />
            <span>{t(language, 'openAiTutor')}</span>
          </button>
        </section>
      )}
    </div>
  );
};
