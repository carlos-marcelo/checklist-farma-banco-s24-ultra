import React, { useRef, useEffect, useState } from 'react';

interface SignaturePadProps {
  onEnd: (dataUrl: string) => void;
  label?: string;
}

const SignaturePad: React.FC<SignaturePadProps> = ({ onEnd, label }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const hasDrawnRef = useRef(false);

  const fillWhite = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = canvas.offsetWidth;
      canvas.height = 160;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Fundo branco explícito para evitar fundo preto no toDataURL
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#1F2937'; // Darker, cleaner stroke
        ctx.lineWidth = 2.5; // Slightly thicker for elegance
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    }
  }, []);

  const getCoordinates = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();

    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  };

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDrawing(true);
    hasDrawnRef.current = false;
    const { x, y } = getCoordinates(e);
    const ctx = canvasRef.current?.getContext('2d');
    ctx?.beginPath();
    ctx?.moveTo(x, y);
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const { x, y } = getCoordinates(e);
    const ctx = canvasRef.current?.getContext('2d');
    ctx?.lineTo(x, y);
    ctx?.stroke();
    hasDrawnRef.current = true;
    setHasSignature(true);
  };

  const endDrawing = () => {
    setIsDrawing(false);
    if (canvasRef.current && hasDrawnRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      // Garante fundo branco antes de exportar (corrige fundo preto no PDF / img)
      if (ctx) fillWhite(ctx, canvas);
      onEnd(canvas.toDataURL('image/png'));
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Restaura fundo branco após limpar
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      setHasSignature(false);
      onEnd('');
    }
  };

  return (
    <div className="mb-6 break-inside-avoid">
      {label ? (
        <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">{label}</label>
      ) : null}
      <div className="relative group">
        <div className="absolute inset-0 bg-gray-200 rounded-xl transform translate-y-1 translate-x-1 group-hover:translate-y-2 group-hover:translate-x-2 transition-transform duration-300"></div>
        <div className="border-2 border-gray-200 rounded-xl bg-white relative shadow-inner overflow-hidden">
          {/* Subtle paper pattern or guidelines could go here */}
          <div className="absolute top-0 left-0 right-0 h-full pointer-events-none opacity-5"
            style={{ backgroundImage: 'linear-gradient(#000 1px, transparent 1px)', backgroundSize: '100% 40px' }}>
          </div>

          <canvas
            ref={canvasRef}
            className="w-full touch-none cursor-crosshair relative z-10"
            onPointerDown={startDrawing}
            onPointerMove={draw}
            onPointerUp={endDrawing}
            onPointerCancel={endDrawing}
            onPointerLeave={endDrawing}
            style={{ height: '160px', touchAction: 'none' }}
          />

          {hasSignature && (
            <button
              type="button"
              onClick={clear}
              className="absolute top-3 right-3 text-xs font-bold text-red-600 bg-white/90 backdrop-blur border border-red-200 px-3 py-1.5 rounded-full shadow-sm hover:bg-red-50 hover:shadow-md transition-all no-print z-20"
            >
              Limpar
            </button>
          )}

          {!hasSignature && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-gray-300 text-lg font-medium italic">Assine aqui</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SignaturePad;
