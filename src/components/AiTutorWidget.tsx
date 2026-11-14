import React, { useEffect, useRef, useState } from 'react';
import {
  Bot,
  Box,
  Calculator,
  Calendar,
  Check,
  Copy,
  FileText,
  HelpCircle,
  Mic,
  MicOff,
  Send,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
  X,
} from 'lucide-react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { createClientId } from '../lib/utils';
import { useApp } from '../context/AppContext';
import type { AiChatMessage } from '../types';

type TutorMode =
  | 'general'
  | 'bangla_tutor'
  | 'math_step_by_step'
  | 'visual_3d_guide'
  | 'pdf_qa'
  | 'chapter_summary'
  | 'recommendations'
  | 'voice_tutor'
  | 'quiz_gen'
  | 'study_plan';

export const AiTutorWidget: React.FC = () => {
  const {
    language,
    firebaseUser,
    userProfile,
    classes,
    subjects,
    progressList,
    appSettings,
    aiDrawerOpen,
    setAiDrawerOpen,
    aiContextLesson,
    aiInitialMode,
  } = useApp();

  const [mode, setMode] = useState<TutorMode>(language === 'bn' ? 'bangla_tutor' : 'general');
  const [selectedClass, setSelectedClass] = useState<string>(userProfile?.classId || 'class-9');
  const [selectedSubject, setSelectedSubject] = useState<string>('Mathematics');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [convId, setConvId] = useState<string>(() => createClientId('conv'));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [quotaRemaining, setQuotaRemaining] = useState<number | null>(null);

  // PDF upload state
  const [pdfFile, setPdfFile] = useState<{ name: string; base64: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Voice Recognition & Speech Synthesis
  const [listening, setListening] = useState(false);
  const [speakingEnabled, setSpeakingEnabled] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (aiInitialMode) {
      setMode(aiInitialMode as TutorMode);
    }
  }, [aiInitialMode, aiDrawerOpen]);

  useEffect(() => {
    if (aiContextLesson) {
      setSelectedClass(aiContextLesson.classId);
      const subj = subjects.find((s) => s.subjectId === aiContextLesson.subjectId);
      if (subj) setSelectedSubject(subj.title);
    } else if (userProfile?.classId) {
      setSelectedClass(userProfile.classId);
    }
  }, [aiContextLesson, userProfile?.classId, subjects]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  if (!appSettings.aiSettings.enabled) return null;

  const classObj = classes.find((c) => c.classId === selectedClass);
  const classLabel = classObj ? (language === 'bn' ? classObj.titleBn : classObj.title) : selectedClass;

  const suggestedQuestions =
    language === 'bn'
      ? [
          'থ্রিডি (3D) মডেলে কোণ θ বাড়ালে sin θ কীভাবে বদলায়?',
          'ধাপে ধাপে সমাধান করো: x² - 5x + 6 = 0',
          'আজকের পড়ার জন্য ৪৫ মিনিটের রুটিন তৈরি করো',
          'নিউটনের গতির দ্বিতীয় সূত্র F = ma ব্যাখ্যা করো',
        ]
      : [
          'How does changing angle θ in the 3D triangle affect sin θ and cos θ?',
          'Solve step-by-step: x² - 5x + 6 = 0',
          'Explain Newton orbital gravity when radius increases',
          'Create a 45-minute practice quiz for this chapter',
        ];

  const speakText = (text: string) => {
    if (!speakingEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/[*#`]/g, '').slice(0, 600));
    utterance.lang = language === 'bn' ? 'bn-BD' : 'en-US';
    window.speechSynthesis.speak(utterance);
  };

  const toggleVoiceInput = () => {
    const SpeechRec =
      (window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;

    if (!SpeechRec) {
      setError(
        language === 'bn'
          ? 'এই ব্রাউজারে ভয়েস ইনপুট সমর্থিত নয়।'
          : 'Voice input is not supported in this browser.'
      );
      return;
    }

    const recognition = new SpeechRec() as {
      lang: string;
      interimResults: boolean;
      onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
      onerror: () => void;
      onend: () => void;
      start: () => void;
    };
    recognition.lang = language === 'bn' ? 'bn-BD' : 'en-US';
    recognition.interimResults = false;
    setListening(true);
    setMode('voice_tutor');
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      if (transcript) {
        setInput(transcript);
        void sendMessage(transcript, 'voice_tutor');
      }
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognition.start();
  };

  const handlePdfSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setError(language === 'bn' ? 'শুধুমাত্র পিডিএফ (.pdf) ফাইল আপলোড করা যাবে।' : 'Only PDF (.pdf) files are allowed.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError(language === 'bn' ? 'পিডিএফ ফাইল ১০ মেগাবাইটের কম হতে হবে।' : 'PDF file must be under 10 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      setPdfFile({ name: file.name, base64 });
      setMode('pdf_qa');
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const persistConversation = async (nextMessages: AiChatMessage[]) => {
    if (!firebaseUser?.uid) return;
    try {
      await setDoc(doc(db, 'aiConversations', convId), {
        convId,
        studentId: firebaseUser.uid,
        title: nextMessages[0]?.text.slice(0, 80) || 'AI Tutor Session',
        subjectContext: selectedSubject,
        classContext: classLabel,
        messages: nextMessages.slice(-40),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch {
      // non-blocking
    }
  };

  const sendMessage = async (overrideText?: string, overrideMode?: TutorMode) => {
    const text = (overrideText ?? input).trim();
    const activeMode = overrideMode ?? mode;
    if (!text || sending) return;

    setError(null);
    const userMsg: AiChatMessage = {
      id: createClientId('msg'),
      role: 'user',
      text,
      mode: activeMode,
      attachmentName: pdfFile?.name,
      timestamp: new Date().toISOString(),
    };

    const nextWithUser = [...messages, userMsg];
    setMessages(nextWithUser);
    if (!overrideText) setInput('');
    setSending(true);

    try {
      const idToken = firebaseUser ? await firebaseUser.getIdToken() : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (idToken) headers.Authorization = `Bearer ${idToken}`;

      if (activeMode === 'quiz_gen') {
        const res = await fetch('/api/ai/quiz', {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({
            classTitle: classLabel,
            subjectTitle: selectedSubject,
            topicTitle: text,
            language,
            count: 4,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Quiz generation failed');
        const formatted = (data.questions || [])
          .map(
            (q: { question: string; options: string[]; correctIndex: number; explanation: string }, i: number) =>
              `${i + 1}. ${q.question}\n${q.options.map((o, idx) => `   ${String.fromCharCode(65 + idx)}) ${o}`).join('\n')}\n   Answer: ${String.fromCharCode(
                65 + q.correctIndex
              )} — ${q.explanation}`
          )
          .join('\n\n');
        const botMsg: AiChatMessage = {
          id: createClientId('msg'),
          role: 'assistant',
          text: formatted || 'No quiz questions generated.',
          mode: activeMode,
          timestamp: new Date().toISOString(),
        };
        const updated = [...nextWithUser, botMsg];
        setMessages(updated);
        await persistConversation(updated);
      } else if (activeMode === 'study_plan') {
        const completedCount = progressList.filter((p) => p.completed).length;
        const res = await fetch('/api/ai/study-plan', {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({
            classTitle: classLabel,
            dailyMinutes: userProfile?.dailyGoalMinutes || 45,
            completedCount,
            weakSubjects: [selectedSubject],
            language,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Study plan generation failed');
        const formatted = (data.plan || [])
          .map(
            (d: { day: string; focusSubject: string; task: string; durationMinutes: number; revisionTip: string }) =>
              `${d.day} (${d.focusSubject} · ${d.durationMinutes} min)\n• ${d.task}\nTip: ${d.revisionTip}`
          )
          .join('\n\n');
        const botMsg: AiChatMessage = {
          id: createClientId('msg'),
          role: 'assistant',
          text: formatted,
          mode: activeMode,
          timestamp: new Date().toISOString(),
        };
        const updated = [...nextWithUser, botMsg];
        setMessages(updated);
        await persistConversation(updated);
      } else {
        const res = await fetch('/api/ai/tutor', {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({
            message: text,
            mode: activeMode,
            language,
            classContext: classLabel,
            subjectContext: selectedSubject,
            lessonContext: aiContextLesson ? `${aiContextLesson.title} (${aiContextLesson.titleBn})` : '',
            history: messages.slice(-6),
            pdfBase64: pdfFile?.base64,
            pdfMimeType: pdfFile ? 'application/pdf' : undefined,
            pdfFileName: pdfFile?.name,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'AI Tutor request failed');
        if (typeof data.quotaRemaining === 'number') setQuotaRemaining(data.quotaRemaining);

        const botMsg: AiChatMessage = {
          id: createClientId('msg'),
          role: 'assistant',
          text: data.reply,
          mode: activeMode,
          timestamp: new Date().toISOString(),
        };
        const updated = [...nextWithUser, botMsg];
        setMessages(updated);
        if (activeMode === 'voice_tutor') speakText(data.reply);
        await persistConversation(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSending(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setConvId(createClientId('conv'));
    setPdfFile(null);
    setError(null);
  };

  const copyMsg = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const modeTabs: Array<{ id: TutorMode; label: string; icon: React.ReactNode }> = [
    { id: 'bangla_tutor', label: language === 'bn' ? 'বাংলা টিউটর' : 'Bangla Tutor', icon: <Bot className="h-3.5 w-3.5" /> },
    { id: 'visual_3d_guide', label: language === 'bn' ? '৩ডি গাইড' : '3D Guide', icon: <Box className="h-3.5 w-3.5" /> },
    { id: 'math_step_by_step', label: language === 'bn' ? 'গণিত ধাপ' : 'Math Steps', icon: <Calculator className="h-3.5 w-3.5" /> },
    { id: 'pdf_qa', label: language === 'bn' ? 'পিডিএফ' : 'PDF Q&A', icon: <FileText className="h-3.5 w-3.5" /> },
    { id: 'quiz_gen', label: language === 'bn' ? 'এআই কুইজ' : 'AI Quiz', icon: <HelpCircle className="h-3.5 w-3.5" /> },
    { id: 'study_plan', label: language === 'bn' ? 'রুটিন' : 'Study Plan', icon: <Calendar className="h-3.5 w-3.5" /> },
    { id: 'chapter_summary', label: language === 'bn' ? 'সারসংক্ষেপ' : 'Summary', icon: <Sparkles className="h-3.5 w-3.5" /> },
  ];

  return (
    <>
      {/* Floating AI Assistant Trigger — above MobileBottomNav on mobile */}
      {!aiDrawerOpen && (
        <button
          type="button"
          onClick={() => setAiDrawerOpen(true)}
          aria-label="Open ASA,LEARN AI Tutor"
          className="fixed bottom-20 right-4 md:bottom-5 md:right-5 z-40 hidden md:flex items-center gap-2 rounded-2xl bg-[#172554] px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_32px_rgba(23,37,84,0.32)] transition hover:-translate-y-0.5 hover:bg-[#263B91] focus-visible:outline-2 focus-visible:outline-[#BFE8FF] dark:bg-[#BFE8FF] dark:text-[#172554]"
        >
          <Bot className="h-5 w-5" />
          <span>{language === 'bn' ? 'এআই টিউটর' : 'AI Tutor'}</span>
        </button>
      )}

      {/* Glassmorphism Slide-Over Drawer */}
      {aiDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35 backdrop-blur-xs">
          <aside className="flex h-full w-full max-w-lg flex-col border-l border-white/50 bg-[#F5F9FF]/95 backdrop-blur-2xl dark:border-white/10 dark:bg-[#0A1128]/95">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#172554]/10 px-5 py-4 dark:border-white/10">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#172554] text-[#BFE8FF]">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-display text-base font-bold text-[#172033] dark:text-white">
                    {language === 'bn' ? 'ASA,LEARN এআই টিউটর' : 'ASA,LEARN AI Personal Tutor'}
                  </h2>
                  <p className="text-xs text-[#64748B] dark:text-slate-400">
                    {classLabel} · {selectedSubject}
                    {quotaRemaining !== null ? ` · ${quotaRemaining} left today` : ''}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSpeakingEnabled(!speakingEnabled)}
                  title={speakingEnabled ? 'Voice output on' : 'Voice output muted'}
                  className={`rounded-lg p-2 text-xs transition ${
                    speakingEnabled
                      ? 'bg-[#E7F5FF] text-[#172554] dark:bg-slate-800 dark:text-[#BFE8FF]'
                      : 'text-slate-400 hover:bg-slate-200/60'
                  }`}
                >
                  <Volume2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={clearChat}
                  title={language === 'bn' ? 'চ্যাট মুছুন' : 'Clear conversation'}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-200/60 dark:hover:bg-slate-800"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setAiDrawerOpen(false)}
                  aria-label="Close AI Tutor"
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-200/60 dark:hover:bg-slate-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Context Controls & Modes */}
            <div className="border-b border-[#172554]/10 px-4 py-3 dark:border-white/10">
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={selectedClass}
                  onChange={(e) => setSelectedClass(e.target.value)}
                  aria-label="Select class context"
                  className="rounded-xl border border-[#172554]/15 bg-white/85 px-3 py-1.5 text-xs font-medium text-[#172033] dark:border-white/15 dark:bg-slate-800 dark:text-white"
                >
                  {classes.map((c) => (
                    <option key={c.classId} value={c.classId}>
                      {language === 'bn' ? c.titleBn : c.title}
                    </option>
                  ))}
                </select>
                <select
                  value={selectedSubject}
                  onChange={(e) => setSelectedSubject(e.target.value)}
                  aria-label="Select subject context"
                  className="rounded-xl border border-[#172554]/15 bg-white/85 px-3 py-1.5 text-xs font-medium text-[#172033] dark:border-white/15 dark:bg-slate-800 dark:text-white"
                >
                  <option value="Mathematics">{language === 'bn' ? 'গণিত' : 'Mathematics'}</option>
                  <option value="Science">{language === 'bn' ? 'বিজ্ঞান' : 'Science'}</option>
                  <option value="Bangla">{language === 'bn' ? 'বাংলা' : 'Bangla'}</option>
                  <option value="English">{language === 'bn' ? 'ইংরেজি' : 'English'}</option>
                  <option value="ICT">{language === 'bn' ? 'আইসিটি' : 'ICT'}</option>
                  <option value="Bangladesh & Global Studies">{language === 'bn' ? 'বাংলাদেশ ও বিশ্বপরিচয়' : 'BGS'}</option>
                </select>
              </div>

              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {modeTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setMode(tab.id)}
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition whitespace-nowrap ${
                      mode === tab.id
                        ? 'bg-[#172554] text-white dark:bg-[#BFE8FF] dark:text-[#172554]'
                        : 'bg-white/75 text-[#64748B] hover:text-[#172554] dark:bg-slate-800/70 dark:text-slate-300'
                    }`}
                  >
                    {tab.icon}
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {messages.length === 0 && (
                <div className="space-y-4 py-4">
                  <div className="glass-surface rounded-2xl p-4 text-sm text-[#172033] dark:text-slate-200">
                    <p className="font-semibold">
                      {language === 'bn'
                        ? 'হ্যালো! আমি আপনার ASA,LEARN এআই পার্সোনাল টিউটর।'
                        : 'Hello! I am your ASA,LEARN AI Personal Tutor.'}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-[#64748B] dark:text-slate-400">
                      {language === 'bn'
                        ? 'যেকোনো অধ্যায়ের প্রশ্ন করুন, গণিতের সমাধান বুঝুন, পিডিএফ আপলোড করুন অথবা থ্রিডি (3D) মডেল সম্পর্কে জানুন।'
                        : 'Ask curriculum questions, explore 3D simulations, solve math step-by-step, generate quizzes, or upload PDFs.'}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-[#64748B] dark:text-slate-400">
                      {language === 'bn' ? 'দ্রুত প্রশ্ন' : 'Suggested Prompts'}
                    </p>
                    {suggestedQuestions.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => void sendMessage(q)}
                        className="block w-full rounded-xl border border-[#172554]/10 bg-white/80 px-3.5 py-2.5 text-left text-xs font-medium text-[#172033] transition hover:border-[#263B91] hover:bg-[#E7F5FF] dark:border-white/10 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-[#172554] text-white dark:bg-[#263B91]'
                        : 'glass-surface text-[#172033] dark:text-slate-100'
                    }`}
                  >
                    {msg.attachmentName && (
                      <div className="mb-1.5 flex items-center gap-1 text-xs opacity-80">
                        <FileText className="h-3 w-3" />
                        <span>{msg.attachmentName}</span>
                      </div>
                    )}
                    {msg.text}
                  </div>
                  {msg.role === 'assistant' && (
                    <div className="mt-1 flex items-center gap-2 px-1">
                      <button
                        type="button"
                        onClick={() => copyMsg(msg.id, msg.text)}
                        className="inline-flex items-center gap-1 text-[11px] text-[#64748B] hover:text-[#172554] dark:text-slate-400 dark:hover:text-[#BFE8FF]"
                      >
                        {copiedId === msg.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        <span>{copiedId === msg.id ? 'Copied' : 'Copy'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => speakText(msg.text)}
                        className="inline-flex items-center gap-1 text-[11px] text-[#64748B] hover:text-[#172554] dark:text-slate-400 dark:hover:text-[#BFE8FF]"
                      >
                        <Volume2 className="h-3 w-3" />
                        <span>{language === 'bn' ? 'শুনুন' : 'Speak'}</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {sending && (
                <div className="glass-surface max-w-[75%] rounded-2xl px-4 py-3 text-xs text-[#64748B] dark:text-slate-300">
                  {language === 'bn' ? 'চিন্তা করছি এবং উত্তর সাজাচ্ছি...' : 'Preparing step-by-step explanation...'}
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-red-500/25 bg-red-50 px-3.5 py-2.5 text-xs text-red-700 dark:bg-red-950/50 dark:text-red-200">
                  {error}
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Footer Input */}
            <div className="border-t border-[#172554]/10 p-4 dark:border-white/10">
              {pdfFile && (
                <div className="mb-2 flex items-center justify-between rounded-xl bg-[#E7F5FF] px-3 py-1.5 text-xs text-[#172554] dark:bg-slate-800 dark:text-[#BFE8FF]">
                  <span className="truncate font-medium">PDF: {pdfFile.name}</span>
                  <button type="button" onClick={() => setPdfFile(null)} className="ml-2 hover:opacity-75">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2">
                {appSettings.aiSettings.allowPdfUpload && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="application/pdf"
                      onChange={handlePdfSelect}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      title={language === 'bn' ? 'পিডিএফ আপলোড করুন' : 'Upload educational PDF'}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#172554]/15 bg-white/85 text-[#172554] hover:bg-[#E7F5FF] dark:border-white/15 dark:bg-slate-800 dark:text-[#BFE8FF]"
                    >
                      <Upload className="h-4 w-4" />
                    </button>
                  </>
                )}

                {appSettings.aiSettings.allowVoiceTutor && (
                  <button
                    type="button"
                    onClick={toggleVoiceInput}
                    title={language === 'bn' ? 'ভয়েস প্রশ্ন' : 'Ask by voice'}
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition ${
                      listening
                        ? 'border-red-500 bg-red-500 text-white'
                        : 'border-[#172554]/15 bg-white/85 text-[#172554] hover:bg-[#E7F5FF] dark:border-white/15 dark:bg-slate-800 dark:text-[#BFE8FF]'
                    }`}
                  >
                    {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </button>
                )}

                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void sendMessage();
                    }
                  }}
                  placeholder={
                    language === 'bn' ? 'আপনার প্রশ্ন লিখুন...' : 'Ask a question or paste a math problem...'
                  }
                  className="h-10 flex-1 rounded-xl border border-[#172554]/15 bg-white/90 px-3.5 text-sm text-[#172033] placeholder:text-[#64748B] focus:border-[#263B91] focus:outline-none dark:border-white/15 dark:bg-slate-800 dark:text-white"
                />

                <button
                  type="button"
                  disabled={sending || !input.trim()}
                  onClick={() => void sendMessage()}
                  aria-label="Send message"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#172554] text-white transition hover:bg-[#263B91] disabled:opacity-50 dark:bg-[#BFE8FF] dark:text-[#172554]"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
};
