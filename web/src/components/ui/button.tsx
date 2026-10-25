import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'press inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] px-4 text-[0.95rem] font-semibold whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-60 [&_svg]:size-[18px] [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-blue text-white hover:bg-blue-strong',
        secondary: 'border border-line-strong bg-card text-text hover:border-text/40',
        quiet: 'text-text hover:bg-text/5',
        ink: 'bg-on-ink text-ink hover:bg-white',
        danger: 'border border-line-strong bg-card text-text hover:border-text/50',
        done: 'border border-green/30 bg-green-tint text-green',
      },
      size: { md: '', sm: 'min-h-9 px-3 text-sm', lg: 'min-h-12 px-5 text-base' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild, ...props }: Props) {
  const Comp = asChild ? Slot.Root : 'button';
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
