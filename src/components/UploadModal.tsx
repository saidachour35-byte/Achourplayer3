// File upload modal
import React, { useState, useRef, useEffect } from 'react';
import { Upload, X, FileCode, AlertCircle, Sparkles } from 'lucide-react';
import { CodeFile } from '../types/analyzer';
import { isSafeBackdropClick } from '../utils/tvNavigation';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFileLoaded: (file: CodeFile) => void;
  isArabic: boolean;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onFileLoaded,
  isArabic
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const openedAtRef = useRef<number>(Date.now());
  const backdropDownRef = useRef<boolean>(false);

  useEffect(() => {
    if (isOpen) openedAtRef.current = Date.now();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];

    // Read file text
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (typeof content === 'string') {
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        let language = 'javascript';
        if (['html', 'htm'].includes(ext)) language = 'html';
        else if (['css'].includes(ext)) language = 'css';
        else if (['json'].includes(ext)) language = 'json';
        else if (['py'].includes(ext)) language = 'python';
        else if (['jsx', 'tsx'].includes(ext)) language = 'jsx';

        onFileLoaded({
          name: file.name,
          content,
          language,
          size: file.size
        });
        onClose();
      }
    };
    reader.onerror = () => {
      setErrorMessage(isArabic ? 'فشلت قراءة الملف. يرجى تجربة ملف آخر.' : 'Failed to read file. Please try another.');
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 achour-modal-backdrop animate-in fade-in duration-150"
    >
      <div
        role="dialog"
        aria-modal="true"
        data-tv-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-[min(92vw,640px)] max-h-[82vh] achour-glass-modal border-gold/35 rounded-2xl overflow-y-auto no-scrollbar p-5 relative"
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 rtl:right-auto rtl:left-4 p-1.5 rounded-lg bg-white/[0.08] hover:bg-white/15 text-slate-300 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center">
            <Upload className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-100 text-base">
              {isArabic ? 'رفع ملف كود لفحصه' : 'Upload Code File to Inspect'}
            </h3>
            <p className="text-xs text-slate-400">
              {isArabic ? 'يدعم ملفات React و JavaScript و HTML و CSS و Python و JSON' : 'Supports React, JSX/TSX, HTML, CSS, JS, Python & JSON files'}
            </p>
          </div>
        </div>

        {/* Drag and Drop Zone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
            isDragging
              ? 'border-indigo-500 bg-indigo-500/10'
              : 'border-white/15 hover:border-white/30 bg-white/[0.04] hover:bg-white/[0.07]'
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
            accept=".js,.jsx,.ts,.tsx,.html,.css,.json,.py,.txt"
          />

          <div className="w-12 h-12 rounded-full bg-white/[0.08] flex items-center justify-center mx-auto mb-3 text-slate-300">
            <FileCode className="w-6 h-6 text-indigo-400" />
          </div>

          <h4 className="font-semibold text-slate-200 text-sm mb-1">
            {isArabic ? 'اسحب الملف وأفلته هنا، أو اضغط للاختيار من جهازك' : 'Drag and drop file here, or click to browse'}
          </h4>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            {isArabic ? 'يمكنك رفع أي ملف برمجي يحتوي على أخطاء لتحليله وإصلاحه فوراً.' : 'Upload any source code file with bugs to diagnose and fix.'}
          </p>
        </div>

        {errorMessage && (
          <div className="mt-4 p-3 rounded-xl bg-rose-950/50 border border-rose-900/50 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs text-slate-300">
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            {isArabic ? 'فحص تلقائي فوري بمجرد الاختيار' : 'Instant diagnosis on upload'}
          </span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/15 text-slate-200 transition"
          >
            {isArabic ? 'إلغاء' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
};
