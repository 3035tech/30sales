import { forwardRef, type ButtonHTMLAttributes } from 'react'
import './Button.css'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'quiet' | 'danger' }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ className = '', variant = 'secondary', type = 'submit', ...props }, ref) {
  return <button ref={ref} type={type} className={`ui-button ui-button-${variant} ${className}`.trim()} {...props} />
})
