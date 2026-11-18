import { Button, FileField, SelectField } from '../components/ui/FormControls'
import { useMemo, useState } from 'react'
import { AlertTriangle, FileUp, RefreshCw, SearchCheck, ShieldCheck, UserRoundPlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { IMPORT_CSV_HEADERS, IMPORT_CSV_MAX_BYTES, IMPORT_PREVIEW_STATUS, IMPORT_PROVIDERS, IMPORT_TARGET_TYPE, IMPORT_TARGET_TYPES, LEAD_IMPORT_RESULT_STATUS } from '../lib/importConstants'
import './ImportsWorkspace.css'

type Provider = (typeof IMPORT_PROVIDERS)[number]
type ImportRecord = { recordType: string; externalId: string; targetType: (typeof IMPORT_TARGET_TYPES)[number]; accountName?: string; contactName?: string; email?: string; phone?: string; sourceStatus?: string }
type ImportableLeadRecord = ImportRecord & { targetType: typeof IMPORT_TARGET_TYPE.lead; accountName: string; contactName: string }
const headers = IMPORT_CSV_HEADERS

function isImportableLeadRecord(record: ImportRecord): record is ImportableLeadRecord {
  return record.targetType === IMPORT_TARGET_TYPE.lead && Boolean(record.accountName && record.contactName && (record.email || record.phone))
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], value = '', quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character === '"' && quoted && text[index + 1] === '"') { value += '"'; index += 1 }
    else if (character === '"') quoted = !quoted
    else if (character === ',' && !quoted) { row.push(value.trim()); value = '' }
    else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      row.push(value.trim()); if (row.some(Boolean)) rows.push(row); row = []; value = ''
    } else value += character
  }
  if (quoted) throw new Error('invalidCsv')
  row.push(value.trim()); if (row.some(Boolean)) rows.push(row)
  return rows
}

function readRecords(text: string): ImportRecord[] {
  const rows = parseCsv(text)
  if (!rows.length) throw new Error('emptyCsv')
  const columns = rows[0].map((value) => value.replace(/^\uFEFF/, ''))
  const missing = headers.filter((header) => !columns.includes(header))
  if (missing.length) throw new Error('missingHeaders')
  const index = new Map(headers.map((header) => [header, columns.indexOf(header)] as const))
  return rows.slice(1).map((row) => {
    const get = (key: (typeof headers)[number]) => {
      const columnIndex = index.get(key)
      return columnIndex === undefined ? '' : row[columnIndex]?.trim() ?? ''
    }
    const targetType = IMPORT_TARGET_TYPES.find((candidate) => candidate === get('targetType'))
    if (!targetType) throw new Error('invalidTargetType')
    return { recordType: get('recordType'), externalId: get('externalId'), targetType, accountName: get('accountName') || undefined, contactName: get('contactName') || undefined, email: get('email') || undefined, phone: get('phone') || undefined, sourceStatus: get('sourceStatus') || undefined }
  })
}

export function ImportsWorkspace() {
  const { t } = useTranslation()
  const [provider, setProvider] = useState<Provider>('twenty')
  const [records, setRecords] = useState<ImportRecord[]>([])
  const [fileName, setFileName] = useState('')
  const [parseError, setParseError] = useState('')
  const [result, setResult] = useState<Awaited<ReturnType<typeof api.imports.preview>> | null>(null)
  const [commitResult, setCommitResult] = useState<Awaited<ReturnType<typeof api.imports.importLeads>> | null>(null)
  const [loading, setLoading] = useState<'preview' | 'import' | null>(null)
  const [requestError, setRequestError] = useState(false)
  const counts = useMemo(() => Object.fromEntries(Object.values(IMPORT_PREVIEW_STATUS).map((status) => [status, result?.records.filter((record) => record.status === status).length ?? 0])), [result])

  const selectFile = async (file?: File) => {
    setResult(null); setCommitResult(null); setParseError(''); setFileName(file?.name ?? ''); setRecords([])
    if (!file) return
    try {
      if (file.size > IMPORT_CSV_MAX_BYTES) throw new Error('fileTooLarge')
      const parsed = readRecords(await file.text())
      if (parsed.length > 100) throw new Error('tooManyRecords')
      if (!parsed.length) throw new Error('emptyCsv')
      setRecords(parsed)
    } catch (error) { setParseError(error instanceof Error ? error.message : 'invalidCsv') }
  }
  const preview = async () => {
    setLoading('preview'); setRequestError(false); setCommitResult(null)
    try { setResult(await api.imports.preview({ provider, records })) }
    catch { setRequestError(true) }
    finally { setLoading(null) }
  }
  const importUnmatchedLeads = async () => {
    const importable = result?.records.filter((record) => record.targetType === IMPORT_TARGET_TYPE.lead && record.status === IMPORT_PREVIEW_STATUS.noMatch) ?? []
    const identities = new Set(importable.map((record) => `${record.recordType}\u0000${record.externalId}`))
    const leadRecords = records.filter(isImportableLeadRecord).filter((record) => identities.has(`${record.recordType}\u0000${record.externalId}`))
    if (!leadRecords.length) return
    setLoading('import'); setRequestError(false)
    try { setCommitResult(await api.imports.importLeads({ provider, records: leadRecords.map((record) => ({ ...record, targetType: IMPORT_TARGET_TYPE.lead })) })) }
    catch { setRequestError(true) }
    finally { setLoading(null) }
  }

  return <section className="leads-page imports-page">
    <header className="leads-heading"><div><p className="eyebrow">{t('imports.eyebrow')}</p><h2>{t('imports.title')}</h2><p className="muted">{t('imports.description')}</p></div><Button className="refresh" onClick={() => { setResult(null); setCommitResult(null); setRecords([]); setFileName(''); setParseError('') }} aria-label={t('imports.reset')}><RefreshCw size={16} /></Button></header>
    <div className="imports-safety"><ShieldCheck size={18} /><span>{t('imports.readOnly')}</span></div>
    <section className="imports-upload">
      <label>{t('imports.provider')}<SelectField value={provider} onChange={(event) => { const selectedProvider = IMPORT_PROVIDERS.find((candidate) => candidate === event.target.value); if (selectedProvider) setProvider(selectedProvider); setResult(null); setCommitResult(null) }}><option value={IMPORT_PROVIDERS[0]}>Twenty</option><option value={IMPORT_PROVIDERS[1]}>Chatwoot</option><option value={IMPORT_PROVIDERS[2]}>Legacy PostgreSQL</option></SelectField></label>
      <div className="imports-file"><span>{t('imports.csvFile')}</span><FileField accept=".csv,text/csv" onChange={(event) => void selectFile(event.target.files?.[0])} /><small>{fileName || t('imports.fileHint')}</small></div>
      <p className="imports-format">{t('imports.format')}<code>{headers.join(', ')}</code></p>
      {parseError && <p className="error imports-error">{t(`imports.errors.${parseError}`, { defaultValue: t('imports.errors.invalidCsv') })}</p>}
      {requestError && <p className="error imports-error">{t('imports.requestFailed')}</p>}
      <div className="imports-actions"><span>{t('imports.recordsLoaded', { count: records.length })}</span><Button className="primary" disabled={!records.length || loading !== null} onClick={() => void preview()}>{loading === 'preview' ? t('imports.analyzing') : t('imports.preview')}<SearchCheck size={16} /></Button></div>
    </section>
    {result && <section className="lead-list-panel imports-results">
      <div className="lead-list-toolbar"><div><h3>{t('imports.results')}</h3><p>{t('imports.resultsHint', { count: result.records.length })}</p></div><AlertTriangle size={18} /></div>
      {commitResult && <p className="imports-outcome" role="status">{t('imports.importOutcome', { imported: commitResult.records.filter((record) => record.status === LEAD_IMPORT_RESULT_STATUS.imported).length, linked: commitResult.records.filter((record) => record.status === LEAD_IMPORT_RESULT_STATUS.alreadyLinked).length, review: commitResult.records.filter((record) => record.status === LEAD_IMPORT_RESULT_STATUS.reviewRequired || record.status === LEAD_IMPORT_RESULT_STATUS.typeConflict).length })}</p>}
      <div className="imports-summary">{Object.entries(counts).map(([status, count]) => <div key={status}><strong>{count}</strong><span>{t(`imports.status.${status}`)}</span></div>)}</div>
      <div className="imports-table-wrap"><table className="imports-table"><thead><tr>{['source', 'record', 'target', 'status', 'candidates'].map((key) => <th key={key}>{t(`imports.columns.${key}`)}</th>)}</tr></thead><tbody>{result.records.map((record, index) => { const committed = commitResult?.records.find((item) => item.recordType === record.recordType && item.externalId === record.externalId); const targetId = committed?.leadId ?? record.linkedTarget?.targetId; const targetType = committed?.leadId ? IMPORT_TARGET_TYPE.lead : record.linkedTarget?.targetType; return <tr key={`${record.recordType}-${record.externalId}-${index}`}><td><strong>{record.externalId}</strong><small>{record.recordType}{record.sourceStatus ? ` · ${record.sourceStatus}` : ''}</small></td><td>{t(`imports.targetType.${record.targetType}`)}</td><td>{targetId && targetType ? `${t(`imports.targetType.${targetType}`)} · ${targetId}` : '—'}</td><td><span className={`imports-status ${committed?.status ?? record.status}`}>{committed ? t(`imports.commitStatus.${committed.status}`) : t(`imports.status.${record.status}`)}</span></td><td>{record.candidates.length ? record.candidates.map((candidate) => <div className="imports-candidate" key={candidate.targetId}><strong>{candidate.label}</strong><small>{candidate.matchedBy.map((field) => t(`imports.matchField.${field}`)).join(', ')}</small></div>) : '—'}</td></tr> })}</tbody></table></div>
      <div className="imports-actions imports-commit"><span>{t('imports.reviewOnlyHint')}</span><Button className="primary" disabled={!result.records.some((record) => record.targetType === IMPORT_TARGET_TYPE.lead && record.status === IMPORT_PREVIEW_STATUS.noMatch) || loading !== null || Boolean(commitResult)} onClick={() => void importUnmatchedLeads()}>{loading === 'import' ? t('imports.importing') : t('imports.importLeads', { count: result.records.filter((record) => record.targetType === IMPORT_TARGET_TYPE.lead && record.status === IMPORT_PREVIEW_STATUS.noMatch).length })}<UserRoundPlus size={16} /></Button></div>
    </section>}
    <div className="imports-footnote"><FileUp size={15} />{t('imports.noWriteNotice')}</div>
  </section>
}
