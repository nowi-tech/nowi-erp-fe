import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, onWheel, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        // A `type="number"` input silently changes value when the mouse wheel
        // scrolls over a focused field — an easy way to corrupt a quantity
        // without noticing. Blur on wheel so scrolling never mutates the value
        // (the page still scrolls normally). Any caller onWheel still fires.
        onWheel={(e) => {
          if (type === 'number') e.currentTarget.blur();
          onWheel?.(e);
        }}
        className={cn(
          // 48px tall (h-12) — floor-friendly tap target. 15px font.
          // Admin can pass `h-9 text-[13px]` via className for denser controls.
          'flex w-full h-12 rounded-[10px] border border-[var(--color-input)] bg-white px-3.5 py-2 text-[15px] text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:cursor-not-allowed disabled:opacity-50',
          // Number fields: hide the up/down spinner steppers (Webkit + Firefox)
          // so the field reads as a plain text box — paired with the wheel-blur
          // above, mouse interaction can no longer nudge the value.
          type === 'number' &&
            '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0',
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
