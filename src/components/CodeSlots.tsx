import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Tick02Icon } from '@hugeicons/core-free-icons';
import './CodeSlots.css';

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];
const EASE_OUT_CSS = 'cubic-bezier(0.23, 1, 0.32, 1)';

export type CodeSlotsStatus = 'idle' | 'error' | 'success';

export interface CodeSlotsProps {
  length?: number;
  value?: string;
  defaultValue?: string;
  onChange?: (code: string) => void;
  onComplete?: (code: string) => void;
  status?: CodeSlotsStatus;
  mask?: boolean;
  caret?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  accentColor?: string;
  inkColor?: string;
  slotColor?: string;
  digitColor?: string;
  dangerColor?: string;
  slotSize?: number;
  gap?: number;
  radius?: number;
  bounce?: number;
  settle?: number;
  rise?: number;
  cascade?: number;
  ariaLabel?: string;
  className?: string;
  name?: string;
  dataTestId?: string;
}

interface SlotProps {
  char: string;
  delay: number;
  active: boolean;
  caret: boolean;
  mask: boolean;
  error: boolean;
  locked: boolean;
  bounce: number;
  settle: number;
  rise: number;
  reduced: boolean | null;
}

const Slot: React.FC<SlotProps> = ({
  char,
  delay,
  active,
  caret,
  mask,
  error,
  locked,
  bounce,
  settle,
  rise,
  reduced,
}) => {
  const fillProgress = useMotionValue(char ? 1 : 0);
  const [shownChar, setShownChar] = useState(char);

  useEffect(() => {
    if (char) {
      setShownChar(char);
    }
  }, [char]);

  useEffect(() => {
    const target = char ? 1 : 0;
    if (reduced) {
      fillProgress.set(target);
      return;
    }

    const controls = animate(fillProgress, target, {
      type: char && bounce > 0 ? 'spring' : 'tween',
      duration: char && bounce > 0 ? undefined : Math.max(0.14, settle),
      bounce: char ? Math.min(0.45, Math.max(0, bounce)) : 0,
      delay: Math.max(0, delay) / 1000,
      ease: char && bounce > 0 ? undefined : EASE_OUT,
    });

    return () => controls.stop();
  }, [char, delay, bounce, settle, reduced, fillProgress]);

  const fillScaleY = useTransform(fillProgress, [0, 1], [0.25, 1]);
  const fillOpacity = useTransform(fillProgress, [0, 0.2, 1], [0, 0.9, 1]);
  const digitY = useTransform(fillProgress, [0, 1], [rise, 0]);
  const digitOpacity = useTransform(fillProgress, [0, 0.4, 1], [0, 0.65, 1]);

  return (
    <div
      className="cs-slot"
      data-filled={Boolean(char) ? 'true' : 'false'}
      data-active={active && !locked ? 'true' : 'false'}
      data-error={error ? 'true' : 'false'}
    >
      <div className="cs-slot-bg" />
      <motion.div
        className="cs-slot-fill"
        style={{
          scaleY: fillScaleY,
          opacity: fillOpacity,
        }}
      />
      {(char || shownChar) && (
        <motion.span
          className="cs-digit"
          style={{
            y: digitY,
            opacity: digitOpacity,
          }}
        >
          {mask ? <span className="cs-dot" /> : (char || shownChar)}
        </motion.span>
      )}
      {!char && active && caret && !locked && !error && (
        <motion.span
          className="cs-caret"
          animate={reduced ? undefined : { opacity: [1, 1, 0, 0] }}
          transition={
            reduced
              ? undefined
              : {
                  duration: 1.05,
                  repeat: Infinity,
                  times: [0, 0.45, 0.5, 0.95],
                }
          }
        />
      )}
    </div>
  );
};

export function sanitizeCodeDigits(raw: string, length: number): string {
  return String(raw || '').replace(/\D/g, '').slice(0, Math.max(1, length));
}

export const CodeSlots: React.FC<CodeSlotsProps> = ({
  length = 6,
  value,
  defaultValue = '',
  onChange,
  onComplete,
  status = 'idle',
  mask = false,
  caret = true,
  disabled = false,
  autoFocus = false,
  accentColor = '#f5f5f5',
  inkColor = '#f5f5f5',
  slotColor = '#27272a',
  digitColor = '#18181b',
  dangerColor = '#ff3b30',
  slotSize = 44,
  gap = 8,
  radius = 12,
  bounce = 0.2,
  settle = 0.3,
  rise = 8,
  cascade = 20,
  ariaLabel = 'One-time code',
  className = '',
  name,
  dataTestId = 'code-slots-input',
}) => {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const reduced = useReducedMotion();

  const safeLength = Math.max(1, Math.min(12, Math.round(length)));
  const isControlled = value !== undefined;
  const [uncontrolledCode, setUncontrolledCode] = useState(() =>
    sanitizeCodeDigits(defaultValue, safeLength)
  );
  const currentCode = isControlled
    ? sanitizeCodeDigits(value || '', safeLength)
    : uncontrolledCode;

  const [focused, setFocused] = useState(false);
  const [drainingError, setDrainingError] = useState(false);
  const [previousCode, setPreviousCode] = useState(currentCode);
  const lastCompletedRef = useRef<string>('');
  const prevStatusRef = useRef<CodeSlotsStatus>(status);

  const clampedRadius = Math.min(Math.max(0, radius), slotSize / 2);
  const isSuccess = status === 'success';
  const isLocked = disabled || isSuccess || drainingError;

  const applyCodeUpdate = useCallback(
    (rawNext: string) => {
      const next = sanitizeCodeDigits(rawNext, safeLength);
      setPreviousCode(currentCode);
      if (!isControlled) {
        setUncontrolledCode(next);
      }
      onChange?.(next);
      if (next.length === safeLength) {
        if (lastCompletedRef.current !== next) {
          lastCompletedRef.current = next;
          onComplete?.(next);
        }
      } else {
        lastCompletedRef.current = '';
      }
    },
    [currentCode, isControlled, onChange, onComplete, safeLength]
  );

  // Trigger last-to-first drain and clear on status -> 'error'
  useEffect(() => {
    const enteredError = status === 'error' && prevStatusRef.current !== 'error';
    prevStatusRef.current = status;

    if (!enteredError) {
      if (status === 'idle') {
        setDrainingError(false);
      }
      return;
    }

    setDrainingError(true);
    const totalDrainMs =
      Math.max(0, safeLength - 1) * Math.max(0, cascade) +
      Math.round(Math.max(0.18, settle) * 1000) +
      90;

    const timer = window.setTimeout(() => {
      setDrainingError(false);
      lastCompletedRef.current = '';
      setPreviousCode('');
      if (!isControlled) {
        setUncontrolledCode('');
      }
      onChange?.('');
      window.requestAnimationFrame(() => {
        if (!disabled) {
          inputRef.current?.focus();
        }
      });
    }, totalDrainMs);

    return () => window.clearTimeout(timer);
  }, [status, safeLength, cascade, settle, isControlled, onChange, disabled]);

  useEffect(() => {
    if (autoFocus && !isLocked) {
      inputRef.current?.focus();
    }
  }, [autoFocus, isLocked]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isLocked) return;
    applyCodeUpdate(e.target.value);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    if (isLocked) return;
    const pasted = e.clipboardData.getData('text');
    const digits = sanitizeCodeDigits(pasted, safeLength);
    if (digits) {
      e.preventDefault();
      applyCodeUpdate(digits);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isLocked) return;
    if (e.key === 'Backspace' && currentCode.length > 0) {
      e.preventDefault();
      applyCodeUpdate(currentCode.slice(0, -1));
    }
  };

  const slotDelays = useMemo(() => {
    return Array.from({ length: safeLength }, (_, idx) => {
      if (drainingError) {
        return (safeLength - 1 - idx) * Math.max(0, cascade);
      }
      const prevLen = previousCode.length;
      const nextLen = currentCode.length;
      if (nextLen - prevLen > 1 && idx >= prevLen && idx < nextLen) {
        return (idx - prevLen) * Math.max(0, cascade);
      }
      return 0;
    });
  }, [safeLength, drainingError, cascade, previousCode.length, currentCode.length]);

  const activeIndex = Math.min(currentCode.length, safeLength - 1);

  const rootStyle = {
    '--cs-accent': accentColor,
    '--cs-ink': inkColor,
    '--cs-slot': slotColor,
    '--cs-digit': digitColor,
    '--cs-danger': dangerColor,
    '--cs-size': `${slotSize}px`,
    '--cs-gap': `${gap}px`,
    '--cs-radius': `${clampedRadius}px`,
  } as React.CSSProperties;

  return (
    <motion.div
      className={`cs-root ${className}`.trim()}
      style={rootStyle}
      data-status={status}
      data-disabled={disabled ? 'true' : 'false'}
      animate={
        status === 'error' && !reduced
          ? { x: [0, -7, 7, -5, 5, -2, 0] }
          : { x: 0 }
      }
      transition={{ duration: 0.36, ease: EASE_OUT_CSS as any }}
      onClick={() => {
        if (!isLocked) inputRef.current?.focus();
      }}
    >
      <div className="cs-row">
        <div className="cs-slots">
          {Array.from({ length: safeLength }, (_, index) => {
            const char = drainingError ? '' : (currentCode[index] || '');
            const isSlotActive = focused && index === activeIndex && currentCode.length < safeLength;
            return (
              <Slot
                key={index}
                char={char}
                delay={slotDelays[index] || 0}
                active={isSlotActive}
                caret={caret}
                mask={mask}
                error={status === 'error' || drainingError}
                locked={isLocked}
                bounce={bounce}
                settle={settle}
                rise={rise}
                reduced={reduced}
              />
            );
          })}

          {isSuccess && (
            <motion.div
              className="cs-wash"
              initial={reduced ? { opacity: 1 } : { opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.24, ease: EASE_OUT }}
            >
              <motion.span
                className="cs-tick"
                initial={reduced ? { scale: 1 } : { scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 420, damping: 22, delay: 0.06 }}
              >
                <HugeiconsIcon icon={Tick02Icon} size={Math.round(slotSize * 0.52)} strokeWidth={2.4} />
              </motion.span>
            </motion.div>
          )}

          <input
            ref={inputRef}
            id={inputId}
            name={name}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label={ariaLabel}
            data-testid={dataTestId}
            maxLength={safeLength}
            value={currentCode}
            disabled={isLocked}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onChange={handleInputChange}
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
            className="cs-input"
          />
        </div>
      </div>
    </motion.div>
  );
};

export default CodeSlots;
