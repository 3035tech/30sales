import { useEffect, useId, useRef, useState } from 'react'
import type { TextFieldProps } from './FormControls'
import { AsYouType } from 'libphonenumber-js/min'
import { useTranslation } from 'react-i18next'
import './FormControls.css'

type PhoneFieldProps = Omit<TextFieldProps, 'type' | 'value' | 'onChange'> & {
  value: string
  onValueChange: (value: string) => void
  requireInternational?: boolean
}

export function PhoneField({ value, onValueChange, requireInternational = false, className = '', onFocus, onBlur, onInvalid, error, hint, ...props }: PhoneFieldProps) {
  const { t } = useTranslation()
  const inputId = useId()
  const [draft, setDraft] = useState(() => formatPhoneDisplay(value))
  const [touched, setTouched] = useState(false)
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const phoneIsInvalid = Boolean(value && requireInternational && !/^\+[1-9]\d{7,14}$/.test(value))
  useEffect(() => { if (document.activeElement !== inputRef.current) setDraft(formatPhoneDisplay(value)) }, [value])
  const visibleError = error ?? (submitAttempted && props.required && !value ? t('formControls.required') : touched && phoneIsInvalid ? t('formControls.invalidPhone') : undefined)
  const hintId = hint ? `${inputId}-hint` : undefined
  const describedBy = [props['aria-describedby'], hintId, visibleError ? `${inputId}-error` : undefined].filter(Boolean).join(' ') || undefined
  return <><input {...props} ref={inputRef} type="tel" inputMode="tel" value={draft} className={`ui-field-control ui-text-field ${className}`.trim()} aria-invalid={visibleError ? true : props['aria-invalid']} aria-describedby={describedBy} onFocus={(event) => { onFocus?.(event); setDraft(formatPhoneDisplay(value)) }} onChange={(event) => {
    const raw = event.target.value
    const cursor = event.currentTarget.selectionStart ?? raw.length
    const digits = raw.replace(/\D/g, '').slice(0, 15)
    const canonical = raw.trim().startsWith('+') ? `+${digits}` : digits
    const formatted = formatPhoneDisplay(canonical)
    const digitsBeforeCursor = raw.slice(0, cursor).replace(/\D/g, '').length
    onValueChange(canonical)
    setDraft(formatted)
    requestAnimationFrame(() => {
      const input = inputRef.current
      if (!input) return
      let digitCount = 0
      let nextCursor = formatted.startsWith('+') ? 1 : 0
      if (digitsBeforeCursor > 0) {
        for (let index = nextCursor; index < formatted.length; index += 1) {
          if (/\d/.test(formatted[index])) digitCount += 1
          nextCursor = index + 1
          if (digitCount >= digitsBeforeCursor) break
        }
      }
      input.setSelectionRange(nextCursor, nextCursor)
    })
    const message = !canonical && props.required && submitAttempted ? t('formControls.required') : canonical && requireInternational && !/^\+[1-9]\d{7,14}$/.test(canonical) ? t('formControls.invalidPhone') : ''
    event.currentTarget.setCustomValidity(message)
  }} onBlur={(event) => { setTouched(true); setDraft(formatPhoneDisplay(value)); const message = !value && props.required && submitAttempted ? t('formControls.required') : value && requireInternational && !/^\+[1-9]\d{7,14}$/.test(value) ? t('formControls.invalidPhone') : ''; event.currentTarget.setCustomValidity(message); onBlur?.(event) }} onInvalid={(event) => { setTouched(true); setSubmitAttempted(true); const message = !value && props.required ? t('formControls.required') : phoneIsInvalid ? t('formControls.invalidPhone') : ''; event.currentTarget.setCustomValidity(message); event.preventDefault(); onInvalid?.(event) }} />{hint && <small id={hintId} className="ui-field-hint">{hint}</small>}{visibleError && <small id={`${inputId}-error`} className="ui-field-error" role="alert">{visibleError}</small>}</>
}

function formatPhoneDisplay(value: string) {
  return value.startsWith('+') ? new AsYouType().input(value) : value
}
