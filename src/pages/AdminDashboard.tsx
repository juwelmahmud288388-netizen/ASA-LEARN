import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  BarChart3,
  BookOpen,
  Bot,
  Box,
  CheckCircle2,
  Database,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  FolderPlus,
  KeyRound,
  Layout,
  Lock,
  LogOut,
  Palette,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Users,
  Video,
  Wand2,
} from 'lucide-react';
import { BRAND_LOGO_PATH, createClientId, formatTimestamp } from '../lib/utils';
import { useApp } from '../context/AppContext';
import type {
  ActivityLog,
  AppSettings,
  DifficultyLevel,
  LessonCategory,
  PublishStatus,
  ThreeDSceneType,
  UserProfile,
} from '../types';

type AdminTab = 'overview' | 'curriculum' | 'videos' | 'quizzes' | 'students' | 'homepage' | 'settings' | 'ai' | 'security';
type CurriculumEntity = 'category' | 'class' | 'subject' | 'chapter' | 'topic' | 'announcement';

interface AdminStudentRow extends UserProfile {
  completedLessonsCount?: number;
  quizAttemptsCount?: number;
}

interface AiQuestionDraft {
  question: string;
  questionBn?: string;
  options: string[];
  optionsBn?: string[];
  correctIndex: number;
  explanation: string;
  explanationBn?: string;
}

const CHART_COLORS = ['#172554', '#263B91', '#0284C7', '#0EA5E9', '#38BDF8', '#6366F1', '#14B8A6'];

export const AdminDashboard: React.FC = () => {
  const {
    isAdmin,
    language,
    categories,
    classes,
    subjects,
    chapters,
    topics,
    lessons,
    quizzes,
    announcements,
    appSettings,
    refreshCurriculum,
    seedCurriculumFromAdmin,
    loginAdminWithPassword,
    logoutAdmin,
    changeAdminPassword,
    navigate,
  } = useApp();

  const [tab, setTab] = useState<AdminTab>('overview');
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [showAdminPass, setShowAdminPass] = useState(false);
  const [adminAuthLoading, setAdminAuthLoading] = useState(false);
  const [adminAuthError, setAdminAuthError] = useState<string | null>(null);

  // Admin password change state
  const [curAdminPass, setCurAdminPass] = useState('');
  const [newAdminPass, setNewAdminPass] = useState('');
  const [confirmAdminPass, setConfirmAdminPass] = useState('');
  const [passChangeLoading, setPassChangeLoading] = useState(false);
  const [passChangeError, setPassChangeError] = useState<string | null>(null);
  const [passChangeSuccess, setPassChangeSuccess] = useState<string | null>(null);

  const [students, setStudents] = useState<AdminStudentRow[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [healthInfo, setHealthInfo] = useState<{ ok?: boolean; geminiConfigured?: boolean; adminFirestoreReady?: boolean }>({});
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [savingBusy, setSavingBusy] = useState(false);

  // Student search & password-only creation
  const [studentSearch, setStudentSearch] = useState('');
  const [studentClassFilter, setStudentClassFilter] = useState('all');
  const [newStuName, setNewStuName] = useState('');
  const [newStuClass, setNewStuClass] = useState('class-9');
  const [newStuPass, setNewStuPass] = useState('');
  const [newStuLang, setNewStuLang] = useState<'bn' | 'en'>('bn');

  // Curriculum creation (Categories, Classes, Subjects, Chapters, Topics, Announcements)
  const [entityType, setEntityType] = useState<CurriculumEntity>('category');
  const [entTitle, setEntTitle] = useState('');
  const [entTitleBn, setEntTitleBn] = useState('');
  const [entDesc, setEntDesc] = useState('');
  const [entIcon, setEntIcon] = useState('sparkles');
  const [entClassId, setEntClassId] = useState('class-9');
  const [entSubjectId, setEntSubjectId] = useState('subj-9-math');
  const [entChapterId, setEntChapterId] = useState('chap-9-math-9');
  const [entOrder, setEntOrder] = useState(1);

  // AI One-Click Module Builder
  const [aiModulePrompt, setAiModulePrompt] = useState('');
  const [aiModuleClassId, setAiModuleClassId] = useState('class-9');
  const [aiModuleSubjectId, setAiModuleSubjectId] = useState('subj-9-math');
  const [aiModuleBusy, setAiModuleBusy] = useState(false);

  // Video + 3D Lesson Form + AI Auto-Fill
  const [vidAiTopic, setVidAiTopic] = useState('');
  const [vidAiBusy, setVidAiBusy] = useState(false);
  const [vidAiQuestions, setVidAiQuestions] = useState<AiQuestionDraft[]>([]);
  const [vidTitle, setVidTitle] = useState('');
  const [vidTitleBn, setVidTitleBn] = useState('');
  const [vidUrl, setVidUrl] = useState('');
  const [vidClassId, setVidClassId] = useState('class-9');
  const [vidSubjectId, setVidSubjectId] = useState('subj-9-math');
  const [vidChapterId, setVidChapterId] = useState('chap-9-math-9');
  const [vidTopicId, setVidTopicId] = useState('top-9-math-9-a');
  const [vidCategory, setVidCategory] = useState<LessonCategory>('interactive_3d');
  const [vidDifficulty, setVidDifficulty] = useState<DifficultyLevel>('intermediate');
  const [vidDuration, setVidDuration] = useState(15);
  const [vidStatus, setVidStatus] = useState<PublishStatus>('published');
  const [vidDesc, setVidDesc] = useState('');
  const [vidDescBn, setVidDescBn] = useState('');
  const [vidHas3d, setVidHas3d] = useState(true);
  const [vidSceneType, setVidSceneType] = useState<ThreeDSceneType>('trigonometry_triangle');

  // Quiz Creation Form
  const [quizLessonId, setQuizLessonId] = useState('');
  const [quizQ, setQuizQ] = useState('');
  const [quizQBn, setQuizQBn] = useState('');
  const [quizOpts, setQuizOpts] = useState(['', '', '', '']);
  const [quizCorrect, setQuizCorrect] = useState(0);
  const [quizExp, setQuizExp] = useState('');

  // Settings local draft
  const [draftSettings, setDraftSettings] = useState<AppSettings>(appSettings);

  useEffect(() => {
    setDraftSettings(appSettings);
  }, [appSettings]);

  const notify = useCallback((msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(null), 3500);
  }, []);

  const loadAdminExtras = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const [healthRes, studentsRes] = await Promise.all([
        fetch('/api/health', { credentials: 'include' }),
        fetch('/api/admin/students-list', { credentials: 'include' }),
      ]);
      if (healthRes.ok) {
        setHealthInfo(await healthRes.json());
      }
      if (studentsRes.ok) {
        const data = await studentsRes.json();
        if (Array.isArray(data.students)) setStudents(data.students);
        if (Array.isArray(data.logs)) setLogs(data.logs);
      }
    } catch {
      // ignore background refresh failures
    }
  }, [isAdmin]);

  useEffect(() => {
    void loadAdminExtras();
  }, [loadAdminExtras]);

  const saveContentItem = async (collectionName: string, idField: string, item: Record<string, unknown>) => {
    const res = await fetch('/api/admin/content/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ collection: collectionName, idField, item }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `Failed to save into ${collectionName}`);
    }
    await refreshCurriculum();
    void loadAdminExtras();
    return data;
  };

  const handleDeleteContent = async (collectionName: string, id: string, label?: string) => {
    try {
      const res = await fetch('/api/admin/content/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ collection: collectionName, id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      await refreshCurriculum();
      void loadAdminExtras();
      notify(language === 'bn' ? `${label || id} মুছে ফেলা হয়েছে` : `Removed ${label || id}`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Delete failed.');
    }
  };

  const handleAdminUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminAuthError(null);
    setAdminAuthLoading(true);
    try {
      await loginAdminWithPassword(adminPasswordInput);
      setAdminPasswordInput('');
    } catch (err) {
      setAdminAuthError(err instanceof Error ? err.message : 'Incorrect Admin Portal password.');
    } finally {
      setAdminAuthLoading(false);
    }
  };

  // Visual Analytics computed datasets
  const categoryBreakdown = useMemo(() => {
    const total = Math.max(lessons.length, 1);
    const items = categories.map((cat, idx) => {
      const count = lessons.filter((l) => l.category === cat.categoryId).length;
      return {
        id: cat.categoryId,
        label: language === 'bn' ? cat.titleBn || cat.title : cat.title,
        count,
        pct: Math.round((count / total) * 100),
        color: CHART_COLORS[idx % CHART_COLORS.length]!,
      };
    });
    const knownIds = new Set(categories.map((c) => c.categoryId));
    const otherCount = lessons.filter((l) => !knownIds.has(l.category)).length;
    if (otherCount > 0) {
      items.push({
        id: 'other',
        label: language === 'bn' ? 'অন্যান্য' : 'Other',
        count: otherCount,
        pct: Math.round((otherCount / total) * 100),
        color: '#64748B',
      });
    }
    return items;
  }, [categories, lessons, language]);

  const classAnalytics = useMemo(() => {
    const rows = classes.map((cls) => {
      const lessonCount = lessons.filter((l) => l.classId === cls.classId).length;
      const studentCount = students.filter((s) => s.classId === cls.classId).length;
      const subjectCount = subjects.filter((s) => s.classId === cls.classId).length;
      return {
        classId: cls.classId,
        label: language === 'bn' ? cls.titleBn || cls.title : cls.title,
        lessonCount,
        studentCount,
        subjectCount,
      };
    });
    const maxVal = Math.max(1, ...rows.map((r) => Math.max(r.lessonCount, r.studentCount)));
    return { rows, maxVal };
  }, [classes, lessons, students, subjects, language]);

  const activeStudentsCount = useMemo(
    () => students.filter((s) => s.accountStatus !== 'suspended').length,
    [students]
  );
  const lessons3dCount = useMemo(() => lessons.filter((l) => l.has3dMode).length, [lessons]);
  const totalQuestionsCount = useMemo(
    () => quizzes.reduce((acc, q) => acc + (q.questions?.length || 0), 0),
    [quizzes]
  );

  if (!isAdmin) {
    return (
      <div className="mx-auto flex min-h-[75vh] max-w-md items-center px-4 py-12">
        <div className="glass-surface w-full rounded-3xl p-7 sm:p-9">
          <div className="flex flex-col items-center text-center">
            <img
              src={appSettings.branding.logoUrl || BRAND_LOGO_PATH}
              alt="ASA,LEARN logo"
              className="h-16 w-auto object-contain"
            />
            <h1 className="font-display mt-4 text-2xl font-bold text-[#172033] dark:text-white">
              {language === 'bn' ? 'অ্যাডমিন পোর্টাল' : 'Admin Portal'}
            </h1>
            <p className="mt-1 text-xs text-[#64748B] dark:text-slate-400">
              {language === 'bn'
                ? 'অ্যাডমিন ড্যাশবোর্ডে প্রবেশ করতে আপনার অ্যাডমিন পাসওয়ার্ড দিন'
                : 'Enter your dedicated Admin Portal password to access controls'}
            </p>
          </div>

          {adminAuthError && (
            <div className="mt-5 flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-50 px-3.5 py-2.5 text-xs text-red-700 dark:bg-red-950/50 dark:text-red-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{adminAuthError}</span>
            </div>
          )}

          <form onSubmit={handleAdminUnlock} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#172033] dark:text-slate-200">
                {language === 'bn' ? 'অ্যাডমিন পাসওয়ার্ড' : 'Admin Password'}
              </label>
              <div className="mt-1.5 flex items-center rounded-xl border border-[#172554]/15 bg-white/90 px-3.5 py-2.5 dark:border-white/15 dark:bg-slate-900/85">
                <Lock className="mr-2.5 h-4 w-4 text-[#64748B]" />
                <input
                  type={showAdminPass ? 'text' : 'password'}
                  required
                  autoFocus
                  value={adminPasswordInput}
                  onChange={(e) => setAdminPasswordInput(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full bg-transparent text-sm text-[#172033] focus:outline-none dark:text-white"
                />
                <button type="button" onClick={() => setShowAdminPass(!showAdminPass)} className="text-[#64748B]">
                  {showAdminPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={adminAuthLoading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#172554] py-3 text-sm font-semibold text-white transition hover:bg-[#263B91] disabled:opacity-50 dark:bg-[#BFE8FF] dark:text-[#172554]"
            >
              <KeyRound className="h-4 w-4" />
              <span>
                {adminAuthLoading
                  ? language === 'bn'
                    ? 'যাচাই হচ্ছে...'
                    : 'Verifying...'
                  : language === 'bn'
                    ? 'পোর্টালে প্রবেশ করুন'
                    : 'Unlock Admin Portal'}
              </span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  const handleCreateCurriculumItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entTitle.trim()) return;
    setSavingBusy(true);
    try {
      const id = createClientId(entityType === 'category' ? 'cat' : entityType);
      if (entityType === 'category') {
        await saveContentItem('categories', 'categoryId', {
          categoryId: id,
          title: entTitle.trim(),
          titleBn: entTitleBn.trim() || entTitle.trim(),
          description: entDesc.trim(),
          descriptionBn: entDesc.trim(),
          icon: entIcon || 'sparkles',
          order: Number(entOrder) || categories.length + 1,
          status: 'published',
        });
      } else if (entityType === 'class') {
        await saveContentItem('classes', 'classId', {
          classId: id,
          title: entTitle.trim(),
          titleBn: entTitleBn.trim() || entTitle.trim(),
          description: entDesc.trim(),
          descriptionBn: entDesc.trim(),
          order: Number(entOrder) || classes.length + 1,
          status: 'published',
        });
      } else if (entityType === 'subject') {
        await saveContentItem('subjects', 'subjectId', {
          subjectId: id,
          classId: entClassId,
          title: entTitle.trim(),
          titleBn: entTitleBn.trim() || entTitle.trim(),
          description: entDesc.trim(),
          descriptionBn: entDesc.trim(),
          order: Number(entOrder) || subjects.length + 1,
          status: 'published',
        });
      } else if (entityType === 'chapter') {
        await saveContentItem('chapters', 'chapterId', {
          chapterId: id,
          classId: entClassId,
          subjectId: entSubjectId,
          title: entTitle.trim(),
          titleBn: entTitleBn.trim() || entTitle.trim(),
          description: entDesc.trim(),
          descriptionBn: entDesc.trim(),
          order: Number(entOrder) || chapters.length + 1,
          status: 'published',
        });
      } else if (entityType === 'topic') {
        await saveContentItem('topics', 'topicId', {
          topicId: id,
          classId: entClassId,
          subjectId: entSubjectId,
          chapterId: entChapterId,
          title: entTitle.trim(),
          titleBn: entTitleBn.trim() || entTitle.trim(),
          description: entDesc.trim(),
          descriptionBn: entDesc.trim(),
          order: Number(entOrder) || topics.length + 1,
          status: 'published',
        });
      } else if (entityType === 'announcement') {
        await saveContentItem('announcements', 'announcementId', {
          announcementId: id,
          title: entTitle.trim(),
          titleBn: entTitleBn.trim() || entTitle.trim(),
          content: entDesc.trim() || entTitle.trim(),
          contentBn: entDesc.trim() || entTitle.trim(),
          targetClasses: [entClassId],
          published: true,
        });
      }
      setEntTitle('');
      setEntTitleBn('');
      setEntDesc('');
      notify(language === 'bn' ? 'সফলভাবে সংরক্ষিত হয়েছে!' : 'Saved and published live!');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSavingBusy(false);
    }
  };

  const handleAiGenerateModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiModulePrompt.trim()) return;
    setAiModuleBusy(true);
    try {
      const res = await fetch('/api/admin/ai/generate-module', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          prompt: aiModulePrompt.trim(),
          classId: aiModuleClassId,
          subjectId: aiModuleSubjectId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI Module generation failed.');
      await refreshCurriculum();
      void loadAdminExtras();
      setAiModulePrompt('');
      notify(
        language === 'bn'
          ? `AI মডিউল তৈরি হয়েছে: ${data.lesson?.titleBn || data.lesson?.title}`
          : `AI generated Chapter + 3D Lesson + Quiz: ${data.lesson?.title}`
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : 'AI Module Builder failed.');
    } finally {
      setAiModuleBusy(false);
    }
  };

  const handleAiAutofillLesson = async () => {
    const promptIdea = vidAiTopic.trim() || vidTitle.trim();
    if (!promptIdea) {
      notify(language === 'bn' ? 'প্রথমে টপিকের নাম বা আইডিয়া লিখুন।' : 'Enter a topic idea first for AI Auto-Fill.');
      return;
    }
    setVidAiBusy(true);
    try {
      const clsObj = classes.find((c) => c.classId === vidClassId);
      const subjObj = subjects.find((s) => s.subjectId === vidSubjectId);
      const res = await fetch('/api/admin/ai/autofill-lesson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          topicPrompt: promptIdea,
          classTitle: clsObj?.title || vidClassId,
          subjectTitle: subjObj?.title || vidSubjectId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI Auto-Fill failed');
      const gen = data.generated || {};
      if (gen.title) setVidTitle(gen.title);
      if (gen.titleBn) setVidTitleBn(gen.titleBn);
      if (gen.description) setVidDesc(gen.description);
      if (gen.descriptionBn) setVidDescBn(gen.descriptionBn);
      if (['beginner', 'intermediate', 'advanced'].includes(gen.difficulty)) {
        setVidDifficulty(gen.difficulty);
      }
      if (gen.durationMinutes) setVidDuration(Number(gen.durationMinutes) || 15);
      if (typeof gen.has3dMode === 'boolean') setVidHas3d(gen.has3dMode);
      const validScenes: ThreeDSceneType[] = ['trigonometry_triangle', 'newton_orbit', 'algebra_geometry', 'molecule_atom'];
      if (validScenes.includes(gen.threeDSceneType)) {
        setVidSceneType(gen.threeDSceneType);
      }
      if (!vidUrl.trim()) {
        const scene = validScenes.includes(gen.threeDSceneType) ? gen.threeDSceneType : 'trigonometry_triangle';
        setVidUrl(
          scene === 'newton_orbit'
            ? 'demo://newton-orbit-3d'
            : scene === 'molecule_atom'
              ? 'demo://atom-3d'
              : 'demo://trigonometry-3d'
        );
      }
      if (Array.isArray(gen.questions)) {
        setVidAiQuestions(gen.questions);
      }
      notify(
        language === 'bn'
          ? 'AI লেসন ও কুইজ পূরণ করেছে — এখন সেভ করুন!'
          : 'AI auto-filled lesson metadata + quiz questions!'
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : 'AI Auto-Fill failed.');
    } finally {
      setVidAiBusy(false);
    }
  };

  const handleAddLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vidTitle.trim()) return;
    setSavingBusy(true);
    try {
      const lessonId = createClientId('les');
      const fallbackDemoUrl =
        vidSceneType === 'newton_orbit'
          ? 'demo://newton-orbit-3d'
          : vidSceneType === 'molecule_atom'
            ? 'demo://atom-3d'
            : 'demo://trigonometry-3d';

      await saveContentItem('lessons', 'lessonId', {
        lessonId,
        classId: vidClassId,
        subjectId: vidSubjectId,
        chapterId: vidChapterId,
        topicId: vidTopicId || 'general',
        category: vidCategory || categories[0]?.categoryId || 'interactive_3d',
        title: vidTitle.trim(),
        titleBn: vidTitleBn.trim() || vidTitle.trim(),
        youtubeUrl: vidUrl.trim() || fallbackDemoUrl,
        description: vidDesc.trim(),
        descriptionBn: vidDescBn.trim() || vidDesc.trim(),
        objectives: [],
        difficulty: vidDifficulty,
        durationMinutes: Number(vidDuration) || 15,
        featured: true,
        has3dMode: vidHas3d,
        threeDSceneType: vidHas3d ? vidSceneType : undefined,
        order: lessons.length + 1,
        status: vidStatus,
      });

      if (vidAiQuestions.length > 0) {
        const quizId = createClientId('quiz');
        await saveContentItem('quizzes', 'quizId', {
          quizId,
          lessonId,
          title: `${vidTitle.trim()} Assessment Quiz`,
          status: 'published',
          questions: vidAiQuestions.map((q, idx) => ({
            id: createClientId(`q${idx + 1}`),
            ...q,
          })),
        });
      }

      setVidTitle('');
      setVidTitleBn('');
      setVidUrl('');
      setVidDesc('');
      setVidDescBn('');
      setVidAiTopic('');
      setVidAiQuestions([]);
      notify(language === 'bn' ? 'ভিডিও ও 3D লেসন প্রকাশিত হয়েছে!' : 'Video & 3D lesson published!');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save lesson.');
    } finally {
      setSavingBusy(false);
    }
  };

  const toggleLessonStatus = async (lessonId: string, current: PublishStatus) => {
    const existing = lessons.find((l) => l.lessonId === lessonId);
    if (!existing) return;
    const next: PublishStatus = current === 'published' ? 'draft' : 'published';
    try {
      await saveContentItem('lessons', 'lessonId', { ...existing, status: next });
      notify(`Lesson marked as ${next}`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not update lesson status.');
    }
  };

  const handleAddQuizQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetLessonId = quizLessonId || lessons[0]?.lessonId;
    if (!targetLessonId || !quizQ.trim()) return;
    const existing = quizzes.find((q) => q.lessonId === targetLessonId);
    const quizId = existing?.quizId || createClientId('quiz');
    const cleanOptions = quizOpts.map((o, i) => o.trim() || `Option ${i + 1}`);
    const nextQuestions = [
      ...(existing?.questions || []),
      {
        id: createClientId('q'),
        question: quizQ.trim(),
        questionBn: quizQBn.trim() || quizQ.trim(),
        options: cleanOptions,
        correctIndex: Number(quizCorrect),
        explanation: quizExp.trim() || 'Reviewed and verified by ASA,LEARN.',
      },
    ];
    try {
      await saveContentItem('quizzes', 'quizId', {
        quizId,
        lessonId: targetLessonId,
        title: existing?.title || 'Lesson Assessment Quiz',
        questions: nextQuestions,
        status: 'published',
      });
      setQuizQ('');
      setQuizQBn('');
      setQuizOpts(['', '', '', '']);
      setQuizExp('');
      notify('MCQ question saved!');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save quiz question.');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBusy(true);
    try {
      await saveContentItem('appSettings', 'settingId', {
        ...draftSettings,
        settingId: 'global',
      });
      notify(language === 'bn' ? 'সেটিংস সেভ ও লাইভ হয়েছে!' : 'Settings saved and applied live!');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save settings.');
    } finally {
      setSavingBusy(false);
    }
  };

  const handleCreateStudentByAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/students/password-only', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          fullName: newStuName.trim(),
          classId: newStuClass,
          password: newStuPass.trim(),
          preferredLanguage: newStuLang,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        notify(data.error || 'Could not create student profile.');
        return;
      }
      setNewStuName('');
      setNewStuPass('');
      notify(`Created profile ${data.student?.studentId || ''}`);
      void loadAdminExtras();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not create student.');
    }
  };

  const toggleStudentStatus = async (stu: AdminStudentRow) => {
    try {
      const res = await fetch(`/api/admin/students/${encodeURIComponent(stu.uid)}/toggle-status`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Status update failed');
      notify(`${stu.fullName}: ${data.accountStatus}`);
      void loadAdminExtras();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not update student status.');
    }
  };

  const handleChangeAdminPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassChangeError(null);
    setPassChangeSuccess(null);
    if (newAdminPass.length < 8) {
      setPassChangeError(
        language === 'bn'
          ? 'নতুন পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।'
          : 'New Admin Portal password must be at least 8 characters long.'
      );
      return;
    }
    if (newAdminPass !== confirmAdminPass) {
      setPassChangeError(language === 'bn' ? 'নতুন পাসওয়ার্ড দুটি মিলছে না।' : 'New passwords do not match.');
      return;
    }
    setPassChangeLoading(true);
    try {
      await changeAdminPassword(curAdminPass, newAdminPass);
      setCurAdminPass('');
      setNewAdminPass('');
      setConfirmAdminPass('');
      setPassChangeSuccess(
        language === 'bn'
          ? 'অ্যাডমিন পোর্টালের পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে!'
          : 'Admin Portal password updated successfully!'
      );
      notify(language === 'bn' ? 'পাসওয়ার্ড আপডেট হয়েছে!' : 'Admin password updated!');
    } catch (err) {
      setPassChangeError(err instanceof Error ? err.message : 'Could not change password.');
    } finally {
      setPassChangeLoading(false);
    }
  };

  const handleExportBackup = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      categories,
      classes,
      subjects,
      chapters,
      topics,
      lessons,
      quizzes,
      announcements,
      appSettings,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `asa-learn-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const jumpToAddEntity = (type: CurriculumEntity) => {
    setEntityType(type);
    setTab('curriculum');
  };

  const filteredStudents = students.filter((s) => {
    if (studentClassFilter !== 'all' && s.classId !== studentClassFilter) return false;
    const q = studentSearch.trim().toLowerCase();
    if (q && !s.fullName.toLowerCase().includes(q) && !s.studentId.toLowerCase().includes(q)) return false;
    return true;
  });

  const adminNav: Array<{ id: AdminTab; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: language === 'bn' ? 'অ্যানালিটিক্স ও ওভারভিউ' : 'Analytics & Overview', icon: <BarChart3 className="h-4 w-4" /> },
    { id: 'curriculum', label: language === 'bn' ? 'ক্যাটাগরি ও AI বিল্ডার' : 'Categories & AI Builder', icon: <FolderPlus className="h-4 w-4" /> },
    { id: 'videos', label: language === 'bn' ? 'ভিডিও ও 3D লেসন' : 'Video & 3D Lessons', icon: <Video className="h-4 w-4" /> },
    { id: 'quizzes', label: language === 'bn' ? 'MCQ প্রশ্ন ব্যাংক' : 'MCQ Question Bank', icon: <FileText className="h-4 w-4" /> },
    { id: 'students', label: language === 'bn' ? 'শিক্ষার্থী প্রোফাইল' : 'Student Profiles', icon: <Users className="h-4 w-4" /> },
    { id: 'homepage', label: language === 'bn' ? 'হোমপেজ এডিটর' : 'Homepage Editor', icon: <Layout className="h-4 w-4" /> },
    { id: 'settings', label: language === 'bn' ? 'ব্র্যান্ড ও রঙ' : 'Brand & Colors', icon: <Palette className="h-4 w-4" /> },
    { id: 'ai', label: language === 'bn' ? 'AI টিউটর সেটিংস' : 'AI Tutor Settings', icon: <Bot className="h-4 w-4" /> },
    { id: 'security', label: language === 'bn' ? 'পাসওয়ার্ড পরিবর্তন' : 'Admin Password', icon: <KeyRound className="h-4 w-4" /> },
  ];

  // Donut SVG Stroke Calculations
  const donutRadius = 54;
  const donutCircumference = 2 * Math.PI * donutRadius;
  let cumulativeOffset = 0;

  return (
    <div className="mx-auto max-w-[1380px] px-4 py-8 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Admin Sidebar */}
        <aside className="glass-surface h-fit rounded-3xl p-5 lg:col-span-3">
          <div className="flex items-center gap-3 border-b border-[#172554]/10 pb-4 dark:border-white/10">
            <img
              src={appSettings.branding.logoUrl || BRAND_LOGO_PATH}
              alt="ASA,LEARN logo"
              className="h-12 w-auto object-contain"
            />
            <div>
              <p className="font-display text-sm font-bold text-[#172033] dark:text-white">Admin Console</p>
              <p className="text-xs text-[#64748B] dark:text-slate-400">ASA,LEARN Studio</p>
            </div>
          </div>

          <nav className="mt-4 space-y-1">
            {adminNav.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-xs font-semibold transition ${
                  tab === item.id
                    ? 'bg-[#172554] text-white shadow-sm dark:bg-[#BFE8FF] dark:text-[#172554]'
                    : 'text-[#64748B] hover:bg-[#E7F5FF] hover:text-[#172554] dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="mt-6 space-y-2 border-t border-[#172554]/10 pt-4 dark:border-white/10">
            <button
              type="button"
              onClick={handleExportBackup}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#172554]/15 py-2 text-xs font-semibold text-[#172554] hover:bg-[#E7F5FF] dark:border-white/15 dark:text-[#BFE8FF]"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export JSON Backup</span>
            </button>
            <button
              type="button"
              onClick={() =>
                void seedCurriculumFromAdmin()
                  .then(() => notify('Curriculum refreshed!'))
                  .catch((err) => notify(err instanceof Error ? err.message : 'Seed refreshed locally.'))
              }
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#172554]/15 py-2 text-xs font-semibold text-[#172554] hover:bg-[#E7F5FF] dark:border-white/15 dark:text-[#BFE8FF]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Sync Curriculum</span>
            </button>
            <button
              type="button"
              onClick={() => void logoutAdmin()}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/20 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 dark:border-red-400/20 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>{language === 'bn' ? 'পোর্টাল লক করুন' : 'Lock Admin Portal'}</span>
            </button>
          </div>
        </aside>

        {/* Admin Content */}
        <main className="space-y-6 lg:col-span-9">
          {statusMsg && (
            <div className="flex items-center justify-between gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-50/90 px-4 py-3 text-xs font-semibold text-emerald-700 backdrop-blur dark:bg-emerald-950/70 dark:text-emerald-200">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{statusMsg}</span>
              </div>
              <button type="button" onClick={() => setStatusMsg(null)} className="text-[11px] opacity-70 hover:opacity-100">
                ✕
              </button>
            </div>
          )}

          {/* TAB 1: VIBRANT ANALYTICS OVERVIEW */}
          {tab === 'overview' && (
            <div className="space-y-6">
              {/* Top Quick Action Ribbon */}
              <div className="glass-surface flex flex-wrap items-center justify-between gap-3 rounded-3xl px-5 py-4">
                <div>
                  <h2 className="font-display text-lg font-bold text-[#172033] dark:text-white">
                    {language === 'bn' ? 'প্ল্যাটফর্ম অ্যানালিটিক্স ও কন্ট্রোল' : 'Platform Analytics & Quick Actions'}
                  </h2>
                  <p className="text-xs text-[#64748B] dark:text-slate-400">
                    {language === 'bn'
                      ? 'এক ক্লিকে নতুন ক্যাটাগরি, ভিডিও, 3D লেসন অথবা শিক্ষার্থী যোগ করুন'
                      : 'Add new categories, 3D video lessons, or AI-generated modules in one click'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => jumpToAddEntity('category')}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#172554] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#263B91] dark:bg-[#BFE8FF] dark:text-[#172554]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>{language === 'bn' ? 'নতুন ক্যাটাগরি' : 'Add Category'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab('videos')}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#172554]/15 bg-white/80 px-3.5 py-2 text-xs font-semibold text-[#172554] transition hover:bg-[#E7F5FF] dark:border-white/15 dark:bg-slate-800 dark:text-[#BFE8FF]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>{language === 'bn' ? 'নতুন ভিডিও/3D' : 'Add Video / 3D'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/lesson/les-sample-3d-demo')}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:opacity-95"
                  >
                    <Box className="h-3.5 w-3.5" />
                    <span>{language === 'bn' ? '3D মোড টেস্ট করুন' : 'Test 3D Mode'}</span>
                  </button>
                </div>
              </div>

              {/* Vibrant Gradient KPI Cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#172554] to-[#263B91] p-5 text-white shadow-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-[#BFE8FF]">
                      {language === 'bn' ? 'মোট শিক্ষার্থী' : 'Student Profiles'}
                    </span>
                    <Users className="h-5 w-5 text-[#BFE8FF]" />
                  </div>
                  <p className="font-mono-nums mt-3 text-3xl font-bold">{students.length}</p>
                  <p className="mt-1 text-[11px] text-[#E7F5FF]/85">
                    {activeStudentsCount} {language === 'bn' ? 'সক্রিয় পাসকোড প্রোফাইল' : 'active password profiles'}
                  </p>
                </div>

                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-sky-600 to-cyan-500 p-5 text-white shadow-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-sky-100">
                      {language === 'bn' ? 'ভিডিও ও 3D লেসন' : 'Video & 3D Lessons'}
                    </span>
                    <Video className="h-5 w-5 text-sky-100" />
                  </div>
                  <p className="font-mono-nums mt-3 text-3xl font-bold">{lessons.length}</p>
                  <p className="mt-1 text-[11px] text-sky-50/90">
                    {lessons3dCount} {language === 'bn' ? 'টি ইন্টার‍্যাক্টিভ 3D মোড সহ' : 'with interactive 3D Mode'}
                  </p>
                </div>

                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-600 p-5 text-white shadow-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-indigo-100">
                      {language === 'bn' ? 'কুইজ ও প্রশ্ন' : 'Quizzes & MCQs'}
                    </span>
                    <FileText className="h-5 w-5 text-indigo-100" />
                  </div>
                  <p className="font-mono-nums mt-3 text-3xl font-bold">{totalQuestionsCount}</p>
                  <p className="mt-1 text-[11px] text-indigo-100/90">
                    {quizzes.length} {language === 'bn' ? 'টি লেসন অ্যাসেসমেন্টে' : 'published quiz sets'}
                  </p>
                </div>

                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-500 p-5 text-white shadow-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-emerald-100">
                      {language === 'bn' ? 'ক্যাটাগরি ও বিষয়' : 'Categories & Subjects'}
                    </span>
                    <BookOpen className="h-5 w-5 text-emerald-100" />
                  </div>
                  <p className="font-mono-nums mt-3 text-3xl font-bold">{categories.length}</p>
                  <p className="mt-1 text-[11px] text-emerald-50/90">
                    {classes.length} classes · {subjects.length} subjects
                  </p>
                </div>
              </div>

              {/* Dual SVG Analytics Charts */}
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                {/* Class-wise Content & Student Bar Chart */}
                <div className="glass-surface rounded-3xl p-6 xl:col-span-7">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-display text-base font-bold text-[#172033] dark:text-white">
                        {language === 'bn' ? 'ক্লাস ভিত্তিক কন্টেন্ট ও শিক্ষার্থী গ্রাফ' : 'Class 6–10 Content & Student Overview'}
                      </h3>
                      <p className="text-[11px] text-[#64748B] dark:text-slate-400">
                        {language === 'bn' ? 'প্রতি ক্লাসের লেসন এবং রেজিস্টার্ড প্রোফাইল সংখ্যা' : 'Lessons and enrolled password profiles per class'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] font-semibold">
                      <span className="flex items-center gap-1.5 text-[#172554] dark:text-[#BFE8FF]">
                        <span className="h-2.5 w-2.5 rounded-sm bg-[#263B91] dark:bg-[#38BDF8]" />
                        {language === 'bn' ? 'লেসন' : 'Lessons'}
                      </span>
                      <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-300">
                        <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
                        {language === 'bn' ? 'শিক্ষার্থী' : 'Students'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-5">
                    <svg viewBox="0 0 540 210" className="h-52 w-full overflow-visible">
                      <defs>
                        <linearGradient id="asaBarLesson" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#38BDF8" />
                          <stop offset="100%" stopColor="#172554" />
                        </linearGradient>
                        <linearGradient id="asaBarStudent" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#34D399" />
                          <stop offset="100%" stopColor="#059669" />
                        </linearGradient>
                      </defs>

                      {[0, 0.5, 1].map((step) => {
                        const y = 165 - step * 130;
                        return (
                          <line
                            key={step}
                            x1={24}
                            y1={y}
                            x2={525}
                            y2={y}
                            stroke="currentColor"
                            strokeOpacity={0.08}
                            strokeDasharray="4 4"
                          />
                        );
                      })}

                      {classAnalytics.rows.slice(0, 6).map((row, idx) => {
                        const slotW = 480 / Math.max(classAnalytics.rows.slice(0, 6).length, 1);
                        const xCenter = 45 + idx * slotW + slotW / 2;
                        const lessonH = Math.max(6, (row.lessonCount / classAnalytics.maxVal) * 125);
                        const studentH = Math.max(6, (row.studentCount / classAnalytics.maxVal) * 125);
                        return (
                          <g key={row.classId}>
                            <rect
                              x={xCenter - 18}
                              y={165 - lessonH}
                              width={15}
                              height={lessonH}
                              rx={6}
                              fill="url(#asaBarLesson)"
                            />
                            <text
                              x={xCenter - 10.5}
                              y={159 - lessonH}
                              textAnchor="middle"
                              className="fill-[#172033] text-[10px] font-bold dark:fill-slate-200"
                            >
                              {row.lessonCount}
                            </text>

                            <rect
                              x={xCenter + 3}
                              y={165 - studentH}
                              width={15}
                              height={studentH}
                              rx={6}
                              fill="url(#asaBarStudent)"
                            />
                            <text
                              x={xCenter + 10.5}
                              y={159 - studentH}
                              textAnchor="middle"
                              className="fill-emerald-700 text-[10px] font-bold dark:fill-emerald-300"
                            >
                              {row.studentCount}
                            </text>

                            <text
                              x={xCenter}
                              y={186}
                              textAnchor="middle"
                              className="fill-[#64748B] text-[10px] font-semibold dark:fill-slate-400"
                            >
                              {row.label.slice(0, 10)}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                </div>

                {/* Category Distribution Donut Chart */}
                <div className="glass-surface rounded-3xl p-6 xl:col-span-5">
                  <h3 className="font-display text-base font-bold text-[#172033] dark:text-white">
                    {language === 'bn' ? 'ক্যাটাগরি অনুযায়ী লেসন ভাগ' : 'Category Breakdown'}
                  </h3>
                  <p className="text-[11px] text-[#64748B] dark:text-slate-400">
                    {language === 'bn' ? 'ডাইনামিক ক্যাটাগরি ও কন্টেন্ট অনুপাত' : 'Live distribution across active categories'}
                  </p>

                  <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row">
                    <div className="relative h-36 w-36 shrink-0">
                      <svg viewBox="0 0 140 140" className="-rotate-90 h-full w-full">
                        <circle
                          cx="70"
                          cy="70"
                          r={donutRadius}
                          fill="transparent"
                          stroke="currentColor"
                          strokeOpacity={0.08}
                          strokeWidth={18}
                        />
                        {categoryBreakdown.map((seg) => {
                          const segLen = (seg.count / Math.max(lessons.length, 1)) * donutCircumference;
                          const dashArray = `${segLen} ${donutCircumference}`;
                          const dashOffset = -cumulativeOffset;
                          cumulativeOffset += segLen;
                          if (seg.count === 0) return null;
                          return (
                            <circle
                              key={seg.id}
                              cx="70"
                              cy="70"
                              r={donutRadius}
                              fill="transparent"
                              stroke={seg.color}
                              strokeWidth={18}
                              strokeDasharray={dashArray}
                              strokeDashoffset={dashOffset}
                              strokeLinecap="butt"
                            />
                          );
                        })}
                      </svg>
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                        <span className="font-mono-nums text-xl font-bold text-[#172033] dark:text-white">
                          {lessons.length}
                        </span>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-slate-400">
                          Lessons
                        </span>
                      </div>
                    </div>

                    <div className="w-full space-y-2">
                      {categoryBreakdown.map((item) => (
                        <div key={item.id} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 truncate">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                            <span className="truncate font-medium text-[#172033] dark:text-slate-200">{item.label}</span>
                          </div>
                          <span className="font-mono-nums font-bold text-[#172554] dark:text-[#BFE8FF]">
                            {item.count} ({item.pct}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* System Health + Recent Activity */}
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                <div className="glass-surface rounded-3xl p-6 xl:col-span-5">
                  <h3 className="font-display flex items-center gap-2 text-base font-bold text-[#172033] dark:text-white">
                    <Activity className="h-4 w-4 text-sky-500" />
                    <span>{language === 'bn' ? 'সিস্টেম ও AI স্ট্যাটাস' : 'System & AI Health'}</span>
                  </h3>
                  <div className="mt-4 space-y-3 text-xs">
                    <div className="flex items-center justify-between rounded-2xl bg-white/75 px-4 py-3 dark:bg-slate-900/60">
                      <span className="text-[#64748B] dark:text-slate-400">Server API</span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {healthInfo.ok ? 'Online (Healthy)' : 'Checking...'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl bg-white/75 px-4 py-3 dark:bg-slate-900/60">
                      <span className="text-[#64748B] dark:text-slate-400">Gemini AI Engine</span>
                      <span
                        className={`font-semibold ${
                          healthInfo.geminiConfigured ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600'
                        }`}
                      >
                        {healthInfo.geminiConfigured ? 'Connected & Ready' : 'API Key Needed'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl bg-white/75 px-4 py-3 dark:bg-slate-900/60">
                      <span className="text-[#64748B] dark:text-slate-400">Interactive 3D Engine</span>
                      <span className="font-semibold text-sky-600 dark:text-sky-300">Three.js WebGL Ready</span>
                    </div>
                  </div>
                </div>

                <div className="glass-surface rounded-3xl p-6 xl:col-span-7">
                  <h3 className="font-display text-base font-bold text-[#172033] dark:text-white">
                    {language === 'bn' ? 'সাম্প্রতিক কার্যক্রম' : 'Recent Activity'}
                  </h3>
                  <div className="mt-4 space-y-2 text-xs">
                    {logs.length === 0 ? (
                      <p className="text-[#64748B] dark:text-slate-400">
                        {language === 'bn' ? 'নতুন পরিবর্তন করলে এখানে দেখাবে।' : 'Recent changes will appear here.'}
                      </p>
                    ) : (
                      logs.slice(0, 6).map((l) => (
                        <div
                          key={l.logId}
                          className="flex items-center justify-between rounded-xl bg-white/70 px-3.5 py-2.5 dark:bg-slate-900/60"
                        >
                          <div className="truncate">
                            <span className="font-semibold text-[#172554] dark:text-[#BFE8FF]">{l.action}</span>{' '}
                            <span className="text-[#64748B] dark:text-slate-300">· {l.target}</span>
                          </div>
                          <span className="shrink-0 text-[11px] text-[#64748B]">{formatTimestamp(l.timestamp)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CATEGORIES, CURRICULUM & ONE-CLICK AI MODULE BUILDER */}
          {tab === 'curriculum' && (
            <div className="space-y-6">
              {/* One-Click AI Module Builder */}
              <form
                onSubmit={handleAiGenerateModule}
                className="relative overflow-hidden rounded-3xl border border-sky-500/25 bg-gradient-to-br from-[#E7F5FF]/90 via-white/80 to-[#BFE8FF]/50 p-6 shadow-sm backdrop-blur-xl dark:border-sky-400/20 dark:from-slate-900/90 dark:via-slate-900/80 dark:to-[#172554]/60"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#172554] text-[#BFE8FF]">
                      <Wand2 className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="font-display text-base font-bold text-[#172033] dark:text-white">
                        {language === 'bn' ? 'এক ক্লিকে AI মডিউল বিল্ডার' : 'One-Click AI Module Builder'}
                      </h2>
                      <p className="text-[11px] text-[#64748B] dark:text-slate-400">
                        {language === 'bn'
                          ? 'একটি টপিক লিখুন — AI স্বয়ংক্রিয়ভাবে অধ্যায়, টপিক, 3D লেসন ও কুইজ তৈরি করবে।'
                          : 'Enter any topic idea — AI creates Chapter, Topic, interactive 3D Lesson, and MCQ Quiz automatically.'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <input
                    type="text"
                    required
                    value={aiModulePrompt}
                    onChange={(e) => setAiModulePrompt(e.target.value)}
                    placeholder={language === 'bn' ? 'যেমন: নিউটনের গতির সূত্র বা বীজগণিত' : 'e.g. Quadratic Equations or Cell Structure'}
                    className="rounded-xl border border-[#172554]/15 bg-white px-3.5 py-2.5 text-xs sm:col-span-2 dark:border-white/15 dark:bg-slate-800 dark:text-white"
                  />
                  <select
                    value={aiModuleClassId}
                    onChange={(e) => setAiModuleClassId(e.target.value)}
                    className="rounded-xl border border-[#172554]/15 bg-white px-3 py-2.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                  >
                    {classes.map((c) => (
                      <option key={c.classId} value={c.classId}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                  <select
                    value={aiModuleSubjectId}
                    onChange={(e) => setAiModuleSubjectId(e.target.value)}
                    className="rounded-xl border border-[#172554]/15 bg-white px-3 py-2.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                  >
                    {subjects.map((s) => (
                      <option key={s.subjectId} value={s.subjectId}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={aiModuleBusy}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#172554] px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-[#263B91] disabled:opacity-50 dark:bg-[#BFE8FF] dark:text-[#172554]"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>
                    {aiModuleBusy
                      ? language === 'bn'
                        ? 'AI তৈরি করছে...'
                        : 'Generating Module...'
                      : language === 'bn'
                        ? 'AI দিয়ে সম্পূর্ণ মডিউল তৈরি করুন'
                        : 'Generate Full Module with AI'}
                  </span>
                </button>
              </form>

              {/* Unified Minimal "+ Add" Form with Optional Fields */}
              <form onSubmit={handleCreateCurriculumItem} className="glass-surface rounded-3xl p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display text-lg font-bold text-[#172033] dark:text-white">
                    {language === 'bn' ? '+ নতুন আইটেম যোগ করুন (প্রয়োজনীয় + ঐচ্ছিক)' : '+ Add New Category or Curriculum Item'}
                  </h2>
                  <span className="text-[11px] font-medium text-[#64748B] dark:text-slate-400">
                    {language === 'bn' ? 'শুধুমাত্র নাম বাধ্যতামূলক, বাকিগুলো ঐচ্ছিক' : 'Only Name/Title required · Extra fields optional'}
                  </span>
                </div>

                {/* Quick Entity Type Pills */}
                <div className="mt-4 flex flex-wrap gap-2">
                  {(
                    [
                      ['category', language === 'bn' ? '+ ক্যাটাগরি' : '+ Category'],
                      ['class', language === 'bn' ? '+ ক্লাস' : '+ Class'],
                      ['subject', language === 'bn' ? '+ বিষয়' : '+ Subject'],
                      ['chapter', language === 'bn' ? '+ অধ্যায়' : '+ Chapter'],
                      ['topic', language === 'bn' ? '+ টপিক' : '+ Topic'],
                      ['announcement', language === 'bn' ? '+ ঘোষণা' : '+ Announcement'],
                    ] as Array<[CurriculumEntity, string]>
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setEntityType(val)}
                      className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                        entityType === val
                          ? 'bg-[#172554] text-white dark:bg-[#BFE8FF] dark:text-[#172554]'
                          : 'border border-[#172554]/15 bg-white/70 text-[#172033] hover:bg-[#E7F5FF] dark:border-white/15 dark:bg-slate-800 dark:text-slate-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <input
                    type="text"
                    required
                    value={entTitle}
                    onChange={(e) => setEntTitle(e.target.value)}
                    placeholder="Title / Name (Required) *"
                    className="rounded-xl border border-[#172554]/15 bg-white px-3.5 py-2.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                  />
                  <input
                    type="text"
                    value={entTitleBn}
                    onChange={(e) => setEntTitleBn(e.target.value)}
                    placeholder="Bangla Title (Optional)"
                    className="rounded-xl border border-[#172554]/15 bg-white px-3.5 py-2.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                  />

                  {entityType === 'category' && (
                    <select
                      value={entIcon}
                      onChange={(e) => setEntIcon(e.target.value)}
                      className="rounded-xl border border-[#172554]/15 bg-white px-3 py-2.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                    >
                      <option value="sparkles">Icon: Sparkles (Optional)</option>
                      <option value="box">Icon: 3D Cube</option>
                      <option value="book">Icon: Book / Course</option>
                      <option value="zap">Icon: One-Shot Lightning</option>
                      <option value="layers">Icon: Layers</option>
                    </select>
                  )}

                  {(entityType === 'subject' || entityType === 'chapter' || entityType === 'topic' || entityType === 'announcement') && (
                    <select
                      value={entClassId}
                      onChange={(e) => setEntClassId(e.target.value)}
                      className="rounded-xl border border-[#172554]/15 bg-white px-3 py-2.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                    >
                      {classes.map((c) => (
                        <option key={c.classId} value={c.classId}>
                          {c.title}
                        </option>
                      ))}
                    </select>
                  )}

                  {(entityType === 'chapter' || entityType === 'topic') && (
                    <select
                      value={entSubjectId}
                      onChange={(e) => setEntSubjectId(e.target.value)}
                      className="rounded-xl border border-[#172554]/15 bg-white px-3 py-2.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                    >
                      {subjects.map((s) => (
                        <option key={s.subjectId} value={s.subjectId}>
                          {s.title}
                        </option>
                      ))}
                    </select>
                  )}

                  {entityType === 'topic' && (
                    <select
                      value={entChapterId}
                      onChange={(e) => setEntChapterId(e.target.value)}
                      className="rounded-xl border border-[#172554]/15 bg-white px-3 py-2.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                    >
                      {chapters.map((ch) => (
                        <option key={ch.chapterId} value={ch.chapterId}>
                          {ch.title}
                        </option>
                      ))}
                    </select>
                  )}

                  <input
                    type="text"
                    value={entDesc}
                    onChange={(e) => setEntDesc(e.target.value)}
                    placeholder="Short Description (Optional)"
                    className="rounded-xl border border-[#172554]/15 bg-white px-3.5 py-2.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                  />
                  <input
                    type="number"
                    min={1}
                    value={entOrder}
                    onChange={(e) => setEntOrder(Number(e.target.value))}
                    placeholder="Display Order (Optional)"
                    className="rounded-xl border border-[#172554]/15 bg-white px-3.5 py-2.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingBusy}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#172554] px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-[#263B91] disabled:opacity-50 dark:bg-[#BFE8FF] dark:text-[#172554]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{savingBusy ? 'Saving...' : `Add ${entityType}`}</span>
                </button>
              </form>

              {/* Dynamic Lists with "+ Add" header buttons */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Categories */}
                <div className="glass-surface rounded-3xl p-6">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-base font-bold text-[#172033] dark:text-white">
                      {language === 'bn' ? 'ক্যাটাগরি সমূহ' : 'Categories'} ({categories.length})
                    </h3>
                    <button
                      type="button"
                      onClick={() => setEntityType('category')}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#E7F5FF] px-2.5 py-1 text-[11px] font-semibold text-[#172554] dark:bg-slate-800 dark:text-[#BFE8FF]"
                    >
                      <Plus className="h-3 w-3" /> Add
                    </button>
                  </div>
                  <div className="mt-3 space-y-2 text-xs">
                    {categories.map((c) => (
                      <div key={c.categoryId} className="flex items-center justify-between rounded-xl bg-white/75 px-3 py-2.5 dark:bg-slate-900/60">
                        <div>
                          <p className="font-semibold text-[#172033] dark:text-white">{c.title}</p>
                          <p className="text-[11px] text-[#64748B]">{c.titleBn}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleDeleteContent('categories', c.categoryId, c.title)}
                          className="text-red-500 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Classes */}
                <div className="glass-surface rounded-3xl p-6">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-base font-bold text-[#172033] dark:text-white">
                      {language === 'bn' ? 'ক্লাস সমূহ' : 'Classes'} ({classes.length})
                    </h3>
                    <button
                      type="button"
                      onClick={() => setEntityType('class')}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#E7F5FF] px-2.5 py-1 text-[11px] font-semibold text-[#172554] dark:bg-slate-800 dark:text-[#BFE8FF]"
                    >
                      <Plus className="h-3 w-3" /> Add
                    </button>
                  </div>
                  <div className="mt-3 space-y-2 text-xs">
                    {classes.map((c) => (
                      <div key={c.classId} className="flex items-center justify-between rounded-xl bg-white/75 px-3 py-2.5 dark:bg-slate-900/60">
                        <div>
                          <p className="font-semibold text-[#172033] dark:text-white">{c.title}</p>
                          <p className="text-[11px] text-[#64748B]">{c.titleBn}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleDeleteContent('classes', c.classId, c.title)}
                          className="text-red-500 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Subjects */}
                <div className="glass-surface rounded-3xl p-6">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-base font-bold text-[#172033] dark:text-white">
                      {language === 'bn' ? 'বিষয় সমূহ' : 'Subjects'} ({subjects.length})
                    </h3>
                    <button
                      type="button"
                      onClick={() => setEntityType('subject')}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#E7F5FF] px-2.5 py-1 text-[11px] font-semibold text-[#172554] dark:bg-slate-800 dark:text-[#BFE8FF]"
                    >
                      <Plus className="h-3 w-3" /> Add
                    </button>
                  </div>
                  <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1 text-xs">
                    {subjects.map((s) => (
                      <div key={s.subjectId} className="flex items-center justify-between rounded-xl bg-white/75 px-3 py-2.5 dark:bg-slate-900/60">
                        <div>
                          <p className="font-semibold text-[#172033] dark:text-white">{s.title}</p>
                          <p className="text-[11px] text-[#64748B]">
                            {s.classId} · {s.titleBn}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleDeleteContent('subjects', s.subjectId, s.title)}
                          className="text-red-500 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Chapters & Announcements */}
                <div className="glass-surface rounded-3xl p-6">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-base font-bold text-[#172033] dark:text-white">
                      {language === 'bn' ? 'অধ্যায় ও ঘোষণা' : 'Chapters & Announcements'} ({chapters.length + announcements.length})
                    </h3>
                    <button
                      type="button"
                      onClick={() => setEntityType('chapter')}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#E7F5FF] px-2.5 py-1 text-[11px] font-semibold text-[#172554] dark:bg-slate-800 dark:text-[#BFE8FF]"
                    >
                      <Plus className="h-3 w-3" /> Add
                    </button>
                  </div>
                  <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1 text-xs">
                    {chapters.map((ch) => (
                      <div key={ch.chapterId} className="flex items-center justify-between rounded-xl bg-white/75 px-3 py-2.5 dark:bg-slate-900/60">
                        <div>
                          <p className="font-semibold text-[#172033] dark:text-white">{ch.title}</p>
                          <p className="text-[11px] text-[#64748B]">{ch.subjectId}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleDeleteContent('chapters', ch.chapterId, ch.title)}
                          className="text-red-500 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    {announcements.map((an) => (
                      <div key={an.announcementId} className="flex items-center justify-between rounded-xl border border-amber-400/20 bg-amber-50/70 px-3 py-2.5 dark:bg-amber-950/20">
                        <div>
                          <p className="font-semibold text-[#172033] dark:text-white">📢 {an.title}</p>
                          <p className="text-[11px] text-[#64748B]">{an.content}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleDeleteContent('announcements', an.announcementId, an.title)}
                          className="text-red-500 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: VIDEO & 3D LESSONS + AI AUTO-FILL */}
          {tab === 'videos' && (
            <div className="space-y-6">
              <form onSubmit={handleAddLesson} className="glass-surface space-y-4 rounded-3xl p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-display text-lg font-bold text-[#172033] dark:text-white">
                      {language === 'bn' ? '+ নতুন ভিডিও এবং 3D লেসন যোগ করুন' : '+ Add Video & 3D Lesson'}
                    </h2>
                    <p className="text-[11px] text-[#64748B] dark:text-slate-400">
                      {language === 'bn'
                        ? 'শুধু শিরোনাম প্রয়োজনীয়; বাকিগুলো AI দিয়ে অটো-ফিল করতে পারেন।'
                        : 'Only Title is required — leave URL empty to auto-attach a built-in interactive 3D demo video!'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/lesson/les-sample-3d-demo')}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-sky-500/30 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100 dark:bg-sky-950/40 dark:text-sky-300"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>{language === 'bn' ? 'ডেমো 3D ভিডিও দেখুন' : 'Preview Sample 3D Lesson'}</span>
                  </button>
                </div>

                {/* AI Auto-Fill Bar */}
                <div className="rounded-2xl border border-sky-500/20 bg-[#E7F5FF]/70 p-4 dark:border-sky-400/20 dark:bg-slate-900/70">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      type="text"
                      value={vidAiTopic}
                      onChange={(e) => setVidAiTopic(e.target.value)}
                      placeholder={
                        language === 'bn'
                          ? 'AI অটো-ফিল: যেকোনো টপিক লিখুন (যেমন: ত্রিকোণমিতি বা পরমাণুর গঠন)...'
                          : 'AI Auto-Fill: Type a topic idea (e.g., Bohr Atomic Model or Pythagoras Theorem)...'
                      }
                      className="flex-1 rounded-xl border border-[#172554]/15 bg-white px-3.5 py-2 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                    />
                    <button
                      type="button"
                      disabled={vidAiBusy}
                      onClick={() => void handleAiAutofillLesson()}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#172554] to-[#0284C7] px-4 py-2 text-xs font-semibold text-white transition hover:opacity-95 disabled:opacity-50"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>{vidAiBusy ? 'Generating...' : 'AI Auto-Fill Metadata & Quiz'}</span>
                    </button>
                  </div>
                  {vidAiQuestions.length > 0 && (
                    <p className="mt-2 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                      ✓ {vidAiQuestions.length} AI-generated MCQ questions ready — they will automatically attach when you save this lesson!
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <input
                    type="text"
                    required
                    value={vidTitle}
                    onChange={(e) => setVidTitle(e.target.value)}
                    placeholder="Lesson Title (Required) *"
                    className="rounded-xl border border-[#172554]/15 bg-white px-3.5 py-2.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                  />
                  <input
                    type="text"
                    value={vidTitleBn}
                    onChange={(e) => setVidTitleBn(e.target.value)}
                    placeholder="Bangla Title (Optional)"
                    className="rounded-xl border border-[#172554]/15 bg-white px-3.5 py-2.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                  />
                  <input
                    type="text"
                    value={vidUrl}
                    onChange={(e) => setVidUrl(e.target.value)}
                    placeholder="Video URL (Optional — leave blank for built-in 3D demo video)"
                    className="rounded-xl border border-[#172554]/15 bg-white px-3.5 py-2.5 text-xs sm:col-span-2 dark:border-white/15 dark:bg-slate-800 dark:text-white"
                  />

                  <select
                    value={vidClassId}
                    onChange={(e) => setVidClassId(e.target.value)}
                    className="rounded-xl border border-[#172554]/15 bg-white px-3 py-2.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                  >
                    {classes.map((c) => (
                      <option key={c.classId} value={c.classId}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                  <select
                    value={vidSubjectId}
                    onChange={(e) => setVidSubjectId(e.target.value)}
                    className="rounded-xl border border-[#172554]/15 bg-white px-3 py-2.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                  >
                    {subjects.map((s) => (
                      <option key={s.subjectId} value={s.subjectId}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                  <select
                    value={vidChapterId}
                    onChange={(e) => setVidChapterId(e.target.value)}
                    className="rounded-xl border border-[#172554]/15 bg-white px-3 py-2.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                  >
                    {chapters.map((ch) => (
                      <option key={ch.chapterId} value={ch.chapterId}>
                        {ch.title}
                      </option>
                    ))}
                  </select>
                  <select
                    value={vidTopicId}
                    onChange={(e) => setVidTopicId(e.target.value)}
                    className="rounded-xl border border-[#172554]/15 bg-white px-3 py-2.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                  >
                    {topics.map((tp) => (
                      <option key={tp.topicId} value={tp.topicId}>
                        {tp.title}
                      </option>
                    ))}
                  </select>

                  <select
                    value={vidCategory}
                    onChange={(e) => setVidCategory(e.target.value)}
                    className="rounded-xl border border-[#172554]/15 bg-white px-3 py-2.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                  >
                    {categories.map((cat) => (
                      <option key={cat.categoryId} value={cat.categoryId}>
                        Category: {cat.title}
                      </option>
                    ))}
                  </select>

                  <select
                    value={vidDifficulty}
                    onChange={(e) => setVidDifficulty(e.target.value as DifficultyLevel)}
                    className="rounded-xl border border-[#172554]/15 bg-white px-3 py-2.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="beginner">Beginner (Optional)</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>

                  <input
                    type="number"
                    min={1}
                    value={vidDuration}
                    onChange={(e) => setVidDuration(Number(e.target.value))}
                    placeholder="Duration mins (Optional)"
                    className="rounded-xl border border-[#172554]/15 bg-white px-3.5 py-2.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                  />

                  <select
                    value={vidStatus}
                    onChange={(e) => setVidStatus(e.target.value as PublishStatus)}
                    className="rounded-xl border border-[#172554]/15 bg-white px-3 py-2.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="published">Published (Live Immediately)</option>
                    <option value="draft">Save as Draft</option>
                  </select>
                </div>

                {/* 3D Interactive Mode Options */}
                <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-white/70 p-3.5 text-xs dark:bg-slate-900/60">
                  <label className="flex items-center gap-2 font-semibold text-[#172033] dark:text-white">
                    <input
                      type="checkbox"
                      checked={vidHas3d}
                      onChange={(e) => setVidHas3d(e.target.checked)}
                    />
                    <span>Enable Interactive 3D Mode</span>
                  </label>
                  {vidHas3d && (
                    <select
                      value={vidSceneType}
                      onChange={(e) => setVidSceneType(e.target.value as ThreeDSceneType)}
                      className="rounded-xl border border-[#172554]/15 bg-white px-3 py-1.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                    >
                      <option value="trigonometry_triangle">3D Scene: Trigonometry Triangle</option>
                      <option value="newton_orbit">3D Scene: Newton Gravity & Orbit</option>
                      <option value="algebra_geometry">3D Scene: 3D Algebra Cubes</option>
                      <option value="molecule_atom">3D Scene: Interactive Atom & Orbitals</option>
                    </select>
                  )}
                </div>

                <textarea
                  rows={2}
                  value={vidDesc}
                  onChange={(e) => setVidDesc(e.target.value)}
                  placeholder="Lesson Description (Optional)"
                  className="w-full rounded-xl border border-[#172554]/15 bg-white p-3 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                />

                <button
                  type="submit"
                  disabled={savingBusy}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#172554] px-6 py-2.5 text-xs font-semibold text-white transition hover:bg-[#263B91] disabled:opacity-50 dark:bg-[#BFE8FF] dark:text-[#172554]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{savingBusy ? 'Publishing...' : 'Publish Video & 3D Lesson'}</span>
                </button>
              </form>

              <div className="glass-surface rounded-3xl p-6">
                <h3 className="font-display text-base font-bold text-[#172033] dark:text-white">
                  {language === 'bn' ? 'প্রকাশিত ও ড্রাফট লেসন' : 'All Lessons'} ({lessons.length})
                </h3>
                <div className="mt-4 space-y-2 text-xs">
                  {lessons.map((l) => (
                    <div
                      key={l.lessonId}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white/75 px-4 py-3 dark:bg-slate-900/60"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-semibold text-[#172033] dark:text-white">{l.title}</p>
                          {l.has3dMode && (
                            <span className="rounded-md bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-700 dark:bg-sky-900/50 dark:text-sky-300">
                              3D
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[#64748B]">
                          {l.classId} · {l.category} · {l.youtubeUrl}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => navigate(`/lesson/${l.lessonId}`)}
                          className="rounded-lg border border-[#172554]/15 px-2.5 py-1 text-[11px] font-semibold text-[#172554] hover:bg-[#E7F5FF] dark:border-white/15 dark:text-[#BFE8FF]"
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          onClick={() => void toggleLessonStatus(l.lessonId, l.status)}
                          className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold ${
                            l.status === 'published'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                          }`}
                        >
                          {l.status}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteContent('lessons', l.lessonId, l.title)}
                          className="text-red-500 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: QUIZZES */}
          {tab === 'quizzes' && (
            <div className="space-y-6">
              <form onSubmit={handleAddQuizQuestion} className="glass-surface space-y-4 rounded-3xl p-6">
                <h2 className="font-display text-lg font-bold text-[#172033] dark:text-white">
                  {language === 'bn' ? '+ MCQ প্রশ্ন যোগ করুন' : '+ Add MCQ Quiz Question'}
                </h2>
                <select
                  value={quizLessonId || lessons[0]?.lessonId || ''}
                  onChange={(e) => setQuizLessonId(e.target.value)}
                  className="w-full rounded-xl border border-[#172554]/15 bg-white px-3 py-2.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                >
                  {lessons.map((l) => (
                    <option key={l.lessonId} value={l.lessonId}>
                      {l.title} ({l.classId})
                    </option>
                  ))}
                </select>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <input
                    type="text"
                    required
                    value={quizQ}
                    onChange={(e) => setQuizQ(e.target.value)}
                    placeholder="Question Text (Required) *"
                    className="rounded-xl border border-[#172554]/15 bg-white px-3.5 py-2.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                  />
                  <input
                    type="text"
                    value={quizQBn}
                    onChange={(e) => setQuizQBn(e.target.value)}
                    placeholder="Bangla Question (Optional)"
                    className="rounded-xl border border-[#172554]/15 bg-white px-3.5 py-2.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {quizOpts.map((opt, idx) => (
                    <input
                      key={idx}
                      type="text"
                      required
                      value={opt}
                      onChange={(e) => {
                        const copy = [...quizOpts];
                        copy[idx] = e.target.value;
                        setQuizOpts(copy);
                      }}
                      placeholder={`Option ${idx + 1} *`}
                      className="rounded-xl border border-[#172554]/15 bg-white px-3.5 py-2.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                    />
                  ))}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <select
                    value={quizCorrect}
                    onChange={(e) => setQuizCorrect(Number(e.target.value))}
                    className="rounded-xl border border-[#172554]/15 bg-white px-3 py-2.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                  >
                    <option value={0}>Correct: Option 1</option>
                    <option value={1}>Correct: Option 2</option>
                    <option value={2}>Correct: Option 3</option>
                    <option value={3}>Correct: Option 4</option>
                  </select>
                  <input
                    type="text"
                    value={quizExp}
                    onChange={(e) => setQuizExp(e.target.value)}
                    placeholder="Explanation after submit (Optional)"
                    className="rounded-xl border border-[#172554]/15 bg-white px-3.5 py-2.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#172554] px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-[#263B91] dark:bg-[#BFE8FF] dark:text-[#172554]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Save Question</span>
                </button>
              </form>

              <div className="glass-surface rounded-3xl p-6">
                <h3 className="font-display text-base font-bold text-[#172033] dark:text-white">
                  {language === 'bn' ? 'বিদ্যমান কুইজ সেট' : 'Published Quiz Sets'} ({quizzes.length})
                </h3>
                <div className="mt-4 space-y-2 text-xs">
                  {quizzes.map((q) => (
                    <div key={q.quizId} className="flex items-center justify-between rounded-2xl bg-white/75 px-4 py-3 dark:bg-slate-900/60">
                      <div>
                        <p className="font-semibold text-[#172033] dark:text-white">{q.title}</p>
                        <p className="text-[11px] text-[#64748B]">
                          Lesson: {q.lessonId} · {q.questions.length} Questions
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleDeleteContent('quizzes', q.quizId, q.title)}
                        className="text-red-500 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: PASSWORD-ONLY STUDENTS */}
          {tab === 'students' && (
            <div className="space-y-6">
              <form onSubmit={handleCreateStudentByAdmin} className="glass-surface space-y-4 rounded-3xl p-6">
                <div>
                  <h2 className="font-display text-lg font-bold text-[#172033] dark:text-white">
                    {language === 'bn' ? '+ নতুন পাসওয়ার্ড-ভিত্তিক শিক্ষার্থী প্রোফাইল' : '+ Create Password-Only Student Profile'}
                  </h2>
                  <p className="text-[11px] text-[#64748B] dark:text-slate-400">
                    {language === 'bn'
                      ? 'কোনো জিমেইল বা মোবাইল নম্বর ছাড়াই শিক্ষার্থী শুধু এই পাসওয়ার্ড দিয়ে তার প্রোফাইল খুলতে পারবে।'
                      : 'No email or phone required — students unlock this profile later with their personal password alone.'}
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <input
                    type="text"
                    required
                    value={newStuName}
                    onChange={(e) => setNewStuName(e.target.value)}
                    placeholder="Student Name *"
                    className="rounded-xl border border-[#172554]/15 bg-white px-3.5 py-2.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                  />
                  <select
                    value={newStuClass}
                    onChange={(e) => setNewStuClass(e.target.value)}
                    className="rounded-xl border border-[#172554]/15 bg-white px-3 py-2.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                  >
                    {classes.map((c) => (
                      <option key={c.classId} value={c.classId}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                  <select
                    value={newStuLang}
                    onChange={(e) => setNewStuLang(e.target.value as 'bn' | 'en')}
                    className="rounded-xl border border-[#172554]/15 bg-white px-3 py-2.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="bn">Bangla (বাংলা)</option>
                    <option value="en">English</option>
                  </select>
                  <input
                    type="text"
                    required
                    minLength={4}
                    value={newStuPass}
                    onChange={(e) => setNewStuPass(e.target.value)}
                    placeholder="Personal Password (min 4 chars) *"
                    className="rounded-xl border border-[#172554]/15 bg-white px-3.5 py-2.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#172554] px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-[#263B91] dark:bg-[#BFE8FF] dark:text-[#172554]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Create Student Profile</span>
                </button>
              </form>

              <div className="glass-surface rounded-3xl p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-display text-base font-bold text-[#172033] dark:text-white">
                    {language === 'bn' ? 'নিবন্ধিত শিক্ষার্থীরা' : 'Student Profiles'} ({filteredStudents.length})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      placeholder="Search name or ID..."
                      className="rounded-xl border border-[#172554]/15 bg-white px-3 py-1.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                    />
                    <select
                      value={studentClassFilter}
                      onChange={(e) => setStudentClassFilter(e.target.value)}
                      className="rounded-xl border border-[#172554]/15 bg-white px-3 py-1.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                    >
                      <option value="all">All Classes</option>
                      {classes.map((c) => (
                        <option key={c.classId} value={c.classId}>
                          {c.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#172554]/10 text-[#64748B] dark:border-white/10">
                        <th className="py-2">Student ID</th>
                        <th className="py-2">Name</th>
                        <th className="py-2">Class</th>
                        <th className="py-2">Lessons Done</th>
                        <th className="py-2">Quizzes</th>
                        <th className="py-2">Status</th>
                        <th className="py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStudents.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-6 text-center text-[#64748B] dark:text-slate-400">
                            No student profiles created yet.
                          </td>
                        </tr>
                      ) : (
                        filteredStudents.map((s) => (
                          <tr key={s.uid} className="border-b border-[#172554]/5 dark:border-white/5">
                            <td className="py-2.5 font-mono-nums font-semibold text-[#172554] dark:text-[#BFE8FF]">
                              {s.studentId}
                            </td>
                            <td className="py-2.5 font-medium">{s.fullName}</td>
                            <td className="py-2.5">{s.classId}</td>
                            <td className="py-2.5 font-mono-nums">{s.completedLessonsCount ?? 0}</td>
                            <td className="py-2.5 font-mono-nums">{s.quizAttemptsCount ?? 0}</td>
                            <td className="py-2.5">
                              <span
                                className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                                  s.accountStatus === 'suspended'
                                    ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                }`}
                              >
                                {s.accountStatus}
                              </span>
                            </td>
                            <td className="py-2.5">
                              <button
                                type="button"
                                onClick={() => void toggleStudentStatus(s)}
                                className="rounded-lg border border-[#172554]/15 px-2.5 py-1 text-[11px] font-semibold hover:bg-[#E7F5FF] dark:border-white/15"
                              >
                                {s.accountStatus === 'suspended' ? 'Activate' : 'Pause'}
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: HOMEPAGE CUSTOMIZATION */}
          {tab === 'homepage' && (
            <form onSubmit={handleSaveSettings} className="glass-surface space-y-4 rounded-3xl p-6">
              <h2 className="font-display text-xl font-bold text-[#172033] dark:text-white">
                Homepage Customization
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <input
                  type="text"
                  value={draftSettings.homepageSettings.heroTitleEn}
                  onChange={(e) =>
                    setDraftSettings({
                      ...draftSettings,
                      homepageSettings: { ...draftSettings.homepageSettings, heroTitleEn: e.target.value },
                    })
                  }
                  placeholder="Hero Heading (EN)"
                  className="rounded-xl border border-[#172554]/15 bg-white px-3.5 py-2.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                />
                <input
                  type="text"
                  value={draftSettings.homepageSettings.heroTitleBn}
                  onChange={(e) =>
                    setDraftSettings({
                      ...draftSettings,
                      homepageSettings: { ...draftSettings.homepageSettings, heroTitleBn: e.target.value },
                    })
                  }
                  placeholder="Hero Heading (BN)"
                  className="rounded-xl border border-[#172554]/15 bg-white px-3.5 py-2.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                />
                <input
                  type="text"
                  value={draftSettings.homepageSettings.heroSubtitleEn}
                  onChange={(e) =>
                    setDraftSettings({
                      ...draftSettings,
                      homepageSettings: { ...draftSettings.homepageSettings, heroSubtitleEn: e.target.value },
                    })
                  }
                  placeholder="Hero Subtitle (EN)"
                  className="rounded-xl border border-[#172554]/15 bg-white px-3.5 py-2.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                />
                <input
                  type="text"
                  value={draftSettings.homepageSettings.heroSubtitleBn}
                  onChange={(e) =>
                    setDraftSettings({
                      ...draftSettings,
                      homepageSettings: { ...draftSettings.homepageSettings, heroSubtitleBn: e.target.value },
                    })
                  }
                  placeholder="Hero Subtitle (BN)"
                  className="rounded-xl border border-[#172554]/15 bg-white px-3.5 py-2.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                />
                <input
                  type="text"
                  value={draftSettings.homepageSettings.announcementBannerEn}
                  onChange={(e) =>
                    setDraftSettings({
                      ...draftSettings,
                      homepageSettings: { ...draftSettings.homepageSettings, announcementBannerEn: e.target.value },
                    })
                  }
                  placeholder="Announcement Banner (EN)"
                  className="rounded-xl border border-[#172554]/15 bg-white px-3.5 py-2.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                />
                <input
                  type="text"
                  value={draftSettings.homepageSettings.announcementBannerBn}
                  onChange={(e) =>
                    setDraftSettings({
                      ...draftSettings,
                      homepageSettings: { ...draftSettings.homepageSettings, announcementBannerBn: e.target.value },
                    })
                  }
                  placeholder="Announcement Banner (BN)"
                  className="rounded-xl border border-[#172554]/15 bg-white px-3.5 py-2.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="flex flex-wrap gap-4 text-xs">
                {(
                  [
                    ['showAnnouncementBanner', 'Show Announcement Banner'],
                    ['showPopularSubjects', 'Show Popular Categories'],
                    ['showBasicToPro', 'Show Featured Lessons'],
                    ['showOneShot', 'Show Quick Revision'],
                    ['showAiIntro', 'Show AI Tutor Banner'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={draftSettings.homepageSettings[key]}
                      onChange={(e) =>
                        setDraftSettings({
                          ...draftSettings,
                          homepageSettings: { ...draftSettings.homepageSettings, [key]: e.target.checked },
                        })
                      }
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>

              <button
                type="submit"
                disabled={savingBusy}
                className="rounded-xl bg-[#172554] px-6 py-2.5 text-xs font-semibold text-white transition hover:bg-[#263B91] dark:bg-[#BFE8FF] dark:text-[#172554]"
              >
                {savingBusy ? 'Saving...' : 'Save Homepage Settings'}
              </button>
            </form>
          )}

          {/* TAB 7: BRAND & COLORS */}
          {tab === 'settings' && (
            <form onSubmit={handleSaveSettings} className="glass-surface space-y-4 rounded-3xl p-6">
              <h2 className="font-display text-xl font-bold text-[#172033] dark:text-white">
                Website Branding, Theme Colors & Controls
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <input
                  type="text"
                  value={draftSettings.branding.siteName}
                  onChange={(e) =>
                    setDraftSettings({ ...draftSettings, branding: { ...draftSettings.branding, siteName: e.target.value } })
                  }
                  placeholder="Site Name"
                  className="rounded-xl border border-[#172554]/15 bg-white px-3.5 py-2.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                />
                <input
                  type="text"
                  value={draftSettings.branding.contactEmail}
                  onChange={(e) =>
                    setDraftSettings({ ...draftSettings, branding: { ...draftSettings.branding, contactEmail: e.target.value } })
                  }
                  placeholder="Contact Email"
                  className="rounded-xl border border-[#172554]/15 bg-white px-3.5 py-2.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
                <label className="block">
                  Primary Navy
                  <input
                    type="color"
                    value={draftSettings.theme.primaryNavy}
                    onChange={(e) =>
                      setDraftSettings({ ...draftSettings, theme: { ...draftSettings.theme, primaryNavy: e.target.value } })
                    }
                    className="mt-1 h-9 w-full rounded-lg"
                  />
                </label>
                <label className="block">
                  Secondary Navy
                  <input
                    type="color"
                    value={draftSettings.theme.secondaryNavy}
                    onChange={(e) =>
                      setDraftSettings({ ...draftSettings, theme: { ...draftSettings.theme, secondaryNavy: e.target.value } })
                    }
                    className="mt-1 h-9 w-full rounded-lg"
                  />
                </label>
                <label className="block">
                  Ice Blue
                  <input
                    type="color"
                    value={draftSettings.theme.iceBlue}
                    onChange={(e) =>
                      setDraftSettings({ ...draftSettings, theme: { ...draftSettings.theme, iceBlue: e.target.value } })
                    }
                    className="mt-1 h-9 w-full rounded-lg"
                  />
                </label>
                <label className="block">
                  Light Blue
                  <input
                    type="color"
                    value={draftSettings.theme.lightBlue}
                    onChange={(e) =>
                      setDraftSettings({ ...draftSettings, theme: { ...draftSettings.theme, lightBlue: e.target.value } })
                    }
                    className="mt-1 h-9 w-full rounded-lg"
                  />
                </label>
              </div>

              <label className="flex items-center gap-2 text-xs font-semibold text-red-600 dark:text-red-400">
                <input
                  type="checkbox"
                  checked={draftSettings.featureFlags.maintenanceMode}
                  onChange={(e) =>
                    setDraftSettings({
                      ...draftSettings,
                      featureFlags: { ...draftSettings.featureFlags, maintenanceMode: e.target.checked },
                    })
                  }
                />
                <span>Enable Maintenance Mode (Non-admins see scheduled maintenance banner)</span>
              </label>

              <button
                type="submit"
                disabled={savingBusy}
                className="rounded-xl bg-[#172554] px-6 py-2.5 text-xs font-semibold text-white transition hover:bg-[#263B91] dark:bg-[#BFE8FF] dark:text-[#172554]"
              >
                {savingBusy ? 'Saving...' : 'Save Website Settings'}
              </button>
            </form>
          )}

          {/* TAB 8: AI TUTOR SETTINGS */}
          {tab === 'ai' && (
            <form onSubmit={handleSaveSettings} className="glass-surface space-y-4 rounded-3xl p-6">
              <h2 className="font-display text-xl font-bold text-[#172033] dark:text-white">
                AI Personal Tutor Configuration
              </h2>
              <p className="text-xs text-[#64748B] dark:text-slate-400">
                API keys are securely stored in backend environment secrets and are never exposed in the client UI.
              </p>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="text-xs font-semibold">
                  Gemini Model
                  <select
                    value={draftSettings.aiSettings.model}
                    onChange={(e) =>
                      setDraftSettings({
                        ...draftSettings,
                        aiSettings: {
                          ...draftSettings.aiSettings,
                          model: e.target.value as 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite',
                        },
                      })
                    }
                    className="mt-1.5 w-full rounded-xl border border-[#172554]/15 bg-white px-3 py-2.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="gemini-4-hydrogen">Gemini 4 Hydrogen (Recommended)</option>
                    <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite (Fast)</option>
                  </select>
                </label>

                <label className="text-xs font-semibold">
                  Daily Quota Per Student
                  <input
                    type="number"
                    min={5}
                    max={500}
                    value={draftSettings.aiSettings.dailyQuotaPerStudent}
                    onChange={(e) =>
                      setDraftSettings({
                        ...draftSettings,
                        aiSettings: { ...draftSettings.aiSettings, dailyQuotaPerStudent: Number(e.target.value) },
                      })
                    }
                    className="mt-1.5 w-full rounded-xl border border-[#172554]/15 bg-white px-3 py-2.5 text-xs font-mono-nums dark:border-white/15 dark:bg-slate-800 dark:text-white"
                  />
                </label>
              </div>

              <label className="block text-xs font-semibold">
                System Instructions
                <textarea
                  rows={4}
                  value={draftSettings.aiSettings.systemInstructions}
                  onChange={(e) =>
                    setDraftSettings({
                      ...draftSettings,
                      aiSettings: { ...draftSettings.aiSettings, systemInstructions: e.target.value },
                    })
                  }
                  className="mt-1.5 w-full rounded-xl border border-[#172554]/15 bg-white p-3 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                />
              </label>

              <div className="flex flex-wrap gap-4 text-xs">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={draftSettings.aiSettings.enabled}
                    onChange={(e) =>
                      setDraftSettings({
                        ...draftSettings,
                        aiSettings: { ...draftSettings.aiSettings, enabled: e.target.checked },
                      })
                    }
                  />
                  <span>Enable AI Tutor & 3D Guide</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={draftSettings.aiSettings.allowPdfUpload}
                    onChange={(e) =>
                      setDraftSettings({
                        ...draftSettings,
                        aiSettings: { ...draftSettings.aiSettings, allowPdfUpload: e.target.checked },
                      })
                    }
                  />
                  <span>Allow PDF Uploads</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={draftSettings.aiSettings.allowVoiceTutor}
                    onChange={(e) =>
                      setDraftSettings({
                        ...draftSettings,
                        aiSettings: { ...draftSettings.aiSettings, allowVoiceTutor: e.target.checked },
                      })
                    }
                  />
                  <span>Allow Voice Mode</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={savingBusy}
                className="rounded-xl bg-[#172554] px-6 py-2.5 text-xs font-semibold text-white transition hover:bg-[#263B91] dark:bg-[#BFE8FF] dark:text-[#172554]"
              >
                {savingBusy ? 'Saving...' : 'Save AI Settings'}
              </button>
            </form>
          )}

          {/* TAB 9: ADMIN PASSWORD SECURITY */}
          {tab === 'security' && (
            <form onSubmit={handleChangeAdminPasswordSubmit} className="glass-surface max-w-xl space-y-4 rounded-3xl p-6">
              <div className="flex items-center gap-2.5">
                <KeyRound className="h-5 w-5 text-[#172554] dark:text-[#BFE8FF]" />
                <h2 className="font-display text-xl font-bold text-[#172033] dark:text-white">
                  {language === 'bn' ? 'অ্যাডমিন পোর্টাল পাসওয়ার্ড পরিবর্তন' : 'Change Admin Portal Password'}
                </h2>
              </div>
              <p className="text-xs text-[#64748B] dark:text-slate-400">
                {language === 'bn'
                  ? 'নিরাপত্তার জন্য শক্তিশালী পাসওয়ার্ড (কমপক্ষে ৮ অক্ষর) ব্যবহার করুন।'
                  : 'Update your dedicated Admin Portal password anytime. Passwords are stored salted & bcrypt-hashed on the server.'}
              </p>

              {passChangeError && (
                <div className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-50 px-3.5 py-2.5 text-xs text-red-700 dark:bg-red-950/50 dark:text-red-200">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{passChangeError}</span>
                </div>
              )}

              {passChangeSuccess && (
                <div className="flex items-start gap-2 rounded-xl border border-emerald-500/25 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{passChangeSuccess}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#172033] dark:text-slate-200">
                  {language === 'bn' ? 'বর্তমান পাসওয়ার্ড' : 'Current Password'}
                </label>
                <input
                  type="password"
                  required
                  value={curAdminPass}
                  onChange={(e) => setCurAdminPass(e.target.value)}
                  placeholder="••••••••"
                  className="mt-1.5 w-full rounded-xl border border-[#172554]/15 bg-white px-3.5 py-2.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#172033] dark:text-slate-200">
                  {language === 'bn' ? 'নতুন পাসওয়ার্ড (কমপক্ষে ৮ অক্ষর)' : 'New Password (min 8 characters)'}
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newAdminPass}
                  onChange={(e) => setNewAdminPass(e.target.value)}
                  placeholder="••••••••"
                  className="mt-1.5 w-full rounded-xl border border-[#172554]/15 bg-white px-3.5 py-2.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#172033] dark:text-slate-200">
                  {language === 'bn' ? 'নতুন পাসওয়ার্ড নিশ্চিত করুন' : 'Confirm New Password'}
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmAdminPass}
                  onChange={(e) => setConfirmAdminPass(e.target.value)}
                  placeholder="••••••••"
                  className="mt-1.5 w-full rounded-xl border border-[#172554]/15 bg-white px-3.5 py-2.5 text-xs dark:border-white/15 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <button
                type="submit"
                disabled={passChangeLoading}
                className="rounded-xl bg-[#172554] px-6 py-2.5 text-xs font-semibold text-white transition hover:bg-[#263B91] disabled:opacity-50 dark:bg-[#BFE8FF] dark:text-[#172554]"
              >
                {passChangeLoading
                  ? language === 'bn'
                    ? 'সংরক্ষণ হচ্ছে...'
                    : 'Updating...'
                  : language === 'bn'
                    ? 'পাসওয়ার্ড আপডেট করুন'
                    : 'Update Admin Password'}
              </button>
            </form>
          )}
        </main>
      </div>
    </div>
  );
};
