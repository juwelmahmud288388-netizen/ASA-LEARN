import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bookmark, Box, CheckCircle2, Play, Search } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { t } from '../i18n/translations';
import type { LessonCategory } from '../types';

export const ClassDirectoryPage: React.FC = () => {
  const {
    route,
    navigate,
    language,
    categories,
    classes,
    subjects,
    chapters,
    topics,
    lessons,
    progressList,
    bookmarks,
    toggleBookmark,
  } = useApp();

  const [pathOnly, queryStr] = route.split('?');
  const segments = pathOnly.replace(/^\/+/, '').split('/').filter(Boolean);
  const selectedClassId = segments[1] || classes[0]?.classId || '';
  const selectedSubjectId = segments[2] || '';

  const [categoryFilter, setCategoryFilter] = useState<'all' | LessonCategory>('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(queryStr || window.location.search);
    const cat = params.get('cat');
    if (cat) setCategoryFilter(cat);
  }, [queryStr, route]);

  const activeClass = classes.find((c) => c.classId === selectedClassId) || classes[0];
  const classSubjects = useMemo(
    () => subjects.filter((s) => s.classId === activeClass?.classId),
    [subjects, activeClass]
  );
  const activeSubject = classSubjects.find((s) => s.subjectId === selectedSubjectId) || classSubjects[0];

  const subjectChapters = useMemo(
    () => chapters.filter((ch) => ch.subjectId === activeSubject?.subjectId),
    [chapters, activeSubject]
  );

  const filteredLessons = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return lessons.filter((l) => {
      if (categoryFilter === 'all') {
        if (activeSubject && l.subjectId !== activeSubject.subjectId) return false;
        if (!activeSubject && activeClass && l.classId !== activeClass.classId) return false;
      } else {
        if (l.category !== categoryFilter) return false;
      }
      if (q && !l.title.toLowerCase().includes(q) && !l.titleBn.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [lessons, activeSubject, activeClass, categoryFilter, searchTerm]);

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#263B91] hover:underline dark:text-[#BFE8FF]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{t(language, 'navHome')}</span>
          </button>
          <h1 className="font-display mt-2 text-2xl font-bold text-[#172033] sm:text-3xl dark:text-white">
            {categoryFilter !== 'all'
              ? (() => {
                  const cat = categories.find((c) => c.categoryId === categoryFilter);
                  return cat ? (language === 'bn' ? cat.titleBn : cat.title) : categoryFilter;
                })()
              : activeClass
                ? language === 'bn'
                  ? activeClass.titleBn
                  : activeClass.title
                : t(language, 'navClasses')}
          </h1>
        </div>

        {/* Class Switcher Tabs */}
        <div className="flex flex-wrap gap-1.5 rounded-2xl bg-white/75 p-1.5 backdrop-blur-md dark:bg-slate-900/75">
          {classes.map((cls) => (
            <button
              key={cls.classId}
              type="button"
              onClick={() => {
                setCategoryFilter('all');
                navigate(`/classes/${cls.classId}`);
              }}
              className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition whitespace-nowrap ${
                categoryFilter === 'all' && activeClass?.classId === cls.classId
                  ? 'bg-[#172554] text-white dark:bg-[#BFE8FF] dark:text-[#172554]'
                  : 'text-[#64748B] hover:text-[#172554] dark:text-slate-300'
              }`}
            >
              {language === 'bn' ? cls.titleBn : cls.title}
            </button>
          ))}
        </div>
      </div>

      {/* Subjects Bar */}
      {categoryFilter === 'all' && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {classSubjects.length === 0 ? (
            <div className="glass-surface w-full rounded-2xl p-6 text-sm text-[#64748B] dark:text-slate-400">
              {language === 'bn'
                ? 'এই শ্রেণির জন্য এখনো কোনো বিষয় যুক্ত করা হয়নি।'
                : 'No subjects configured for this class yet.'}
            </div>
          ) : (
            classSubjects.map((subj) => (
              <button
                key={subj.subjectId}
                type="button"
                onClick={() => navigate(`/classes/${activeClass.classId}/${subj.subjectId}`)}
                className={`rounded-xl border px-4 py-2 text-xs font-semibold transition whitespace-nowrap ${
                  activeSubject?.subjectId === subj.subjectId
                    ? 'border-[#172554] bg-[#E7F5FF] text-[#172554] dark:border-[#BFE8FF] dark:bg-slate-800 dark:text-[#BFE8FF]'
                    : 'border-[#172554]/10 bg-white/75 text-[#64748B] hover:text-[#172554] dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-300'
                }`}
              >
                {language === 'bn' ? subj.titleBn : subj.title}
              </button>
            ))
          )}
        </div>
      )}

      {/* Dynamic Category Filter & Search Row */}
      <div className="mt-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap gap-1 rounded-xl bg-white/75 p-1 backdrop-blur-md dark:bg-slate-900/75 self-start">
          <button
            type="button"
            onClick={() => setCategoryFilter('all')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition whitespace-nowrap ${
              categoryFilter === 'all'
                ? 'bg-[#172554] text-white dark:bg-[#BFE8FF] dark:text-[#172554]'
                : 'text-[#64748B] hover:text-[#172554] dark:text-slate-300'
            }`}
          >
            {language === 'bn' ? 'সকল পাঠ' : 'All'}
          </button>
          {categories.map((cat) => (
            <button
              key={cat.categoryId}
              type="button"
              onClick={() => setCategoryFilter(cat.categoryId)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition whitespace-nowrap ${
                categoryFilter === cat.categoryId
                  ? 'bg-[#172554] text-white dark:bg-[#BFE8FF] dark:text-[#172554]'
                  : 'text-[#64748B] hover:text-[#172554] dark:text-slate-300'
              }`}
            >
              {language === 'bn' ? cat.titleBn : cat.title}
            </button>
          ))}
        </div>

        <div className="flex items-center rounded-xl border border-[#172554]/10 bg-white/85 px-3 py-2 sm:w-72 dark:border-white/10 dark:bg-slate-900/80">
          <Search className="mr-2 h-4 w-4 text-[#64748B]" />
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t(language, 'searchPlaceholder')}
            className="w-full bg-transparent text-xs text-[#172033] focus:outline-none dark:text-white"
          />
        </div>
      </div>

      {/* Category Flat View OR Chapter-wise Lessons */}
      <div className="mt-8 space-y-6">
        {categoryFilter !== 'all' ? (
          filteredLessons.length === 0 ? (
            <div className="glass-surface rounded-2xl p-10 text-center text-sm text-[#64748B] dark:text-slate-400">
              {t(language, 'noResults')}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {filteredLessons.map((les) => {
                const done = progressList.some((p) => p.lessonId === les.lessonId && p.completed);
                return (
                  <button
                    key={les.lessonId}
                    type="button"
                    onClick={() => navigate(`/lesson/${les.lessonId}`)}
                    className="glass-surface flex items-center justify-between gap-4 rounded-2xl p-5 text-left transition hover:border-[#263B91]/40"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs text-[#263B91] dark:text-[#BFE8FF]">
                        {les.has3dMode && (
                          <span className="inline-flex items-center gap-1 font-semibold">
                            <Box className="h-3.5 w-3.5" /> 3D
                          </span>
                        )}
                        <span>{t(language, les.difficulty)}</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">{les.durationMinutes || 15} {t(language, 'minutes')}</span>
                      </div>
                      <h3 className="mt-1 truncate text-sm font-semibold text-[#172033] dark:text-white">
                        {language === 'bn' ? les.titleBn : les.title}
                      </h3>
                    </div>
                    {done ? (
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Play className="h-5 w-5 shrink-0 text-[#172554] dark:text-[#BFE8FF]" />
                    )}
                  </button>
                );
              })}
            </div>
          )
        ) : subjectChapters.length === 0 && filteredLessons.length === 0 ? (
          <div className="glass-surface rounded-2xl p-10 text-center text-sm text-[#64748B] dark:text-slate-400">
            {t(language, 'noResults')}
          </div>
        ) : (
          subjectChapters.map((chap) => {
            const chapLessons = filteredLessons.filter((l) => l.chapterId === chap.chapterId);
            const chapTopics = topics.filter((tp) => tp.chapterId === chap.chapterId);
            const isBookmarked = bookmarks.some((b) => b.itemId === chap.chapterId && b.itemType === 'chapter');
            return (
              <div key={chap.chapterId} className="glass-surface rounded-3xl p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-display text-lg font-bold text-[#172033] dark:text-white">
                      {language === 'bn' ? chap.titleBn : chap.title}
                    </h2>
                    <p className="mt-1 text-xs text-[#64748B] dark:text-slate-400">
                      {language === 'bn' ? chap.descriptionBn : chap.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void toggleBookmark(chap.chapterId, 'chapter', language === 'bn' ? chap.titleBn : chap.title)}
                    aria-label="Bookmark chapter"
                    className={`rounded-xl p-2 transition ${
                      isBookmarked
                        ? 'bg-[#172554] text-white dark:bg-[#BFE8FF] dark:text-[#172554]'
                        : 'bg-white/75 text-[#64748B] hover:text-[#172554] dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    <Bookmark className="h-4 w-4" />
                  </button>
                </div>

                {chapTopics.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#64748B] dark:text-slate-400">
                    {chapTopics.map((tp, i) => (
                      <span key={tp.topicId}>
                        {i > 0 && <span className="mr-2">·</span>}
                        {language === 'bn' ? tp.titleBn : tp.title}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {chapLessons.length === 0 ? (
                    <p className="text-xs text-[#64748B] dark:text-slate-400">{t(language, 'noResults')}</p>
                  ) : (
                    chapLessons.map((les) => {
                      const done = progressList.some((p) => p.lessonId === les.lessonId && p.completed);
                      return (
                        <button
                          key={les.lessonId}
                          type="button"
                          onClick={() => navigate(`/lesson/${les.lessonId}`)}
                          className="flex items-center justify-between gap-4 rounded-2xl border border-[#172554]/10 bg-white/85 p-4 text-left transition hover:border-[#263B91]/40 hover:bg-[#E7F5FF]/70 dark:border-white/10 dark:bg-slate-800/75 dark:hover:bg-slate-800"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-xs text-[#263B91] dark:text-[#BFE8FF]">
                              {les.has3dMode && (
                                <span className="inline-flex items-center gap-1 font-semibold">
                                  <Box className="h-3.5 w-3.5" /> 3D
                                </span>
                              )}
                              <span>{t(language, les.difficulty)}</span>
                              <span aria-hidden="true">·</span>
                              <span className="tabular-nums">{les.durationMinutes || 15} {t(language, 'minutes')}</span>
                            </div>
                            <h3 className="mt-1 truncate text-sm font-semibold text-[#172033] dark:text-white">
                              {language === 'bn' ? les.titleBn : les.title}
                            </h3>
                          </div>
                          {done ? (
                            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <Play className="h-5 w-5 shrink-0 text-[#172554] dark:text-[#BFE8FF]" />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
