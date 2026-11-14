import { useMemo, useState } from 'react'
import { AlertTriangle, FileUp, RefreshCw, SearchCheck, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api/client'
import './ImportsWorkspace.css'

type Provider = 'twenty' | 'chatwoot' | 'sofia_postgres'
type ImportRecord = { recordType: string; externalId: string; targetType: 'account' | 'person' | 'lead' | 'opportunity'; accountName?: string; contactName?: string; email?: string; phone?: string; sourceStatus?: string }
const headers = ['recordType', 'externalId', 'targetType', 'accountName', 'contactName', 'email', 'phone', 'sourceStatus'] as const

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
  const index = Object.fromEntries(headers.map((header) => [header, columns.indexOf(header)])) as Record<(typeof headers)[number], number>
  return rows.slice(1).map((row) => {
    const get = (key: (typeof headers)[number]) => row[index[key]]?.trim() ?? ''
    const targetType = get('targetType')
    if (!['account', 'person', 'lead', 'opportunity'].includes(targetType)) throw new Error('invalidTargetType')
    return { recordType: get('recordType'), externalId: get('externalId'), targetType: targetType as ImportRecord['targetType'], accountName: get('accountName') || undefined, contactName: get('contactName') || undefined, email: get('email') || undefined, phone: get('phone') || undefined, sourceStatus: get('sourceStatus') || undefined }
  })
}

export function ImportsWorkspace() {
  const { t } = useTranslation()
  const [provider, setProvider] = useState<Provider>('twenty')
  const [records, setRecords] = useState<ImportRecord[]>([])
  const [fileName, setFileName] = useState('')
  const [parseError, setParseError] = useState('')
  const [result, setResult] = useState<Awaited<ReturnType<typeof api.imports.preview>> | null>(null)
  const [loading, setLoading] = useState(false)
  const [requestError, setRequestError] = useState(false)
  const counts = useMemo(() => Object.fromEntries(['already_linked', 'type_conflict', 'possible_match', 'ambiguous', 'no_match'].map((status) => [status, result?.records.filter((record) => record.status === status).length ?? 0])), [result])

  const selectFile = async (file?: File) => {
    setResult(null); setParseError(''); setFileName(file?.name ?? ''); setRecords([])
    if (!file) return
    try {
      const parsed = readRecords(await file.text())
      if (parsed.length > 100) throw new Error('tooManyRecords')
      if (!parsed.length) throw new Error('emptyCsv')
      setRecords(parsed)
    } catch (error) { setParseError(error instanceof Error ? error.message : 'invalidCsv') }
  }
  const preview = async () => {
    setLoading(true); setRequestError(false)
    try { setResult(await api.imports.preview({ provider, records })) }
    catch { setRequestError(true) }
    finally { setLoading(false) }
  }

  return <section className="leads-page imports-page">
    <header className="leads-heading"><div><p className="eyebrow">{t('imports.eyebrow')}</p><h2>{t('imports.title')}</h2><p className="muted">{t('imports.description')}</p></div><button className="refresh" onClick={() => { setResult(null); setRecords([]); setFileName(''); setParseError('') }} aria-label={t('imports.reset')}><RefreshCw size={16} /></button></header>
    <div className="imports-safety"><ShieldCheck size={18} /><span>{t('imports.readOnly')}</span></div>
    <section className="imports-upload">
      <label>{t('imports.provider')}<select value={provider} onChange={(event) => { setProvider(event.target.value as Provider); setResult(null) }}><option value="twenty">Twenty</option><option value="chatwoot">Chatwoot</option><option value="sofia_postgres">Sofia Postgres</option></select></label>
      <label className="imports-file"><span>{t('imports.csvFile')}</span><input type="file" accept=".csv,text/csv" onChange={(event) => void selectFile(event.target.files?.[0])} /><small>{fileName || t('imports.fileHint')}</small></label>
      <p className="imports-format">{t('imports.format')}<code>{headers.join(', ')}</code></p>
      {parseError && <p className="error imports-error">{t(`imports.errors.${parseError}`, { defaultValue: t('imports.errors.invalidCsv') })}</p>}
      {requestError && <p className="error imports-error">{t('imports.requestFailed')}</p>}
      <div className="imports-actions"><span>{t('imports.recordsLoaded', { count: records.length })}</span><button className="primary" disabled={!records.length || loading} onClick={() => void preview()}>{loading ? t('imports.analyzing') : t('imports.preview')}<SearchCheck size={16} /></button></div>
    </section>
    {result && <section className="lead-list-panel imports-results">
      <div className="lead-list-toolbar"><div><h3>{t('imports.results')}</h3><p>{t('imports.resultsHint', { count: result.records.length })}</p></div><AlertTriangle size={18} /></div>
      <div className="imports-summary">{Object.entries(counts).map(([status, count]) => <div key={status}><strong>{count}</strong><span>{t(`imports.status.${status}`)}</span></div>)}</div>
      <div className="imports-table-wrap"><table className="imports-table"><thead><tr>{['source', 'record', 'target', 'status', 'candidates'].map((key) => <th key={key}>{t(`imports.columns.${key}`)}</th>)}</tr></thead><tbody>{result.records.map((record, index) => <tr key={`${record.recordType}-${record.externalId}-${index}`}><td><strong>{record.externalId}</strong><small>{record.recordType}{record.sourceStatus ? ` · ${record.sourceStatus}` : ''}</small></td><td>{t(`imports.targetType.${record.targetType}`)}</td><td>{record.linkedTarget ? `${t(`imports.targetType.${record.linkedTarget.targetType}`)} · ${record.linkedTarget.targetId}` : '—'}</td><td><span className={`imports-status ${record.status}`}>{t(`imports.status.${record.status}`)}</span></td><td>{record.candidates.length ? record.candidates.map((candidate) => <div className="imports-candidate" key={candidate.targetId}><strong>{candidate.label}</strong><small>{candidate.matchedBy.map((field) => t(`imports.matchField.${field}`)).join(', ')}</small></div>) : '—'}</td></tr>)}</tbody></table></div>
    </section>}
    <div className="imports-footnote"><FileUp size={15} />{t('imports.noWriteNotice')}</div>
  </section>
}
