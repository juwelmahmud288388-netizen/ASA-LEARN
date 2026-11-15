import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { AiTutorWidget } from './components/AiTutorWidget';
import { Footer } from './components/Footer';
import { LanguageSelectorModal } from './components/LanguageSelectorModal';
import { MobileBottomNav } from './components/MobileBottomNav';
import { Navbar } from './components/Navbar';
import { OfflineIndicator } from './components/PWAInstallButton';
import { StudentProfileModal } from './components/StudentProfileModal';
import { t } from './i18n/translations';
import { AdminDashboard } from './pages/AdminDashboard';
import { ForgotPasswordPage, LoginPage, RegisterPage } from './pages/AuthPages';
import { ClassDirectoryPage } from './pages/ClassDirectoryPage';
import { LandingPage } from './pages/LandingPage';
import { LessonPlayerPage } from './pages/LessonPlayerPage';
import { AboutPage, FeaturesPage, PolicyPage } from './pages/StaticPages';
import { StudentDashboard } from './pages/StudentDashboard';
import { LeaderboardPage } from './pages/LeaderboardPage';

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#F5F9FF] p-6 text-center dark:bg-[#070E24]">
          <div className="glass-surface max-w-md rounded-3xl p-8">
            <h1 className="font-display text-xl font-bold text-[#172554] dark:text-white">
              Something went wrong
            </h1>
            <p className="mt-2 text-xs text-[#64748B] dark:text-slate-300">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 rounded-xl bg-[#172554] px-5 py-2.5 text-xs font-semibold text-white"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const RouterView: React.FC = () => {
  const { route, appSettings, isAdmin, language, navigate } = useApp();

  if (appSettings.featureFlags.maintenanceMode && !isAdmin && !route.startsWith('/admin')) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <div className="glass-surface rounded-3xl p-8">
          <h1 className="font-display text-2xl font-bold text-[#172033] dark:text-white">
            {t(language, 'maintenanceTitle')}
          </h1>
          <p className="mt-3 text-sm text-[#64748B] dark:text-slate-300">{t(language, 'maintenanceDesc')}</p>
          <button
            type="button"
            onClick={() => navigate('/admin')}
            className="mt-6 rounded-xl bg-[#172554] px-5 py-2.5 text-xs font-semibold text-white"
          >
            Admin Portal
          </button>
        </div>
      </div>
    );
  }

  if (route === '/' || route === '') return <LandingPage />;
  if (route.startsWith('/classes')) return <ClassDirectoryPage />;
  if (route.startsWith('/lesson/')) return <LessonPlayerPage />;
  if (route.startsWith('/leaderboard')) return <LeaderboardPage />;
  if (route === '/login') return <LoginPage />;
  if (route === '/register') return <RegisterPage />;
  if (route === '/forgot-password') return <ForgotPasswordPage />;
  if (route === '/dashboard') return <StudentDashboard />;
  if (route.startsWith('/admin')) return <AdminDashboard />;
  if (route === '/about') return <AboutPage />;
  if (route === '/features') return <FeaturesPage />;
  if (route === '/privacy') return <PolicyPage type="privacy" />;
  if (route === '/terms') return <PolicyPage type="terms" />;

  return <LandingPage />;
};

const AppShell: React.FC = () => {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#F5F9FF] text-[#172033] transition-colors duration-200 dark:bg-[#070E24] dark:text-[#F8FAFC]">
      {/* Subtle Ice-Blue Liquid Glass Ambient Lighting */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-[#BFE8FF]/45 blur-3xl dark:bg-[#263B91]/25" />
        <div className="absolute right-0 top-1/3 h-[28rem] w-[28rem] rounded-full bg-[#E7F5FF]/80 blur-3xl dark:bg-[#172554]/35" />
      </div>

      <Navbar />
      <main className="min-h-[75vh] pb-20 md:pb-0">
        <RouterView />
      </main>
      <Footer />

      <MobileBottomNav />
      <LanguageSelectorModal />
      <StudentProfileModal />
      <AiTutorWidget />
      <OfflineIndicator />
    </div>
  );
};

export default function App() {
  return (
    <AppErrorBoundary>
      <AppProvider>
        <AppShell />
      </AppProvider>
    </AppErrorBoundary>
  );
}
