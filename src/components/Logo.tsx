import { cn } from '@/lib/utils';

type LogoSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZES: Record<LogoSize, string> = {
  sm: 'h-5',
  md: 'h-7',
  lg: 'h-10',
  xl: 'h-16',
};

export default function Logo({
  size = 'md',
  className,
}: {
  size?: LogoSize;
  className?: string;
}) {
  return (
    <img
      src="/logo-bg-removed.png"
      alt="NOWI"
      className={cn(SIZES[size], 'w-auto select-none', className)}
      draggable={false}
    />
  );
}
