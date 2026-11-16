import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import './Breadcrumbs.css'

export type BreadcrumbItem = {
  label: string
  href?: string
}

export function Breadcrumbs({ items, label }: { items: BreadcrumbItem[]; label: string }) {
  if (items.length === 0) return null

  return <nav className="breadcrumbs" aria-label={label}>
    <ol>
      {items.map((item, index) => {
        const current = index === items.length - 1
        return <li key={`${item.label}-${index}`}>
          {index > 0 && <ChevronRight size={14} aria-hidden="true" />}
          {item.href && !current
            ? <Link to={item.href}>{item.label}</Link>
            : <span aria-current={current ? 'page' : undefined}>{item.label}</span>}
        </li>
      })}
    </ol>
  </nav>
}
