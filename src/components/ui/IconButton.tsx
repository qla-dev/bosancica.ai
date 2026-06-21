import { forwardRef } from 'react';
import Button, { type ButtonProps } from './Button';

export type IconButtonProps = Omit<ButtonProps, 'size'>;

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className = '', ...props },
  ref,
) {
  return <Button ref={ref} size="icon" className={className} {...props} />;
});

export default IconButton;
