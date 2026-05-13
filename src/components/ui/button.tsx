import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// Button sizes are direct px values (no density vars). Admin can override
// per-call via `size="sm"` or className when it wants denser controls.
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] font-semibold transition-all active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        // Primary: blue gradient + inset highlight + tinted blue shadow
        // (matches design `C.accent` → `C.accentDeep`).
        default:
          'text-white bg-gradient-to-b from-[#2240c4] to-[#1a2f96] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_0_0_1px_#1a2f96,0_4px_12px_rgba(34,64,196,0.28)]',
        // Destructive: red gradient (design `C.danger` → `C.dangerDeep`).
        destructive:
          'text-white bg-gradient-to-b from-[#dc2626] to-[#a8201d] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_0_0_1px_#a8201d,0_4px_12px_rgba(220,38,38,0.32)]',
        // Ghost-y outline with hairline border + subtle hover.
        outline:
          'border border-[#e6e6e0] bg-white text-[#0e1730] shadow-[0_1px_1px_rgba(14,23,48,0.03)] hover:bg-[#f1efe8]',
        secondary:
          'bg-[#f1efe8] text-[#0e1730] hover:bg-[#e7e5dc]',
        ghost:
          'text-[#0e1730] hover:bg-[#f1efe8]',
        link: 'text-[#2240c4] underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-11 px-4 py-2 text-[15px]',   // 44px tap target
        sm:      'h-9 px-3 text-[13px]',          // 36px — for admin density
        lg:      'h-12 px-6 text-[15px]',         // 48px hero CTAs
        icon:    'h-11 w-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
