'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'

const LoginPage = () => {
  const [identifier, setIdentifier] = useState('') // Para email ou nome de usuário
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // Primeiro, tentamos fazer login com o email
      const { error: emailError } = await supabase.auth.signInWithPassword({
        email: identifier,
        password,
      })

      if (emailError) {
        // Se falhar, tentamos buscar o usuário pelo nome de usuário
        const { data, error: userError } = await supabase
          .from('profiles')
          .select('email')
          .eq('username', identifier)
          .single()

        if (userError || !data) {
          throw new Error("Usuário não encontrado.")
        }

        // Agora, tentamos fazer login com o email encontrado
        const { error: loginError } = await supabase.auth.signInWithPassword({
          email: data.email,
          password,
        })

        if (loginError) {
          throw new Error("Senha incorreta ou email não confirmado.")
        }
      }

      router.push('/dashboard') // Redireciona para o dashboard ou outra página
    } catch (error) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 bg-white p-8 rounded-lg shadow">
        <div>
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900">
            Login
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Acesse sua conta na Acme Inc
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          <div className="space-y-4 rounded-md shadow-sm">
            <div>
              <label htmlFor="identifier" className="sr-only">Email ou Nome de Usuário</label>
              <input
                id="identifier"
                name="identifier"
                type="text"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="relative block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                placeholder="Email ou Nome de Usuário"
              />
            </div>

            <div>
              <label htmlFor="password" className="sr-only">Senha</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="relative block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && <div className="text-red-500 text-sm text-center">{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className="group relative flex w-full justify-center rounded-md bg-black py-2 px-3 text-sm font-semibold text-white hover:bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-70"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Não tem uma conta?{' '}
          <Link href="/signup" className="font-medium text-indigo-600 hover:text-indigo-500">
            Crie uma conta
          </Link>
        </p>
      </div>
    </div>
  )
}

export default LoginPage 