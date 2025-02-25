"use client"

import { useEffect, useState, useRef } from "react"
import { Send, Copy, PaperclipIcon } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Command, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { TransferMenu } from "@/components/transfer-menu"
import { ActionsMenu } from "@/components/actions-menu"
import { AudioRecorder } from "@/components/audio-recorder"
import { FileUpload } from "@/components/file-upload"
import { fetchMessages, sendMessage, supabase } from "@/lib/supabase"
import type { Message } from "@/types"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"

interface ChatViewProps {
  chatId: string
  currentUserId: string
  recipientName: string
  recipientEmail: string
  recipientAvatar?: string
}

// Componente separado para exibir o tempo da mensagem
function MessageTime({ timestamp }: { timestamp: string | Date }) {
  const [formattedTime, setFormattedTime] = useState<string>("")
  const [mounted, setMounted] = useState(false)
  
  useEffect(() => {
    setMounted(true)
    
    const formatDate = () => {
      try {
        const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp
        const timeAgo = formatDistanceToNow(date, { locale: ptBR, addSuffix: true })
        setFormattedTime(timeAgo)
      } catch (error) {
        console.error("Erro ao formatar data:", error)
        setFormattedTime("")
      }
    }
    
    formatDate()
    
    // Atualizar a formatação a cada minuto
    const interval = setInterval(formatDate, 60000)
    return () => clearInterval(interval)
  }, [timestamp])
  
  // Não renderizar nada no servidor
  if (!mounted) return null
  
  return (
    <div className="text-xs text-muted-foreground mt-1 px-1" suppressHydrationWarning>
      {formattedTime}
    </div>
  )
}

export function ChatView({ 
  chatId, 
  currentUserId, 
  recipientName = "Usuário",
  recipientEmail = "",
  recipientAvatar 
}: ChatViewProps) {
  // Adicionar logs iniciais para verificar as props
  useEffect(() => {
    console.log("ChatView iniciado com os seguintes parâmetros:");
    console.log("- chatId:", chatId);
    console.log("- currentUserId:", currentUserId);
    console.log("- recipientName:", recipientName);
    console.log("- recipientEmail:", recipientEmail);
    
    // Verificação de parâmetros obrigatórios
    if (!chatId) {
      console.error("ERRO CRÍTICO: ChatView iniciado sem chatId");
    }
    
    if (!currentUserId) {
      console.error("ERRO CRÍTICO: ChatView iniciado sem currentUserId");
    }
  }, [chatId, currentUserId, recipientName, recipientEmail]);

  const [messages, setMessages] = useState<Message[]>([])
  const [commandOpen, setCommandOpen] = useState(false)
  const [newMessage, setNewMessage] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [initialLoadAttempted, setInitialLoadAttempted] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null)
  const chatIdRef = useRef<string | null>(null)
  const currentUserIdRef = useRef<string | null>(null)

  // Garantir que temos referências atualizadas para usar em timers assíncronos
  useEffect(() => {
    chatIdRef.current = chatId;
    currentUserIdRef.current = currentUserId;
  }, [chatId, currentUserId]);

  // Efeito para inicialização do componente e gestão de ciclo de vida
  useEffect(() => {
    setMounted(true);
    
    return () => {
      // Limpar todos os timers ao desmontar
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    // Marcar que estamos no cliente
    setMounted(true)
    
    // Resetar contagem de tentativas e erro ao mudar de conversa
    setRetryCount(0);
    setLoadError(null);
    setInitialLoadAttempted(false);
    
    // Resetar estado quando a conversa muda
    if (chatId !== undefined) {
      setRetryCount(0);
      setLoadError(null);
      setInitialLoadAttempted(false);
      setIsLoading(true);
      
      // Cancelar qualquer timer de retry existente
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    }
    
    const loadMessages = async () => {
      // Verificações críticas - nenhuma operação deve prosseguir sem estes parâmetros
      if (!chatIdRef.current || !currentUserIdRef.current) {
        console.error("Não é possível carregar mensagens: parâmetros críticos ausentes", 
                    { chatId: chatIdRef.current, currentUserId: currentUserIdRef.current });
        setIsLoading(false);
        setLoadError("Parâmetros obrigatórios não fornecidos");
        setInitialLoadAttempted(true);
        return;
      }
      
      try {
        console.log(`Carregando mensagens para conversa ${chatIdRef.current}...`);
        const data = await fetchMessages(currentUserIdRef.current, chatIdRef.current);
        console.log(`${data?.length || 0} mensagens carregadas para conversa ${chatIdRef.current}`);
        
        // Verificar se o componente ainda está montado para a mesma conversa
        if (chatIdRef.current === chatId) {
          setMessages(data || []);
          setLoadError(null);
          setInitialLoadAttempted(true);
        }
      } catch (error) {
        console.error("Erro ao carregar mensagens:", error);
        
        // Verificar se o componente ainda está montado para a mesma conversa
        if (chatIdRef.current === chatId) {
          setLoadError(`Falha ao carregar mensagens: ${error instanceof Error ? error.message : String(error)}`);
          setInitialLoadAttempted(true);
          
          // Implementar retry com backoff exponencial
          const nextRetryCount = retryCount + 1;
          if (nextRetryCount <= 3) {
            setRetryCount(nextRetryCount);
            const delayMs = Math.min(1000 * Math.pow(2, nextRetryCount - 1), 8000);
            console.log(`Tentando novamente em ${delayMs}ms (tentativa ${nextRetryCount}/3)...`);
            
            retryTimerRef.current = setTimeout(() => {
              if (chatIdRef.current === chatId) {
                loadMessages();
              }
            }, delayMs);
          } else {
            console.error("Número máximo de tentativas excedido");
          }
        }
      } finally {
        if (chatIdRef.current === chatId) {
          setIsLoading(false);
        }
      }
    };
    
    // Só iniciar a carga de mensagens se tivermos os parâmetros essenciais
    if (chatId && currentUserId && mounted) {
      // Pequeno delay para garantir que os estados estejam sincronizados
      setTimeout(() => {
        if (chatIdRef.current === chatId) {
          loadMessages();
        }
      }, 100);
      
      // Configurar listener para novas mensagens
      const messagesSubscription = supabase
        .channel(`messages:${chatId}`)
        .on('postgres_changes', { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'messages',
          filter: `conversation_id=eq.${chatId}`
        }, () => {
          if (chatIdRef.current === chatId) {
            loadMessages();
          }
        })
        .subscribe();
      
      return () => {
        messagesSubscription.unsubscribe();
      };
    } else if (mounted) {
      // Se estamos montados mas sem parâmetros, definir loading como false para mostrar erro
      setIsLoading(false);
      setInitialLoadAttempted(true);
      
      if (!chatId || !currentUserId) {
        console.error("ChatView montado mas parâmetros essenciais ausentes", { chatId, currentUserId });
        setLoadError("ID da conversa ou usuário não definidos");
      }
    }
  }, [chatId, currentUserId, mounted, retryCount]);

  // Rolar para o final quando novas mensagens são carregadas
  useEffect(() => {
    if (messagesEndRef.current && mounted) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, mounted])

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return

    try {
      await sendMessage({
        chatId,
        content: newMessage,
        type: "text",
        sender: "agent", // Assumindo que o usuário atual é um agente
      })
      setNewMessage("")
    } catch (error) {
      console.error("Erro ao enviar mensagem:", error)
    }
  }

  const handleAudioComplete = async (blob: Blob) => {
    try {
      const file = new File([blob], "audio.webm", { type: "audio/webm" })
      
      // Upload do arquivo
      const fileExt = file.name.split(".").pop()
      const fileName = `audio_${Date.now()}.${fileExt}`
      
      const { data, error } = await supabase.storage
        .from("chat-files")
        .upload(fileName, file, {
          cacheControl: "3600",
          upsert: false
        })
      
      if (error) throw error
      
      // Obter URL pública
      const { data: urlData } = supabase.storage
        .from("chat-files")
        .getPublicUrl(fileName)
      
      // Enviar mensagem com o áudio
      await sendMessage({
        chatId,
        content: urlData.publicUrl,
        type: "audio",
        sender: "agent",
        fileName: file.name,
        fileSize: file.size
      })
    } catch (error) {
      console.error("Erro ao enviar áudio:", error)
    }
  }

  const handleFileUpload = async (url: string, name: string, size: number) => {
    try {
      await sendMessage({
        chatId,
        content: url,
        type: "file",
        fileName: name,
        fileSize: size,
        sender: "agent", // Assumindo que o usuário atual é um agente
      })
    } catch (error) {
      console.error("Erro ao enviar arquivo:", error)
    }
  }

  // Renderizar um estado de carregamento até que o componente seja montado no cliente
  if (!mounted) {
    return null
  }
  
  // Renderizar mensagem de erro amigável se os parâmetros críticos estiverem ausentes
  if ((!chatId || !currentUserId) && initialLoadAttempted) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <Card className="w-full max-w-md p-6 shadow-md">
          <h2 className="text-xl font-bold text-red-500 mb-4">Erro ao carregar o chat</h2>
          <p className="mb-4">Parâmetros obrigatórios não fornecidos:</p>
          <ul className="list-disc pl-6 mb-4">
            {!chatId && <li className="mb-2">ID da conversa não definido</li>}
            {!currentUserId && <li className="mb-2">ID do usuário atual não definido</li>}
          </ul>
          <p className="text-sm text-muted-foreground">Por favor, tente novamente ou contate o suporte.</p>
          <Button 
            className="mt-4 w-full" 
            onClick={() => {
              setInitialLoadAttempted(false);
              setRetryCount(0);
              setLoadError(null);
              setIsLoading(true);
              
              // Forçar um refresh do componente
              setTimeout(() => {
                if (chatId && currentUserId) {
                  window.location.reload();
                }
              }, 500);
            }}
          >
            Tentar Novamente
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" suppressHydrationWarning>
      {/* Chat Header */}
      <div className="border-b p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarImage src={recipientAvatar || "/placeholder.svg"} />
            <AvatarFallback>{recipientName ? recipientName[0] : "?"}</AvatarFallback>
          </Avatar>
          <div>
            <div className="font-medium">{recipientName}</div>
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <span>{recipientEmail}</span>
              <Copy 
                className="h-4 w-4 cursor-pointer" 
                onClick={() => {
                  navigator.clipboard.writeText(recipientEmail)
                  // Opcional: mostrar uma notificação de sucesso
                }}
                aria-label="Copiar email"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    navigator.clipboard.writeText(recipientEmail)
                  }
                }}
              />
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
        {isLoading ? (
          <div className="flex justify-center items-center h-full">
            <p>Carregando mensagens...</p>
          </div>
        ) : loadError ? (
          <div className="flex flex-col justify-center items-center h-full">
            <p className="text-red-500 font-bold mb-2">Erro ao carregar mensagens</p>
            <p className="text-center text-sm">{loadError}</p>
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={() => {
                setRetryCount(0);
                setIsLoading(true);
                fetchMessages(currentUserId || "", chatId || "")
                  .then(data => {
                    setMessages(data || []);
                    setLoadError(null);
                  })
                  .catch(err => {
                    setLoadError(`Falha ao carregar mensagens: ${err instanceof Error ? err.message : String(err)}`);
                  })
                  .finally(() => {
                    setIsLoading(false);
                  });
              }}
            >
              Tentar novamente
            </Button>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex justify-center items-center h-full">
            <p>Nenhuma mensagem encontrada. Inicie uma conversa!</p>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <div key={message.id} className={`flex gap-3 ${message.sender === "agent" ? "justify-end" : ""}`}>
                {message.sender !== "agent" && (
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={recipientAvatar || "/placeholder.svg"} />
                    <AvatarFallback>{recipientName ? recipientName[0] : "?"}</AvatarFallback>
                  </Avatar>
                )}
                <div className="flex flex-col max-w-[80%]">
                  <div
                    className={`rounded-lg p-3 ${
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
                        tabIndex={0}
                        aria-label={`Baixar arquivo ${message.fileName}`}
                      >
                        <PaperclipIcon className="h-4 w-4" />
                        <span>{message.fileName}</span>
                        <span className="text-xs opacity-70">({Math.round((message.fileSize || 0) / 1024)}KB)</span>
                      </a>
                    )}
                    {message.type === "audio" && (
                      <audio controls src={message.content} className="max-w-full" />
                    )}
                  </div>
                  {mounted && <MessageTime timestamp={message.timestamp} />}
                </div>
                {message.sender === "agent" && (
                  <Avatar className="h-8 w-8">
                    <AvatarImage src="/placeholder.svg" />
                    <AvatarFallback>AG</AvatarFallback>
                  </Avatar>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
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
            <Button 
              onClick={handleSendMessage}
              aria-label="Enviar mensagem"
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

