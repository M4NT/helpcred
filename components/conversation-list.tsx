"use client"

import { Search } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

function getTimeColor(minutes: number) {
  if (minutes <= 5) return "text-green-500"
  if (minutes <= 15) return "text-yellow-500"
  return "text-red-500"
}

function TimeDisplay({ minutes }: { minutes: number }) {
  return <div className={`text-xs font-medium ${getTimeColor(minutes)}`}>{minutes}min</div>
}

export function ConversationList() {
  return (
    <div className="w-80 border-r">
      <div className="p-4">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar conversas..." className="pl-8" />
        </div>
      </div>
      <Tabs defaultValue="queue">
        <TabsList className="w-full justify-start px-4 h-12">
          <TabsTrigger value="queue">Fila</TabsTrigger>
          <TabsTrigger value="active">Em Atendimento</TabsTrigger>
          <TabsTrigger value="groups">Grupos</TabsTrigger>
        </TabsList>
        <TabsContent value="queue" className="mt-0">
          <div className="flex flex-col">
            {Array.from({ length: 5 }).map((_, i) => (
              <button key={i} className="flex items-center gap-3 p-4 hover:bg-accent text-left">
                <Avatar>
                  <AvatarImage src={`/placeholder.svg?${i}`} />
                  <AvatarFallback>U{i}</AvatarFallback>
                </Avatar>
                <div className="flex-1 overflow-hidden">
                  <div className="font-medium">Cliente {i + 1}</div>
                  <div className="text-sm text-muted-foreground truncate">Última mensagem da conversa...</div>
                </div>
                <TimeDisplay minutes={i * 4 + 3} />
              </button>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="active" className="mt-0">
          <div className="flex flex-col">
            {Array.from({ length: 3 }).map((_, i) => (
              <button key={i} className="flex items-center gap-3 p-4 hover:bg-accent text-left">
                <Avatar>
                  <AvatarImage src={`/placeholder.svg?${i}`} />
                  <AvatarFallback>A{i}</AvatarFallback>
                </Avatar>
                <div className="flex-1 overflow-hidden">
                  <div className="font-medium">Em Atendimento {i + 1}</div>
                  <div className="text-sm text-muted-foreground truncate">Atendente: João Silva</div>
                </div>
                <TimeDisplay minutes={i * 8 + 4} />
              </button>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

