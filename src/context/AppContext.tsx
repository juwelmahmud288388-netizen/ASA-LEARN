import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithCustomToken,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
  testFirestoreConnection,
} from '../lib/firebase';
import { buildInitialSeedData, DEFAULT_APP_SETTINGS } from '../lib/defaultCurriculum';
import { createClientId } from '../lib/utils';
import type {
  AdminAccount,
  AiConversation,
  Announcement,
  AppSettings,
  BookmarkItem,
  CategoryItem,
  ChapterItem,
  ClassItem,
  Language,
  LessonItem,
  QuizAttempt,
  QuizItem,
  ResourceItem,
  StudentNote,
  StudentProgress,
  SubjectItem,
  ThemeMode,
  TopicItem,
  UserProfile,
} from '../types';

const OWNER_EMAIL = 'juwelmahmud288388@gmail.com';

interface AppContextValue {
  firebaseUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  authLoading: boolean;
  isAdmin: boolean;
  currentAdmin: AdminAccount | null;
  adminSessionActive: boolean;
  adminPasswordUpdatedAt: string | null;
  hasFirestoreAdminAuth: boolean;
  firebaseConnected: boolean;
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  showLanguageModal: boolean;
  setShowLanguageModal: (open: boolean) => void;
  theme: ThemeMode;
  toggleTheme: () => Promise<void>;
  appSettings: AppSettings;
  categories: CategoryItem[];
  classes: ClassItem[];
  subjects: SubjectItem[];
  chapters: ChapterItem[];
  topics: TopicItem[];
  lessons: LessonItem[];
  resources: ResourceItem[];
  quizzes: QuizItem[];
  announcements: Announcement[];
  curriculumLoading: boolean;
  needsAdminSeed: boolean;
  refreshCurriculum: () => Promise<void>;
  seedCurriculumFromAdmin: () => Promise<void>;
  syncItemToFirestore: (colName: string, id: string, item: Record<string, unknown>) => Promise<void>;
  deleteItemFromFirestore: (colName: string, id: string) => Promise<void>;
  syncAdminInviteToFirestore: (admin: AdminAccount) => Promise<void>;
  progressList: StudentProgress[];
  bookmarks: BookmarkItem[];
  notes: StudentNote[];
  quizAttempts: QuizAttempt[];
  aiConversations: AiConversation[];
  createStudentProfile: (payload: {
    fullName: string;
    classId: string;
    preferredLanguage: Language;
    password: string;
  }) => Promise<{ profile: UserProfile }>;
  unlockStudentProfile: (password: string) => Promise<{ profile: UserProfile }>;
  loginAdminWithPassword: (password: string) => Promise<void>;
  logoutAdmin: () => Promise<void>;
  changeAdminPassword: (currentPassword: string, newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUserProfile: (
    patch: Partial<
      Pick<UserProfile, 'fullName' | 'classId' | 'preferredLanguage' | 'preferredTheme' | 'dailyGoalMinutes' | 'activeBorder'>
    >
  ) => Promise<void>;
  toggleLessonComplete: (lesson: LessonItem, completed: boolean) => Promise<void>;
  recordLessonView: (lesson: LessonItem) => Promise<void>;
  toggleBookmark: (itemId: string, itemType: BookmarkItem['itemType'], title: string) => Promise<void>;
  saveNote: (note: { noteId?: string; lessonId?: string; subjectId?: string; title: string; content: string }) => Promise<void>;
  deleteNote: (noteId: string) => Promise<void>;
  recordQuizAttempt: (quizId: string, lessonId: string, score: number, totalQuestions: number) => Promise<void>;
  dailyCheckIn: () => Promise<{
    checkedInToday: boolean;
    alreadyCheckedIn: boolean;
    newlyUnlocked: { badges: string[]; trophies: string[] };
  } | null>;
  studentModalOpen: boolean;
  studentModalTab: 'create' | 'unlock';
  openStudentModal: (tab?: 'create' | 'unlock') => void;
  closeStudentModal: () => void;
  aiDrawerOpen: boolean;
  setAiDrawerOpen: (open: boolean) => void;
  aiContextLesson: LessonItem | null;
  aiInitialMode: string | null;
  openAiWithLesson: (lesson: LessonItem | null, initialMode?: string) => void;
  route: string;
  navigate: (to: string) => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initialSeed = useMemo(() => buildInitialSeedData(), []);

  const [route, setRoute] = useState<string>(() => window.location.pathname || '/');
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [adminSessionActive, setAdminSessionActive] = useState(false);
  const [currentAdmin, setCurrentAdmin] = useState<AdminAccount | null>(null);
  const [adminPasswordUpdatedAt, setAdminPasswordUpdatedAt] = useState<string | null>(() => {
    try {
      const raw = localStorage.getItem('asa_admin_security_meta');
      if (raw) return (JSON.parse(raw) as { updatedAt?: string }).updatedAt || null;
    } catch {
      // ignore
    }
    return null;
  });
  const [firebaseConnected, setFirebaseConnected] = useState(false);

  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('asa_lang');
    return saved === 'bn' ? 'bn' : 'en';
  });
  const [showLanguageModal, setShowLanguageModal] = useState<boolean>(() => {
    return !localStorage.getItem('asa_lang_chosen');
  });
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('asa_theme');
    return saved === 'dark' ? 'dark' : 'light';
  });

  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [categories, setCategories] = useState<CategoryItem[]>(initialSeed.categories);
  const [classes, setClasses] = useState<ClassItem[]>(initialSeed.classes);
  const [subjects, setSubjects] = useState<SubjectItem[]>(initialSeed.subjects);
  const [chapters, setChapters] = useState<ChapterItem[]>(initialSeed.chapters);
  const [topics, setTopics] = useState<TopicItem[]>(initialSeed.topics);
  const [lessons, setLessons] = useState<LessonItem[]>(initialSeed.lessons);
  const [resources, setResources] = useState<ResourceItem[]>(initialSeed.resources);
  const [quizzes, setQuizzes] = useState<QuizItem[]>(initialSeed.quizzes);
  const [announcements, setAnnouncements] = useState<Announcement[]>(initialSeed.announcements);
  const [curriculumLoading, setCurriculumLoading] = useState(false);
  const [needsAdminSeed, setNeedsAdminSeed] = useState(false);

  const [progressList, setProgressList] = useState<StudentProgress[]>([]);
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [notes, setNotes] = useState<StudentNote[]>([]);
  const [quizAttempts, setQuizAttempts] = useState<QuizAttempt[]>([]);
  const [aiConversations, setAiConversations] = useState<AiConversation[]>([]);

  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [aiContextLesson, setAiContextLesson] = useState<LessonItem | null>(null);
  const [aiInitialMode, setAiInitialMode] = useState<string | null>(null);
  const [studentModalOpen, setStudentModalOpen] = useState(false);
  const [studentModalTab, setStudentModalTab] = useState<'create' | 'unlock'>('create');

  const navigate = useCallback((to: string) => {
    if (to !== window.location.pathname) {
      window.history.pushState({}, '', to);
    }
    setRoute(to);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const onPop = () => setRoute(window.location.pathname || '/');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Apply Dark Mode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('asa_theme', theme);
  }, [theme]);

  // Apply dynamic brand color tokens from Admin settings
  useEffect(() => {
    const root = document.documentElement;
    const t = appSettings.theme;
    if (t?.primaryNavy) root.style.setProperty('--asa-primary', t.primaryNavy);
    if (t?.secondaryNavy) root.style.setProperty('--asa-secondary', t.secondaryNavy);
    if (t?.iceBlue) root.style.setProperty('--asa-ice', t.iceBlue);
    if (t?.lightBlue) root.style.setProperty('--asa-light-blue', t.lightBlue);
  }, [appSettings.theme]);

  const hasFirestoreAdminAuth = useMemo(() => {
    if (!firebaseUser) return false;
    if (firebaseUser.email === OWNER_EMAIL && firebaseUser.emailVerified) return true;
    if (
      currentAdmin &&
      currentAdmin.active &&
      currentAdmin.email &&
      firebaseUser.email?.toLowerCase() === currentAdmin.email.toLowerCase() &&
      firebaseUser.emailVerified
    ) {
      return true;
    }
    if (userProfile?.role === 'admin' || userProfile?.role === 'owner') return true;
    return false;
  }, [firebaseUser, userProfile, currentAdmin]);

  const isAdmin = useMemo(() => {
    return adminSessionActive || hasFirestoreAdminAuth;
  }, [adminSessionActive, hasFirestoreAdminAuth]);

  const refreshCurriculum = useCallback(async () => {
    try {
      const res = await fetch('/api/curriculum', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      if (data.settings) setAppSettings(data.settings);
      if (Array.isArray(data.categories)) {
        setCategories(
          data.categories
            .filter((c: CategoryItem) => isAdmin || c.status === 'published')
            .sort((a: CategoryItem, b: CategoryItem) => Number(a.order || 0) - Number(b.order || 0))
        );
      }
      if (Array.isArray(data.classes)) {
        setClasses(
          data.classes
            .filter((c: ClassItem) => isAdmin || c.status === 'published')
            .sort((a: ClassItem, b: ClassItem) => Number(a.order || 0) - Number(b.order || 0))
        );
      }
      if (Array.isArray(data.subjects)) {
        setSubjects(
          data.subjects
            .filter((s: SubjectItem) => isAdmin || s.status === 'published')
            .sort((a: SubjectItem, b: SubjectItem) => Number(a.order || 0) - Number(b.order || 0))
        );
      }
      if (Array.isArray(data.chapters)) {
        setChapters(
          data.chapters
            .filter((ch: ChapterItem) => isAdmin || ch.status === 'published')
            .sort((a: ChapterItem, b: ChapterItem) => Number(a.order || 0) - Number(b.order || 0))
        );
      }
      if (Array.isArray(data.topics)) {
        setTopics(
          data.topics
            .filter((tp: TopicItem) => isAdmin || tp.status === 'published')
            .sort((a: TopicItem, b: TopicItem) => Number(a.order || 0) - Number(b.order || 0))
        );
      }
      if (Array.isArray(data.lessons)) {
        setLessons(
          data.lessons
            .filter((l: LessonItem) => isAdmin || l.status === 'published')
            .sort((a: LessonItem, b: LessonItem) => Number(a.order || 0) - Number(b.order || 0))
        );
      }
      if (Array.isArray(data.resources)) setResources(data.resources);
      if (Array.isArray(data.quizzes)) {
        setQuizzes(data.quizzes.filter((q: QuizItem) => isAdmin || q.status === 'published'));
      }
      if (Array.isArray(data.announcements)) {
        setAnnouncements(data.announcements.filter((a: Announcement) => isAdmin || a.published));
      }
      setNeedsAdminSeed(false);
    } catch (err) {
      console.warn('Could not refresh curriculum from /api/curriculum:', err);
    } finally {
      setCurriculumLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void refreshCurriculum();
  }, [refreshCurriculum]);

  useEffect(() => {
    fetch('/api/admin/session', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (data?.passwordUpdatedAt) {
          setAdminPasswordUpdatedAt(String(data.passwordUpdatedAt));
        }
        if (data?.authenticated) {
          setAdminSessionActive(true);
          if (data.admin) setCurrentAdmin(data.admin);
        }
      })
      .catch(() => {});
  }, []);

  // Validate Firestore connection without blocking UI
  useEffect(() => {
    void testFirestoreConnection().then((res) => {
      setFirebaseConnected(res.ok);
    });
  }, []);

  // Load Student Cookie Session or Firebase Auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      try {
        const res = await fetch('/api/student/profile/me', { credentials: 'include' });
        const data = await res.json();
        if (data?.profile) {
          setUserProfile(data.profile);
          setProgressList(Array.isArray(data.progressList) ? data.progressList : []);
          setBookmarks(Array.isArray(data.bookmarks) ? data.bookmarks : []);
          setNotes(Array.isArray(data.notes) ? data.notes : []);
          setQuizAttempts(Array.isArray(data.quizAttempts) ? data.quizAttempts : []);
          if (data.profile.preferredLanguage) {
            setLanguageState(data.profile.preferredLanguage);
            localStorage.setItem('asa_lang', data.profile.preferredLanguage);
          }
          if (data.profile.preferredTheme) {
            setThemeState(data.profile.preferredTheme);
          }
          setAuthLoading(false);
          return;
        }
      } catch {
        // Ignore if student cookie is not active
      }

      if (!fbUser) {
        setUserProfile(null);
      }
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // Optional Firestore Real-time Sync (only overrides local state when Firestore actually has docs)
  useEffect(() => {
    const makeQuery = (colName: string) =>
      hasFirestoreAdminAuth ? collection(db, colName) : query(collection(db, colName), where('status', '==', 'published'));

    const unsubs: Array<() => void> = [];
    unsubs.push(
      onSnapshot(
        doc(db, 'appSettings', 'global'),
        (snap) => {
          if (snap.exists()) {
            const data = snap.data() as Partial<AppSettings>;
            setAppSettings((prev) => ({
              ...prev,
              ...data,
              branding: { ...prev.branding, ...(data.branding || {}) },
              theme: { ...prev.theme, ...(data.theme || {}) },
              languageSettings: { ...prev.languageSettings, ...(data.languageSettings || {}) },
              homepageSettings: { ...prev.homepageSettings, ...(data.homepageSettings || {}) },
              aiSettings: { ...prev.aiSettings, ...(data.aiSettings || {}) },
              featureFlags: { ...prev.featureFlags, ...(data.featureFlags || {}) },
            }));
          }
        },
        () => {}
      )
    );
    unsubs.push(
      onSnapshot(
        makeQuery('categories'),
        (snap) => {
          if (snap.docs.length > 0) {
            setCategories(snap.docs.map((d) => d.data() as CategoryItem).sort((a, b) => a.order - b.order));
          }
        },
        () => {}
      )
    );
    unsubs.push(
      onSnapshot(
        makeQuery('classes'),
        (snap) => {
          if (snap.docs.length > 0) {
            setClasses(snap.docs.map((d) => d.data() as ClassItem).sort((a, b) => a.order - b.order));
          }
        },
        () => {}
      )
    );
    unsubs.push(
      onSnapshot(
        makeQuery('subjects'),
        (snap) => {
          if (snap.docs.length > 0) {
            setSubjects(snap.docs.map((d) => d.data() as SubjectItem).sort((a, b) => a.order - b.order));
          }
        },
        () => {}
      )
    );
    unsubs.push(
      onSnapshot(
        makeQuery('chapters'),
        (snap) => {
          if (snap.docs.length > 0) {
            setChapters(snap.docs.map((d) => d.data() as ChapterItem).sort((a, b) => a.order - b.order));
          }
        },
        () => {}
      )
    );
    unsubs.push(
      onSnapshot(
        makeQuery('topics'),
        (snap) => {
          if (snap.docs.length > 0) {
            setTopics(snap.docs.map((d) => d.data() as TopicItem).sort((a, b) => a.order - b.order));
          }
        },
        () => {}
      )
    );
    unsubs.push(
      onSnapshot(
        makeQuery('lessons'),
        (snap) => {
          if (snap.docs.length > 0) {
            setLessons(snap.docs.map((d) => d.data() as LessonItem).sort((a, b) => a.order - b.order));
          }
        },
        () => {}
      )
    );
    return () => {
      for (const u of unsubs) u();
    };
  }, [hasFirestoreAdminAuth]);

  const stripUndefined = (obj: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) out[k] = v;
    }
    return out;
  };

  const syncItemToFirestore = useCallback(
    async (colName: string, id: string, item: Record<string, unknown>) => {
      if (!hasFirestoreAdminAuth) return;
      try {
        const payload = stripUndefined(item);
        if (colName === 'appSettings') {
          await setDoc(doc(db, 'appSettings', 'global'), { ...payload, settingId: 'global', updatedAt: serverTimestamp() }, { merge: true });
        } else if (colName === 'resources' || colName === 'announcements') {
          await setDoc(doc(db, colName, id), { ...payload, createdAt: serverTimestamp() }, { merge: true });
        } else {
          await setDoc(doc(db, colName, id), { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
        }
        setFirebaseConnected(true);
      } catch {
        // Fallback already stored via backend /api/admin/content/save
      }
    },
    [hasFirestoreAdminAuth]
  );

  const deleteItemFromFirestore = useCallback(
    async (colName: string, id: string) => {
      if (!hasFirestoreAdminAuth) return;
      try {
        await deleteDoc(doc(db, colName, id));
      } catch {
        // Non-blocking fallback
      }
    },
    [hasFirestoreAdminAuth]
  );

  const syncAdminInviteToFirestore = useCallback(
    async (admin: AdminAccount) => {
      if (!hasFirestoreAdminAuth || !admin.email) return;
      const cleanEmail = admin.email.trim().toLowerCase();
      try {
        await setDoc(
          doc(db, 'adminEmails', cleanEmail),
          {
            email: cleanEmail,
            name: admin.name.slice(0, 120),
            role: admin.role,
            active: admin.active,
            createdAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch {
        // Non-blocking
      }
    },
    [hasFirestoreAdminAuth]
  );

  const seedCurriculumFromAdmin = useCallback(async () => {
    const batch = writeBatch(db);
    batch.set(doc(db, 'appSettings', 'global'), { ...appSettings, updatedAt: serverTimestamp() }, { merge: true });
    for (const item of categories) {
      batch.set(doc(db, 'categories', item.categoryId), { ...stripUndefined(item as unknown as Record<string, unknown>), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    }
    for (const item of classes) {
      batch.set(doc(db, 'classes', item.classId), { ...stripUndefined(item as unknown as Record<string, unknown>), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    }
    for (const item of subjects) {
      batch.set(doc(db, 'subjects', item.subjectId), { ...stripUndefined(item as unknown as Record<string, unknown>), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    }
    for (const item of chapters) {
      batch.set(doc(db, 'chapters', item.chapterId), { ...stripUndefined(item as unknown as Record<string, unknown>), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    }
    for (const item of topics) {
      batch.set(doc(db, 'topics', item.topicId), { ...stripUndefined(item as unknown as Record<string, unknown>), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    }
    for (const item of lessons) {
      batch.set(doc(db, 'lessons', item.lessonId), { ...stripUndefined(item as unknown as Record<string, unknown>), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    }
    for (const item of resources) {
      batch.set(doc(db, 'resources', item.resourceId), { ...stripUndefined(item as unknown as Record<string, unknown>), createdAt: serverTimestamp() });
    }
    for (const item of quizzes) {
      batch.set(doc(db, 'quizzes', item.quizId), { ...stripUndefined(item as unknown as Record<string, unknown>), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    }
    for (const item of announcements) {
      batch.set(doc(db, 'announcements', item.announcementId), { ...stripUndefined(item as unknown as Record<string, unknown>), createdAt: serverTimestamp() });
    }
    await batch.commit();
    setFirebaseConnected(true);
    await refreshCurriculum();
  }, [appSettings, categories, classes, subjects, chapters, topics, lessons, resources, quizzes, announcements, refreshCurriculum]);

  const setLanguage = useCallback(
    async (lang: Language) => {
      setLanguageState(lang);
      localStorage.setItem('asa_lang', lang);
      localStorage.setItem('asa_lang_chosen', '1');
      if (userProfile) {
        setUserProfile((prev) => (prev ? { ...prev, preferredLanguage: lang } : prev));
        fetch('/api/student/profile/me', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ preferredLanguage: lang }),
        }).catch(() => {});
      }
      if (firebaseUser?.uid) {
        try {
          await updateDoc(doc(db, 'users', firebaseUser.uid), {
            preferredLanguage: lang,
            updatedAt: serverTimestamp(),
          });
        } catch {
          // non-blocking
        }
      }
    },
    [userProfile, firebaseUser?.uid]
  );

  const toggleTheme = useCallback(async () => {
    const next: ThemeMode = theme === 'light' ? 'dark' : 'light';
    setThemeState(next);
    if (userProfile) {
      setUserProfile((prev) => (prev ? { ...prev, preferredTheme: next } : prev));
      fetch('/api/student/profile/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ preferredTheme: next }),
      }).catch(() => {});
    }
    if (firebaseUser?.uid) {
      try {
        await updateDoc(doc(db, 'users', firebaseUser.uid), {
          preferredTheme: next,
          updatedAt: serverTimestamp(),
        });
      } catch {
        // non-blocking
      }
    }
  }, [theme, userProfile, firebaseUser?.uid]);

  const createStudentProfile = useCallback(
    async (payload: { fullName: string; classId: string; preferredLanguage: Language; password: string }) => {
      const res = await fetch('/api/student/profile/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not create profile.');
      }
      setUserProfile(data.profile);
      setProgressList(Array.isArray(data.progressList) ? data.progressList : []);
      setBookmarks(Array.isArray(data.bookmarks) ? data.bookmarks : []);
      setNotes(Array.isArray(data.notes) ? data.notes : []);
      setQuizAttempts(Array.isArray(data.quizAttempts) ? data.quizAttempts : []);
      if (data.profile?.preferredLanguage) {
        setLanguageState(data.profile.preferredLanguage);
        localStorage.setItem('asa_lang', data.profile.preferredLanguage);
        localStorage.setItem('asa_lang_chosen', '1');
      }
      return { profile: data.profile as UserProfile };
    },
    []
  );

  const unlockStudentProfile = useCallback(async (password: string) => {
    const res = await fetch('/api/student/profile/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Could not unlock profile.');
    }
    setUserProfile(data.profile);
    setProgressList(Array.isArray(data.progressList) ? data.progressList : []);
    setBookmarks(Array.isArray(data.bookmarks) ? data.bookmarks : []);
    setNotes(Array.isArray(data.notes) ? data.notes : []);
    setQuizAttempts(Array.isArray(data.quizAttempts) ? data.quizAttempts : []);
    if (data.profile?.preferredLanguage) {
      setLanguageState(data.profile.preferredLanguage);
      localStorage.setItem('asa_lang', data.profile.preferredLanguage);
      localStorage.setItem('asa_lang_chosen', '1');
    }
    if (data.profile?.preferredTheme) {
      setThemeState(data.profile.preferredTheme);
    }
    return { profile: data.profile as UserProfile };
  }, []);

  const loginAdminWithPassword = useCallback(async (password: string) => {
    const cleanPassword = password.trim();
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ password: cleanPassword }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Admin authentication failed');
    }
    if (data.customToken) {
      try {
        await signInWithCustomToken(auth, data.customToken);
      } catch {
        // Admin cookie handles authorization cleanly
      }
    }
    if (data.passwordUpdatedAt) {
      setAdminPasswordUpdatedAt(String(data.passwordUpdatedAt));
    }
    if (data.admin) setCurrentAdmin(data.admin);
    setAdminSessionActive(true);
  }, []);

  const logoutAdmin = useCallback(async () => {
    await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' });
    setAdminSessionActive(false);
    setCurrentAdmin(null);
    if (firebaseUser) {
      await signOut(auth);
    }
    navigate('/');
  }, [firebaseUser, navigate]);

  const changeAdminPassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (firebaseUser) {
        try {
          const idToken = await firebaseUser.getIdToken();
          if (idToken) headers.Authorization = `Bearer ${idToken}`;
        } catch {
          // Admin cookie handles auth
        }
      }
      const res = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not update Admin Portal password');
      }
      const updatedAt = String(data.updatedAt || new Date().toISOString());
      setAdminPasswordUpdatedAt(updatedAt);
      try {
        const bytes = new TextEncoder().encode(`asa-admin-v1:${newPassword.trim()}`);
        const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
        const digest = Array.from(new Uint8Array(hashBuffer))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        localStorage.setItem(
          'asa_admin_security_meta',
          JSON.stringify({ updatedAt, passwordDigest: digest })
        );
      } catch {
        localStorage.setItem('asa_admin_security_meta', JSON.stringify({ updatedAt }));
      }
    },
    [firebaseUser]
  );

  const logout = useCallback(async () => {
    await Promise.allSettled([
      fetch('/api/student/profile/logout', { method: 'POST', credentials: 'include' }),
      fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }),
      signOut(auth),
    ]);
    setUserProfile(null);
    setProgressList([]);
    setBookmarks([]);
    setNotes([]);
    setQuizAttempts([]);
    setAiConversations([]);
    navigate('/');
  }, [navigate]);

  const updateUserProfile = useCallback(
    async (
      patch: Partial<
        Pick<UserProfile, 'fullName' | 'classId' | 'preferredLanguage' | 'preferredTheme' | 'dailyGoalMinutes' | 'activeBorder'>
      >
    ) => {
      if (!userProfile?.uid && !firebaseUser?.uid) throw new Error('Unlock your student profile first.');
      const res = await fetch('/api/student/profile/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (res.ok && data.profile) {
        setUserProfile(data.profile);
      } else {
        setUserProfile((prev) => (prev ? { ...prev, ...patch } : prev));
      }
      if (patch.preferredLanguage) {
        setLanguageState(patch.preferredLanguage);
        localStorage.setItem('asa_lang', patch.preferredLanguage);
      }
      if (patch.preferredTheme) setThemeState(patch.preferredTheme);
      if (firebaseUser?.uid) {
        try {
          await updateDoc(doc(db, 'users', firebaseUser.uid), {
            ...patch,
            updatedAt: serverTimestamp(),
          });
        } catch {
          // Cookie backend persisted already
        }
      }
    },
    [userProfile?.uid, firebaseUser?.uid]
  );

  const recordLessonView = useCallback(
    async (lesson: LessonItem) => {
      const uid = userProfile?.uid || firebaseUser?.uid;
      if (!uid) return;
      const existing = progressList.find((p) => p.lessonId === lesson.lessonId);
      try {
        const res = await fetch('/api/student/learning/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            lessonId: lesson.lessonId,
            classId: lesson.classId,
            subjectId: lesson.subjectId,
            chapterId: lesson.chapterId,
            completed: existing?.completed ?? false,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.progressList)) setProgressList(data.progressList);
          if (data.profile) setUserProfile(data.profile);
        }
      } catch {
        // non-blocking
      }
      if (firebaseUser?.uid) {
        const progressId = `${firebaseUser.uid}_${lesson.lessonId}`;
        try {
          await setDoc(
            doc(db, 'studentProgress', progressId),
            {
              progressId,
              studentId: firebaseUser.uid,
              lessonId: lesson.lessonId,
              classId: lesson.classId,
              subjectId: lesson.subjectId,
              chapterId: lesson.chapterId,
              completed: existing?.completed ?? false,
              lastViewedAt: serverTimestamp(),
            },
            { merge: true }
          );
        } catch {
          // non-blocking
        }
      }
    },
    [userProfile?.uid, firebaseUser?.uid, progressList]
  );

  const toggleLessonComplete = useCallback(
    async (lesson: LessonItem, completed: boolean) => {
      const uid = userProfile?.uid || firebaseUser?.uid;
      if (!uid) throw new Error('Unlock your profile with a password to save progress.');
      const res = await fetch('/api/student/learning/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          lessonId: lesson.lessonId,
          classId: lesson.classId,
          subjectId: lesson.subjectId,
          chapterId: lesson.chapterId,
          completed,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.progressList)) setProgressList(data.progressList);
        if (data.profile) setUserProfile(data.profile);
      }
      if (firebaseUser?.uid) {
        const progressId = `${firebaseUser.uid}_${lesson.lessonId}`;
        try {
          await setDoc(doc(db, 'studentProgress', progressId), {
            progressId,
            studentId: firebaseUser.uid,
            lessonId: lesson.lessonId,
            classId: lesson.classId,
            subjectId: lesson.subjectId,
            chapterId: lesson.chapterId,
            completed,
            ...(completed ? { completedAt: serverTimestamp() } : {}),
            lastViewedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `studentProgress/${progressId}`);
        }
      }
    },
    [userProfile?.uid, firebaseUser?.uid]
  );

  const toggleBookmark = useCallback(
    async (itemId: string, itemType: BookmarkItem['itemType'], title: string) => {
      const uid = userProfile?.uid || firebaseUser?.uid;
      if (!uid) {
        navigate('/login');
        return;
      }
      const res = await fetch('/api/student/learning/bookmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ itemId, itemType, title }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.bookmarks)) setBookmarks(data.bookmarks);
      }
      if (firebaseUser?.uid) {
        const existing = bookmarks.find((b) => b.itemId === itemId && b.itemType === itemType);
        const bookmarkId = existing?.bookmarkId || `${firebaseUser.uid}_${itemType}_${itemId}`.slice(0, 120);
        try {
          if (existing) {
            await deleteDoc(doc(db, 'bookmarks', bookmarkId));
          } else {
            await setDoc(doc(db, 'bookmarks', bookmarkId), {
              bookmarkId,
              studentId: firebaseUser.uid,
              itemId,
              itemType,
              title: title.slice(0, 200),
              createdAt: serverTimestamp(),
            });
          }
        } catch {
          // Cookie backend persisted
        }
      }
    },
    [userProfile?.uid, firebaseUser?.uid, bookmarks, navigate]
  );

  const saveNote = useCallback(
    async (note: { noteId?: string; lessonId?: string; subjectId?: string; title: string; content: string }) => {
      const uid = userProfile?.uid || firebaseUser?.uid;
      if (!uid) throw new Error('Unlock your profile first to save personal notes.');
      const res = await fetch('/api/student/learning/note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(note),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.notes)) setNotes(data.notes);
      }
      if (firebaseUser?.uid) {
        const noteId = note.noteId || createClientId('note');
        try {
          await setDoc(
            doc(db, 'studentNotes', noteId),
            {
              noteId,
              studentId: firebaseUser.uid,
              ...(note.lessonId ? { lessonId: note.lessonId } : {}),
              ...(note.subjectId ? { subjectId: note.subjectId } : {}),
              title: note.title.trim().slice(0, 200) || 'Untitled Note',
              content: note.content.slice(0, 10000),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        } catch {
          // Cookie backend persisted
        }
      }
    },
    [userProfile?.uid, firebaseUser?.uid]
  );

  const deleteNote = useCallback(
    async (noteId: string) => {
      const uid = userProfile?.uid || firebaseUser?.uid;
      if (!uid) return;
      const res = await fetch(`/api/student/learning/note/${encodeURIComponent(noteId)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.notes)) setNotes(data.notes);
      }
      if (firebaseUser?.uid) {
        try {
          await deleteDoc(doc(db, 'studentNotes', noteId));
        } catch {
          // Cookie backend persisted
        }
      }
    },
    [userProfile?.uid, firebaseUser?.uid]
  );

  const recordQuizAttempt = useCallback(
    async (quizId: string, lessonId: string, score: number, totalQuestions: number) => {
      const uid = userProfile?.uid || firebaseUser?.uid;
      if (!uid) return;
      const res = await fetch('/api/student/learning/quiz-attempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ quizId, lessonId, score, totalQuestions }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.quizAttempts)) setQuizAttempts(data.quizAttempts);
        if (data.profile) setUserProfile(data.profile);
      }
    },
    [userProfile?.uid, firebaseUser?.uid]
  );

  const dailyCheckIn = useCallback(async () => {
    const uid = userProfile?.uid || firebaseUser?.uid;
    if (!uid) return null;
    try {
      const res = await fetch('/api/student/learning/daily-checkin', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.profile) setUserProfile(data.profile);
      return {
        checkedInToday: Boolean(data.checkedInToday),
        alreadyCheckedIn: Boolean(data.alreadyCheckedIn),
        newlyUnlocked: data.newlyUnlocked || { badges: [], trophies: [] },
      };
    } catch {
      return null;
    }
  }, [userProfile?.uid, firebaseUser?.uid]);

  const openStudentModal = useCallback((tab: 'create' | 'unlock' = 'create') => {
    setStudentModalTab(tab);
    setStudentModalOpen(true);
  }, []);

  const closeStudentModal = useCallback(() => {
    setStudentModalOpen(false);
  }, []);

  const openAiWithLesson = useCallback((lesson: LessonItem | null, initialMode?: string) => {
    setAiContextLesson(lesson);
    setAiInitialMode(initialMode || null);
    setAiDrawerOpen(true);
  }, []);

  const value: AppContextValue = {
    firebaseUser,
    userProfile,
    authLoading,
    isAdmin,
    currentAdmin,
    adminSessionActive,
    adminPasswordUpdatedAt,
    hasFirestoreAdminAuth,
    firebaseConnected,
    language,
    setLanguage,
    showLanguageModal,
    setShowLanguageModal,
    theme,
    toggleTheme,
    appSettings,
    categories,
    classes,
    subjects,
    chapters,
    topics,
    lessons,
    resources,
    quizzes,
    announcements,
    curriculumLoading,
    needsAdminSeed,
    refreshCurriculum,
    seedCurriculumFromAdmin,
    syncItemToFirestore,
    deleteItemFromFirestore,
    syncAdminInviteToFirestore,
    progressList,
    bookmarks,
    notes,
    quizAttempts,
    aiConversations,
    createStudentProfile,
    unlockStudentProfile,
    loginAdminWithPassword,
    logoutAdmin,
    changeAdminPassword,
    logout,
    updateUserProfile,
    toggleLessonComplete,
    recordLessonView,
    toggleBookmark,
    saveNote,
    deleteNote,
    recordQuizAttempt,
    dailyCheckIn,
    studentModalOpen,
    studentModalTab,
    openStudentModal,
    closeStudentModal,
    aiDrawerOpen,
    setAiDrawerOpen,
    aiContextLesson,
    aiInitialMode,
    openAiWithLesson,
    route,
    navigate,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
