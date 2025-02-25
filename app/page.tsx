"use client"

import { useState, useEffect } from "react"
import { AppShell } from "@/components/app-shell"

export default function Page() {
  const [mounted, setMounted] = useState(false)
  
  useEffect(() => {
    setMounted(true)
  }, [])
  
  // Não renderiza nada no servidor, apenas no cliente
  if (!mounted) {
    return null
  }
  
  return <AppShell />
}

