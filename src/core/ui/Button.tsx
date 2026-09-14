import { type JSX, splitProps } from 'solid-js';
import { useAssets } from '~/core/systems/assets';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-white text-black hover:bg-gray-200 active:bg-gray-300',
  secondary: 'bg-transparent border-2 border-white text-white hover:bg-white/10 active:bg-white/20',
  ghost: 'bg-transparent text-white hover:bg-white/10 active:bg-white/20',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-4 py-2 text-sm',
  md: 'px-6 py-3 text-base',
  lg: 'px-8 py-4 text-lg',
};

export function Button(props: ButtonProps) {
  const [local, rest] = splitProps(props, ['variant', 'size', 'loading', 'children', 'class', 'disabled', 'onClick']);
  const { coordinator } = useAssets();

  const variant = () => local.variant ?? 'primary';
  const size = () => local.size ?? 'md';

  const handleClick = (e: MouseEvent) => {
    if (local.onClick) {
      local.onClick(e);
    }
  };

  return (
    <button
      {...rest}
      disabled={local.disabled || local.loading}
      onClick={handleClick}
      class={`
        rounded-lg font-medium transition-all duration-200
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variantClasses[variant()]}
        ${sizeClasses[size()]}
        ${local.class ?? ''}
      `.trim()}
    >
      {local.loading ? (
        <span class="flex items-center justify-center gap-2">
          <span class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          Loading...
        </span>
      ) : (
        local.children
      )}
    </button>
  );
}
