import { forwardRef } from 'react';
import Button, { type ButtonProps } from './Button';

export type PrimaryButtonProps = Omit<ButtonProps, 'variant'>;

const PrimaryButton = forwardRef<HTMLButtonElement, PrimaryButtonProps>(function PrimaryButton(
  { className = '', ...props },
  ref,
) {
  return <Button ref={ref} variant="primary" className={`primary-button ${className}`.trim()} {...props} />;
});

export default PrimaryButton;
