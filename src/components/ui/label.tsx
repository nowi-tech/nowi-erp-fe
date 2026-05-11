import * as React from 'react';
import { cn } from '@/lib/utils';

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  /** Renders a red asterisk after the label text. */
  required?: boolean;
}

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, required, children, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        'block text-[length:var(--density-font-sm)] font-medium text-[var(--color-foreground)] mb-1.5',
        className,
      )}
      {...props}
    >
      {children}
      {required && (
        <span
          aria-hidden="true"
          className="ml-0.5 text-[var(--color-destructive)]"
        >
          *
        </span>
      )}
    </label>
  ),
);
Label.displayName = 'Label';

export { Label };
