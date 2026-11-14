import React, { useEffect, useRef, useState } from 'react';
import { Maximize2, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import type { Language } from '../types';

interface DemoVideoPlayerProps {
  demoUri: string;
  title: string;
  language: Language;
  playbackRate?: number;
  onFullscreen?: () => void;
}

const TOTAL_SECONDS = 45;

export const DemoVideoPlayer: React.FC<DemoVideoPlayerProps> = ({
  demoUri,
  title,
  language,
  playbackRate = 1,
  onFullscreen,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [muted, setMuted] = useState(true);

  const timeRef = useRef(0);
  const playingRef = useRef(playing);
  const rateRef = useRef(playbackRate);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    rateRef.current = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let lastTs = performance.now();

    const mode = demoUri.includes('newton') ? 'newton' : demoUri.includes('atom') ? 'atom' : 'trig';

    const drawFrame = (now: number) => {
      const dt = Math.min((now - lastTs) / 1000, 0.1);
      lastTs = now;

      if (playingRef.current) {
        timeRef.current = (timeRef.current + dt * rateRef.current) % TOTAL_SECONDS;
        setCurrentTime(timeRef.current);
      }

      const tSec = timeRef.current;
      const w = canvas.width;
      const h = canvas.height;

      // Navy -> Ice-Blue subtle animated gradient background
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#0C173B');
      grad.addColorStop(1, '#172554');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Subtle architectural grid
      ctx.strokeStyle = 'rgba(191, 232, 255, 0.08)';
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 48) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += 48) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Header pill inside video
      ctx.fillStyle = 'rgba(191, 232, 255, 0.14)';
      ctx.fillRect(32, 26, 260, 32);
      ctx.fillStyle = '#BFE8FF';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText('ASA,LEARN · SAMPLE VIDEO CLASS', 46, 47);

      // Lesson Title
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText(title.slice(0, 46), 32, 95);

      const chapterIdx = tSec < 15 ? 0 : tSec < 30 ? 1 : 2;

      if (mode === 'trig') {
        const thetaDeg = 20 + Math.sin(tSec * 0.45) * 20 + 20;
        const theta = (thetaDeg * Math.PI) / 180;
        const hyp = 250;
        const adj = hyp * Math.cos(theta);
        const opp = hyp * Math.sin(theta);

        const ox = 180;
        const oy = 390;
        const px = ox + adj;
        const py = oy - opp;

        // Triangle fill
        ctx.fillStyle = 'rgba(56, 189, 248, 0.16)';
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(px, oy);
        ctx.lineTo(px, py);
        ctx.closePath();
        ctx.fill();

        // Adjacent
        ctx.strokeStyle = '#38BDF8';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(px, oy);
        ctx.stroke();

        // Opposite
        ctx.strokeStyle = '#F472B6';
        ctx.beginPath();
        ctx.moveTo(px, oy);
        ctx.lineTo(px, py);
        ctx.stroke();

        // Hypotenuse
        ctx.strokeStyle = '#FACC15';
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(px, py);
        ctx.stroke();

        // Formula Panel
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.fillRect(540, 155, 360, 220);
        ctx.fillStyle = '#BFE8FF';
        ctx.font = 'bold 18px monospace';
        ctx.fillText(`θ = ${thetaDeg.toFixed(1)}°`, 566, 195);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '16px monospace';
        ctx.fillText(`sin θ = Opposite / Hyp = ${Math.sin(theta).toFixed(3)}`, 566, 238);
        ctx.fillText(`cos θ = Adjacent / Hyp = ${Math.cos(theta).toFixed(3)}`, 566, 274);
        ctx.fillText(`tan θ = Opposite / Adj = ${Math.tan(theta).toFixed(3)}`, 566, 310);
        ctx.fillStyle = '#94A3B8';
        ctx.font = '14px sans-serif';
        ctx.fillText(
          chapterIdx === 0
            ? 'Step 1: Identify Hypotenuse opposite 90°'
            : chapterIdx === 1
              ? 'Step 2: Watch sin θ rise as angle θ opens'
              : 'Step 3: Switch to 3D Mode above to rotate!',
          566,
          352
        );
      } else if (mode === 'newton') {
        const cx = 310;
        const cy = 285;
        const rx = 145;
        const ang = tSec * 1.4;
        const bx = cx + Math.cos(ang) * rx;
        const by = cy + Math.sin(ang) * rx * 0.72;

        ctx.strokeStyle = 'rgba(191,232,255,0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, rx * 0.72, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#F59E0B';
        ctx.beginPath();
        ctx.arc(cx, cy, 34, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#38BDF8';
        ctx.beginPath();
        ctx.arc(bx, by, 14, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.fillRect(540, 155, 360, 220);
        ctx.fillStyle = '#BFE8FF';
        ctx.font = 'bold 20px monospace';
        ctx.fillText('F = m × a', 566, 200);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '15px sans-serif';
        ctx.fillText('Centripetal gravitational force curves', 566, 246);
        ctx.fillText('inertia into a continuous stable orbit.', 566, 272);
        ctx.fillStyle = '#38BDF8';
        ctx.fillText('Tip: Open 3D Mode to change orbit radius!', 566, 330);
      } else {
        const cx = 310;
        const cy = 285;
        for (let i = 1; i <= 3; i++) {
          ctx.strokeStyle = 'rgba(191,232,255,0.3)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cx, cy, i * 48, 0, Math.PI * 2);
          ctx.stroke();
          const ex = cx + Math.cos(tSec * (2.5 - i * 0.4) + i) * i * 48;
          const ey = cy + Math.sin(tSec * (2.5 - i * 0.4) + i) * i * 48;
          ctx.fillStyle = '#FACC15';
          ctx.beginPath();
          ctx.arc(ex, ey, 8, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#F43F5E';
        ctx.beginPath();
        ctx.arc(cx, cy, 18, 0, Math.PI * 2);
        ctx.fill();
      }

      // Subtitle bar
      ctx.fillStyle = 'rgba(7, 14, 36, 0.82)';
      ctx.fillRect(0, h - 54, w, 54);
      ctx.fillStyle = '#E7F5FF';
      ctx.font = '15px sans-serif';
      const subBn =
        chapterIdx === 0
          ? 'অধ্যায় ১/৩: মূল ধারণা ও জ্যামিতিক কাঠামো পর্যবেক্ষণ করুন'
          : chapterIdx === 1
            ? 'অধ্যায় ২/৩: প্যারামিটার পরিবর্তনের সাথে সূত্রের মান পরিবর্তন দেখুন'
            : 'অধ্যায় ৩/৩: উপরের "3D Mode" বাটনে ক্লিক করে নিজেই ঘুরিয়ে দেখুন!';
      const subEn =
        chapterIdx === 0
          ? 'Part 1/3: Observing foundational geometry and visual proportions'
          : chapterIdx === 1
            ? 'Part 2/3: Live mathematical values updating in real time'
            : 'Part 3/3: Click "3D Mode" or "Split View" above to interact freely!';
      ctx.fillText(language === 'bn' ? subBn : subEn, 32, h - 22);

      rafId = requestAnimationFrame(drawFrame);
    };

    rafId = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(rafId);
  }, [demoUri, title, language]);

  const formatSec = (s: number) => {
    const whole = Math.floor(s);
    return `0:${whole < 10 ? '0' : ''}${whole}`;
  };

  return (
    <div className="relative flex h-full w-full flex-col bg-[#0C173B]">
      <canvas ref={canvasRef} width={960} height={540} className="h-full w-full object-contain" />

      <div className="flex items-center gap-3 border-t border-white/10 bg-[#091332] px-4 py-2 text-xs text-white">
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#263B91] text-white hover:bg-[#3551bd]"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>

        <span className="font-mono-nums text-[11px] text-[#BFE8FF]">
          {formatSec(currentTime)} / 0:{TOTAL_SECONDS}
        </span>

        <input
          type="range"
          min={0}
          max={TOTAL_SECONDS - 0.1}
          step={0.1}
          value={currentTime}
          onChange={(e) => {
            const val = Number(e.target.value);
            timeRef.current = val;
            setCurrentTime(val);
          }}
          className="h-1.5 flex-1 cursor-pointer accent-[#BFE8FF]"
        />

        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10"
          title={muted ? 'Unmute captions tone' : 'Mute'}
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>

        {onFullscreen && (
          <button
            type="button"
            onClick={onFullscreen}
            className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10"
            title="Fullscreen"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};
