export type Language = 'bn' | 'en';
export type ThemeMode = 'light' | 'dark';
export type UserRole = 'student' | 'admin' | 'owner';
export type AccountStatus = 'active' | 'suspended';
export type LessonCategory = string;
export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';
export type PublishStatus = 'published' | 'draft';
export type ThreeDSceneType = 'trigonometry_triangle' | 'newton_orbit' | 'algebra_geometry' | 'molecule_atom';

export interface CategoryItem {
  categoryId: string;
  title: string;
  titleBn: string;
  description?: string;
  descriptionBn?: string;
  icon?: string;
  order: number;
  status: PublishStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserProfile {
  uid: string;
  studentId: string;
  fullName: string;
  classId: string;
  preferredLanguage: Language;
  preferredTheme?: ThemeMode;
  role: UserRole;
  accountStatus: AccountStatus;
  dailyGoalMinutes?: number;
  streakDays?: number;
  phoneNumber?: string;
  email?: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface ClassItem {
  classId: string;
  title: string;
  titleBn: string;
  description?: string;
  descriptionBn?: string;
  order: number;
  status: PublishStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SubjectItem {
  subjectId: string;
  classId: string;
  title: string;
  titleBn: string;
  description?: string;
  descriptionBn?: string;
  order: number;
  status: PublishStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ChapterItem {
  chapterId: string;
  classId: string;
  subjectId: string;
  title: string;
  titleBn: string;
  description?: string;
  descriptionBn?: string;
  order: number;
  status: PublishStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface TopicItem {
  topicId: string;
  classId: string;
  subjectId: string;
  chapterId: string;
  title: string;
  titleBn: string;
  description?: string;
  descriptionBn?: string;
  order: number;
  status: PublishStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface LessonItem {
  lessonId: string;
  classId: string;
  subjectId: string;
  chapterId: string;
  topicId: string;
  category: LessonCategory;
  title: string;
  titleBn: string;
  youtubeUrl: string;
  thumbnailUrl?: string;
  description?: string;
  descriptionBn?: string;
  objectives?: string[];
  difficulty: DifficultyLevel;
  durationMinutes?: number;
  featured?: boolean;
  has3dMode?: boolean;
  threeDSceneType?: ThreeDSceneType;
  order: number;
  status: PublishStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ResourceItem {
  resourceId: string;
  lessonId: string;
  title: string;
  titleBn?: string;
  fileUrl: string;
  fileType: string;
  downloadable: boolean;
  createdAt?: unknown;
}

export interface QuizQuestion {
  id: string;
  question: string;
  questionBn?: string;
  options: string[];
  optionsBn?: string[];
  correctIndex: number;
  explanation: string;
  explanationBn?: string;
}

export interface QuizItem {
  quizId: string;
  lessonId: string;
  title: string;
  questions: QuizQuestion[];
  status: PublishStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface StudentProgress {
  progressId: string;
  studentId: string;
  lessonId: string;
  classId: string;
  subjectId: string;
  chapterId: string;
  completed: boolean;
  completedAt?: unknown;
  lastViewedAt: unknown;
}

export interface BookmarkItem {
  bookmarkId: string;
  studentId: string;
  itemId: string;
  itemType: 'lesson' | 'chapter' | 'topic' | 'resource';
  title: string;
  createdAt: unknown;
}

export interface StudentNote {
  noteId: string;
  studentId: string;
  lessonId?: string;
  subjectId?: string;
  title: string;
  content: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface QuizAttempt {
  attemptId: string;
  studentId: string;
  quizId: string;
  lessonId: string;
  score: number;
  totalQuestions: number;
  completedAt: unknown;
}

export interface FeedbackItem {
  feedbackId: string;
  studentId: string;
  lessonId?: string;
  rating: number;
  message: string;
  createdAt: unknown;
}

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  mode?: string;
  attachmentName?: string;
  timestamp: string;
}

export interface AiConversation {
  convId: string;
  studentId: string;
  title: string;
  subjectContext?: string;
  classContext?: string;
  messages: AiChatMessage[];
  createdAt: unknown;
  updatedAt: unknown;
}

export interface Announcement {
  announcementId: string;
  title: string;
  titleBn?: string;
  content: string;
  contentBn?: string;
  targetClasses: string[];
  published: boolean;
  createdAt: unknown;
}

export interface AppSettings {
  settingId: string;
  branding: {
    siteName: string;
    taglineEn: string;
    taglineBn: string;
    logoUrl: string;
    contactEmail: string;
    contactPhone: string;
    footerTextEn: string;
    footerTextBn: string;
  };
  theme: {
    primaryNavy: string;
    secondaryNavy: string;
    iceBlue: string;
    lightBlue: string;
    defaultMode: ThemeMode;
  };
  languageSettings: {
    defaultLanguage: Language;
    allowLanguageSwitch: boolean;
  };
  homepageSettings: {
    heroTitleEn: string;
    heroTitleBn: string;
    heroSubtitleEn: string;
    heroSubtitleBn: string;
    announcementBannerEn: string;
    announcementBannerBn: string;
    showAnnouncementBanner: boolean;
    showPopularSubjects: boolean;
    showBasicToPro: boolean;
    showOneShot: boolean;
    showAiIntro: boolean;
  };
  aiSettings: {
    enabled: boolean;
    model: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';
    dailyQuotaPerStudent: number;
    systemInstructions: string;
    allowPdfUpload: boolean;
    allowVoiceTutor: boolean;
  };
  featureFlags: {
    maintenanceMode: boolean;
    certificatesEnabled: boolean;
    minLessonsForCertificate: number;
  };
  updatedAt?: unknown;
}

export interface ActivityLog {
  logId: string;
  actorId: string;
  actorName?: string;
  action: string;
  target: string;
  timestamp: unknown;
}
