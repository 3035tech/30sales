import { useState } from 'react'
import { Button } from './Button'
import { Modal } from './Modal'
import './ConfirmDialog.css'

type ConfirmDialogProps = {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  cancelLabel: string
  closeLabel: string
  onOpenChange: (open: boolean) => void
  onConfirm: () => void | boolean | Promise<void | boolean>
  destructive?: boolean
}

export function ConfirmDialog({ open, title, description, confirmLabel, cancelLabel, closeLabel, onOpenChange, onConfirm, destructive = false }: ConfirmDialogProps) {
  const [saving, setSaving] = useState(false)

  const confirmSelection = async () => {
    setSaving(true)
    try {
      const confirmed = await onConfirm()
      if (confirmed !== false) onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return <Modal open={open} onOpenChange={(nextOpen) => { if (!saving) onOpenChange(nextOpen) }} title={title} description={description} closeLabel={closeLabel} className="ui-confirm-dialog">
    <div className="ui-confirm-actions">
      <Button type="button" disabled={saving} onClick={() => onOpenChange(false)}>{cancelLabel}</Button>
      <Button type="button" variant={destructive ? 'danger' : 'primary'} disabled={saving} onClick={() => void confirmSelection()}>{confirmLabel}</Button>
    </div>
  </Modal>
}
