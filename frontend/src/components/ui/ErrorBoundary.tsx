import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'

import { Button } from './Button'

interface Props {
  children: ReactNode
  /** Rendered instead of the default panel. */
  fallback?: (error: Error, reset: () => void) => ReactNode
  /** Reset the boundary when this value changes (e.g. the route). */
  resetKey?: unknown
}

interface State {
  error: Error | null
}

/**
 * Catches render errors so one broken screen doesn't blank the whole app.
 * Offers "Try again" (re-renders the subtree) and "Reload".
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled render error', error, info.componentStack)
  }

  override componentDidUpdate(prev: Props): void {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.reset()
  }

  reset = (): void => this.setState({ error: null })

  override render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    if (this.props.fallback) return this.props.fallback(error, this.reset)
    return (
      <div
        role="alert"
        className="mx-auto my-10 max-w-md rounded-xl border border-rose-200 bg-rose-50 p-6 text-center dark:border-rose-500/30 dark:bg-rose-500/10"
        data-testid="error-boundary"
      >
        <AlertTriangle className="mx-auto h-8 w-8 text-rose-500" />
        <h2 className="mt-3 text-base font-semibold text-slate-900 dark:text-white">
          Something went wrong
        </h2>
        <p className="mt-1 break-words text-sm text-slate-600 dark:text-slate-300">
          {error.message}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="outline" onClick={this.reset}>
            <RotateCcw className="h-4 w-4" /> Try again
          </Button>
          <Button onClick={() => window.location.reload()}>Reload</Button>
        </div>
      </div>
    )
  }
}
