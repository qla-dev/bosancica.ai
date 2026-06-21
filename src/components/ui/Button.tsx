import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export type ButtonVariant = 'unstyled' | 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'none' | 'sm' | 'md' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  unstyled: '', primary: 'ui-button--primary', secondary: 'ui-button--secondary',
  ghost: 'ui-button--ghost', danger: 'ui-button--danger',
};

const sizeClasses: Record<ButtonSize, string> = {
  none: '', sm: 'ui-button--sm', md: 'ui-button--md', icon: 'ui-button--icon',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { children, className = '', type = 'button', variant = 'unstyled', size = 'none', leadingIcon, trailingIcon, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`ui-button ${variantClasses[variant]} ${sizeClasses[size]} ${className}`.trim()}
      {...props}
    >
      {leadingIcon}{children}{trailingIcon}
    </button>
  );
});

export default Button;
