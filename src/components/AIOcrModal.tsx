import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Upload, Zap, Loader2, Sparkles } from 'lucide-react';
import { useI18n } from '../utils/i18n';
import { AppSettings } from '../types';
import { isSafeBackdropClick } from '../utils/tvNavigation';

interface AIOcrModalProps {
  onClose: () => void;
  onSelectChannel: (name: string) => void;
  language?: AppSettings['language'];
}

export default function AIOcrModal({ onClose, onSelectChannel, language = 'en' }: AIOcrModalProps) {
  const { t, isRtl } = useI18n(language);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<string[]>([]);
  const openedAtRef = useRef<number>(Date.now());
  const backdropDownRef = useRef<boolean>(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result as string);
      reader.readAsDataURL(f);
    }
  };

  const handleAnalyze = async () => {
    if (!preview) return;
    setLoading(true);
    try {
      const response = await fetch('/api/gemini/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: preview })
      });
      const data = await response.json();
      if (data.result) {
        // Handle result which might be a JSON or a CSV list
        if (data.result.trim().startsWith('{')) {
           try {
             const parsed = JSON.parse(data.result.replace(/```json|```/g, '').trim());
             if (parsed.channels) setResults(parsed.channels);
             else setResults([parsed.name || parsed.host || 'Unknown']);
           } catch(e) {
             setResults(data.result.split(',').map((s: string) => s.trim()));
           }
        } else {
          setResults(data.result.split(',').map((s: string) => s.trim()));
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      onPointerDown={(e) => {
        backdropDownRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (isSafeBackdropClick(e, openedAtRef.current, backdropDownRef.current)) {
          onClose();
        }
        backdropDownRef.current = false;
      }}
      className={`fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 achour-modal-backdrop ${isRtl ? 'font-cairo' : 'font-sans'}`}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        data-tv-modal="true"
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.08 }}
        onClick={(e) => e.stopPropagation()}
        className="w-[min(92vw,680px)] max-h-[84vh] achour-glass-modal border-gold/35 rounded-2xl overflow-hidden flex flex-col"
      >
        <div className={`flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-white/[0.04] shrink-0 ${isRtl ? 'flex-row-reverse' : ''}`}>
          <div className={`flex items-center gap-3 ${isRtl ? 'flex-row-reverse' : ''}`}>
            <div className="p-2.5 bg-gold/20 text-gold rounded-xl">
              <Sparkles size={20} />
            </div>
            <div className={isRtl ? 'text-right' : 'text-left'}>
              <h2 className="text-base sm:text-lg font-semibold achour-glossy-title uppercase tracking-wider">{t('ai_discovery')}</h2>
              <p className="text-xs achour-glossy-text font-medium">{isRtl ? 'التعرف على القنوات من الصور' : 'Visual Channel Recognition'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-all text-zinc-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto no-scrollbar">
          {!preview ? (
            <label className="flex flex-col items-center justify-center aspect-video border-2 border-dashed border-white/10 rounded-[2rem] cursor-pointer hover:border-gold/50 hover:bg-gold/5 transition-all group relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20 pointer-events-none" />
              <Upload size={56} className="text-zinc-600 group-hover:text-gold mb-4 transition-colors duration-300" />
              <span className="text-zinc-400 font-semibold uppercase tracking-wider text-xs group-hover:text-white transition-colors">
                {isRtl ? 'انقر لرفع لقطة شاشة' : 'Upload Screenshot'}
              </span>
              <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
            </label>
          ) : (
            <div className="space-y-6">
              <div className="relative aspect-video rounded-3xl overflow-hidden border-2 border-gold/30">
                <img src={preview} className="w-full h-full object-cover" alt="Preview" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
                <button 
                  onClick={() => { setFile(null); setPreview(null); setResults([]); }}
                  className="absolute top-4 right-4 p-2 bg-black/75 hover:bg-red-600 text-white rounded-full transition-all border border-white/15"
                >
                  <X size={16} />
                </button>
              </div>

              {results.length > 0 ? (
                <div className="space-y-4">
                  <div className={`flex items-center justify-between ${isRtl ? 'flex-row-reverse' : ''}`}>
                    <h3 className="text-xs font-semibold achour-glossy-text uppercase tracking-wider">{isRtl ? 'القنوات التي تم اكتشافها' : 'Detected Channels'}</h3>
                    <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-medium font-sans tabular-nums rounded-lg border border-emerald-500/30">
                      {results.length} {isRtl ? 'نتائج' : 'Results'}
                    </span>
                  </div>
                  <div className={`flex flex-wrap gap-2 ${isRtl ? 'flex-row-reverse' : ''}`}>
                    {results.map((res, i) => (
                      <button
                        key={i}
                        data-tv-focusable="true"
                        onClick={() => onSelectChannel(res)}
                        className="px-5 py-2.5 bg-white/5 hover:bg-gold hover:text-black border border-white/10 hover:border-gold rounded-2xl text-sm font-medium transition-all active:scale-95 shadow-md"
                      >
                        {res}
                      </button>
                    ))}
                  </div>
                  <button 
                    onClick={() => { setResults([]); setPreview(null); }}
                    className="w-full py-3 text-zinc-500 hover:text-white text-xs font-medium uppercase transition-colors"
                  >
                    {isRtl ? 'إعادة المحاولة' : 'Try Another Image'}
                  </button>
                </div>
              ) : (
                <button
                  disabled={loading}
                  data-tv-focusable="true"
                  onClick={handleAnalyze}
                  className="w-full py-5 bg-gold text-black font-semibold uppercase tracking-wider rounded-2xl flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-98 disabled:opacity-50 transition-all group overflow-hidden relative"
                >
                  <div className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 skew-x-12" />
                  {loading ? <Loader2 className="animate-spin" /> : <Zap size={20} className="fill-current" />}
                  <span>{loading ? t('ai_analyzing') : (isRtl ? 'بدء التحليل الذكي' : 'Start AI Analysis')}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

