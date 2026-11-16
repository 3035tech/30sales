import { forwardRef, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, FileUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import './FormControls.css'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'quiet' | 'danger' }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ className = '', variant = 'secondary', type = 'submit', ...props }, ref) {
  return <button ref={ref} type={type} className={`ui-button ui-button-${variant} ${className}`.trim()} {...props} />
})

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { label: string }

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({ className = '', label, type = 'button', ...props }, ref) {
  return <Button ref={ref} type={type} className={`ui-icon-button ${className}`.trim()} aria-label={label} title={label} {...props} />
})

type TextInputType = 'text' | 'search' | 'email' | 'password' | 'tel' | 'url' | 'time' | 'hidden'
type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  type?: TextInputType
  error?: string
  hint?: string
  normalize?: 'email'
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField({ className = '', type = 'text', error, hint, normalize, onChange, onBlur, onInvalid, value, ...props }, ref) {
  const { t } = useTranslation()
  const generatedId = useId()
  const [validationError, setValidationError] = useState('')
  const visibleError = error ?? validationError
  const errorId = visibleError ? `${generatedId}-error` : undefined
  const hintId = hint ? `${generatedId}-hint` : undefined
  const describedBy = [props['aria-describedby'], hintId, errorId].filter(Boolean).join(' ') || undefined
  const handleChange: TextFieldProps['onChange'] = (event) => {
    if (normalize === 'email') {
      const normalized = event.target.value.replace(/\s/g, '').toLowerCase()
      if (normalized !== event.target.value) {
        event.target.value = normalized
      }
    }
    event.currentTarget.setCustomValidity('')
    const message = getValidationMessage(event.currentTarget, t)
    event.currentTarget.setCustomValidity(message)
    setValidationError(message)
    onChange?.(event)
  }
  const handleBlur: TextFieldProps['onBlur'] = (event) => {
    event.currentTarget.setCustomValidity('')
    const message = getValidationMessage(event.currentTarget, t)
    event.currentTarget.setCustomValidity(message)
    setValidationError(message)
    onBlur?.(event)
  }
  const handleInvalid: TextFieldProps['onInvalid'] = (event) => {
    const message = getValidationMessage(event.currentTarget, t)
    event.currentTarget.setCustomValidity(message)
    setValidationError(message)
    onInvalid?.(event)
  }
  return <>
    <input {...props} ref={ref} type={type} value={value} onChange={handleChange} onBlur={handleBlur} onInvalid={handleInvalid} className={`ui-field-control ui-text-field ${className}`.trim()} aria-invalid={visibleError ? true : props['aria-invalid']} aria-describedby={describedBy} />
    {hint && <small id={hintId} className="ui-field-hint">{hint}</small>}
    {visibleError && <small id={errorId} className="ui-field-error" role="alert">{visibleError}</small>}
  </>
})

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & { error?: string; hint?: string }

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField({ className = '', children, error, hint, onChange, onBlur, onInvalid, ...props }, ref) {
  const { t } = useTranslation()
  const generatedId = useId()
  const [validationError, setValidationError] = useState('')
  const visibleError = error ?? validationError
  const errorId = visibleError ? `${generatedId}-error` : undefined
  const hintId = hint ? `${generatedId}-hint` : undefined
  const describedBy = [props['aria-describedby'], hintId, errorId].filter(Boolean).join(' ') || undefined
  const validate = (element: HTMLSelectElement) => {
    element.setCustomValidity('')
    const message = getValidationMessage(element, t)
    element.setCustomValidity(message)
    setValidationError(message)
  }
  return <><select ref={ref} className={`ui-field-control ui-select ${className}`.trim()} {...props} aria-invalid={visibleError ? true : props['aria-invalid']} aria-describedby={describedBy} onChange={(event) => { validate(event.currentTarget); onChange?.(event) }} onBlur={(event) => { validate(event.currentTarget); onBlur?.(event) }} onInvalid={(event) => { validate(event.currentTarget); onInvalid?.(event) }}>{children}</select>{hint && <small id={hintId} className="ui-field-hint">{hint}</small>}{visibleError && <small id={errorId} className="ui-field-error" role="alert">{visibleError}</small>}</>
})

export const TextareaField = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: string; hint?: string }>(function TextareaField({ className = '', error, hint, onChange, onBlur, onInvalid, ...props }, ref) {
  const { t } = useTranslation()
  const generatedId = useId()
  const [validationError, setValidationError] = useState('')
  const visibleError = error ?? validationError
  const errorId = visibleError ? `${generatedId}-error` : undefined
  const hintId = hint ? `${generatedId}-hint` : undefined
  const describedBy = [props['aria-describedby'], hintId, errorId].filter(Boolean).join(' ') || undefined
  const validate = (element: HTMLTextAreaElement) => {
    element.setCustomValidity('')
    const message = getValidationMessage(element, t)
    element.setCustomValidity(message)
    setValidationError(message)
  }
  return <><textarea {...props} ref={ref} className={`ui-field-control ui-textarea ${className}`.trim()} aria-invalid={visibleError ? true : props['aria-invalid']} aria-describedby={describedBy} onChange={(event) => { validate(event.currentTarget); onChange?.(event) }} onBlur={(event) => { validate(event.currentTarget); onBlur?.(event) }} onInvalid={(event) => { validate(event.currentTarget); onInvalid?.(event) }} />{hint && <small id={hintId} className="ui-field-hint">{hint}</small>}{visibleError && <small id={errorId} className="ui-field-error" role="alert">{visibleError}</small>}</>
})

export const CheckboxField = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>>(function CheckboxField({ className = '', ...props }, ref) {
  return <input ref={ref} type="checkbox" className={`ui-checkbox ${className}`.trim()} {...props} />
})

type PhoneFieldProps = Omit<TextFieldProps, 'type' | 'value' | 'onChange'> & { value: string; onValueChange: (value: string) => void; requireInternational?: boolean }

export function PhoneField({ value, onValueChange, requireInternational = false, className = '', onFocus, onBlur, error, hint, ...props }: PhoneFieldProps) {
  const { t } = useTranslation()
  const inputId = useId()
  const [draft, setDraft] = useState(() => formatPhoneDisplay(value))
  const [touched, setTouched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const phoneIsInvalid = Boolean(value && requireInternational && !/^\+[1-9]\d{7,14}$/.test(value))
  useEffect(() => { if (document.activeElement !== inputRef.current) setDraft(formatPhoneDisplay(value)) }, [value])
  const visibleError = error ?? (touched && props.required && !value ? t('formControls.required') : touched && phoneIsInvalid ? t('formControls.invalidPhone') : undefined)
  const hintId = hint ? `${inputId}-hint` : undefined
  const describedBy = [props['aria-describedby'], hintId, visibleError ? `${inputId}-error` : undefined].filter(Boolean).join(' ') || undefined
  return <><input {...props} ref={inputRef} type="tel" inputMode="tel" value={draft} className={`ui-field-control ui-text-field ${className}`.trim()} aria-invalid={visibleError ? true : props['aria-invalid']} aria-describedby={describedBy} onFocus={(event) => { onFocus?.(event); setDraft(value) }} onChange={(event) => { const raw = event.target.value; const digits = raw.replace(/\D/g, '').slice(0, 15); const canonical = raw.trim().startsWith('+') ? `+${digits}` : digits; onValueChange(canonical); setDraft(raw); const message = !canonical && props.required ? t('formControls.required') : canonical && requireInternational && !/^\+[1-9]\d{7,14}$/.test(canonical) ? t('formControls.invalidPhone') : ''; event.currentTarget.setCustomValidity(message) }} onBlur={(event) => { setTouched(true); setDraft(formatPhoneDisplay(value)); const message = !value && props.required ? t('formControls.required') : value && requireInternational && !/^\+[1-9]\d{7,14}$/.test(value) ? t('formControls.invalidPhone') : ''; event.currentTarget.setCustomValidity(message); onBlur?.(event) }} />{hint && <small id={hintId} className="ui-field-hint">{hint}</small>}{visibleError && <small id={`${inputId}-error`} className="ui-field-error" role="alert">{visibleError}</small>}</>
}

function formatPhoneDisplay(value: string) {
  const digits = value.replace(/\D/g, '')
  if (value.startsWith('+') && digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    const local = digits.slice(4)
    const subscriber = local.length === 9 ? `${local.slice(0, 5)}-${local.slice(5)}` : `${local.slice(0, 4)}-${local.slice(4)}`
    return `+55 (${digits.slice(2, 4)}) ${subscriber}`
  }
  return value
}

export const FileField = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>>(function FileField({ className = '', ...props }, ref) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  return <>
    <input {...props} ref={(element) => { inputRef.current = element; if (typeof ref === 'function') ref(element); else if (ref) ref.current = element }} type="file" tabIndex={-1} aria-hidden="true" className={`ui-file-field ${className}`.trim()} />
    <Button className="ui-file-select" type="button" onClick={() => inputRef.current?.click()}><FileUp size={16} aria-hidden="true" />{t('formControls.chooseFile')}</Button>
  </>
})

type NumericFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'min' | 'max' | 'step'> & {
  value: number | null
  onValueChange: (value: number | null) => void
  mode: 'integer' | 'decimal'
  min?: number
  max?: number
  step?: number
  error?: string
}

export function NumericField({ value, onValueChange, mode, min, max, step, className = '', error, onBlur, ...props }: NumericFieldProps) {
  const { i18n, t } = useTranslation()
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState(() => formatNumeric(value, mode, i18n.language))
  const [validationError, setValidationError] = useState('')
  const visibleError = error ?? validationError
  const errorId = visibleError ? `${inputId}-error` : undefined
  useEffect(() => {
    if (document.activeElement !== inputRef.current) setDraft(formatNumeric(value, mode, i18n.language))
  }, [i18n.language, mode, value])
  const change = (raw: string) => {
    const precision = step === undefined ? 6 : Math.max(0, (String(step).split('.')[1] ?? '').length)
    const next = mode === 'integer' ? raw.replace(/\D/g, '') : normalizeDecimalDraft(raw, precision, i18n.language)
    setDraft(mode === 'decimal' && i18n.language.startsWith('pt') ? next.replace('.', ',') : next)
    if (!next || next === ',' || next === '.') {
      const message = props.required ? t('formControls.required') : ''
      inputRef.current?.setCustomValidity(message)
      setValidationError(message)
      onValueChange(null)
    }
    else {
      const parsed = Number(next.replace(',', '.'))
      const outOfRange = Number.isFinite(parsed) && (min !== undefined && parsed < min || max !== undefined && parsed > max)
      const message = outOfRange ? numericRangeMessage(parsed, min, max, t) : ''
      inputRef.current?.setCustomValidity(message)
      setValidationError(message)
      if (Number.isFinite(parsed)) onValueChange(mode === 'integer' ? Math.trunc(parsed) : parsed)
    }
  }
  const validate = (field: HTMLInputElement) => {
    const rangeMessage = value === null ? '' : numericRangeMessage(value, min, max, t)
    const message = rangeMessage || (props.required && value === null ? t('formControls.required') : '')
    field.setCustomValidity(message)
    setValidationError(message)
  }
  return <><input {...props} ref={inputRef} type="text" inputMode={mode === 'integer' ? 'numeric' : 'decimal'} pattern={mode === 'integer' ? '[0-9]*' : '[0-9]*([.,][0-9]*)?'} value={draft} className={`ui-field-control ui-text-field ui-numeric-field ${className}`.trim()} aria-invalid={visibleError ? true : props['aria-invalid']} aria-describedby={[props['aria-describedby'], errorId].filter(Boolean).join(' ') || undefined} onChange={(event) => change(event.target.value)} onBlur={(event) => { validate(event.currentTarget); setDraft(formatNumeric(value, mode, i18n.language)); onBlur?.(event) }} onInvalid={(event) => { validate(event.currentTarget); props.onInvalid?.(event) }} />{visibleError && <small id={errorId} className="ui-field-error" role="alert">{visibleError}</small>}</>
}

type CurrencyFieldProps = Omit<NumericFieldProps, 'mode' | 'step'> & { currency: string }

export function CurrencyField({ value, onValueChange, currency, min, max, className = '', ...props }: CurrencyFieldProps) {
  const { i18n, t } = useTranslation()
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState(() => formatCurrency(value, currency, i18n.language))
  const [validationError, setValidationError] = useState('')
  const { error, onBlur, onFocus, onInvalid, ...inputProps } = props
  const visibleError = error ?? validationError
  const errorId = visibleError ? `${inputId}-error` : undefined
  useEffect(() => { if (document.activeElement !== inputRef.current) setDraft(formatCurrency(value, currency, i18n.language)) }, [currency, i18n.language, value])
  const validate = (field: HTMLInputElement) => {
    const rangeMessage = value === null ? '' : numericRangeMessage(value, min, max, t)
    const message = rangeMessage || (props.required && value === null ? t('formControls.required') : '')
    field.setCustomValidity(message)
    setValidationError(message)
  }
  return <><input {...inputProps} ref={inputRef} type="text" inputMode="decimal" value={draft} className={`ui-field-control ui-text-field ui-numeric-field ${className}`.trim()} aria-invalid={visibleError ? true : inputProps['aria-invalid']} aria-describedby={[inputProps['aria-describedby'], errorId].filter(Boolean).join(' ') || undefined} onFocus={(event) => { onFocus?.(event); setDraft(formatNumeric(value, 'decimal', i18n.language)) }} onChange={(event) => { const next = normalizeDecimalDraft(event.target.value, 2, i18n.language); const localized = next.replace('.', i18n.language.startsWith('pt') ? ',' : '.'); setDraft(localized); const parsed = Number(next); const numeric = next ? Number.isFinite(parsed) ? parsed : null : null; const rangeMessage = numeric === null ? '' : numericRangeMessage(numeric, min, max, t); const message = rangeMessage || (inputProps.required && numeric === null ? t('formControls.required') : ''); inputRef.current?.setCustomValidity(message); setValidationError(message); onValueChange(numeric) }} onBlur={(event) => { validate(event.currentTarget); setDraft(formatCurrency(value, currency, i18n.language)); onBlur?.(event) }} onInvalid={(event) => { validate(event.currentTarget); onInvalid?.(event) }} />{visibleError && <small id={errorId} className="ui-field-error" role="alert">{visibleError}</small>}</>
}

function formatCurrency(value: number | null, currency: string, language: string) {
  if (value === null || !Number.isFinite(value) || !/^[A-Z]{3}$/.test(currency)) return value === null ? '' : String(value)
  return new Intl.NumberFormat(language, { style: 'currency', currency, maximumFractionDigits: 2 }).format(value)
}

function formatNumeric(value: number | null, mode: 'integer' | 'decimal', language: string) {
  if (value === null || !Number.isFinite(value)) return ''
  return mode === 'integer' ? String(Math.trunc(value)) : new Intl.NumberFormat(language, { useGrouping: false, maximumFractionDigits: 6 }).format(value)
}

function normalizeDecimalDraft(raw: string, maxFractionDigits = 6, language = 'en') {
  const normalized = raw.replace(/[^\d.,]/g, '')
  const commaIndex = normalized.lastIndexOf(',')
  const dotIndex = normalized.lastIndexOf('.')
  const localeSeparator = language.startsWith('pt') ? ',' : '.'
  const separatorIndex = Math.max(commaIndex, dotIndex)
  if (separatorIndex < 0) return normalized
  const separator = normalized[separatorIndex]
  const fraction = normalized.slice(separatorIndex + 1).replace(/[.,]/g, '')
  const otherSeparatorIndex = separator === ',' ? dotIndex : commaIndex
  const separatorIsGrouping = otherSeparatorIndex < 0 && separator !== localeSeparator && fraction.length === 3
  if (separatorIsGrouping) return normalized.replace(/[.,]/g, '')
  const whole = normalized.slice(0, separatorIndex).replace(/[.,]/g, '')
  return `${whole}.${fraction.slice(0, maxFractionDigits)}`
}

function numericRangeMessage(value: number, min: number | undefined, max: number | undefined, translate: ReturnType<typeof useTranslation>['t']) {
  if (min !== undefined && value < min && max !== undefined) return translate('formControls.valueOutOfRange', { min, max })
  if (min !== undefined && value < min) return translate('formControls.minimumValue', { min })
  if (max !== undefined && value > max) return translate('formControls.maximumValue', { max })
  return ''
}

function getValidationMessage(field: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, translate: ReturnType<typeof useTranslation>['t']) {
  if (field.validity.valueMissing) return translate('formControls.required')
  if (field.validity.typeMismatch) return translate(field instanceof HTMLInputElement && field.type === 'email' ? 'formControls.invalidEmail' : 'formControls.invalidFormat')
  if (field.validity.patternMismatch) return translate('formControls.invalidFormat')
  if (field.validity.tooShort) return translate('formControls.minimumLength', { count: 'minLength' in field ? field.minLength : 0 })
  if (field.validity.badInput) return translate('formControls.invalidNumber')
  return ''
}

type CalendarFieldProps = {
  value: string
  onValueChange: (value: string) => void
  mode: 'date' | 'datetime-local'
  min?: string
  max?: string
  required?: boolean
  disabled?: boolean
  className?: string
  'aria-label'?: string
  error?: string
}

export function CalendarField({ value, onValueChange, mode, min, max, required, disabled, className = '', 'aria-label': ariaLabel, error }: CalendarFieldProps) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(() => parseCalendarValue(value) ?? new Date())
  const [validationError, setValidationError] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const hiddenInputRef = useRef<HTMLInputElement>(null)
  const selectedDate = parseCalendarValue(value)
  const selectedDateKey = selectedDate ? formatCalendarDate(selectedDate) : ''
  const id = useId()
  const dateKey = value.slice(0, 10)
  const dateIsOutsideBounds = Boolean(selectedDate && (min && dateKey < min.slice(0, 10) || max && dateKey > max.slice(0, 10)))
  const valueIsComplete = mode === 'date' ? isValidDateValue(value) : isValidDateTimeValue(value)
  const visibleError = error ?? (validationError || (dateIsOutsideBounds ? t('formControls.dateOutOfRange') : undefined))
  useEffect(() => {
    const message = dateIsOutsideBounds ? t('formControls.dateOutOfRange') : required && !valueIsComplete ? t('formControls.required') : ''
    hiddenInputRef.current?.setCustomValidity(message)
    if (!message) setValidationError('')
  }, [dateIsOutsideBounds, required, t, valueIsComplete])
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false) }
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); rootRef.current?.querySelector<HTMLButtonElement>('.ui-calendar-trigger')?.focus() } }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('keydown', onKeyDown) }
  }, [open])
  useEffect(() => {
    if (!open) return
    const key = selectedDateKey || formatCalendarDate(new Date())
    window.requestAnimationFrame(() => rootRef.current?.querySelector<HTMLButtonElement>(`[data-date="${key}"]:not(:disabled)`)?.focus())
  }, [open, selectedDateKey])
  const monthLabel = new Intl.DateTimeFormat(i18n.language, { month: 'long', year: 'numeric' }).format(month)
  const dateLabel = selectedDate ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(selectedDate) : t('formControls.chooseDate')
  const timeValue = mode === 'datetime-local' ? value.slice(11, 16) : ''
  const days = calendarDays(month)
  const chooseDay = (day: Date) => {
    if (isOutsideDateBounds(day, min, max)) return
    const date = formatCalendarDate(day)
    const time = timeValue || '09:00'
    onValueChange(mode === 'date' ? date : `${date}T${time}`)
    setValidationError('')
    hiddenInputRef.current?.setCustomValidity('')
    if (mode === 'date') { setOpen(false); rootRef.current?.querySelector<HTMLButtonElement>('.ui-calendar-trigger')?.focus() }
  }
  const updateTime = (time: string) => {
    const date = selectedDate ? formatCalendarDate(selectedDate) : formatCalendarDate(new Date())
    onValueChange(`${date}T${time}`)
    setValidationError('')
  }
  return <div className={`ui-calendar-field ${className}`.trim()} ref={rootRef}>
    <button type="button" className="ui-field-control ui-calendar-trigger" aria-haspopup="dialog" aria-expanded={open} aria-required={required || undefined} aria-label={ariaLabel ?? t('formControls.chooseDate')} aria-invalid={visibleError ? true : undefined} aria-describedby={visibleError ? `${id}-error` : undefined} disabled={disabled} onClick={() => { setMonth(selectedDate ?? new Date()); setOpen((current) => !current) }}><CalendarDays size={16} aria-hidden="true" /><span>{mode === 'datetime-local' && timeValue ? `${dateLabel} · ${timeValue}` : dateLabel}</span></button>
    {open && <div className="ui-calendar-popover" role="dialog" aria-modal="false" aria-label={t('formControls.chooseDate')}>
      <div className="ui-calendar-heading"><button type="button" aria-label={t('formControls.previousMonth')} onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}><ChevronLeft size={17} /></button><strong>{monthLabel}</strong><button type="button" aria-label={t('formControls.nextMonth')} onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}><ChevronRight size={17} /></button></div>
      <div className="ui-calendar-grid" role="grid">{weekdayLabels(i18n.language).map((label, index) => <span key={`weekday-${index}`} className="ui-calendar-weekday" role="columnheader">{label}</span>)}{days.map((day) => {
        const dayKey = formatCalendarDate(day)
        const inCurrentMonth = day.getMonth() === month.getMonth()
        const selected = selectedDate ? dayKey === formatCalendarDate(selectedDate) : false
        const today = dayKey === formatCalendarDate(new Date())
        return <button key={dayKey} data-date={dayKey} type="button" role="gridcell" className={`ui-calendar-day${inCurrentMonth ? '' : ' outside'}${selected ? ' selected' : ''}${today ? ' today' : ''}`} aria-label={new Intl.DateTimeFormat(i18n.language, { dateStyle: 'full' }).format(day)} aria-pressed={selected} aria-current={today ? 'date' : undefined} disabled={isOutsideDateBounds(day, min, max)} onKeyDown={(event) => { const delta = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? -7 : event.key === 'ArrowDown' ? 7 : 0; if (delta) { event.preventDefault(); const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + delta); setMonth(next); window.requestAnimationFrame(() => rootRef.current?.querySelector<HTMLButtonElement>(`[data-date="${formatCalendarDate(next)}"]`)?.focus()) } }} onClick={() => chooseDay(day)}>{day.getDate()}</button>
      })}</div>
      {mode === 'datetime-local' && <label className="ui-calendar-time">{t('formControls.time')}<input className="ui-time-input" type="time" value={timeValue} onChange={(event) => updateTime(event.target.value)} /></label>}
      <div className="ui-calendar-actions"><button type="button" onClick={() => { onValueChange(''); setValidationError(''); setOpen(false) }} disabled={required}>{t('formControls.clear')}</button><button type="button" onClick={() => { chooseDay(new Date()); if (mode === 'date') setOpen(false) }}>{t('formControls.today')}</button></div>
    </div>}
    <input ref={hiddenInputRef} className="ui-visually-hidden" tabIndex={-1} aria-hidden="true" type="text" value={valueIsComplete ? 'selected' : ''} required={required} readOnly onInvalid={(event) => { const message = dateIsOutsideBounds ? t('formControls.dateOutOfRange') : t('formControls.required'); event.preventDefault(); event.currentTarget.setCustomValidity(message); setValidationError(message); rootRef.current?.querySelector<HTMLButtonElement>('.ui-calendar-trigger')?.focus() }} />
    {visibleError && <small id={`${id}-error`} className="ui-field-error" role="alert">{visibleError}</small>}
  </div>
}

function parseCalendarValue(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]) ? date : null
}

function isValidDateValue(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && parseCalendarValue(value) !== null
}

function isValidDateTimeValue(value: string) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value)
  return Boolean(match && parseCalendarValue(match[1]) && Number(match[2]) <= 23 && Number(match[3]) <= 59)
}

function formatCalendarDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function calendarDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const mondayOffset = (first.getDay() + 6) % 7
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - mondayOffset)
  return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index))
}

function weekdayLabels(language: string) {
  const formatter = new Intl.DateTimeFormat(language, { weekday: 'short' })
  const monday = new Date(2024, 0, 1)
  return Array.from({ length: 7 }, (_, index) => formatter.format(new Date(2024, 0, monday.getDate() + index)))
}

function isOutsideDateBounds(date: Date, min?: string, max?: string) {
  const key = formatCalendarDate(date)
  return Boolean(min && key < min.slice(0, 10) || max && key > max.slice(0, 10))
}

export type FormFieldProps = { label: string; hint?: ReactNode; error?: string; required?: boolean; children: ReactNode }

export function FormField({ label, hint, error, required, children }: FormFieldProps) {
  return <label className={`ui-form-field${error ? ' has-error' : ''}`}><span className="ui-form-field-label">{label}{required && <span aria-hidden="true" className="ui-required-mark">*</span>}</span>{children}{hint && <small className="ui-field-hint">{hint}</small>}{error && <small className="ui-field-error" role="alert">{error}</small>}</label>
}
