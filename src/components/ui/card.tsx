import * as React from 'react';
import { cn } from '@/lib/utils';

export type CardStage = 'stitch' | 'finish' | 'disp' | 'ready' | 'rework' | 'stuck';

const STAGE_ACCENTS: Record<CardStage, string> = {
  stitch: 'var(--stage-stitch-acc)',
  finish: 'var(--stage-finish-acc)',
  disp: 'var(--stage-disp-acc)',
  ready: 'var(--status-ready-acc)',
  rework: 'var(--status-rework-acc)',
  stuck: 'var(--status-stuck-acc)',
};

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Adds a 3px coloured left rail using the stage / status palette.
   * Matches the Stage system v2 KPI/card pattern.
   */
  stage?: CardStage;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, stage, style, children, ...props }, ref) => (
    <div
      ref={ref}
      style={
        stage
          ? { ...style, ['--card-acc' as string]: STAGE_ACCENTS[stage] }
          : style
      }
      className={cn(
        // 14px radius + soft shadow per design `C.bgRaised` card.
        'relative rounded-[14px] bg-white text-[#0e1730] shadow-[0_1px_2px_rgba(15,26,54,0.04)] overflow-hidden',
        stage &&
          'before:absolute before:left-0 before:top-3.5 before:bottom-3.5 before:w-[3px] before:rounded-r-full before:bg-[var(--card-acc)]',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  ),
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('text-lg font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  ),
);
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('text-[13px] text-[#71788b]', className)}
      {...props}
    />
  ),
);
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
  ),
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
