import { useState, useEffect } from "react"
import { useRouter } from "next/router"
import { supabase } from "@/lib/supabase"

export function Auth() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isRegister, setIsRegister] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const session = supabase.auth.session()
    if (session) {
      const now = new Date().getTime()
      const sessionExpiry = new Date(session.expires_at * 1000).getTime()
      if (sessionExpiry > now) {
        setIsLoggedIn(true)
        router.push("/")
      } else {
        supabase.auth.signOut()
      }
    }
  }, [router])

  const handleAuth = async () => {
    let error
    if (isRegister) {
      ({ error } = await supabase.auth.signUp({ email, password }))
    } else {
      ({ error } = await supabase.auth.signIn({ email, password }))
    }

    if (error) {
      console.error("Erro de autenticação:", error.message)
    } else {
      const session = supabase.auth.session()
      if (session) {
        localStorage.setItem("supabase.auth.token", session.access_token)
        setIsLoggedIn(true)
        router.push("/")
      }
    }
  }

  if (isLoggedIn) {
    return <div>Você está logado!</div>
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <div className="bg-white p-6 rounded shadow-md w-80">
        <h2 className="text-2xl font-bold mb-4">{isRegister ? "Registrar" : "Login"}</h2>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-2 mb-4 border rounded"
        />
        <input
          type="password"
          placeholder="Senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full p-2 mb-4 border rounded"
        />
        <button onClick={handleAuth} className="w-full bg-blue-500 text-white p-2 rounded">
          {isRegister ? "Registrar" : "Login"}
        </button>
        <button onClick={() => setIsRegister(!isRegister)} className="w-full mt-2 text-blue-500">
          {isRegister ? "Já tem uma conta? Login" : "Não tem uma conta? Registrar"}
        </button>
      </div>
    </div>
  )
} 