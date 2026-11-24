import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from './Button'
import './SystemAlert.css'

export const SYSTEM_ALERT_KIND = { success: 'success', error: 'error', info: 'info' } as const
export type SystemAlertKind = typeof SYSTEM_ALERT_KIND[keyof typeof SYSTEM_ALERT_KIND]

const SYSTEM_ALERT_DURATION_MS = { success: 5_000, error: 8_000, info: 6_000 } as const
const SYSTEM_ALERT_LIMIT = 4
type SystemAlertItem = { id: string; kind: SystemAlertKind; message: string }
type SystemAlertListener = (item: SystemAlertItem) => void
const listeners = new Set<SystemAlertListener>()

export function notifySystemAlert(kind: SystemAlertKind, message: string) {
  const item = { id: crypto.randomUUID(), kind, message }
  listeners.forEach((listener) => listener(item))
}

export function SystemAlertViewport() {
  const { t } = useTranslation()
  const [alerts, setAlerts] = useState<SystemAlertItem[]>([])

  useEffect(() => {
    const receive = (item: SystemAlertItem) => setAlerts((current) => [...current, item].slice(-SYSTEM_ALERT_LIMIT))
    listeners.add(receive)
    return () => { listeners.delete(receive) }
  }, [])

  useEffect(() => {
    const timers = alerts.map((alert) => window.setTimeout(
      () => setAlerts((current) => current.filter(({ id }) => id !== alert.id)),
      SYSTEM_ALERT_DURATION_MS[alert.kind],
    ))
    return () => timers.forEach(window.clearTimeout)
  }, [alerts])

  if (!alerts.length) return null
  return createPortal(
    <div className="system-alert-viewport" aria-label={t('systemAlerts.region')}>
      {alerts.map((alert) => {
        const Icon = alert.kind === SYSTEM_ALERT_KIND.error ? AlertCircle : alert.kind === SYSTEM_ALERT_KIND.success ? CheckCircle2 : Info
        return <section key={alert.id} className={`system-alert system-alert-${alert.kind}`} role={alert.kind === SYSTEM_ALERT_KIND.error ? 'alert' : 'status'} aria-live={alert.kind === SYSTEM_ALERT_KIND.error ? 'assertive' : 'polite'}>
          <Icon size={19} aria-hidden="true" />
          <p>{alert.message}</p>
          <Button type="button" className="system-alert-close" aria-label={t('common.close')} onClick={() => setAlerts((current) => current.filter(({ id }) => id !== alert.id))}><X size={17} aria-hidden="true" /></Button>
        </section>
      })}
    </div>,
    document.body,
  )
}
