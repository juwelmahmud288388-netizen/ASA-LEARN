import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bookmark, BookOpen, Box, CheckCircle2, Play, Search, Sparkles } from 'lucide-react';
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
    openAiWithLesson,
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

  // Standalone lessons not mapped to a specific chapterId (e.g., uploaded directly with chapterId: 'general')
  const standaloneLessons = useMemo(() => {
    const chapIds = new Set(subjectChapters.map((c) => c.chapterId));
    return filteredLessons.filter((l) => !l.chapterId || l.chapterId === 'general' || !chapIds.has(l.chapterId));
  }, [filteredLessons, subjectChapters]);

  const renderLessonCard = (les: (typeof lessons)[number]) => {
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
            <span className="tabular-nums">
              {les.durationMinutes || 15} {t(language, 'minutes')}
            </span>
          </div>
          <h3 className="mt-1 truncate text-sm font-semibold text-[#172033] dark:text-white">
            {language === 'bn' ? les.titleBn || les.title : les.title}
          </h3>
        </div>
        {done ? (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <Play className="h-5 w-5 shrink-0 text-[#172554] dark:text-[#BFE8FF]" />
        )}
      </button>
    );
  };

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

      {/* Detailed Bangladesh NCTB Subjects Grid */}
      {categoryFilter === 'all' && (
        <div className="mt-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wider text-[#263B91] dark:text-[#BFE8FF]">
              {language === 'bn'
                ? `${activeClass?.titleBn || ''} — সকল বিষয় (${classSubjects.length}টি)`
                : `${activeClass?.title || ''} — All Subjects (${classSubjects.length})`}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => navigate('/3d-lab')}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#E7F5FF] px-3 py-1.5 text-xs font-bold text-[#172554] hover:bg-[#BFE8FF] dark:bg-slate-800 dark:text-[#BFE8FF]"
              >
                <Box className="h-3.5 w-3.5" />
                <span>{language === 'bn' ? '৩ডি-তে বুঝুন' : 'Explore in 3D'}</span>
              </button>
              <button
                type="button"
                onClick={() => openAiWithLesson(null)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#172554]/15 bg-white px-3 py-1.5 text-xs font-semibold text-[#172554] hover:bg-[#E7F5FF] dark:border-white/15 dark:bg-slate-800 dark:text-white"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>{language === 'bn' ? 'AI সহায়তা' : 'Ask AI'}</span>
              </button>
            </div>
          </div>

          {classSubjects.length === 0 ? (
            <div className="glass-surface w-full rounded-2xl p-6 text-sm text-[#64748B] dark:text-slate-400">
              {language === 'bn'
                ? 'এই শ্রেণির জন্য এখনো কোনো বিষয় যুক্ত করা হয়নি।'
                : 'No subjects configured for this class yet.'}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {classSubjects.map((subj) => {
                const count = lessons.filter((l) => l.subjectId === subj.subjectId).length;
                const isSelected = activeSubject?.subjectId === subj.subjectId;
                return (
                  <button
                    key={subj.subjectId}
                    type="button"
                    onClick={() => navigate(`/classes/${activeClass.classId}/${subj.subjectId}`)}
                    className={`flex flex-col justify-between rounded-2xl border p-3.5 text-left transition ${
                      isSelected
                        ? 'border-[#172554] bg-[#E7F5FF] text-[#172554] shadow-xs dark:border-[#BFE8FF] dark:bg-slate-800 dark:text-[#BFE8FF]'
                        : 'border-[#172554]/10 bg-white/80 text-[#172033] hover:border-[#263B91]/40 hover:bg-white dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <BookOpen className="h-4 w-4 shrink-0 opacity-75" />
                      <span className="rounded-md bg-[#172554]/10 px-1.5 py-0.5 font-mono-nums text-[10px] font-bold dark:bg-white/10">
                        {count}
                      </span>
                    </div>
                    <div className="mt-2">
                      <p className="line-clamp-1 text-xs font-bold">
                        {language === 'bn' ? subj.titleBn : subj.title}
                      </p>
                      <p className="line-clamp-1 text-[10px] opacity-70">
                        {language === 'bn' ? subj.title : subj.titleBn}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Dynamic Category Filter & Search Row */}
      <div className="mt-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap gap-1 self-start rounded-xl bg-white/75 p-1 backdrop-blur-md dark:bg-slate-900/75">
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

      {/* Category Flat View OR Chapters + Standalone Class Lessons */}
      <div className="mt-8 space-y-6">
        {categoryFilter !== 'all' ? (
          filteredLessons.length === 0 ? (
            <div className="glass-surface rounded-2xl p-10 text-center text-sm text-[#64748B] dark:text-slate-400">
              {t(language, 'noResults')}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {filteredLessons.map((les) => renderLessonCard(les))}
            </div>
          )
        ) : subjectChapters.length === 0 && filteredLessons.length === 0 ? (
          <div className="glass-surface rounded-3xl p-10 text-center">
            <p className="text-sm font-medium text-[#64748B] dark:text-slate-300">
              {language === 'bn'
                ? 'এই বিষয়ে এখনো কোনো ক্লাস আপলোড করা হয়নি। তবে আপনি এখনই AI ৩ডি ল্যাব ও টিউটরের সাহায্যে এই বিষয় শিখতে পারেন!'
                : 'No video classes uploaded for this subject yet. Try exploring its topics interactively in our AI 3D Lab!'}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2.5">
              <button
                type="button"
                onClick={() => navigate('/3d-lab')}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#172554] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#263B91] dark:bg-[#BFE8FF] dark:text-[#172554]"
              >
                <Box className="h-4 w-4" />
                <span>{language === 'bn' ? 'AI ৩ডি ল্যাবে শিখুন' : 'Learn in AI 3D Lab'}</span>
              </button>
              <button
                type="button"
                onClick={() => openAiWithLesson(null)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#172554]/15 bg-white px-4 py-2.5 text-xs font-semibold text-[#172554] hover:bg-[#E7F5FF] dark:border-white/15 dark:bg-slate-800 dark:text-[#BFE8FF]"
              >
                <Sparkles className="h-4 w-4" />
                <span>{t(language, 'openAiTutor')}</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Standalone / Direct Class Lessons (without requiring Chapter) */}
            {standaloneLessons.length > 0 && (
              <div className="glass-surface rounded-3xl p-6">
                <h2 className="font-display text-lg font-bold text-[#172033] dark:text-white">
                  {language === 'bn'
                    ? `${activeSubject?.titleBn || 'বিষয়'} — ক্লাস ও পাঠসমূহ`
                    : `${activeSubject?.title || 'Subject'} — Class Lessons`}
                </h2>
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {standaloneLessons.map((les) => renderLessonCard(les))}
                </div>
              </div>
            )}

            {/* Structured Chapter Cards */}
            {subjectChapters.map((chap) => {
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
                      chapLessons.map((les) => renderLessonCard(les))
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
};
