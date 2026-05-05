import * as React from 'react';
import { cn } from '@/lib/utils';

export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        'block text-[length:var(--density-font-sm)] font-medium text-[var(--color-foreground)] mb-1.5',
        className,
      )}
      {...props}
    />
  ),
);
Label.displayName = 'Label';

export { Label };
