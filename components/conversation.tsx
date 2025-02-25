"use client"

import { useState, useEffect } from "react"
import { ChatView } from "@/components/chat-view"
import { ConversationList } from "@/components/conversation-list"
import { supabase } from "@/lib/supabase"

export function Conversation() {
  const [selectedConversation, setSelectedConversation] = useState<{
    id: string;
    name: string;
    email: string;
    avatar?: string;
  } | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isUserLoaded, setIsUserLoaded] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    // Marcar que estamos no cliente e componente está montado
    setMounted(true)
    
    // Função assíncrona para buscar a sessão
    const fetchSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession()
        
        if (error) {
          console.error("Erro ao buscar sessão:", error.message)
          setAuthError("Falha ao autenticar usuário")
          setIsUserLoaded(true)
          return
        }
        
        if (data.session?.user) {
          console.log("Usuário autenticado:", data.session.user.id)
          setCurrentUserId(data.session.user.id)
        } else {
          console.error("Usuário não autenticado")
          setAuthError("Usuário não está autenticado")
        }
        
        setIsUserLoaded(true)
      } catch (err) {
        console.error("Erro inesperado:", err)
        setAuthError("Ocorreu um erro inesperado")
        setIsUserLoaded(true)
      }
    }
    
    fetchSession()
    
    // Configurar listener para mudanças de autenticação
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setCurrentUserId(session.user.id)
        setAuthError(null)
      } else {
        setCurrentUserId(null)
        setAuthError("Usuário não está autenticado")
      }
      setIsUserLoaded(true)
    })
    
    return () => {
      authListener?.subscription.unsubscribe()
    }
  }, [])

  const handleSelectConversation = (conversationId: string, conversationData: any) => {
    console.log("Recebido pedido para selecionar conversa:", conversationId);
    
    if (!conversationId || conversationId === "undefined") {
      console.error("ID da conversa não fornecido ou inválido");
      return;
    }
    
    if (!conversationData || typeof conversationData !== 'object') {
      console.error("Dados da conversa inválidos:", conversationData);
      return;
    }
    
    if (!currentUserId) {
      console.error("Usuário atual não definido, não é possível selecionar a conversa");
      return;
    }
    
    console.log("Definindo conversa selecionada com ID:", conversationId);
    
    // Garantir que os valores nunca sejam undefined
    setSelectedConversation({
      id: conversationId,
      name: conversationData.name || "Usuário",
      email: conversationData.email || "",
      avatar: conversationData.avatar || null
    });
    
    console.log("Conversa selecionada com sucesso:", conversationId);
  }

  // Usando o padrão de renderização dinâmica para evitar problemas de hidratação
  if (!mounted) {
    return null // Não renderizar nada no servidor
  }

  const isReadyToRenderChat = mounted && isUserLoaded && currentUserId && selectedConversation && selectedConversation.id;

  return (
    <div className="flex h-full" suppressHydrationWarning>
      <ConversationList onSelectConversation={handleSelectConversation} />
      <div className="flex-1 flex flex-col">
        {authError ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center p-6">
              <p className="text-red-500 font-bold mb-2">Erro de autenticação</p>
              <p className="text-muted-foreground">{authError}</p>
            </div>
          </div>
        ) : isReadyToRenderChat ? (
          // Usar IIFE para executar logs sem afetar a renderização
          (() => {
            console.log("Renderizando ChatView com parâmetros validados:", {
              id: selectedConversation.id,
              userId: currentUserId,
              name: selectedConversation.name,
              email: selectedConversation.email
            });
            
            return (
              <ChatView
                chatId={selectedConversation.id}
                currentUserId={currentUserId}
                recipientName={selectedConversation.name}
                recipientEmail={selectedConversation.email}
                recipientAvatar={selectedConversation.avatar}
              />
            );
          })()
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">
              {!isUserLoaded 
                ? "Carregando seu perfil..." 
                : !currentUserId 
                  ? "Autenticação necessária para acessar conversas" 
                  : "Selecione uma conversa para começar"}
            </p>
          </div>
        )}
      </div>
    </div>
  )
} 