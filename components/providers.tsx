"use client"

import type React from "react"

import { createContext, useContext, useState } from "react"

type Config = {
  supabaseUrl: string
  supabaseKey: string
  whatsappToken: string
}

type ConfigContextType = {
  config: Config
  setConfig: (config: Partial<Config>) => void
  isConfigValid: {
    supabase: boolean
    whatsapp: boolean
  }
  setIsConfigValid: (valid: Partial<{ supabase: boolean; whatsapp: boolean }>) => void
}

const ConfigContext = createContext<ConfigContextType | null>(null)

export function useConfig() {
  const context = useContext(ConfigContext)
  if (!context) throw new Error("useConfig must be used within a ConfigProvider")
  return context
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [config, setConfigState] = useState<Config>({
    supabaseUrl: "",
    supabaseKey: "",
    whatsappToken: "",
  })

  const [isConfigValid, setIsConfigValidState] = useState({
    supabase: false,
    whatsapp: false,
  })

  const setConfig = (newConfig: Partial<Config>) => {
    setConfigState((prev) => ({ ...prev, ...newConfig }))
  }

  const setIsConfigValid = (valid: Partial<{ supabase: boolean; whatsapp: boolean }>) => {
    setIsConfigValidState((prev) => ({ ...prev, ...valid }))
  }

  return (
    <ConfigContext.Provider value={{ config, setConfig, isConfigValid, setIsConfigValid }}>
      {children}
    </ConfigContext.Provider>
  )
}

