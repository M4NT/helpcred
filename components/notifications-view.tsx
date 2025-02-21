"use client"

import { MessageSquare, UserPlus } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function NotificationsView() {
  return (
    <div className="flex-1 p-6 overflow-auto">
      <h1 className="text-2xl font-bold mb-6">Notificações</h1>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">Todas</TabsTrigger>
          <TabsTrigger value="messages">Mensagens</TabsTrigger>
          <TabsTrigger value="transfers">Transferências</TabsTrigger>
        </TabsList>
        <TabsContent value="all">
          <Card>
            <CardHeader>
              <CardTitle>Notificações Recentes</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px] pr-4">
                {[...Array(10)].map((_, i) => (
                  <div key={i} className="flex items-start space-x-4 mb-4 p-3 rounded-lg hover:bg-accent">
                    {i % 2 === 0 ? (
                      <MessageSquare className="h-5 w-5 mt-1 text-primary" />
                    ) : (
                      <UserPlus className="h-5 w-5 mt-1 text-primary" />
                    )}
                    <div>
                      <p className="font-medium">{i % 2 === 0 ? "Nova mensagem de Cliente" : "Conversa transferida"}</p>
                      <p className="text-sm text-muted-foreground">
                        {i % 2 === 0
                          ? "O cliente João enviou uma nova mensagem."
                          : "Maria transferiu uma conversa para você."}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">há 5 minutos</p>
                    </div>
                  </div>
                ))}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

