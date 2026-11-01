import { Link } from 'react-router'

import { Button } from '@/components/ui/Button'

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center py-20 text-center">
      <p className="text-6xl font-bold text-slate-200 dark:text-slate-700">404</p>
      <h1 className="mt-2 text-lg font-semibold">Page not found</h1>
      <p className="mt-1 text-sm text-slate-500">The page you're looking for doesn't exist.</p>
      <Link to="/" className="mt-6">
        <Button>Back to dashboard</Button>
      </Link>
    </div>
  )
}
