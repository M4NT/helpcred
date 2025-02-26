"use client"

import { useState, useEffect } from "react"
import { ChatView } from "@/components/chat-view"
import { ConversationList } from "@/components/conversation-list"
import { supabase, getCurrentUser } from "@/lib/supabase"
import { toast } from "@/components/ui/use-toast"
import { MessageSquare } from "lucide-react"

export function Conversation({ userId }: { userId?: string | null }) {
  const [selectedConversation, setSelectedConversation] = useState<{
    id: string;
    name: string;
    email: string;
    avatar?: string;
  } | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(userId || null)
  const [isUserLoaded, setIsUserLoaded] = useState(Boolean(userId))
  const [mounted, setMounted] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [isConversationViewForced, setIsConversationViewForced] = useState(false)

  // Função para persistir o ID do usuário
  const persistUserId = (id: string) => {
    if (typeof window !== 'undefined') {
      try {
        console.log("[AUTH DEBUG] Persistindo ID do usuário:", id);
        localStorage.setItem('currentUserId', id);
      } catch (err) {
        console.error("[AUTH DEBUG] Erro ao persistir ID do usuário:", err);
      }
    }
  };

  // Função para recuperar o ID do usuário do localStorage
  const getPersistedUserId = (): string | null => {
    if (typeof window !== 'undefined') {
      try {
        const id = localStorage.getItem('currentUserId');
        if (id) {
          console.log("[AUTH DEBUG] Recuperado ID de usuário do localStorage:", id);
          return id;
        }
      } catch (err) {
        console.error("[AUTH DEBUG] Erro ao recuperar ID do usuário:", err);
      }
    }
    return null;
  };

  // Função para verificar e obter o usuário atual
  const checkCurrentUser = async () => {
    try {
      console.log("[AUTH DEBUG] Verificando usuário atual...");
      
      // Primeiro, tentar obter do localStorage
      const cachedUserId = getPersistedUserId();
      if (cachedUserId) {
        console.log("[AUTH DEBUG] Usando ID de usuário em cache:", cachedUserId);
        setCurrentUserId(cachedUserId);
        setIsUserLoaded(true);
        return cachedUserId;
      }
      
      // Se não estiver em cache, buscar da API
      const user = await getCurrentUser();
      if (user) {
        console.log("[AUTH DEBUG] Usuário encontrado na API:", user.id);
        setCurrentUserId(user.id);
        persistUserId(user.id);
        setIsUserLoaded(true);
        setAuthError(null);
        return user.id;
      } else {
        console.warn("[AUTH DEBUG] Nenhum usuário encontrado");
        setCurrentUserId(null);
        setIsUserLoaded(true);
        setAuthError("Usuário não está autenticado");
        return null;
      }
    } catch (error) {
      console.error("[AUTH DEBUG] Erro ao verificar usuário:", error);
      setIsUserLoaded(true);
      setAuthError("Erro ao verificar autenticação");
      return null;
    }
  };

  useEffect(() => {
    // Marcar que estamos no cliente e componente está montado
    setMounted(true)
    
    // Verificar se temos uma conversa no localStorage
    if (typeof window !== 'undefined') {
      try {
        const savedConversation = localStorage.getItem('lastSelectedConversation');
        if (savedConversation) {
          const parsedConversation = JSON.parse(savedConversation);
          console.log("[CONV DEBUG] Encontrada conversa salva:", parsedConversation);
          setSelectedConversation(parsedConversation);
        }
      } catch (err) {
        console.error("[CONV DEBUG] Erro ao carregar conversa salva:", err);
      }
    }
    
    // Se o userId já foi fornecido como prop, não precisamos buscar
    if (userId) {
      console.log("[AUTH DEBUG] Usando ID de usuário fornecido via props:", userId);
      setCurrentUserId(userId);
      persistUserId(userId);
      setIsUserLoaded(true);
      setAuthError(null);
      return;
    }
    
    // Verificar usuário atual
    checkCurrentUser();
    
    // Configurar listener para mudanças de autenticação
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        console.log("[AUTH DEBUG] Evento de autenticação:", event, "- Usuário:", session.user.id);
        setCurrentUserId(session.user.id);
        persistUserId(session.user.id);
        setAuthError(null);
      } else {
        console.warn("[AUTH DEBUG] Evento de autenticação sem usuário:", event);
        setCurrentUserId(null);
        setAuthError("Usuário não está autenticado");
      }
      setIsUserLoaded(true);
    });
    
    return () => {
      authListener?.subscription.unsubscribe();
    }
  }, [userId]);

  // Adicionar efeito para verificar periodicamente a autenticação quando o app está visível
  useEffect(() => {
    if (!mounted) return;
    
    // Verificar a cada 30 segundos quando o documento estiver visível
    const checkInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        checkCurrentUser();
      }
    }, 30000);
    
    // Verificar quando o documento fica visível
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkCurrentUser();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      clearInterval(checkInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [mounted]);

  const handleSelectConversation = async (conversationId: string, conversationData: any) => {
    console.log("[CONV DEBUG] Recebido pedido para selecionar conversa:", conversationId);
    
    if (!conversationId || conversationId === "undefined") {
      console.error("[CONV DEBUG] ID da conversa não fornecido ou inválido");
      return;
    }
    
    if (!conversationData || typeof conversationData !== 'object') {
      console.error("[CONV DEBUG] Dados da conversa inválidos:", conversationData);
      return;
    }
    
    // Verificar se temos um ID de usuário válido
    let userId = currentUserId;
    
    if (!userId) {
      console.warn("[AUTH DEBUG] Usuário não definido, tentando obter novamente...");
      // Tentar obter o usuário novamente
      userId = await checkCurrentUser();
      
      if (!userId) {
        console.error("[AUTH DEBUG] Não foi possível obter usuário para selecionar conversa");
        toast({
          title: "Erro de autenticação",
          description: "Você precisa estar logado para acessar conversas. Faça login e tente novamente.",
          variant: "destructive"
        });
        return;
      }
    }
    
    console.log("[CONV DEBUG] Definindo conversa selecionada com ID:", conversationId);
    
    // Garantir que os valores nunca sejam undefined
    const conversationToSave = {
      id: conversationId,
      name: conversationData.name || "Usuário",
      email: conversationData.email || "",
      avatar: conversationData.avatar || null
    };
    
    // Salvar a conversa no localStorage para persistência
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('lastSelectedConversation', JSON.stringify(conversationToSave));
      } catch (err) {
        console.error("[CONV DEBUG] Erro ao salvar conversa:", err);
      }
    }
    
    setSelectedConversation(conversationToSave);
    
    // Forçar a exibição da visualização de conversa
    setIsConversationViewForced(true);
    
    console.log("[CONV DEBUG] Conversa selecionada com sucesso:", conversationId);
  }

  // Usando o padrão de renderização dinâmica para evitar problemas de hidratação
  if (!mounted) {
    return null // Não renderizar nada no servidor
  }

  const isReadyToRenderChat = mounted && isUserLoaded && currentUserId && selectedConversation && selectedConversation.id;

  return (
    <div className="flex h-full" suppressHydrationWarning>
      <ConversationList onSelectConversation={handleSelectConversation} key={currentUserId || 'no-user'} />
      <div className="flex-1 flex flex-col">
        {isReadyToRenderChat ? (
          <ChatView
            chatId={selectedConversation.id}
            currentUserId={currentUserId}
            recipientName={selectedConversation.name}
            recipientEmail={selectedConversation.email}
            recipientAvatar={selectedConversation.avatar}
            key={`${currentUserId}-${selectedConversation.id}`}
          />
        ) : (
          <div className="flex-1 flex justify-center items-center bg-gradient-to-b from-background to-muted/10">
            <div className="text-center max-w-md p-8 animate-in fade-in duration-500">
              <div className="flex justify-center mb-6">
                <div className="rounded-full bg-primary/10 p-4">
                  <MessageSquare className="h-8 w-8 text-primary" />
                </div>
              </div>
              <h2 className="text-xl font-semibold mb-3">
                {authError ? "Autenticação necessária" : "Suas conversas"}
              </h2>
              <p className="text-muted-foreground text-sm">
                {authError 
                  ? "Faça login para acessar suas conversas."
                  : "Selecione uma conversa existente ou inicie uma nova pelo menu lateral."}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
} 