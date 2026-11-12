import * as React from 'react';
import { Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Input, type InputProps } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type SearchInputProps = Omit<InputProps, 'value' | 'onChange'> & {
  value: string;
  onChange: (value: string) => void;
  inputClassName?: string;
};

/** Page-level search box: search icon, × clear (also Escape). `className` sizes the wrapper. */
export function SearchInput({ value, onChange, className, inputClassName, onKeyDown, ...props }: SearchInputProps) {
  const { t } = useTranslation();
  const ref = React.useRef<HTMLInputElement>(null);
  const clear = () => {
    onChange('');
    ref.current?.focus();
  };
  return (
    <div className={cn('relative', className)}>
      <Search
        size={16}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-primary)]"
      />
      <Input
        ref={ref}
        className={cn(
          'h-9 text-[13px] pl-9 pr-9 border-[var(--color-primary)]/40 bg-[var(--color-primary-soft)]/30 focus-visible:border-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25',
          inputClassName,
        )}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) clear();
          onKeyDown?.(e);
        }}
        {...props}
      />
      {value && (
        <button
          type="button"
          onClick={clear}
          aria-label={t('common.clear', { defaultValue: 'Clear' })}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
}
