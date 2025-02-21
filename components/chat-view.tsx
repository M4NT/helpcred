"use client"

import { useEffect, useState } from "react"
import { Send } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Command, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { TransferMenu } from "@/components/transfer-menu"
import { ActionsMenu } from "@/components/actions-menu"
import { AudioRecorder } from "@/components/audio-recorder"
import { FileUpload } from "@/components/file-upload"
import { fetchMessages, sendMessage } from "@/lib/supabase"
import type { Message } from "@/types"

interface ChatViewProps {
  chatId: string
}

export function ChatView({ chatId }: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [commandOpen, setCommandOpen] = useState(false)
  const [newMessage, setNewMessage] = useState("")

  useEffect(() => {
    const loadMessages = async () => {
      const data = await fetchMessages(chatId)
      setMessages(data)
    }
    loadMessages()
  }, [chatId])

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return

    await sendMessage({
      chatId,
      content: newMessage,
      type: "text",
      sender: "agent",
    })

    setNewMessage("")
  }

  const handleAudioComplete = async (blob: Blob) => {
    const file = new File([blob], "audio.webm", { type: "audio/webm" })
    // Handle audio upload and sending
  }

  const handleFileUpload = async (url: string, name: string, size: number) => {
    await sendMessage({
      chatId,
      content: url,
      type: "file",
      fileName: name,
      fileSize: size,
      sender: "agent",
    })
  }

  return (
    <>
      {/* Chat Header */}
      <div className="border-b p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarImage src="/placeholder.svg" />
            <AvatarFallback>CL</AvatarFallback>
          </Avatar>
          <div>
            <div className="font-medium">Cliente Atual</div>
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              Atendente: João Silva
              <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs">Em Atendimento</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <TransferMenu />
          <ActionsMenu />
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div key={message.id} className={`flex gap-3 ${message.sender === "agent" ? "justify-end" : ""}`}>
            {message.sender === "customer" && (
              <Avatar className="h-8 w-8">
                <AvatarImage src="/placeholder.svg" />
                <AvatarFallback>CL</AvatarFallback>
              </Avatar>
            )}
            <div
              className={`rounded-lg p-3 max-w-[80%] ${
                message.sender === "agent" ? "bg-primary text-primary-foreground" : "bg-accent"
              }`}
            >
              {message.type === "text" && message.content}
              {message.type === "file" && (
                <a
                  href={message.content}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 hover:underline"
                >
                  📎 {message.fileName}
                  <span className="text-xs opacity-70">({Math.round(message.fileSize! / 1024)}KB)</span>
                </a>
              )}
              {message.type === "audio" && <audio controls src={message.content} className="max-w-full" />}
            </div>
            {message.sender === "agent" && (
              <Avatar className="h-8 w-8">
                <AvatarImage src="/placeholder.svg" />
                <AvatarFallback>AG</AvatarFallback>
              </Avatar>
            )}
          </div>
        ))}
      </div>

      {/* Message Input */}
      <div className="border-t p-4">
        <div className="relative">
          {commandOpen && (
            <Card className="absolute bottom-full mb-1 w-80">
              <Command>
                <CommandInput placeholder="Buscar gatilhos..." />
                <CommandList>
                  <CommandItem>Saudação Inicial</CommandItem>
                  <CommandItem>Solicitar Pedido</CommandItem>
                  <CommandItem>Finalizar Atendimento</CommandItem>
                </CommandList>
              </Command>
            </Card>
          )}
          <div className="flex items-center gap-2">
            <Input
              placeholder="Digite sua mensagem..."
              className="flex-1"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "/" && !commandOpen) {
                  setCommandOpen(true)
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleSendMessage()
                }
              }}
              onBlur={() => setCommandOpen(false)}
            />
            <AudioRecorder onRecordingComplete={handleAudioComplete} />
            <FileUpload onFileUpload={handleFileUpload} />
            <Button onClick={handleSendMessage}>
              <Send className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}

