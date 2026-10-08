import React, { useState, useEffect, useRef } from 'react';
import { ExternalLink, ArrowRight, Cloud, Clock, Pause, Play, CheckCircle2 } from 'lucide-react';

const TARGET_URL = 'https://carlos-marcelo.github.io/checklist-farma-banco-s24-ultra-planilha/';
const INITIAL_COUNTDOWN = 10;

export const MigrationModal: React.FC = () => {
  const [secondsLeft, setSecondsLeft] = useState<number>(INITIAL_COUNTDOWN);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isRedirecting, setIsRedirecting] = useState<boolean>(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const handleRedirect = () => {
    setIsRedirecting(true);
    window.location.href = TARGET_URL;
  };

  useEffect(() => {
    if (isPaused || isRedirecting) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          handleRedirect();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPaused, isRedirecting]);

  const progressPercentage = ((INITIAL_COUNTDOWN - secondsLeft) / INITIAL_COUNTDOWN) * 100;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="migration-modal-title"
      className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md transition-all duration-300 animate-fadeIn"
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl border border-slate-100 ring-1 ring-black/5 transform transition-all duration-300 scale-100 animate-scaleUp">
        
        {/* Barra superior de progresso animada */}
        <div className="h-1.5 w-full bg-slate-100 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-500 transition-all duration-1000 ease-linear"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>

        <div className="p-6 sm:p-8">
          {/* Header com Badge e Ícone */}
          <div className="flex items-start justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              <div className="relative flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25">
                <Cloud className="w-7 h-7 animate-pulse" />
                <span className="absolute -top-1 -right-1 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-white"></span>
                </span>
              </div>
              <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200/60 mb-1">
                  <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping"></span>
                  Migração de Plataforma
                </span>
                <h2 id="migration-modal-title" className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-tight">
                  Site em Migração para o Drive
                </h2>
              </div>
            </div>
          </div>

          {/* Mensagem descritiva */}
          <div className="space-y-3 mb-6">
            <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
              O sistema <strong className="text-slate-800 font-semibold">Checklists Digitais</strong> está sendo migrado para a nova versão integrada ao <strong className="text-slate-800 font-semibold">Google Drive / Planilhas</strong>.
            </p>
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70 text-slate-700 text-xs sm:text-sm flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <span>Maior velocidade, estabilidade e sincronização de dados atualizada.</span>
            </div>
          </div>

          {/* Card do Contador Regressivo */}
          <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-blue-50 via-indigo-50 to-sky-50 border border-blue-100/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white shadow-sm border border-blue-100 flex items-center justify-center text-blue-600">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Redirecionamento Automático
                </div>
                <div className="text-sm font-bold text-slate-800">
                  {isPaused ? (
                    <span className="text-amber-600">Redirecionamento pausado</span>
                  ) : secondsLeft > 0 ? (
                    <span>Redirecionando em <span className="text-blue-600 text-base font-extrabold">{secondsLeft}s</span>...</span>
                  ) : (
                    <span className="text-emerald-600">Redirecionando agora...</span>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsPaused(!isPaused)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100/80 border border-slate-200 transition shadow-sm"
              title={isPaused ? "Retomar contagem" : "Pausar contagem"}
            >
              {isPaused ? (
                <>
                  <Play className="w-3.5 h-3.5 text-blue-600" />
                  Retomar
                </>
              ) : (
                <>
                  <Pause className="w-3.5 h-3.5 text-amber-600" />
                  Pausar
                </>
              )}
            </button>
          </div>

          {/* Links e Botão de Ação */}
          <div className="space-y-3">
            <button
              type="button"
              id="btn-redirect-now"
              onClick={handleRedirect}
              disabled={isRedirecting}
              className="w-full inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-2xl text-base font-bold text-white bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-800 active:scale-[0.98] transition shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 cursor-pointer disabled:opacity-70"
            >
              {isRedirecting ? (
                <span>Acessando nova versão...</span>
              ) : (
                <>
                  <span>Acessar Nova Versão Agora</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>

            <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500 pt-1">
              <span>Link de destino:</span>
              <a
                href={TARGET_URL}
                className="text-blue-600 hover:text-blue-800 underline truncate max-w-[280px] sm:max-w-xs font-medium inline-flex items-center gap-1"
                title={TARGET_URL}
              >
                carlos-marcelo.github.io/checklist...
                <ExternalLink className="w-3 h-3 flex-shrink-0" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MigrationModal;
