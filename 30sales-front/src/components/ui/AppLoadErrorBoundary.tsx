import { Component, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import './AppLoadErrorBoundary.css'

type BoundaryState = { hasError: boolean }
type BoundaryProps = { children: ReactNode; title: string; description: string; reloadLabel: string }

class Boundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { hasError: false }

  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return <main className="app-load-error" role="alert">
        <section>
          <img className="app-load-error-illustration" src="/illustrations/support-recovery.webp" alt="" aria-hidden="true" />
          <h1>{this.props.title}</h1>
          <p>{this.props.description}</p>
          <button className="app-load-error-reload" type="button" onClick={() => window.location.reload()}>{this.props.reloadLabel}</button>
        </section>
      </main>
    }

    return this.props.children
  }
}

export function AppLoadErrorBoundary({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  return <Boundary title={t('common.loadErrorTitle')} description={t('common.loadErrorDescription')} reloadLabel={t('common.reloadPage')}>
    {children}
  </Boundary>
}
