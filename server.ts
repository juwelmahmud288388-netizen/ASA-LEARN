import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore, FieldValue } from 'firebase-admin/firestore';
import { buildInitialSeedData, DEFAULT_APP_SETTINGS } from './src/lib/defaultCurriculum.ts';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const OWNER_EMAIL = 'juwelmahmud288388@gmail.com';
const SESSION_COOKIE_NAME = 'asa_session';
const ADMIN_COOKIE_NAME = 'asa_admin_session';
const STUDENT_COOKIE_NAME = 'asa_student_session';
const ADMIN_SECRET_FILE = path.resolve(process.cwd(), '.asa-admin-secret.json');
const STUDENT_PROFILES_FILE = path.resolve(process.cwd(), '.asa-student-profiles.json');
const CONTENT_OVERRIDE_FILE = path.resolve(process.cwd(), '.asa-content-override.json');
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PORTAL_PASSWORD || 'ASA@Admin2026!';
const SESSION_SECRET =
  process.env.AUTH_SESSION_SECRET ||
  crypto.createHash('sha256').update(`asa-learn-${process.env.GEMINI_API_KEY || 'dev-ephemeral-key'}`).digest('hex');

const firebaseConfigPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf-8'));

// Initialize Firebase Admin SDK (modular v14)
let adminApp: App;
const existingApps = getApps();
if (existingApps.length > 0) {
  adminApp = existingApps[0]!;
} else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  adminApp = initializeApp({
    credential: cert(serviceAccount),
    projectId: firebaseConfig.projectId,
  });
} else {
  adminApp = initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

const adminDb = getAdminFirestore(adminApp, firebaseConfig.firestoreDatabaseId);
const adminAuth = getAuth(adminApp);

// Initialize Gemini AI client strictly server-side
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// In-memory rate limiter for auth routes & fallback AI quota tracking
const authRateLimiter = new Map<string, { count: number; resetAt: number }>();
const memoryAiUsage = new Map<string, number>();

function checkRateLimit(key: string, maxRequests = 20, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = authRateLimiter.get(key);
  if (!entry || entry.resetAt < now) {
    authRateLimiter.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) return false;
  entry.count += 1;
  return true;
}

function normalizePhone(raw: string): string {
  const cleaned = String(raw || '').replace(/[\s()-]/g, '');
  if (cleaned.startsWith('01') && cleaned.length === 11) return `+88${cleaned}`;
  if (cleaned.startsWith('8801') && cleaned.length === 13) return `+${cleaned}`;
  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
}

function hashPhoneKey(phone: string): string {
  return crypto.createHash('sha256').update(normalizePhone(phone)).digest('hex').slice(0, 40);
}

function signSessionToken(payload: { uid: string; role: string; exp: number }): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifySessionToken(token: string): { uid: string; role: string; exp: number } | null {
  try {
    const [encoded, sig] = token.split('.');
    if (!encoded || !sig) return null;
    const expected = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8'));
    if (typeof parsed.exp !== 'number' || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader?: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = decodeURIComponent(part.slice(idx + 1).trim());
      result[k] = v;
    }
  }
  return result;
}

interface AuthenticatedRequest extends Request {
  authUser?: {
    uid: string;
    role: string;
    email?: string;
    emailVerified?: boolean;
  };
}

interface AdminSecretRecord {
  passwordHash: string;
  failedAttempts: number;
  lockedUntil: string | null;
  updatedAt: string;
}

async function loadAdminSecret(): Promise<AdminSecretRecord | null> {
  try {
    if (fs.existsSync(ADMIN_SECRET_FILE)) {
      const raw = JSON.parse(fs.readFileSync(ADMIN_SECRET_FILE, 'utf-8'));
      if (raw && typeof raw.passwordHash === 'string' && raw.passwordHash.length > 20) {
        return {
          passwordHash: raw.passwordHash,
          failedAttempts: Number(raw.failedAttempts || 0),
          lockedUntil: typeof raw.lockedUntil === 'string' ? raw.lockedUntil : null,
          updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
        };
      }
    }
  } catch {
    // Fall back to Firestore check
  }

  try {
    const snap = await adminDb.collection('authSecrets').doc('admin_portal').get();
    if (snap.exists) {
      const data = snap.data();
      if (data && typeof data.passwordHash === 'string') {
        const record: AdminSecretRecord = {
          passwordHash: data.passwordHash,
          failedAttempts: Number(data.failedAttempts || 0),
          lockedUntil: typeof data.lockedUntil === 'string' ? data.lockedUntil : null,
          updatedAt: new Date().toISOString(),
        };
        try {
          fs.writeFileSync(ADMIN_SECRET_FILE, JSON.stringify(record, null, 2), { mode: 0o600 });
        } catch {
          // Ignore file write errors
        }
        return record;
      }
    }
  } catch {
    // Ignore if Firestore admin credentials are not configured in preview
  }
  return null;
}

async function saveAdminSecret(record: AdminSecretRecord): Promise<void> {
  fs.writeFileSync(ADMIN_SECRET_FILE, JSON.stringify(record, null, 2), { mode: 0o600 });
  try {
    await adminDb.collection('authSecrets').doc('admin_portal').set(
      {
        uid: 'admin_portal',
        passwordHash: record.passwordHash,
        failedAttempts: record.failedAttempts,
        lockedUntil: record.lockedUntil,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch {
    // Best-effort Firestore sync; local file remains authoritative when server ADC lacks permissions
  }
}

async function ensureAdminPasswordInitialized(): Promise<AdminSecretRecord> {
  const existing = await loadAdminSecret();
  if (existing) return existing;
  const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 12);
  const initial: AdminSecretRecord = {
    passwordHash,
    failedAttempts: 0,
    lockedUntil: null,
    updatedAt: new Date().toISOString(),
  };
  await saveAdminSecret(initial);
  return initial;
}

function resolveAdminCookie(req: Request): AuthenticatedRequest['authUser'] | null {
  const cookies = parseCookies(req.headers.cookie);
  const adminToken = cookies[ADMIN_COOKIE_NAME];
  if (!adminToken) return null;
  const parsed = verifySessionToken(adminToken);
  if (parsed && (parsed.role === 'owner' || parsed.role === 'admin')) {
    return { uid: parsed.uid, role: parsed.role };
  }
  return null;
}

function resolveStudentCookie(req: Request): AuthenticatedRequest['authUser'] | null {
  const cookies = parseCookies(req.headers.cookie);
  const stuToken = cookies[STUDENT_COOKIE_NAME];
  if (!stuToken) return null;
  const parsed = verifySessionToken(stuToken);
  if (parsed && parsed.role === 'student') {
    return { uid: parsed.uid, role: parsed.role };
  }
  return null;
}

interface StoredStudentRecord {
  uid: string;
  studentId: string;
  fullName: string;
  classId: string;
  preferredLanguage: 'bn' | 'en';
  preferredTheme: 'light' | 'dark';
  role: 'student';
  accountStatus: 'active' | 'suspended';
  dailyGoalMinutes: number;
  streakDays: number;
  passcodeKey: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
  progressList: Array<Record<string, unknown>>;
  bookmarks: Array<Record<string, unknown>>;
  notes: Array<Record<string, unknown>>;
  quizAttempts: Array<Record<string, unknown>>;
}

function hashPasscodeKey(passcode: string): string {
  return crypto.createHmac('sha256', SESSION_SECRET).update(passcode.trim()).digest('hex');
}

function loadStudentStore(): Record<string, StoredStudentRecord> {
  try {
    if (fs.existsSync(STUDENT_PROFILES_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(STUDENT_PROFILES_FILE, 'utf-8'));
      if (parsed && typeof parsed === 'object') return parsed as Record<string, StoredStudentRecord>;
    }
  } catch {
    // Ignore parse error and start empty
  }
  return {};
}

function saveStudentStore(store: Record<string, StoredStudentRecord>): void {
  fs.writeFileSync(STUDENT_PROFILES_FILE, JSON.stringify(store, null, 2), { mode: 0o600 });
}

function sanitizeStudentProfile(rec: StoredStudentRecord) {
  return {
    uid: rec.uid,
    studentId: rec.studentId,
    fullName: rec.fullName,
    classId: rec.classId,
    preferredLanguage: rec.preferredLanguage,
    preferredTheme: rec.preferredTheme,
    role: rec.role,
    accountStatus: rec.accountStatus,
    dailyGoalMinutes: rec.dailyGoalMinutes,
    streakDays: rec.streakDays,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}

interface ContentOverrideStore {
  settings?: Record<string, unknown>;
  upserts: Record<string, Record<string, Record<string, unknown>>>;
  deletes: Record<string, string[]>;
  activityLogs: Array<Record<string, unknown>>;
}

function loadContentOverrides(): ContentOverrideStore {
  try {
    if (fs.existsSync(CONTENT_OVERRIDE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(CONTENT_OVERRIDE_FILE, 'utf-8'));
      if (parsed && typeof parsed === 'object') {
        return {
          settings: parsed.settings || undefined,
          upserts: parsed.upserts || {},
          deletes: parsed.deletes || {},
          activityLogs: Array.isArray(parsed.activityLogs) ? parsed.activityLogs : [],
        };
      }
    }
  } catch {
    // Ignore parse errors
  }
  return { upserts: {}, deletes: {}, activityLogs: [] };
}

function saveContentOverrides(store: ContentOverrideStore): void {
  fs.writeFileSync(CONTENT_OVERRIDE_FILE, JSON.stringify(store, null, 2), { mode: 0o600 });
}

function mergeCollectionWithOverrides<T extends Record<string, unknown>>(
  baseItems: T[],
  idField: string,
  colName: string,
  overrides: ContentOverrideStore
): T[] {
  const deletedSet = new Set(overrides.deletes[colName] || []);
  const map = new Map<string, T>();
  for (const item of baseItems) {
    const id = String(item[idField] || '');
    if (id && !deletedSet.has(id)) map.set(id, item);
  }
  const upserts = overrides.upserts[colName] || {};
  for (const [id, raw] of Object.entries(upserts)) {
    if (!deletedSet.has(id)) {
      map.set(id, { ...(map.get(id) || {}), ...raw } as T);
    }
  }
  return Array.from(map.values());
}

async function resolveAuthUser(req: Request): Promise<AuthenticatedRequest['authUser'] | null> {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const idToken = authHeader.slice(7).trim();
    try {
      const decoded = await adminAuth.verifyIdToken(idToken);
      let role = 'student';
      if (decoded.email === OWNER_EMAIL && decoded.email_verified) {
        role = 'owner';
      } else {
        try {
          const adminDoc = await adminDb.collection('admins').doc(decoded.uid).get();
          if (adminDoc.exists) {
            role = (adminDoc.data()?.role as string) || 'admin';
          } else {
            const userDoc = await adminDb.collection('users').doc(decoded.uid).get();
            if (userDoc.exists) {
              role = (userDoc.data()?.role as string) || 'student';
            }
          }
        } catch {
          // If Firestore admin lookup unavailable, rely on token email check
        }
      }
      return {
        uid: decoded.uid,
        role,
        email: decoded.email,
        emailVerified: decoded.email_verified,
      };
    } catch {
      // Fall through to cookie check
    }
  }

  const cookies = parseCookies(req.headers.cookie);
  const sessionToken = cookies[SESSION_COOKIE_NAME];
  if (sessionToken) {
    const parsed = verifySessionToken(sessionToken);
    if (parsed) {
      return { uid: parsed.uid, role: parsed.role };
    }
  }

  const adminCookieUser = resolveAdminCookie(req);
  if (adminCookieUser) {
    return adminCookieUser;
  }

  const studentCookieUser = resolveStudentCookie(req);
  if (studentCookieUser) {
    return studentCookieUser;
  }
  return null;
}

async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const user = await resolveAuthUser(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  req.authUser = user;
  next();
}

async function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const adminFromCookie = resolveAdminCookie(req);
  if (adminFromCookie) {
    req.authUser = adminFromCookie;
    next();
    return;
  }
  const user = await resolveAuthUser(req);
  if (!user) {
    res.status(401).json({ error: 'Admin authentication required' });
    return;
  }
  const isOwner = user.email === OWNER_EMAIL && user.emailVerified === true;
  if (!isOwner && user.role !== 'admin' && user.role !== 'owner') {
    res.status(403).json({ error: 'Administrator privileges required' });
    return;
  }
  req.authUser = user;
  next();
}

function isAdminSdkCredentialError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('Could not load the default credentials') ||
    msg.includes('Unable to detect a Project Id') ||
    msg.includes('iam.serviceAccounts.signBlob') ||
    msg.includes('PERMISSION_DENIED')
  );
}

async function getAiSettingsFromFirestore() {
  try {
    const snap = await adminDb.collection('appSettings').doc('global').get();
    if (snap.exists) {
      const data = snap.data();
      if (data?.aiSettings) {
        return { ...DEFAULT_APP_SETTINGS.aiSettings, ...data.aiSettings };
      }
    }
  } catch {
    // Use defaults if Firestore admin read isn't available yet
  }
  return DEFAULT_APP_SETTINGS.aiSettings;
}

function extractRetryError(err: unknown): { status: number; message: string } {
  const rawMsg = err instanceof Error ? err.message : String(err);
  let parsedMessage = rawMsg;
  try {
    const inner = JSON.parse(rawMsg);
    if (inner?.error?.message) parsedMessage = String(inner.error.message);
  } catch {
    // Keep raw message if not JSON
  }

  if (rawMsg.includes('403') || rawMsg.includes('PERMISSION_DENIED') || rawMsg.includes('API_KEY_INVALID')) {
    return {
      status: 403,
      message: 'Gemini API key is invalid or missing. Please verify GEMINI_API_KEY in Settings > Secrets.',
    };
  }
  if (rawMsg.includes('429') || rawMsg.includes('RESOURCE_EXHAUSTED')) {
    return {
      status: 429,
      message: 'AI rate limit reached. Please wait a moment before sending another request.',
    };
  }
  if (rawMsg.includes('503') || rawMsg.includes('UNAVAILABLE')) {
    return {
      status: 503,
      message: 'The AI Tutor model is experiencing temporary high demand. Please retry in a few seconds.',
    };
  }
  return { status: 500, message: parsedMessage || 'AI Tutor request failed.' };
}

async function generateWithRetry(
  primaryModel: string,
  params: Omit<Parameters<typeof ai.models.generateContent>[0], 'model'>
) {
  const attempts = [primaryModel, primaryModel, 'gemini-3.1-flash-lite'];
  let lastError: unknown;
  for (let i = 0; i < attempts.length; i += 1) {
    try {
      return await ai.models.generateContent({
        model: attempts[i]!,
        ...params,
      });
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient = msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('429');
      if (!isTransient || i === attempts.length - 1) throw err;
      await new Promise((r) => setTimeout(r, 700 * (i + 1)));
    }
  }
  throw lastError;
}

async function startServer() {
  await ensureAdminPasswordInitialized();
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // Health & Status Check
  app.get('/api/health', async (_req: Request, res: Response) => {
    let adminFirestoreOk = false;
    try {
      await adminDb.collection('appSettings').doc('global').get();
      adminFirestoreOk = true;
    } catch {
      adminFirestoreOk = false;
    }
    res.json({
      ok: true,
      projectId: firebaseConfig.projectId,
      databaseId: firebaseConfig.firestoreDatabaseId,
      adminFirestoreReady: adminFirestoreOk,
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'),
      timestamp: new Date().toISOString(),
    });
  });

  // Initial Idempotent Curriculum Seed
  app.post('/api/seed/initial', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const force = Boolean(req.body?.force);
      if (force) {
        const user = await resolveAuthUser(req);
        if (!user || (user.role !== 'admin' && user.role !== 'owner' && !(user.email === OWNER_EMAIL && user.emailVerified))) {
          res.status(403).json({ error: 'Only admins can force-reseed curriculum.' });
          return;
        }
      }

      const existingClasses = await adminDb.collection('classes').limit(1).get();
      if (!existingClasses.empty && !force) {
        res.json({ seeded: false, message: 'Curriculum already initialized.' });
        return;
      }

      const seed = buildInitialSeedData();
      const batch = adminDb.batch();

      batch.set(
        adminDb.collection('appSettings').doc('global'),
        { ...seed.settings, updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );

      for (const item of seed.classes) {
        batch.set(adminDb.collection('classes').doc(item.classId), {
          ...item,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      for (const item of seed.subjects) {
        batch.set(adminDb.collection('subjects').doc(item.subjectId), {
          ...item,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      for (const item of seed.chapters) {
        batch.set(adminDb.collection('chapters').doc(item.chapterId), {
          ...item,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      for (const item of seed.topics) {
        batch.set(adminDb.collection('topics').doc(item.topicId), {
          ...item,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      for (const item of seed.lessons) {
        batch.set(adminDb.collection('lessons').doc(item.lessonId), {
          ...item,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      for (const item of seed.resources) {
        batch.set(adminDb.collection('resources').doc(item.resourceId), {
          ...item,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
      for (const item of seed.quizzes) {
        batch.set(adminDb.collection('quizzes').doc(item.quizId), {
          ...item,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      for (const item of seed.announcements) {
        batch.set(adminDb.collection('announcements').doc(item.announcementId), {
          ...item,
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      await batch.commit();
      res.json({ seeded: true, message: 'Initial curriculum seeded successfully.' });
    } catch (err) {
      if (isAdminSdkCredentialError(err)) {
        res.status(503).json({
          code: 'ADMIN_CREDENTIALS_UNCONFIGURED',
          error: 'Server Admin SDK credentials are not attached in this preview container; client-side Admin seed can be used after Owner Google Sign-In.',
        });
        return;
      }
      res.status(500).json({ error: err instanceof Error ? err.message : 'Seed failed' });
    }
  });

  // Student Registration (requires verified Firebase Phone Auth ID Token + sets salted bcrypt hash)
  app.post('/api/auth/register', async (req: Request, res: Response) => {
    const ip = req.ip || 'unknown';
    if (!checkRateLimit(`reg:${ip}`, 10, 60_000)) {
      res.status(429).json({ error: 'Too many registration attempts. Please try again shortly.' });
      return;
    }

    try {
      const { idToken, fullName, classId, password, preferredLanguage } = req.body || {};
      if (!idToken || !fullName || !classId || !password) {
        res.status(400).json({ error: 'Missing required registration fields or phone verification token.' });
        return;
      }
      if (String(password).length < 6) {
        res.status(400).json({ error: 'Password must be at least 6 characters long.' });
        return;
      }

      const decoded = await adminAuth.verifyIdToken(String(idToken));
      if (!decoded.phone_number) {
        res.status(400).json({ error: 'Phone number verification via SMS OTP is required.' });
        return;
      }

      const normalizedPhone = normalizePhone(decoded.phone_number);
      const phoneKey = hashPhoneKey(normalizedPhone);
      const existingPhone = await adminDb.collection('phoneIndex').doc(phoneKey).get();
      if (existingPhone.exists) {
        res.status(409).json({ error: 'An account with this mobile number already exists. Please sign in.' });
        return;
      }

      const uid = decoded.uid;
      const randomNum = crypto.randomInt(1000, 9999);
      const studentId = `ASA-26-${randomNum}`;
      const passwordHash = await bcrypt.hash(String(password), 12);
      const lang = preferredLanguage === 'bn' ? 'bn' : 'en';

      const batch = adminDb.batch();
      batch.set(adminDb.collection('users').doc(uid), {
        uid,
        studentId,
        fullName: String(fullName).trim().slice(0, 120),
        classId: String(classId).trim().slice(0, 64),
        preferredLanguage: lang,
        preferredTheme: 'light',
        role: 'student',
        accountStatus: 'active',
        dailyGoalMinutes: 45,
        streakDays: 1,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      batch.set(adminDb.collection('users').doc(uid).collection('private').doc('info'), {
        uid,
        phoneNumber: normalizedPhone,
        studentId,
        updatedAt: FieldValue.serverTimestamp(),
      });
      batch.set(adminDb.collection('authSecrets').doc(uid), {
        uid,
        passwordHash,
        phoneNumber: normalizedPhone,
        studentId,
        failedAttempts: 0,
        lockedUntil: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
      batch.set(adminDb.collection('phoneIndex').doc(phoneKey), { uid, studentId });
      batch.set(adminDb.collection('studentIdIndex').doc(studentId), { uid, phoneNumber: normalizedPhone });
      batch.set(adminDb.collection('activityLogs').doc(`log_${Date.now()}_${uid.slice(0, 6)}`), {
        logId: `log_${Date.now()}_${uid.slice(0, 6)}`,
        actorId: uid,
        actorName: String(fullName).trim().slice(0, 120),
        action: 'STUDENT_REGISTERED',
        target: studentId,
        timestamp: FieldValue.serverTimestamp(),
      });

      await batch.commit();

      let customToken: string | null = null;
      try {
        customToken = await adminAuth.createCustomToken(uid, { role: 'student' });
      } catch {
        customToken = null;
      }

      const sessionToken = signSessionToken({
        uid,
        role: 'student',
        exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });
      res.cookie(SESSION_COOKIE_NAME, sessionToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.status(201).json({
        uid,
        studentId,
        fullName: String(fullName).trim(),
        classId,
        preferredLanguage: lang,
        role: 'student',
        customToken,
      });
    } catch (err) {
      if (isAdminSdkCredentialError(err)) {
        res.status(503).json({
          code: 'ADMIN_CREDENTIALS_UNCONFIGURED',
          error: 'Firebase Admin credentials are required on the server to mint custom authentication tokens and verify phone ID tokens.',
        });
        return;
      }
      res.status(500).json({ error: err instanceof Error ? err.message : 'Registration failed.' });
    }
  });

  // Student Login via Mobile Number or Student ID + Password
  app.post('/api/auth/login', async (req: Request, res: Response) => {
    const ip = req.ip || 'unknown';
    if (!checkRateLimit(`login:${ip}`, 25, 60_000)) {
      res.status(429).json({ error: 'Too many login requests. Please wait a minute.' });
      return;
    }

    try {
      const { identifier, password, rememberMe } = req.body || {};
      if (!identifier || !password) {
        res.status(400).json({ error: 'Mobile number or Student ID and password are required.' });
        return;
      }

      const cleanId = String(identifier).trim();
      let uid: string | null = null;

      if (/^ASA-\d{2}-\d{4,}$/i.test(cleanId)) {
        const idxSnap = await adminDb.collection('studentIdIndex').doc(cleanId.toUpperCase()).get();
        if (idxSnap.exists) uid = idxSnap.data()?.uid as string;
      } else {
        const phoneKey = hashPhoneKey(cleanId);
        const idxSnap = await adminDb.collection('phoneIndex').doc(phoneKey).get();
        if (idxSnap.exists) uid = idxSnap.data()?.uid as string;
      }

      if (!uid) {
        res.status(401).json({ error: 'Invalid credentials.' });
        return;
      }

      const secretRef = adminDb.collection('authSecrets').doc(uid);
      const secretSnap = await secretRef.get();
      if (!secretSnap.exists) {
        res.status(401).json({ error: 'Invalid credentials.' });
        return;
      }

      const secret = secretSnap.data()!;
      if (secret.lockedUntil && new Date(secret.lockedUntil).getTime() > Date.now()) {
        res.status(423).json({
          error: 'Account temporarily locked due to repeated failed attempts. Try again in 15 minutes or reset password.',
        });
        return;
      }

      const passwordValid = await bcrypt.compare(String(password), String(secret.passwordHash));
      if (!passwordValid) {
        const nextAttempts = Number(secret.failedAttempts || 0) + 1;
        const lockUpdate: Record<string, unknown> = { failedAttempts: nextAttempts };
        if (nextAttempts >= 5) {
          lockUpdate.lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
          lockUpdate.failedAttempts = 0;
        }
        await secretRef.update(lockUpdate);
        res.status(401).json({ error: 'Invalid credentials.' });
        return;
      }

      // Reset failed attempt counter
      await secretRef.update({ failedAttempts: 0, lockedUntil: null });

      const userSnap = await adminDb.collection('users').doc(uid).get();
      if (!userSnap.exists) {
        res.status(404).json({ error: 'User profile not found.' });
        return;
      }
      const profile = userSnap.data()!;
      if (profile.accountStatus === 'suspended') {
        res.status(403).json({ error: 'This account has been deactivated by an administrator.' });
        return;
      }

      let customToken: string | null = null;
      try {
        customToken = await adminAuth.createCustomToken(uid, { role: profile.role || 'student' });
      } catch {
        customToken = null;
      }

      const maxAge = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
      const sessionToken = signSessionToken({
        uid,
        role: String(profile.role || 'student'),
        exp: Date.now() + maxAge,
      });
      res.cookie(SESSION_COOKIE_NAME, sessionToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge,
      });

      res.json({
        user: {
          ...profile,
          phoneNumber: secret.phoneNumber,
        },
        customToken,
      });
    } catch (err) {
      if (isAdminSdkCredentialError(err)) {
        res.status(503).json({
          code: 'ADMIN_CREDENTIALS_UNCONFIGURED',
          error: 'Server Admin SDK credentials are not configured in this environment for custom password lookup.',
        });
        return;
      }
      res.status(500).json({ error: err instanceof Error ? err.message : 'Login failed.' });
    }
  });

  // Password Reset after Firebase Phone Auth OTP verification
  app.post('/api/auth/reset-password', async (req: Request, res: Response) => {
    const ip = req.ip || 'unknown';
    if (!checkRateLimit(`reset:${ip}`, 5, 60_000)) {
      res.status(429).json({ error: 'Too many reset attempts. Please wait.' });
      return;
    }

    try {
      const { idToken, newPassword } = req.body || {};
      if (!idToken || !newPassword || String(newPassword).length < 6) {
        res.status(400).json({ error: 'Verified OTP token and a new password (min 6 characters) are required.' });
        return;
      }

      const decoded = await adminAuth.verifyIdToken(String(idToken));
      if (!decoded.phone_number) {
        res.status(400).json({ error: 'Phone verification is required to reset password.' });
        return;
      }

      const phoneKey = hashPhoneKey(decoded.phone_number);
      const idxSnap = await adminDb.collection('phoneIndex').doc(phoneKey).get();
      if (!idxSnap.exists) {
        res.status(404).json({ error: 'No account found with this mobile number.' });
        return;
      }

      const uid = idxSnap.data()?.uid as string;
      const passwordHash = await bcrypt.hash(String(newPassword), 12);
      await adminDb.collection('authSecrets').doc(uid).update({
        passwordHash,
        failedAttempts: 0,
        lockedUntil: null,
        updatedAt: FieldValue.serverTimestamp(),
      });

      res.json({ ok: true, message: 'Password updated successfully.' });
    } catch (err) {
      if (isAdminSdkCredentialError(err)) {
        res.status(503).json({
          code: 'ADMIN_CREDENTIALS_UNCONFIGURED',
          error: 'Server Admin SDK credentials required for password reset.',
        });
        return;
      }
      res.status(500).json({ error: err instanceof Error ? err.message : 'Password reset failed.' });
    }
  });

  app.get('/api/auth/me', async (req: Request, res: Response) => {
    const authUser = await resolveAuthUser(req);
    if (!authUser) {
      res.json({ user: null });
      return;
    }
    try {
      const snap = await adminDb.collection('users').doc(authUser.uid).get();
      res.json({ user: snap.exists ? snap.data() : null });
    } catch {
      res.json({ user: null });
    }
  });

  app.post('/api/auth/logout', (_req: Request, res: Response) => {
    res.clearCookie(SESSION_COOKIE_NAME);
    res.json({ ok: true });
  });

  // Admin Portal Standalone Password Authentication (Separate from Student Auth)
  app.get('/api/admin/session', async (req: Request, res: Response) => {
    const cookieAdmin = resolveAdminCookie(req);
    if (cookieAdmin) {
      res.json({ authenticated: true });
      return;
    }
    const user = await resolveAuthUser(req);
    const isFirebaseAdmin =
      Boolean(user) &&
      ((user?.email === OWNER_EMAIL && user?.emailVerified === true) || user?.role === 'admin' || user?.role === 'owner');
    res.json({ authenticated: isFirebaseAdmin });
  });

  app.post('/api/admin/login', async (req: Request, res: Response) => {
    const ip = req.ip || 'unknown';
    if (!checkRateLimit(`admin-login:${ip}`, 15, 60_000)) {
      res.status(429).json({ error: 'Too many admin login attempts. Please wait a minute.' });
      return;
    }

    try {
      const { password } = req.body || {};
      if (!password || typeof password !== 'string') {
        res.status(400).json({ error: 'Admin Portal password is required.' });
        return;
      }

      const secret = await ensureAdminPasswordInitialized();
      if (secret.lockedUntil && new Date(secret.lockedUntil).getTime() > Date.now()) {
        res.status(423).json({
          error: 'Admin Portal temporarily locked due to repeated incorrect attempts. Please try again in 5 minutes.',
        });
        return;
      }

      const valid = await bcrypt.compare(password, secret.passwordHash);
      if (!valid) {
        const nextAttempts = secret.failedAttempts + 1;
        const lockedUntil = nextAttempts >= 5 ? new Date(Date.now() + 5 * 60 * 1000).toISOString() : null;
        await saveAdminSecret({
          ...secret,
          failedAttempts: nextAttempts >= 5 ? 0 : nextAttempts,
          lockedUntil,
          updatedAt: new Date().toISOString(),
        });
        res.status(401).json({ error: 'Incorrect Admin Portal password.' });
        return;
      }

      if (secret.failedAttempts > 0 || secret.lockedUntil) {
        await saveAdminSecret({
          ...secret,
          failedAttempts: 0,
          lockedUntil: null,
          updatedAt: new Date().toISOString(),
        });
      }

      const maxAge = 7 * 24 * 60 * 60 * 1000;
      const adminToken = signSessionToken({
        uid: 'asa_owner_admin',
        role: 'owner',
        exp: Date.now() + maxAge,
      });

      res.cookie(ADMIN_COOKIE_NAME, adminToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge,
      });

      let customToken: string | null = null;
      try {
        await adminDb.collection('admins').doc('asa_owner_admin').set(
          {
            uid: 'asa_owner_admin',
            email: OWNER_EMAIL,
            role: 'owner',
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        customToken = await adminAuth.createCustomToken('asa_owner_admin', { role: 'owner' });
      } catch {
        customToken = null;
      }

      res.json({ authenticated: true, customToken });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Admin login failed.' });
    }
  });

  app.post('/api/admin/logout', (_req: Request, res: Response) => {
    res.clearCookie(ADMIN_COOKIE_NAME);
    res.json({ ok: true });
  });

  app.post('/api/admin/change-password', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { currentPassword, newPassword } = req.body || {};
      if (!currentPassword || !newPassword) {
        res.status(400).json({ error: 'Current password and new password are required.' });
        return;
      }
      if (String(newPassword).length < 8) {
        res.status(400).json({ error: 'New Admin Portal password must be at least 8 characters long.' });
        return;
      }

      const secret = await ensureAdminPasswordInitialized();
      const valid = await bcrypt.compare(String(currentPassword), secret.passwordHash);
      if (!valid) {
        res.status(401).json({ error: 'Current password is incorrect.' });
        return;
      }

      const nextHash = await bcrypt.hash(String(newPassword), 12);
      await saveAdminSecret({
        passwordHash: nextHash,
        failedAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date().toISOString(),
      });

      res.json({ ok: true, message: 'Admin Portal password updated successfully.' });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Could not update Admin password.' });
    }
  });

  // Admin: Create Student or Reset Password securely without ever revealing plaintext
  app.post('/api/admin/students', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { fullName, phoneNumber, classId, password, preferredLanguage } = req.body || {};
      if (!fullName || !phoneNumber || !classId || !password || String(password).length < 6) {
        res.status(400).json({ error: 'Full name, mobile number, class, and password (min 6 chars) are required.' });
        return;
      }

      const normalizedPhone = normalizePhone(String(phoneNumber));
      const phoneKey = hashPhoneKey(normalizedPhone);
      const existing = await adminDb.collection('phoneIndex').doc(phoneKey).get();
      if (existing.exists) {
        res.status(409).json({ error: 'Mobile number already registered.' });
        return;
      }

      const uid = `stu_${crypto.randomBytes(8).toString('hex')}`;
      const studentId = `ASA-26-${crypto.randomInt(1000, 9999)}`;
      const passwordHash = await bcrypt.hash(String(password), 12);

      const batch = adminDb.batch();
      batch.set(adminDb.collection('users').doc(uid), {
        uid,
        studentId,
        fullName: String(fullName).trim().slice(0, 120),
        classId: String(classId),
        preferredLanguage: preferredLanguage === 'bn' ? 'bn' : 'en',
        preferredTheme: 'light',
        role: 'student',
        accountStatus: 'active',
        dailyGoalMinutes: 45,
        streakDays: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      batch.set(adminDb.collection('users').doc(uid).collection('private').doc('info'), {
        uid,
        phoneNumber: normalizedPhone,
        studentId,
        updatedAt: FieldValue.serverTimestamp(),
      });
      batch.set(adminDb.collection('authSecrets').doc(uid), {
        uid,
        passwordHash,
        phoneNumber: normalizedPhone,
        studentId,
        failedAttempts: 0,
        lockedUntil: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
      batch.set(adminDb.collection('phoneIndex').doc(phoneKey), { uid, studentId });
      batch.set(adminDb.collection('studentIdIndex').doc(studentId), { uid, phoneNumber: normalizedPhone });
      await batch.commit();

      res.status(201).json({ uid, studentId, fullName, classId });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create student.' });
    }
  });

  app.post('/api/admin/students/:uid/reset-password', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { uid } = req.params;
      const { newPassword } = req.body || {};
      if (!newPassword || String(newPassword).length < 6) {
        res.status(400).json({ error: 'New password must be at least 6 characters.' });
        return;
      }
      const passwordHash = await bcrypt.hash(String(newPassword), 12);
      await adminDb.collection('authSecrets').doc(uid).set(
        {
          uid,
          passwordHash,
          failedAttempts: 0,
          lockedUntil: null,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Password reset failed.' });
    }
  });

  // Admin: JSON Backup Export & Import
  app.get('/api/admin/export', requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const collections = ['classes', 'subjects', 'chapters', 'topics', 'lessons', 'resources', 'quizzes', 'announcements'];
      const payload: Record<string, unknown[]> = {};
      for (const col of collections) {
        const snap = await adminDb.collection(col).get();
        payload[col] = snap.docs.map((d) => d.data());
      }
      res.json({ exportedAt: new Date().toISOString(), data: payload });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Export failed' });
    }
  });

  // AI Personal Tutor Endpoint (Bangla, Math Step-by-Step, PDF QA, Voice, Chapter Summary, Recommendations)
  app.post('/api/ai/tutor', async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'MY_GEMINI_API_KEY') {
        res.status(503).json({ error: 'GEMINI_API_KEY is not configured in server secrets.' });
        return;
      }

      const aiSettings = await getAiSettingsFromFirestore();
      if (!aiSettings.enabled) {
        res.status(403).json({ error: 'AI Tutor is currently disabled by the administrator.' });
        return;
      }

      const user = await resolveAuthUser(req);
      const quotaKey = `${user?.uid || req.ip || 'guest'}_${new Date().toISOString().slice(0, 10)}`;
      const currentCount = memoryAiUsage.get(quotaKey) || 0;
      const limit = Number(aiSettings.dailyQuotaPerStudent || 40);
      if (currentCount >= limit) {
        res.status(429).json({ error: `Daily AI Tutor quota (${limit} messages) reached. Try again tomorrow.` });
        return;
      }

      const {
        message,
        mode = 'general',
        language = 'en',
        classContext = 'Class 9',
        subjectContext = 'General',
        lessonContext = '',
        history = [],
        pdfBase64,
        pdfMimeType,
        pdfFileName,
      } = req.body || {};

      if (!message || String(message).trim().length === 0) {
        res.status(400).json({ error: 'Please enter a question for the AI Tutor.' });
        return;
      }

      if (pdfBase64) {
        if (!aiSettings.allowPdfUpload) {
          res.status(403).json({ error: 'PDF upload is disabled by administrator settings.' });
          return;
        }
        if (pdfMimeType !== 'application/pdf') {
          res.status(400).json({ error: 'Only valid PDF files (application/pdf) are accepted.' });
          return;
        }
        const byteLength = Buffer.byteLength(String(pdfBase64), 'base64');
        if (byteLength > 10 * 1024 * 1024) {
          res.status(400).json({ error: 'Uploaded PDF exceeds the 10 MB limit.' });
          return;
        }
      }

      const modeInstructions: Record<string, string> = {
        bangla_tutor:
          'Explain concepts in simple, crystal-clear, natural Unicode Bangla suitable for school students. Use friendly analogies.',
        math_step_by_step:
          'Break down every mathematical problem into numbered steps, clearly explaining WHY each transformation is performed before showing the result.',
        visual_3d_guide:
          'Relate your explanation directly to 3D geometry, interactive angles, forces, or spatial visualization so the student understands what changes as they drag sliders in 3D Mode.',
        pdf_qa:
          'Answer strictly using the uploaded PDF whenever possible. Explicitly distinguish between [From Uploaded PDF] and [General Explanation]. If the answer is not in the PDF, state that clearly.',
        chapter_summary:
          'Provide a structured, concise chapter summary with Key Definitions, Core Formulas/Principles, and Exam Revision Checkpoints.',
        recommendations:
          'Recommend logical next lessons, revision exercises, and practice strategies tailored to the student class and progress.',
        voice_tutor:
          'Keep the response clear, conversational, and concise without heavy markdown symbols so it sounds natural when read aloud by text-to-speech.',
        general:
          'Provide encouraging, guided educational tutoring adapted to the student grade level.',
      };

      const systemInstruction = [
        aiSettings.systemInstructions,
        `Target Student Level: ${classContext}. Subject Context: ${subjectContext}.`,
        lessonContext ? `Current Lesson Context: ${lessonContext}.` : '',
        `Preferred Response Language: ${language === 'bn' ? 'Bangla (বাংলা)' : 'English'}.`,
        `Active Mode (${mode}): ${modeInstructions[mode] || modeInstructions.general}`,
        'Safety & Integrity: Never fabricate textbook page numbers or fake quotes. If unsure, admit uncertainty clearly. Encourage active learning.',
      ]
        .filter(Boolean)
        .join('\n');

      const recentHistory = Array.isArray(history)
        ? history
            .slice(-6)
            .map((h: { role?: string; text?: string }) => `${h.role === 'user' ? 'Student' : 'Tutor'}: ${String(h.text || '').slice(0, 800)}`)
            .join('\n')
        : '';

      const promptText = recentHistory
        ? `Previous context:\n${recentHistory}\n\nCurrent Student Question: ${String(message).trim()}`
        : String(message).trim();

      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
      if (pdfBase64) {
        parts.push({
          inlineData: {
            mimeType: 'application/pdf',
            data: String(pdfBase64),
          },
        });
        parts.push({
          text: `Attached Educational PDF: ${pdfFileName || 'document.pdf'}\n\n${promptText}`,
        });
      } else {
        parts.push({ text: promptText });
      }

      const modelName = aiSettings.model === 'gemini-3.1-flash-lite' ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen';

      const response = await generateWithRetry(modelName, {
        contents: { parts },
        config: {
          systemInstruction,
        },
      });

      memoryAiUsage.set(quotaKey, currentCount + 1);

      res.json({
        reply: response.text || 'I could not generate a response. Please rephrase your question.',
        model: modelName,
        quotaRemaining: Math.max(0, limit - (currentCount + 1)),
      });
    } catch (err) {
      const parsed = extractRetryError(err);
      res.status(parsed.status).json({ error: parsed.message });
    }
  });

  // AI Quiz Generator
  app.post('/api/ai/quiz', async (req: Request, res: Response) => {
    try {
      if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'MY_GEMINI_API_KEY') {
        res.status(503).json({ error: 'GEMINI_API_KEY is not configured.' });
        return;
      }

      const { classTitle = 'Class 9', subjectTitle = 'Mathematics', topicTitle = 'Trigonometry', language = 'en', count = 4 } =
        req.body || {};
      const safeCount = Math.min(Math.max(Number(count) || 4, 3), 8);

      const response = await generateWithRetry('gemini-4-hydrogen', {
        contents: `Generate ${safeCount} multiple-choice practice questions for ${classTitle}, Subject: ${subjectTitle}, Topic: ${topicTitle}. Language: ${
          language === 'bn' ? 'Bangla (বাংলা)' : 'English'
        }. Make questions accurate, age-appropriate, and educational with 4 options and a clear explanation.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                correctIndex: { type: Type.INTEGER },
                explanation: { type: Type.STRING },
              },
              required: ['question', 'options', 'correctIndex', 'explanation'],
            },
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '[]').trim());
      res.json({ questions: parsed });
    } catch (err) {
      const parsed = extractRetryError(err);
      res.status(parsed.status).json({ error: parsed.message });
    }
  });

  // AI Study Plan Generator
  app.post('/api/ai/study-plan', async (req: Request, res: Response) => {
    try {
      if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'MY_GEMINI_API_KEY') {
        res.status(503).json({ error: 'GEMINI_API_KEY is not configured.' });
        return;
      }

      const {
        classTitle = 'Class 9',
        dailyMinutes = 45,
        completedCount = 0,
        weakSubjects = [],
        language = 'en',
      } = req.body || {};

      const response = await generateWithRetry('gemini-4-hydrogen', {
        contents: `Create a practical 5-day study plan for a ${classTitle} student studying ${dailyMinutes} minutes per day. Completed lessons so far: ${completedCount}. Focus areas: ${
          Array.isArray(weakSubjects) && weakSubjects.length ? weakSubjects.join(', ') : 'Core Mathematics & Science'
        }. Write all text in ${language === 'bn' ? 'Bangla (বাংলা)' : 'English'}.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                day: { type: Type.STRING },
                focusSubject: { type: Type.STRING },
                task: { type: Type.STRING },
                durationMinutes: { type: Type.INTEGER },
                revisionTip: { type: Type.STRING },
              },
              required: ['day', 'focusSubject', 'task', 'durationMinutes', 'revisionTip'],
            },
          },
        },
      });

      const plan = JSON.parse((response.text ?? '[]').trim());
      res.json({ plan });
    } catch (err) {
      const parsed = extractRetryError(err);
      res.status(parsed.status).json({ error: parsed.message });
    }
  });

  // Public Curriculum API (Default seed + Admin overrides + Firestore if available)
  app.get('/api/curriculum', async (_req: Request, res: Response) => {
    const seed = buildInitialSeedData();
    const overrides = loadContentOverrides();

    const mergedSettings = overrides.settings
      ? {
          ...seed.settings,
          ...overrides.settings,
          branding: { ...seed.settings.branding, ...((overrides.settings.branding as object) || {}) },
          theme: { ...seed.settings.theme, ...((overrides.settings.theme as object) || {}) },
          languageSettings: { ...seed.settings.languageSettings, ...((overrides.settings.languageSettings as object) || {}) },
          homepageSettings: { ...seed.settings.homepageSettings, ...((overrides.settings.homepageSettings as object) || {}) },
          aiSettings: { ...seed.settings.aiSettings, ...((overrides.settings.aiSettings as object) || {}) },
          featureFlags: { ...seed.settings.featureFlags, ...((overrides.settings.featureFlags as object) || {}) },
        }
      : seed.settings;

    res.json({
      settings: mergedSettings,
      categories: mergeCollectionWithOverrides(seed.categories as unknown as Array<Record<string, unknown>>, 'categoryId', 'categories', overrides),
      classes: mergeCollectionWithOverrides(seed.classes as unknown as Array<Record<string, unknown>>, 'classId', 'classes', overrides),
      subjects: mergeCollectionWithOverrides(seed.subjects as unknown as Array<Record<string, unknown>>, 'subjectId', 'subjects', overrides),
      chapters: mergeCollectionWithOverrides(seed.chapters as unknown as Array<Record<string, unknown>>, 'chapterId', 'chapters', overrides),
      topics: mergeCollectionWithOverrides(seed.topics as unknown as Array<Record<string, unknown>>, 'topicId', 'topics', overrides),
      lessons: mergeCollectionWithOverrides(seed.lessons as unknown as Array<Record<string, unknown>>, 'lessonId', 'lessons', overrides),
      resources: mergeCollectionWithOverrides(seed.resources as unknown as Array<Record<string, unknown>>, 'resourceId', 'resources', overrides),
      quizzes: mergeCollectionWithOverrides(seed.quizzes as unknown as Array<Record<string, unknown>>, 'quizId', 'quizzes', overrides),
      announcements: mergeCollectionWithOverrides(seed.announcements as unknown as Array<Record<string, unknown>>, 'announcementId', 'announcements', overrides),
    });
  });

  // Password-Only Student Profile Creation & Restore (No Email, No Phone, No OTP)
  app.post('/api/student/profile/create', async (req: Request, res: Response) => {
    const ip = req.ip || 'unknown';
    if (!checkRateLimit(`stu-create:${ip}`, 25, 60_000)) {
      res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
      return;
    }
    try {
      const { fullName, classId = 'class-9', preferredLanguage = 'en', password } = req.body || {};
      const cleanName = String(fullName || '').trim();
      const cleanPass = String(password || '').trim();
      if (!cleanName || cleanName.length < 2) {
        res.status(400).json({ error: 'Please enter your name (at least 2 characters).' });
        return;
      }
      if (!cleanPass || cleanPass.length < 4) {
        res.status(400).json({ error: 'Password must be at least 4 characters long.' });
        return;
      }

      const store = loadStudentStore();
      const passcodeKey = hashPasscodeKey(cleanPass);
      const conflict = Object.values(store).find((s) => s.passcodeKey === passcodeKey);
      if (conflict) {
        res.status(409).json({
          error:
            'This exact password is already linked to an existing profile. Use "Restore Profile" with this password or choose a different personal password.',
        });
        return;
      }

      const uid = `stu_${crypto.randomBytes(8).toString('hex')}`;
      const studentId = `ASA-${crypto.randomInt(1000, 9999)}`;
      const passwordHash = await bcrypt.hash(cleanPass, 10);
      const now = new Date().toISOString();

      const record: StoredStudentRecord = {
        uid,
        studentId,
        fullName: cleanName.slice(0, 120),
        classId: String(classId || 'class-9'),
        preferredLanguage: preferredLanguage === 'bn' ? 'bn' : 'en',
        preferredTheme: 'light',
        role: 'student',
        accountStatus: 'active',
        dailyGoalMinutes: 45,
        streakDays: 1,
        passcodeKey,
        passwordHash,
        createdAt: now,
        updatedAt: now,
        progressList: [],
        bookmarks: [],
        notes: [],
        quizAttempts: [],
      };

      store[uid] = record;
      saveStudentStore(store);

      // Best-effort Firestore mirror
      try {
        await adminDb.collection('users').doc(uid).set({
          ...sanitizeStudentProfile(record),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } catch {
        // Preview sandbox fallback
      }

      const token = signSessionToken({ uid, role: 'student', exp: Date.now() + 30 * 24 * 60 * 60 * 1000 });
      res.cookie(STUDENT_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });

      res.status(201).json({
        profile: sanitizeStudentProfile(record),
        progressList: record.progressList,
        bookmarks: record.bookmarks,
        notes: record.notes,
        quizAttempts: record.quizAttempts,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Could not create student profile.' });
    }
  });

  app.post('/api/student/profile/unlock', async (req: Request, res: Response) => {
    const ip = req.ip || 'unknown';
    if (!checkRateLimit(`stu-unlock:${ip}`, 30, 60_000)) {
      res.status(429).json({ error: 'Too many attempts. Please wait a minute.' });
      return;
    }
    try {
      const { password } = req.body || {};
      const cleanPass = String(password || '').trim();
      if (!cleanPass) {
        res.status(400).json({ error: 'Please enter your profile password.' });
        return;
      }

      const store = loadStudentStore();
      const passcodeKey = hashPasscodeKey(cleanPass);
      const match = Object.values(store).find((s) => s.passcodeKey === passcodeKey);

      if (!match) {
        res.status(404).json({ error: 'No student profile found for that password.' });
        return;
      }

      const valid = await bcrypt.compare(cleanPass, match.passwordHash);
      if (!valid) {
        res.status(401).json({ error: 'Incorrect password.' });
        return;
      }

      if (match.accountStatus === 'suspended') {
        res.status(403).json({ error: 'This profile has been paused by an administrator.' });
        return;
      }

      const token = signSessionToken({ uid: match.uid, role: 'student', exp: Date.now() + 30 * 24 * 60 * 60 * 1000 });
      res.cookie(STUDENT_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });

      res.json({
        profile: sanitizeStudentProfile(match),
        progressList: match.progressList || [],
        bookmarks: match.bookmarks || [],
        notes: match.notes || [],
        quizAttempts: match.quizAttempts || [],
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Could not unlock profile.' });
    }
  });

  app.get('/api/student/profile/me', (req: Request, res: Response) => {
    const stuUser = resolveStudentCookie(req);
    if (!stuUser) {
      res.json({ profile: null });
      return;
    }
    const store = loadStudentStore();
    const rec = store[stuUser.uid];
    if (!rec) {
      res.json({ profile: null });
      return;
    }
    res.json({
      profile: sanitizeStudentProfile(rec),
      progressList: rec.progressList || [],
      bookmarks: rec.bookmarks || [],
      notes: rec.notes || [],
      quizAttempts: rec.quizAttempts || [],
    });
  });

  app.patch('/api/student/profile/me', (req: Request, res: Response) => {
    const stuUser = resolveStudentCookie(req);
    if (!stuUser) {
      res.status(401).json({ error: 'Student profile not unlocked.' });
      return;
    }
    const store = loadStudentStore();
    const rec = store[stuUser.uid];
    if (!rec) {
      res.status(404).json({ error: 'Profile not found.' });
      return;
    }
    const { fullName, classId, preferredLanguage, preferredTheme, dailyGoalMinutes } = req.body || {};
    if (typeof fullName === 'string' && fullName.trim().length >= 2) rec.fullName = fullName.trim().slice(0, 120);
    if (typeof classId === 'string' && classId.trim()) rec.classId = classId.trim();
    if (preferredLanguage === 'bn' || preferredLanguage === 'en') rec.preferredLanguage = preferredLanguage;
    if (preferredTheme === 'light' || preferredTheme === 'dark') rec.preferredTheme = preferredTheme;
    if (typeof dailyGoalMinutes === 'number' && dailyGoalMinutes >= 5 && dailyGoalMinutes <= 600) {
      rec.dailyGoalMinutes = dailyGoalMinutes;
    }
    rec.updatedAt = new Date().toISOString();
    store[rec.uid] = rec;
    saveStudentStore(store);
    res.json({ profile: sanitizeStudentProfile(rec) });
  });

  app.post('/api/student/profile/logout', (_req: Request, res: Response) => {
    res.clearCookie(STUDENT_COOKIE_NAME);
    res.json({ ok: true });
  });

  // Student Learning Sync Endpoints (Progress, Bookmarks, Notes, Quiz Attempts)
  app.post('/api/student/learning/progress', (req: Request, res: Response) => {
    const stuUser = resolveStudentCookie(req);
    if (!stuUser) {
      res.status(401).json({ error: 'Unlock student profile first.' });
      return;
    }
    const store = loadStudentStore();
    const rec = store[stuUser.uid];
    if (!rec) {
      res.status(404).json({ error: 'Profile not found.' });
      return;
    }
    const { lessonId, classId, subjectId, chapterId, completed } = req.body || {};
    if (!lessonId) {
      res.status(400).json({ error: 'lessonId required' });
      return;
    }
    const progressId = `${rec.uid}_${lessonId}`;
    const now = new Date().toISOString();
    const idx = rec.progressList.findIndex((p) => p.lessonId === lessonId);
    const existing = idx >= 0 ? rec.progressList[idx] : null;
    const item = {
      progressId,
      studentId: rec.uid,
      lessonId,
      classId: classId || '',
      subjectId: subjectId || '',
      chapterId: chapterId || '',
      completed: typeof completed === 'boolean' ? completed : Boolean(existing?.completed),
      completedAt: completed ? now : existing?.completedAt,
      lastViewedAt: now,
    };
    if (idx >= 0) rec.progressList[idx] = item;
    else rec.progressList.unshift(item);
    saveStudentStore(store);
    res.json({ progressList: rec.progressList });
  });

  app.post('/api/student/learning/bookmark', (req: Request, res: Response) => {
    const stuUser = resolveStudentCookie(req);
    if (!stuUser) {
      res.status(401).json({ error: 'Unlock student profile first.' });
      return;
    }
    const store = loadStudentStore();
    const rec = store[stuUser.uid];
    if (!rec) {
      res.status(404).json({ error: 'Profile not found.' });
      return;
    }
    const { itemId, itemType, title } = req.body || {};
    const idx = rec.bookmarks.findIndex((b) => b.itemId === itemId && b.itemType === itemType);
    if (idx >= 0) {
      rec.bookmarks.splice(idx, 1);
    } else {
      rec.bookmarks.unshift({
        bookmarkId: `${rec.uid}_${itemType}_${itemId}`.slice(0, 120),
        studentId: rec.uid,
        itemId,
        itemType,
        title: String(title || '').slice(0, 200),
        createdAt: new Date().toISOString(),
      });
    }
    saveStudentStore(store);
    res.json({ bookmarks: rec.bookmarks });
  });

  app.post('/api/student/learning/note', (req: Request, res: Response) => {
    const stuUser = resolveStudentCookie(req);
    if (!stuUser) {
      res.status(401).json({ error: 'Unlock student profile first.' });
      return;
    }
    const store = loadStudentStore();
    const rec = store[stuUser.uid];
    if (!rec) {
      res.status(404).json({ error: 'Profile not found.' });
      return;
    }
    const { noteId, lessonId, subjectId, title, content } = req.body || {};
    const now = new Date().toISOString();
    const id = noteId || `note_${crypto.randomBytes(6).toString('hex')}`;
    const idx = rec.notes.findIndex((n) => n.noteId === id);
    const nextNote = {
      noteId: id,
      studentId: rec.uid,
      ...(lessonId ? { lessonId } : {}),
      ...(subjectId ? { subjectId } : {}),
      title: String(title || 'Study Note').trim().slice(0, 200),
      content: String(content || '').slice(0, 10000),
      createdAt: idx >= 0 ? rec.notes[idx]!.createdAt : now,
      updatedAt: now,
    };
    if (idx >= 0) rec.notes[idx] = nextNote;
    else rec.notes.unshift(nextNote);
    saveStudentStore(store);
    res.json({ notes: rec.notes });
  });

  app.delete('/api/student/learning/note/:noteId', (req: Request, res: Response) => {
    const stuUser = resolveStudentCookie(req);
    if (!stuUser) {
      res.status(401).json({ error: 'Unlock student profile first.' });
      return;
    }
    const store = loadStudentStore();
    const rec = store[stuUser.uid];
    if (!rec) {
      res.status(404).json({ error: 'Profile not found.' });
      return;
    }
    rec.notes = rec.notes.filter((n) => n.noteId !== req.params.noteId);
    saveStudentStore(store);
    res.json({ notes: rec.notes });
  });

  app.post('/api/student/learning/quiz-attempt', (req: Request, res: Response) => {
    const stuUser = resolveStudentCookie(req);
    if (!stuUser) {
      res.status(401).json({ error: 'Unlock student profile first.' });
      return;
    }
    const store = loadStudentStore();
    const rec = store[stuUser.uid];
    if (!rec) {
      res.status(404).json({ error: 'Profile not found.' });
      return;
    }
    const { quizId, lessonId, score, totalQuestions } = req.body || {};
    rec.quizAttempts.unshift({
      attemptId: `att_${crypto.randomBytes(6).toString('hex')}`,
      studentId: rec.uid,
      quizId,
      lessonId,
      score: Number(score || 0),
      totalQuestions: Number(totalQuestions || 1),
      completedAt: new Date().toISOString(),
    });
    saveStudentStore(store);
    res.json({ quizAttempts: rec.quizAttempts });
  });

  // Admin: Content Save & Delete (works cleanly in Preview & syncs to Firestore when available)
  app.post('/api/admin/content/save', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { collection: colName, idField, item } = req.body || {};
      const allowedCols = ['categories', 'classes', 'subjects', 'chapters', 'topics', 'lessons', 'resources', 'quizzes', 'announcements', 'appSettings'];
      if (!allowedCols.includes(colName) || !item || typeof item !== 'object') {
        res.status(400).json({ error: 'Valid collection and item payload required.' });
        return;
      }

      const overrides = loadContentOverrides();
      const now = new Date().toISOString();

      if (colName === 'appSettings') {
        overrides.settings = { ...item, settingId: 'global', updatedAt: now };
        overrides.activityLogs.unshift({
          logId: `log_${Date.now()}`,
          actorId: req.authUser?.uid || 'admin',
          actorName: 'Admin Portal',
          action: 'UPDATED_SETTINGS',
          target: 'global',
          timestamp: now,
        });
        saveContentOverrides(overrides);
        try {
          await adminDb.collection('appSettings').doc('global').set({ ...item, settingId: 'global', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        } catch {
          // Best-effort Firestore sync
        }
        res.json({ ok: true, item: overrides.settings });
        return;
      }

      const id = String(item[idField] || `${colName.slice(0, 3)}_${crypto.randomBytes(4).toString('hex')}`);
      const cleanItem = { ...item, [idField]: id, createdAt: item.createdAt || now, updatedAt: now };
      if (!overrides.upserts[colName]) overrides.upserts[colName] = {};
      overrides.upserts[colName]![id] = cleanItem;
      if (overrides.deletes[colName]) {
        overrides.deletes[colName] = overrides.deletes[colName]!.filter((d) => d !== id);
      }
      overrides.activityLogs.unshift({
        logId: `log_${Date.now()}`,
        actorId: req.authUser?.uid || 'admin',
        actorName: 'Admin Portal',
        action: `SAVED_${colName.toUpperCase()}`,
        target: String(cleanItem.title || id),
        timestamp: now,
      });
      overrides.activityLogs = overrides.activityLogs.slice(0, 40);
      saveContentOverrides(overrides);

      try {
        await adminDb.collection(colName).doc(id).set(
          { ...cleanItem, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() },
          { merge: true }
        );
      } catch {
        // Best-effort Firestore sync
      }

      res.json({ ok: true, id, item: cleanItem });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to save item.' });
    }
  });

  app.post('/api/admin/content/delete', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { collection: colName, id } = req.body || {};
      if (!colName || !id) {
        res.status(400).json({ error: 'collection and id required' });
        return;
      }
      const overrides = loadContentOverrides();
      if (!overrides.deletes[colName]) overrides.deletes[colName] = [];
      if (!overrides.deletes[colName]!.includes(id)) overrides.deletes[colName]!.push(id);
      if (overrides.upserts[colName]) delete overrides.upserts[colName]![id];
      overrides.activityLogs.unshift({
        logId: `log_${Date.now()}`,
        actorId: req.authUser?.uid || 'admin',
        actorName: 'Admin Portal',
        action: `DELETED_${String(colName).toUpperCase()}`,
        target: String(id),
        timestamp: new Date().toISOString(),
      });
      saveContentOverrides(overrides);

      try {
        await adminDb.collection(colName).doc(id).delete();
      } catch {
        // Best-effort Firestore sync
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to delete item.' });
    }
  });

  app.get('/api/admin/students-list', requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
    const store = loadStudentStore();
    const localStudents = Object.values(store).map((s) => ({
      ...sanitizeStudentProfile(s),
      completedLessonsCount: (s.progressList || []).filter((p) => p.completed).length,
      quizAttemptsCount: (s.quizAttempts || []).length,
    }));
    const overrides = loadContentOverrides();
    res.json({ students: localStudents, logs: overrides.activityLogs || [] });
  });

  app.post('/api/admin/students/password-only', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { fullName, classId = 'class-9', password, preferredLanguage = 'bn' } = req.body || {};
      const cleanName = String(fullName || '').trim();
      const cleanPass = String(password || '').trim();
      if (!cleanName || !cleanPass || cleanPass.length < 4) {
        res.status(400).json({ error: 'Name and password (min 4 chars) are required.' });
        return;
      }
      const store = loadStudentStore();
      const passcodeKey = hashPasscodeKey(cleanPass);
      if (Object.values(store).some((s) => s.passcodeKey === passcodeKey)) {
        res.status(409).json({ error: 'This passcode is already assigned to another student.' });
        return;
      }
      const uid = `stu_${crypto.randomBytes(8).toString('hex')}`;
      const studentId = `ASA-${crypto.randomInt(1000, 9999)}`;
      const now = new Date().toISOString();
      const rec: StoredStudentRecord = {
        uid,
        studentId,
        fullName: cleanName,
        classId: String(classId),
        preferredLanguage: preferredLanguage === 'en' ? 'en' : 'bn',
        preferredTheme: 'light',
        role: 'student',
        accountStatus: 'active',
        dailyGoalMinutes: 45,
        streakDays: 1,
        passcodeKey,
        passwordHash: await bcrypt.hash(cleanPass, 10),
        createdAt: now,
        updatedAt: now,
        progressList: [],
        bookmarks: [],
        notes: [],
        quizAttempts: [],
      };
      store[uid] = rec;
      saveStudentStore(store);
      res.status(201).json({ student: sanitizeStudentProfile(rec) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Could not create student.' });
    }
  });

  app.post('/api/admin/students/:uid/toggle-status', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const store = loadStudentStore();
    const rec = store[req.params.uid];
    if (!rec) {
      res.status(404).json({ error: 'Student profile not found.' });
      return;
    }
    rec.accountStatus = rec.accountStatus === 'suspended' ? 'active' : 'suspended';
    rec.updatedAt = new Date().toISOString();
    saveStudentStore(store);
    res.json({ ok: true, accountStatus: rec.accountStatus });
  });

  // Admin AI Auto-Fill Lesson + Quiz Generator
  app.post('/api/admin/ai/autofill-lesson', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'MY_GEMINI_API_KEY') {
        res.status(503).json({ error: 'GEMINI_API_KEY is not configured.' });
        return;
      }
      const { topicPrompt, classTitle = 'Class 9', subjectTitle = 'Mathematics' } = req.body || {};
      if (!topicPrompt || String(topicPrompt).trim().length < 2) {
        res.status(400).json({ error: 'Enter a topic or lesson idea first.' });
        return;
      }

      const response = await generateWithRetry('gemini-4-hydrogen', {
        contents: `You are an academic curriculum designer for Bangladeshi Class 6-10 students (${classTitle}, ${subjectTitle}).
Create structured bilingual (English + natural Unicode Bangla) metadata and a 3-question MCQ quiz for this topic: "${String(topicPrompt).trim()}".
Pick the most relevant 3D scene from ['trigonometry_triangle', 'newton_orbit', 'algebra_geometry', 'molecule_atom'] and whether 3D mode fits nicely (has3dMode).`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              titleBn: { type: Type.STRING },
              description: { type: Type.STRING },
              descriptionBn: { type: Type.STRING },
              difficulty: { type: Type.STRING },
              durationMinutes: { type: Type.INTEGER },
              has3dMode: { type: Type.BOOLEAN },
              threeDSceneType: { type: Type.STRING },
              objectives: { type: Type.ARRAY, items: { type: Type.STRING } },
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    question: { type: Type.STRING },
                    questionBn: { type: Type.STRING },
                    options: { type: Type.ARRAY, items: { type: Type.STRING } },
                    optionsBn: { type: Type.ARRAY, items: { type: Type.STRING } },
                    correctIndex: { type: Type.INTEGER },
                    explanation: { type: Type.STRING },
                    explanationBn: { type: Type.STRING },
                  },
                  required: ['question', 'questionBn', 'options', 'optionsBn', 'correctIndex', 'explanation', 'explanationBn'],
                },
              },
            },
            required: ['title', 'titleBn', 'description', 'descriptionBn', 'difficulty', 'durationMinutes', 'has3dMode', 'threeDSceneType', 'objectives', 'questions'],
          },
        },
      });

      const generated = JSON.parse((response.text ?? '{}').trim());
      res.json({ generated });
    } catch (err) {
      const parsed = extractRetryError(err);
      res.status(parsed.status).json({ error: parsed.message });
    }
  });

  // Admin AI Full Module Builder (Chapter + Topic + Lesson + Quiz in one click)
  app.post('/api/admin/ai/generate-module', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'MY_GEMINI_API_KEY') {
        res.status(503).json({ error: 'GEMINI_API_KEY is not configured.' });
        return;
      }
      const { prompt, classId = 'class-9', subjectId = 'subj-9-math' } = req.body || {};
      if (!prompt || String(prompt).trim().length < 2) {
        res.status(400).json({ error: 'Enter a module prompt (e.g. Quadratic Equations or Cell Biology).' });
        return;
      }

      const response = await generateWithRetry('gemini-4-hydrogen', {
        contents: `Create a complete mini learning module for ${classId} (${subjectId}) based on: "${String(prompt).trim()}".
Include bilingual English & natural Unicode Bangla titles/descriptions for 1 chapter, 1 topic, 1 lesson (with a realistic 3D scene type from ['trigonometry_triangle', 'newton_orbit', 'algebra_geometry', 'molecule_atom']), and 3 MCQ quiz questions.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              chapterTitle: { type: Type.STRING },
              chapterTitleBn: { type: Type.STRING },
              chapterDesc: { type: Type.STRING },
              chapterDescBn: { type: Type.STRING },
              topicTitle: { type: Type.STRING },
              topicTitleBn: { type: Type.STRING },
              lessonTitle: { type: Type.STRING },
              lessonTitleBn: { type: Type.STRING },
              lessonDesc: { type: Type.STRING },
              lessonDescBn: { type: Type.STRING },
              difficulty: { type: Type.STRING },
              threeDSceneType: { type: Type.STRING },
              objectives: { type: Type.ARRAY, items: { type: Type.STRING } },
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    question: { type: Type.STRING },
                    questionBn: { type: Type.STRING },
                    options: { type: Type.ARRAY, items: { type: Type.STRING } },
                    optionsBn: { type: Type.ARRAY, items: { type: Type.STRING } },
                    correctIndex: { type: Type.INTEGER },
                    explanation: { type: Type.STRING },
                    explanationBn: { type: Type.STRING },
                  },
                  required: ['question', 'questionBn', 'options', 'optionsBn', 'correctIndex', 'explanation', 'explanationBn'],
                },
              },
            },
            required: ['chapterTitle', 'chapterTitleBn', 'topicTitle', 'topicTitleBn', 'lessonTitle', 'lessonTitleBn', 'lessonDesc', 'lessonDescBn', 'difficulty', 'threeDSceneType', 'questions'],
          },
        },
      });

      const gen = JSON.parse((response.text ?? '{}').trim());
      const now = new Date().toISOString();
      const suffix = crypto.randomBytes(3).toString('hex');
      const chapterId = `chap_ai_${suffix}`;
      const topicId = `top_ai_${suffix}`;
      const lessonId = `les_ai_${suffix}`;
      const quizId = `quiz_ai_${suffix}`;

      const chapter = {
        chapterId,
        classId,
        subjectId,
        title: gen.chapterTitle,
        titleBn: gen.chapterTitleBn || gen.chapterTitle,
        description: gen.chapterDesc || '',
        descriptionBn: gen.chapterDescBn || '',
        order: 99,
        status: 'published',
        createdAt: now,
        updatedAt: now,
      };
      const topic = {
        topicId,
        classId,
        subjectId,
        chapterId,
        title: gen.topicTitle,
        titleBn: gen.topicTitleBn || gen.topicTitle,
        order: 1,
        status: 'published',
        createdAt: now,
        updatedAt: now,
      };
      const validScenes = ['trigonometry_triangle', 'newton_orbit', 'algebra_geometry', 'molecule_atom'];
      const scene = validScenes.includes(gen.threeDSceneType) ? gen.threeDSceneType : 'algebra_geometry';
      const demoUrl = scene === 'newton_orbit' ? 'demo://newton-orbit-3d' : scene === 'molecule_atom' ? 'demo://atom-3d' : 'demo://trigonometry-3d';
      const lesson = {
        lessonId,
        classId,
        subjectId,
        chapterId,
        topicId,
        category: 'interactive_3d',
        title: gen.lessonTitle,
        titleBn: gen.lessonTitleBn || gen.lessonTitle,
        youtubeUrl: demoUrl,
        description: gen.lessonDesc,
        descriptionBn: gen.lessonDescBn || gen.lessonDesc,
        objectives: Array.isArray(gen.objectives) ? gen.objectives : [],
        difficulty: ['beginner', 'intermediate', 'advanced'].includes(gen.difficulty) ? gen.difficulty : 'intermediate',
        durationMinutes: 15,
        featured: true,
        has3dMode: true,
        threeDSceneType: scene,
        order: 1,
        status: 'published',
        createdAt: now,
        updatedAt: now,
      };
      const quiz = {
        quizId,
        lessonId,
        title: `${gen.lessonTitle} Quiz`,
        status: 'published',
        questions: (Array.isArray(gen.questions) ? gen.questions : []).map((q: Record<string, unknown>, i: number) => ({
          id: `aiq_${i + 1}_${suffix}`,
          ...q,
        })),
        createdAt: now,
        updatedAt: now,
      };

      const overrides = loadContentOverrides();
      overrides.upserts.chapters = { ...(overrides.upserts.chapters || {}), [chapterId]: chapter };
      overrides.upserts.topics = { ...(overrides.upserts.topics || {}), [topicId]: topic };
      overrides.upserts.lessons = { ...(overrides.upserts.lessons || {}), [lessonId]: lesson };
      overrides.upserts.quizzes = { ...(overrides.upserts.quizzes || {}), [quizId]: quiz };
      overrides.activityLogs.unshift({
        logId: `log_${Date.now()}`,
        actorId: req.authUser?.uid || 'admin',
        actorName: 'Admin AI Builder',
        action: 'AI_GENERATED_MODULE',
        target: String(gen.lessonTitle || prompt),
        timestamp: now,
      });
      saveContentOverrides(overrides);

      res.status(201).json({ ok: true, chapter, topic, lesson, quiz });
    } catch (err) {
      const parsed = extractRetryError(err);
      res.status(parsed.status).json({ error: parsed.message });
    }
  });

  // Vite dev middleware or static dist serving
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ASA,LEARN server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
