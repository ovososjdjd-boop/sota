import { cx } from './cx';

import type { ReactNode, ButtonHTMLAttributes } from 'react';

// ─────────────────────── Кнопка ───────────────────────

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'lg';
  full?: boolean;
};

export function Button({
  variant = 'primary',
  size = 'md',
  full,
  className,
  children,
  ...rest
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-2xl font-semibold ' +
    'transition-all duration-200 ease-smooth active:scale-[0.97] ' +
    'disabled:opacity-40 disabled:pointer-events-none select-none';

  const sizes = {
    md: 'h-12 px-5 text-[15px]',
    lg: 'h-14 px-6 text-base',
  };

  const variants = {
    primary:
      'bg-brand-600 text-white shadow-card hover:bg-brand-700 active:bg-brand-800',
    secondary:
      'bg-surface-100 text-surface-900 hover:bg-surface-200 ' +
      'dark:bg-surface-800 dark:text-surface-100 dark:hover:bg-surface-700',
    ghost:
      'text-surface-600 hover:bg-surface-100 dark:text-surface-300 dark:hover:bg-surface-800',
    danger: 'bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-950 dark:text-red-400',
  };

  return (
    <button
      className={cx(base, sizes[size], variants[variant], full && 'w-full', className)}
      {...rest}
    >
      {children}
    </button>
  );
}

// ─────────────────────── Карточка ───────────────────────

export function Card({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cx(
        'rounded-card bg-white shadow-card dark:bg-surface-900',
        onClick && 'cursor-pointer transition-transform duration-200 active:scale-[0.99]',
        className,
      )}
    >
      {children}
    </div>
  );
}

// ─────────────────────── Кольцо прогресса ───────────────────────

export function Ring({
  value,
  target,
  label,
  unit,
  tone = 'good',
  size = 76,
}: {
  value: number;
  target: number;
  label: string;
  unit?: string;
  tone?: 'good' | 'warn' | 'bad';
  size?: number;
}) {
  const pct = target > 0 ? Math.min(value / target, 1.35) : 0;
  const stroke = 7;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.min(pct, 1));

  const colors = {
    good: 'stroke-brand-500',
    warn: 'stroke-amber-500',
    bad: 'stroke-red-500',
  };

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            strokeWidth={stroke}
            fill="none"
            className="stroke-surface-200 dark:stroke-surface-800"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={cx(colors[tone], 'transition-all duration-500 ease-smooth')}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="tnum text-[15px] font-bold text-surface-900 dark:text-surface-50">
            {Math.round(value)}
          </span>
          {unit && (
            <span className="text-[10px] text-surface-400 dark:text-surface-500">{unit}</span>
          )}
        </div>
      </div>
      <span className="text-xs font-medium text-surface-500 dark:text-surface-400">
        {label}
      </span>
    </div>
  );
}

// ─────────────────────── Индикатор загрузки ───────────────────────

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cx('animate-spin', className)}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.2" />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ─────────────────────── Плашка-подсказка ───────────────────────

export function Note({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warn' | 'value';
  children: ReactNode;
}) {
  const tones = {
    info: 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-300',
    warn: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
    value: 'bg-brand-50 text-brand-800 dark:bg-brand-950/40 dark:text-brand-300',
  };
  return (
    <div className={cx('rounded-2xl px-4 py-3 text-[13px] leading-snug', tones[tone])}>
      {children}
    </div>
  );
}

// ─────────────────────── Сегментированный переключатель ───────────────────────

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-2xl bg-surface-100 p-1 dark:bg-surface-800">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          onClick={() => onChange(opt.value)}
          className={cx(
            'flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all duration-200',
            value === opt.value
              ? 'bg-white text-surface-900 shadow-sm dark:bg-surface-700 dark:text-white'
              : 'text-surface-500 dark:text-surface-400',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

