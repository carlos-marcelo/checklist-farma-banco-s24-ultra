
import React, { useState, useRef, useEffect } from 'react';
import { ScanLine } from 'lucide-react';

interface ScannerInputProps {
  onScan: (code: string) => void;
  placeholder?: string;
}

const ScannerInput: React.FC<ScannerInputProps> = ({ onScan, placeholder }) => {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Initial focus without scrolling
    inputRef.current?.focus({ preventScroll: true });

    // Keep focus on the input for scanners, but be smart about it
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Don't steal focus if clicking on interactive elements
      const isInteractive =
        target.closest('button') ||
        target.closest('input') ||
        target.closest('select') ||
        target.closest('textarea') ||
        target.closest('a') ||
        target.getAttribute('role') === 'button';

      if (!isInteractive) {
        inputRef.current?.focus({ preventScroll: true });
      }
    };
    window.addEventListener('mousedown', handleGlobalClick);
    return () => window.removeEventListener('mousedown', handleGlobalClick);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      onScan(inputValue.trim());
      setInputValue('');
    }
  };

  return (
    <div className="relative w-full">
      <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400">
        <ScanLine size={24} />
      </div>
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || "Bipar código de barras ou reduzido..."}
        className="w-full pl-16 pr-6 py-6 bg-white border-2 border-slate-200 rounded-2xl text-xl font-mono focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none transition-all placeholder:text-slate-300"
      />
      <div className="mt-2 text-center text-slate-400 text-xs">
        Pressione Enter após digitar se não estiver usando scanner.
      </div>
    </div>
  );
};

export default ScannerInput;
