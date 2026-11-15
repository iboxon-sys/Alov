import React from 'react';
import { Phone } from 'lucide-react';
import { detectPhoneCountry, formatPhoneNumberPretty } from '../utils/phone';

interface SmartPhoneInputProps {
  id?: string;
  value: string;
  onChange: (formattedPhone: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  testId?: string;
}

export const SmartPhoneInput: React.FC<SmartPhoneInputProps> = ({
  id,
  value,
  onChange,
  placeholder = '+998 90 123 45 67',
  required = false,
  disabled = false,
  className = '',
  testId,
}) => {
  const detectedCountry = detectPhoneCountry(value);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Allow user to clear completely or keep lone '+'
    if (!raw.trim()) {
      onChange('');
      return;
    }
    const formatted = formatPhoneNumberPretty(raw);
    onChange(formatted);
  };

  return (
    <div
      className={`flex items-center gap-2 px-3 min-h-[44px] rounded-xl bg-[#181A22] border border-white/15 focus-within:border-rose-500 focus-within:ring-1 focus-within:ring-rose-500 transition-all ${
        disabled ? 'opacity-65 bg-[#111218]' : ''
      } ${className}`}
    >
      <Phone className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
      <input
        id={id}
        type="tel"
        inputMode="tel"
        value={value}
        onChange={handleChange}
        placeholder={detectedCountry?.placeholderExample || placeholder}
        required={required}
        disabled={disabled}
        data-testid={testId}
        className="flex-1 min-w-0 py-2 bg-transparent text-xs font-semibold text-white placeholder:text-zinc-500 outline-none tabular-nums"
      />
      {detectedCountry && (
        <span
          data-testid={testId ? `${testId}-country` : 'phone-detected-country'}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#232634] border border-white/10 text-[10.5px] font-bold text-zinc-200 shrink-0 whitespace-nowrap"
        >
          <span>{detectedCountry.flag}</span>
          <span>{detectedCountry.nameUz}</span>
        </span>
      )}
    </div>
  );
};
