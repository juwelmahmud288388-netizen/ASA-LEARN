import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Bot, Box, Loader2, Sparkles, Square, Volume2 } from 'lucide-react';
import { Interactive3DLab } from '../components/Interactive3DLab';
import { useApp } from '../context/AppContext';
import type { Ai3DSceneBlueprint } from '../types';

const PRESET_TOPICS = [
  {
    en: 'Solar System & Planetary Gravity',
    bn: 'সৌরজগৎ ও গ্রহগুলোর কক্ষপথ',
    subject: 'Science / Physics',
  },
  {
    en: 'Water Molecule (H2O) 3D Bond Angle',
    bn: 'পানির অণু (H2O) থ্রিডি গঠন',
    subject: 'Chemistry',
  },
  {
    en: 'Plant Cell Organelles & Nucleus',
    bn: 'উদ্ভিদ কোষের গঠন ও নিউক্লিয়াস',
    subject: 'Biology',
  },
  {
    en: 'Pythagoras Theorem & Right Triangle',
    bn: 'পিথাগোরাসের উপপাদ্য ও সমকোণী ত্রিভুজ',
    subject: 'Mathematics',
  },
  {
    en: 'Bohr Atomic Model & Electron Shells',
    bn: 'বোরের পরমাণু মডেল ও ইলেকট্রন স্তর',
    subject: 'Chemistry',
  },
  {
    en: 'DNA Double Helix Structure',
    bn: 'ডিএনএ (DNA) ডাবল হেলিক্স গঠন',
    subject: 'Biology',
  },
];

export const Ai3DExplorerPage: React.FC = () => {
  const {
    language,
    classes,
    subjects,
    userProfile,
    firebaseUser,
    ai3dBlueprint,
    setAi3dBlueprint,
    openAiWithLesson,
    navigate,
  } = useApp();

  const [topicInput, setTopicInput] = useState(ai3dBlueprint?.topic || '');
  const [selectedClassId, setSelectedClassId] = useState<string>(userProfile?.classId || classes[0]?.classId || 'class-9');
  const [selectedSubjectTitle, setSelectedSubjectTitle] = useState<string>('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [blueprint, setBlueprint] = useState<Ai3DSceneBlueprint | null>(ai3dBlueprint);

  // Voice playback state (Gemini TTS + fallback)
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (ai3dBlueprint) {
      setBlueprint(ai3dBlueprint);
      setTopicInput(ai3dBlueprint.topic || '');
    }
  }, [ai3dBlueprint]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const classSubjects = useMemo(() => {
    const filtered = subjects.filter((s) => s.classId === selectedClassId);
    return filtered.length > 0 ? filtered : subjects;
  }, [subjects, selectedClassId]);

  const activeClassObj = classes.find((c) => c.classId === selectedClassId);

  const stopVoice = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setTtsPlaying(false);
  };

  const generate3DTopic = async (overrideTopic?: string) => {
    const q = (overrideTopic ?? topicInput).trim();
    if (!q || generating) return;
    stopVoice();
    setGenError(null);
    setGenerating(true);
    try {
      const idToken = firebaseUser ? await firebaseUser.getIdToken() : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (idToken) headers.Authorization = `Bearer ${idToken}`;

      const res = await fetch('/api/ai/topic-3d', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          topic: q,
          classTitle: activeClassObj ? (language === 'bn' ? activeClassObj.titleBn : activeClassObj.title) : selectedClassId,
          subjectTitle: selectedSubjectTitle || 'Science & Mathematics',
          language,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.blueprint) {
        throw new Error(data.error || 'Could not generate 3D visualization.');
      }
      setBlueprint(data.blueprint);
      setAi3dBlueprint(data.blueprint);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Failed to generate 3D model.');
    } finally {
      setGenerating(false);
    }
  };

  const playNaturalAiVoice = async () => {
    if (ttsPlaying) {
      stopVoice();
      return;
    }
    const textToRead = blueprint
      ? `${language === 'bn' ? blueprint.titleBn : blueprint.title}. ${language === 'bn' ? blueprint.summaryBn : blueprint.summary} ${(blueprint.keyPoints || []).join('. ')}`
      : language === 'bn'
        ? 'যেকোনো টপিক লিখে এআই থ্রিডি মডেল তৈরি করুন এবং ঘুরিয়ে ঘুরিয়ে পড়া বুঝে নিন।'
        : 'Type any curriculum topic to generate an interactive 3D learning model and listen to clear explanations.';

    setTtsLoading(true);
    try {
      const res = await fetch('/api/ai/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ text: textToRead, language }),
      });
      const data = await res.json();
      if (res.ok && data.audioBase64) {
        const mime = data.mimeType || 'audio/wav';
        const audio = new Audio(`data:${mime};base64,${data.audioBase64}`);
        audioRef.current = audio;
        audio.onended = () => setTtsPlaying(false);
        audio.onerror = () => setTtsPlaying(false);
        setTtsPlaying(true);
        await audio.play();
        return;
      }
      throw new Error(data.error || 'TTS unavailable');
    } catch {
      // Fallback to browser SpeechSynthesis
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(textToRead.slice(0, 750));
        utter.lang = language === 'bn' ? 'bn-BD' : 'en-US';
        utter.onend = () => setTtsPlaying(false);
        utter.onerror = () => setTtsPlaying(false);
        setTtsPlaying(true);
        window.speechSynthesis.speak(utter);
      }
    } finally {
      setTtsLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1320px] px-4 py-7 sm:px-6 lg:px-8">
      {/* Breadcrumb & Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#263B91] hover:underline dark:text-[#BFE8FF]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{language === 'bn' ? 'হোমে ফিরুন' : 'Back to Home'}</span>
          </button>
          <h1 className="font-display mt-2 text-2xl font-extrabold text-[#172033] sm:text-3xl dark:text-white">
            {language === 'bn' ? 'AI ৩ডি ভিজ্যুয়াল ল্যাব' : 'AI Interactive 3D Topic Lab'}
          </h1>
          <p className="mt-1 text-xs text-[#64748B] sm:text-sm dark:text-slate-300">
            {language === 'bn'
              ? 'যেকোনো অধ্যায় বা টপিক লিখুন—এআই সাথে সাথে ৩ডি মডেল, সহজ ব্যাখ্যা ও ন্যাচারাল ভয়েস তৈরি করবে।'
              : 'Pick or type any topic—AI instantly builds an interactive 3D simulation with clear explanation and natural voice.'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate('/lesson/les-sample-3d-demo')}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#172554]/15 bg-white/85 px-4 py-2 text-xs font-semibold text-[#172554] hover:bg-[#E7F5FF] dark:border-white/15 dark:bg-slate-800 dark:text-[#BFE8FF]"
        >
          <Box className="h-4 w-4" />
          <span>{language === 'bn' ? 'ডেমো ভিডিও + ৩ডি দেখুন' : 'Video + 3D Demo Lesson'}</span>
        </button>
      </div>

      {/* Topic Generator Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void generate3DTopic();
        }}
        className="glass-surface mt-6 rounded-3xl p-4 sm:p-5"
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-6">
            <input
              type="text"
              value={topicInput}
              onChange={(e) => setTopicInput(e.target.value)}
              placeholder={
                language === 'bn'
                  ? 'টপিক লিখুন (যেমন: সৌরজগৎ, পানির অণু H2O, উদ্ভিদ কোষ, নিউটনের সূত্র)...'
                  : 'Enter any topic (e.g., Solar System, Water Molecule H2O, Plant Cell, Newton Gravity)...'
              }
              className="h-11 w-full rounded-xl border border-[#172554]/15 bg-white px-4 text-sm text-[#172033] placeholder:text-[#64748B] focus:border-[#263B91] focus:outline-none dark:border-white/15 dark:bg-slate-900 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 md:col-span-4">
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              aria-label="Class"
              className="h-11 rounded-xl border border-[#172554]/15 bg-white px-3 text-xs font-medium text-[#172033] dark:border-white/15 dark:bg-slate-900 dark:text-white"
            >
              {classes.map((c) => (
                <option key={c.classId} value={c.classId}>
                  {language === 'bn' ? c.titleBn : c.title}
                </option>
              ))}
            </select>

            <select
              value={selectedSubjectTitle}
              onChange={(e) => setSelectedSubjectTitle(e.target.value)}
              aria-label="Subject"
              className="h-11 rounded-xl border border-[#172554]/15 bg-white px-3 text-xs font-medium text-[#172033] dark:border-white/15 dark:bg-slate-900 dark:text-white"
            >
              <option value="">{language === 'bn' ? 'সকল বিষয়' : 'All Subjects'}</option>
              {classSubjects.map((s) => (
                <option key={s.subjectId} value={s.title}>
                  {language === 'bn' ? s.titleBn : s.title}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={generating || !topicInput.trim()}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#172554] px-4 text-xs font-bold text-white transition hover:bg-[#263B91] disabled:opacity-50 dark:bg-[#BFE8FF] dark:text-[#172554]"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              <span>{generating ? (language === 'bn' ? 'তৈরি হচ্ছে...' : 'Building...') : language === 'bn' ? '৩ডি তৈরি করুন' : 'Create 3D'}</span>
            </button>
          </div>
        </div>

        {/* One-Click Presets */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold text-[#64748B] dark:text-slate-400">
            {language === 'bn' ? 'জনপ্রিয় টপিক:' : 'Quick Topics:'}
          </span>
          {PRESET_TOPICS.map((preset) => {
            const label = language === 'bn' ? preset.bn : preset.en;
            return (
              <button
                key={preset.en}
                type="button"
                disabled={generating}
                onClick={() => {
                  setTopicInput(label);
                  setSelectedSubjectTitle(preset.subject);
                  void generate3DTopic(label);
                }}
                className="rounded-lg border border-[#172554]/12 bg-white/85 px-2.5 py-1 text-[11px] font-medium text-[#172554] transition hover:bg-[#E7F5FF] dark:border-white/15 dark:bg-slate-800 dark:text-[#BFE8FF]"
              >
                {label}
              </button>
            );
          })}
        </div>

        {genError && (
          <p className="mt-3 rounded-xl border border-red-500/25 bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/50 dark:text-red-200">
            {genError}
          </p>
        )}
      </form>

      {/* Main 3D Stage + AI Explanation & Voice Card */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="h-[430px] lg:col-span-7 lg:h-[520px]">
          <Interactive3DLab
            initialScene={blueprint ? 'ai_custom' : 'trigonometry_triangle'}
            customBlueprint={blueprint}
            language={language}
            onAskAi={() => openAiWithLesson(null, 'visual_3d_guide')}
          />
        </div>

        <div className="glass-surface flex flex-col justify-between rounded-3xl p-6 lg:col-span-5">
          <div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#E7F5FF] px-2.5 py-1 text-[11px] font-bold text-[#172554] dark:bg-slate-800 dark:text-[#BFE8FF]">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>{blueprint ? (language === 'bn' ? 'এআই জেনারেটেড ৩ডি' : 'AI Generated 3D') : language === 'bn' ? 'ইন্টারেক্টিভ ৩ডি স্টুডিও' : 'Interactive 3D Studio'}</span>
                </span>
                <h2 className="font-display mt-3 text-xl font-bold text-[#172033] dark:text-white">
                  {blueprint
                    ? language === 'bn'
                      ? blueprint.titleBn || blueprint.title
                      : blueprint.title
                    : language === 'bn'
                      ? 'যেকোনো বিষয় থ্রিডি-তে বুঝে নিন'
                      : 'Understand Any Subject Visually in 3D'}
                </h2>
              </div>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-[#475569] dark:text-slate-300">
              {blueprint
                ? language === 'bn'
                  ? blueprint.summaryBn || blueprint.summary
                  : blueprint.summary
                : language === 'bn'
                  ? 'বাম পাশের ৩ডি মডেল মাউস বা আঙুল দিয়ে ঘুরিয়ে দেখুন এবং নিচের স্লাইডার ব্যবহার করে মান পরিবর্তন করুন। অথবা উপরে আপনার পছন্দের যেকোনো টপিক লিখে "৩ডি তৈরি করুন" বাটনে ক্লিক করুন।'
                  : 'Drag to orbit the 3D simulation on the left and use the slider to manipulate live parameters, or enter any topic above to generate a custom 3D model.'}
            </p>

            {blueprint?.keyPoints && blueprint.keyPoints.length > 0 && (
              <div className="mt-5 space-y-2 rounded-2xl bg-white/80 p-4 dark:bg-slate-900/70">
                <p className="text-xs font-bold text-[#172554] dark:text-[#BFE8FF]">
                  {language === 'bn' ? 'গুরুত্বপূর্ণ পয়েন্টসমূহ:' : 'Key Concepts:'}
                </p>
                <ul className="space-y-1.5 text-xs leading-relaxed text-[#334155] dark:text-slate-300">
                  {blueprint.keyPoints.map((kp, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#263B91] dark:bg-[#BFE8FF]" />
                      <span>{kp}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2.5 border-t border-[#172554]/10 pt-4 dark:border-white/10">
            <button
              type="button"
              disabled={ttsLoading}
              onClick={() => void playNaturalAiVoice()}
              className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-bold transition ${
                ttsPlaying
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-[#172554] text-white hover:bg-[#263B91] dark:bg-[#BFE8FF] dark:text-[#172554]'
              }`}
            >
              {ttsLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : ttsPlaying ? (
                <Square className="h-3.5 w-3.5 fill-current" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
              <span>
                {ttsLoading
                  ? language === 'bn'
                    ? 'ভয়েস তৈরি হচ্ছে...'
                    : 'Generating AI Voice...'
                  : ttsPlaying
                    ? language === 'bn'
                      ? 'ভয়েস বন্ধ করুন'
                      : 'Stop AI Voice'
                    : language === 'bn'
                      ? 'AI ভয়েসে শুনুন'
                      : 'Listen with AI Voice'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => openAiWithLesson(null, 'visual_3d_guide')}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#172554]/15 bg-white px-4 py-3 text-xs font-semibold text-[#172554] hover:bg-[#E7F5FF] dark:border-white/15 dark:bg-slate-800 dark:text-[#BFE8FF]"
            >
              <Bot className="h-4 w-4" />
              <span>{language === 'bn' ? 'প্রশ্ন করুন' : 'Ask AI'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
