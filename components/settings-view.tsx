"use client"

import { useState } from "react"
import { Check, Loader2, Plus, Trash } from "lucide-react"

import { useConfig } from "@/components/providers"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/use-toast"
import { initSupabase } from "@/lib/supabase"
import type { Company } from "@/types"

export function SettingsView() {
  const { config, setConfig, isConfigValid, setIsConfigValid } = useConfig()
  const [isTestingSupabase, setIsTestingSupabase] = useState(false)
  const [companies, setCompanies] = useState<Company[]>([])
  const { toast } = useToast()

  const testSupabaseConnection = async () => {
    setIsTestingSupabase(true)
    try {
      const supabase = initSupabase(config.supabaseUrl, config.supabaseKey)
      const { data, error } = await supabase.from("profiles").select("count")
      if (error) throw error

      setIsConfigValid({ supabase: true })
      toast({
        title: "Conexão Supabase estabelecida",
        description: "As credenciais do Supabase foram validadas com sucesso.",
      })
    } catch (error) {
      setIsConfigValid({ supabase: false })
      toast({
        title: "Erro na conexão Supabase",
        description: "Verifique suas credenciais e tente novamente.",
        variant: "destructive",
      })
    } finally {
      setIsTestingSupabase(false)
    }
  }

  const addCompany = () => {
    setCompanies([
      ...companies,
      {
        id: Date.now().toString(),
        name: "",
        whatsappNumber: "",
        whatsappToken: "",
      },
    ])
  }

  const removeCompany = (id: string) => {
    setCompanies(companies.filter((company) => company.id !== id))
  }

  const updateCompany = (id: string, updates: Partial<Company>) => {
    setCompanies(companies.map((company) => (company.id === id ? { ...company, ...updates } : company)))
  }

  return (
    <div className="flex-1 p-6 overflow-auto">
      <h1 className="text-2xl font-bold mb-6">Configurações</h1>

      <Tabs defaultValue="apis">
        <TabsList>
          <TabsTrigger value="apis">APIs</TabsTrigger>
          <TabsTrigger value="profile">Perfil</TabsTrigger>
          <TabsTrigger value="notifications">Notificações</TabsTrigger>
        </TabsList>

        <TabsContent value="apis">
          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Configuração Supabase</CardTitle>
                <CardDescription>Configure suas credenciais do Supabase para armazenamento de dados.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>URL do Projeto</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="https://xxx.supabase.co"
                      value={config.supabaseUrl}
                      onChange={(e) => setConfig({ supabaseUrl: e.target.value })}
                      className={isConfigValid.supabase ? "border-green-500 focus-visible:ring-green-500" : ""}
                    />
                    <Button onClick={testSupabaseConnection} disabled={isTestingSupabase}>
                      {isTestingSupabase ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : isConfigValid.supabase ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        "Testar"
                      )}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Chave Anon</Label>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      placeholder="sua-chave-anon"
                      value={config.supabaseKey}
                      onChange={(e) => setConfig({ supabaseKey: e.target.value })}
                      className={isConfigValid.supabase ? "border-green-500 focus-visible:ring-green-500" : ""}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Configuração WhatsApp</CardTitle>
                  <CardDescription>Configure suas integrações com a API do WhatsApp.</CardDescription>
                </div>
                <Button onClick={addCompany} variant="outline" size="icon">
                  <Plus className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-6">
                {companies.map((company) => (
                  <div key={company.id} className="space-y-4 p-4 border rounded-lg relative">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2"
                      onClick={() => removeCompany(company.id)}
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                    <div className="space-y-2">
                      <Label>Nome da Empresa</Label>
                      <Input
                        placeholder="Nome da empresa"
                        value={company.name}
                        onChange={(e) => updateCompany(company.id, { name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Número do WhatsApp</Label>
                      <Input
                        placeholder="+5511999999999"
                        value={company.whatsappNumber}
                        onChange={(e) => updateCompany(company.id, { whatsappNumber: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Token de Acesso</Label>
                      <Input
                        type="password"
                        placeholder="Token do WhatsApp"
                        value={company.whatsappToken}
                        onChange={(e) => updateCompany(company.id, { whatsappToken: e.target.value })}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Other tabs content remains the same */}
      </Tabs>
    </div>
  )
}

