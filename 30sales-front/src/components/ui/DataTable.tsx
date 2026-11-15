import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { WorkspaceState } from './WorkspaceState'
import './DataTable.css'

export type DataTableColumn<T, SortKey extends string> = {
  id: SortKey
  label: string
  render: (row: T) => ReactNode
}

export type DataTableProps<T, SortKey extends string> = {
  rows: T[]
  columns: DataTableColumn<T, SortKey>[]
  getRowId: (row: T) => string
  sort: { key: SortKey; direction: 'asc' | 'desc' }
  onSortChange: (key: SortKey, direction: 'asc' | 'desc') => void
  pagination: { limit: number; offset: number; total: number; hasNextPage: boolean }
  onPageChange: (offset: number) => void
  onPageSizeChange: (limit: number) => void
  filters?: ReactNode
  loading?: boolean
  emptyState: ReactNode
  emptyStateKind?: 'empty' | 'error'
}

export function DataTable<T, SortKey extends string>({ rows, columns, getRowId, sort, onSortChange, pagination, onPageChange, onPageSizeChange, filters, loading = false, emptyState, emptyStateKind = 'empty' }: DataTableProps<T, SortKey>) {
  const { t } = useTranslation()
  const page = Math.floor(pagination.offset / pagination.limit)
  const firstItem = pagination.total === 0 ? 0 : pagination.offset + 1
  const lastItem = Math.min(pagination.offset + pagination.limit, pagination.total)
  const pageCount = Math.max(1, Math.ceil(pagination.total / pagination.limit))

  const changeSort = (key: SortKey) => {
    const direction = sort.key === key && sort.direction === 'asc' ? 'desc' : 'asc'
    onSortChange(key, direction)
  }

  return <div className="data-table" aria-busy={loading}>
    {filters && <div className="data-table-filters">{filters}</div>}
    {loading && rows.length > 0 && <WorkspaceState kind="stale" compact message={t('table.refreshingResults')} detail={t('table.showingPreviousResults')} />}
    <div className="data-table-scroll"><table>
      <thead><tr>{columns.map((column) => {
        const active = sort.key === column.id
        const ariaSort = active ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'
        const SortIcon = active ? sort.direction === 'asc' ? ArrowUp : ArrowDown : ArrowUpDown
        return <th key={column.id} scope="col" aria-sort={ariaSort}><button className="data-table-sort" type="button" disabled={loading} onClick={() => changeSort(column.id)} aria-label={t('table.sortBy', { column: column.label, direction: t(`table.${sort.direction}`) })}>{column.label}<SortIcon size={14} aria-hidden="true" /></button></th>
      })}</tr></thead>
      <tbody>
        {loading && rows.length === 0 ? <tr><td colSpan={columns.length} className="data-table-state"><WorkspaceState kind="loading" compact message={t('common.loading')} /></td></tr> : rows.length === 0 ? <tr><td colSpan={columns.length} className="data-table-state"><WorkspaceState kind={emptyStateKind} showIcon={false} compact>{emptyState}</WorkspaceState></td></tr> : rows.map((row) => <tr key={getRowId(row)}>{columns.map((column) => <td key={column.id}>{column.render(row)}</td>)}</tr>)}
      </tbody>
    </table></div>
    <footer className="data-table-footer">
      <span className="data-table-range">{t('table.range', { from: firstItem, to: lastItem, total: pagination.total })}</span>
      <label className="data-table-page-size">{t('table.rowsPerPage')}<select value={pagination.limit} disabled={loading} onChange={(event) => onPageSizeChange(Number(event.target.value))} aria-label={t('table.rowsPerPage')}>
        {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
      </select></label>
      <span className="data-table-page-label">{t('table.page', { page: page + 1, pages: pageCount })}</span>
      <div className="data-table-page-controls">
        <button type="button" onClick={() => onPageChange(Math.max(0, pagination.offset - pagination.limit))} disabled={loading || pagination.offset === 0} aria-label={t('table.previous')}><ChevronLeft size={16} /></button>
        <button type="button" onClick={() => onPageChange(pagination.offset + pagination.limit)} disabled={loading || !pagination.hasNextPage} aria-label={t('table.next')}><ChevronRight size={16} /></button>
      </div>
    </footer>
  </div>
}
