import type { ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { IconButton } from './FormControls'
import './Modal.css'

type ModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  closeLabel: string
  children: ReactNode
  className?: string
}

export function Modal({ open, onOpenChange, title, description, closeLabel, children, className = '' }: ModalProps) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="ui-modal-overlay" />
      <Dialog.Content className={`ui-modal ${className}`.trim()}>
        <header className="ui-modal-header">
          <div><Dialog.Title>{title}</Dialog.Title>{description && <Dialog.Description>{description}</Dialog.Description>}</div>
          <Dialog.Close asChild><IconButton label={closeLabel}><X size={18} /></IconButton></Dialog.Close>
        </header>
        <div className="ui-modal-body">{children}</div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
