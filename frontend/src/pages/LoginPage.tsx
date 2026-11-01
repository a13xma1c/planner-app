import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'

import { useLogin } from '@/api/queries'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { PasswordField } from '@/components/auth/PasswordField'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { nextPath } from '@/lib/navigation'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const login = useLogin({
    onSuccess: () => navigate(nextPath(location.search), { replace: true }),
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    login.mutate({ email, password })
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your planner.">
      <form onSubmit={submit} className="space-y-4" data-testid="login-form">
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <PasswordField
          id="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          showStrength={false}
        />
        {login.error && (
          <p role="alert" className="text-sm text-rose-600">
            {login.error.message}
          </p>
        )}
        <Button type="submit" className="w-full" loading={login.isPending}>
          Sign in
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">
        No account yet?{' '}
        <Link
          to={`/register${location.search}`}
          className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
        >
          Create one
        </Link>
      </p>
    </AuthLayout>
  )
}
