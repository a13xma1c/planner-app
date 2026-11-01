import { useMemo, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'

import { useRegister } from '@/api/queries'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { PasswordField } from '@/components/auth/PasswordField'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { nextPath } from '@/lib/navigation'
import { evaluatePassword } from '@/lib/password'

export function RegisterPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const register = useRegister({
    onSuccess: () => navigate(nextPath(location.search), { replace: true }),
  })
  const context = useMemo(() => ({ email, displayName: name }), [email, name])
  const report = useMemo(() => evaluatePassword(password, context), [password, context])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!report.ok) return
    register.mutate({ display_name: name, email, password })
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="You'll get a personal planner, and you can share planners with others."
    >
      <form onSubmit={submit} className="space-y-4" data-testid="register-form">
        <Field label="Your name" htmlFor="name">
          <Input
            id="name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={100}
          />
        </Field>
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
          report={report}
          context={context}
        />
        {register.error && (
          <p role="alert" className="text-sm text-rose-600">
            {register.error.message}
          </p>
        )}
        <Button type="submit" className="w-full" loading={register.isPending} disabled={!report.ok}>
          Create account
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">
        Already have an account?{' '}
        <Link
          to={`/login${location.search}`}
          className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
        >
          Sign in
        </Link>
      </p>
    </AuthLayout>
  )
}
