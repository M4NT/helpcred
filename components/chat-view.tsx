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
import { toast } from "@/components/ui/use-toast"

// Atualização do tipo Message para incluir receiverId
interface LocalMessage extends Omit<Message, 'receiverId'> {
  receiverId?: string | null
}

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
    
    try {
      const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp
      const timeAgo = formatDistanceToNow(date, { locale: ptBR, addSuffix: true })
      setFormattedTime(timeAgo)
    } catch (error) {
      console.error("Erro ao formatar data:", error)
      setFormattedTime("")
    }
    
    // Atualizar a formatação a cada minuto
    const interval = setInterval(() => {
      try {
        const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp
        const timeAgo = formatDistanceToNow(date, { locale: ptBR, addSuffix: true })
        setFormattedTime(timeAgo)
      } catch (error) {
        console.error("Erro ao atualizar formatação de data:", error)
      }
    }, 60000)
    
    return () => clearInterval(interval)
  }, [timestamp])
  
  if (!mounted) return null;
  
  return (
    <div className="text-xs text-muted-foreground mt-1 px-1" suppressHydrationWarning>
      <span suppressHydrationWarning>{formattedTime}</span>
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
  console.log("[CHAT DEBUG] ChatView renderizado com: ", { 
    chatId, currentUserId, recipientName, recipientEmail 
  });
  
  // Armazenar ID da conversa em uma ref para comparações
  const prevChatIdRef = useRef<string | null>(null);
  
  // Adicionar logs iniciais para verificar as props
  useEffect(() => {
    console.log("[CHAT DEBUG] ChatView iniciado com os seguintes parâmetros:");
    console.log("- chatId:", chatId);
    console.log("- currentUserId:", currentUserId);
    console.log("- recipientName:", recipientName);
    console.log("- recipientEmail:", recipientEmail);
    
    // Verificação de parâmetros obrigatórios
    if (!chatId) {
      console.error("[CHAT DEBUG] ERRO CRÍTICO: ChatView iniciado sem chatId");
    }
    
    if (!currentUserId) {
      console.error("[CHAT DEBUG] ERRO CRÍTICO: ChatView iniciado sem currentUserId");
    }
    
    // Salvar informações do destinatário no localStorage para persistência
    if (chatId && typeof window !== 'undefined') {
      try {
        // Usar um formato de chave que inclui o ID da conversa para garantir unicidade
        const recipientKey = `recipient_${chatId}`;
        const recipientData = {
          name: recipientName || "Usuário",
          email: recipientEmail || "",
          avatar: recipientAvatar || ""
        };
        localStorage.setItem(recipientKey, JSON.stringify(recipientData));
        console.log("[CHAT DEBUG] Informações do destinatário salvas para persistência:", recipientData);
        
        // Também salvar esta conversa como ativa
        localStorage.setItem(`active_conversation_${chatId}`, 'true');
        localStorage.setItem('last_active_conversation', chatId);
        
        // IMPORTANTE: Disparar evento para notificar a lista de conversas
        // que esta conversa está ativa (quando o ChatView é montado)
        const messageEvent = new CustomEvent('messageWasSent', {
          detail: {
            conversationId: chatId,
            message: null,
            timestamp: new Date().toISOString(),
            recipientName: recipientName || "Usuário",
            recipientEmail: recipientEmail || ""
          }
        });
        
        window.dispatchEvent(messageEvent);
        console.log("[CHAT DEBUG] Evento inicial disparado para notificar conversa ativa:", chatId);
      } catch (err) {
        console.error("[CHAT DEBUG] Erro ao salvar informações do destinatário:", err);
      }
    }
  }, [chatId, currentUserId, recipientName, recipientEmail, recipientAvatar]);

  const [messages, setMessages] = useState<Message[]>([])
  const [commandOpen, setCommandOpen] = useState(false)
  const [newMessage, setNewMessage] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [initialLoadAttempted, setInitialLoadAttempted] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const realtimeChannel = useRef<any>(null)
  
  // Estado local para informações do destinatário (para persistência)
  const [localRecipientName, setLocalRecipientName] = useState<string>(recipientName || "Usuário")
  const [localRecipientEmail, setLocalRecipientEmail] = useState<string>(recipientEmail || "")
  const [localRecipientAvatar, setLocalRecipientAvatar] = useState<string | undefined>(recipientAvatar)

  // Função para buscar e atualizar detalhes do destinatário a partir do ID da conversa
  const fetchRecipientDetails = async (chatId: string) => {
    if (!chatId || !chatId.includes('_') || !currentUserId) return;
    
    try {
      console.log(`[CHAT DEBUG] Buscando detalhes do destinatário para conversa: ${chatId}`);
      
      // Extrair ID do destinatário do ID da conversa
      const userIds = chatId.split('_');
      const otherUserId = userIds[0] === currentUserId ? userIds[1] : userIds[0];
      
      if (!otherUserId) {
        console.error(`[CHAT DEBUG] Não foi possível extrair o ID do destinatário de ${chatId}`);
        return;
      }
      
      console.log(`[CHAT DEBUG] ID do destinatário identificado: ${otherUserId}`);
      
      // Buscar dados do perfil
      const { data: profileData, error } = await supabase
        .from("profiles")
        .select("first_name, last_name, email, avatar_url")
        .eq("id", otherUserId)
        .single();
      
      if (error) {
        console.error(`[CHAT DEBUG] Erro ao buscar perfil do destinatário: ${error.message}`);
        return;
      }
      
      if (!profileData) {
        console.warn(`[CHAT DEBUG] Nenhum dado de perfil encontrado para o ID ${otherUserId}`);
        return;
      }
      
      console.log(`[CHAT DEBUG] Dados do destinatário recuperados:`, profileData);
      
      // Construir nome completo
      const fullName = [profileData.first_name, profileData.last_name]
        .filter(Boolean)
        .join(' ') || "Usuário";
      
      // Atualizar estados locais
      setLocalRecipientName(fullName);
      if (profileData.email) setLocalRecipientEmail(profileData.email);
      if (profileData.avatar_url) setLocalRecipientAvatar(profileData.avatar_url);
      
      // Salvar no localStorage
      const recipientKey = `recipient_${chatId}`;
      const recipientData = {
        name: fullName,
        email: profileData.email || "",
        avatar: profileData.avatar_url || ""
      };
      
      localStorage.setItem(recipientKey, JSON.stringify(recipientData));
      console.log(`[CHAT DEBUG] Dados do destinatário atualizados e salvos no localStorage`);
      
      return {
        name: fullName,
        email: profileData.email,
        avatar: profileData.avatar_url
      };
    } catch (err) {
      console.error(`[CHAT DEBUG] Erro ao buscar detalhes do destinatário: ${err}`);
    }
  };

  // Carregar informações salvas do destinatário quando o chatId muda
  useEffect(() => {
    if (!chatId || typeof window === 'undefined') return;
    
    try {
      const recipientKey = `recipient_${chatId}`;
      const savedRecipientData = localStorage.getItem(recipientKey);
      
      if (savedRecipientData) {
        const parsedData = JSON.parse(savedRecipientData);
        console.log("[CHAT DEBUG] Carregando informações salvas do destinatário:", parsedData);
        
        // Atualizar estados locais com dados salvos
        setLocalRecipientName(parsedData.name || "Usuário");
        setLocalRecipientEmail(parsedData.email || "");
        setLocalRecipientAvatar(parsedData.avatar || "");
      } else {
        console.log("[CHAT DEBUG] Nenhuma informação salva do destinatário encontrada, fazendo busca...");
        fetchRecipientDetails(chatId);
      }
    } catch (err) {
      console.error("[CHAT DEBUG] Erro ao carregar informações salvas do destinatário:", err);
      // Tentar buscar diretamente do banco
      fetchRecipientDetails(chatId);
    }
  }, [chatId, currentUserId]);

  // Efeito para inicialização do componente e carregamento de mensagens
  useEffect(() => {
    setMounted(true);
    
    // Verificar se mudamos de conversa
    const isNewChat = prevChatIdRef.current !== chatId;
    prevChatIdRef.current = chatId;
    
    if (isNewChat) {
      console.log(`[CHAT DEBUG] Conversa alterada para: ${chatId}`);
      // Não limpamos as mensagens imediatamente para evitar tela em branco
      setIsLoading(true);
      setLoadError(null);
    }
    
    const loadMessages = async () => {
      if (!chatId || !currentUserId) {
        console.error("[CHAT DEBUG] Não é possível carregar mensagens: parâmetros críticos ausentes", { chatId, currentUserId });
        setIsLoading(false);
        setLoadError("ID da conversa ou usuário não definidos");
        setInitialLoadAttempted(true);
        return;
      }
      
      try {
        console.log(`[CHAT DEBUG] Carregando mensagens para conversa ${chatId}...`);
        
        // Primeiro tente usar cache local para feedback imediato
        let cachedMessages = [];
        try {
          const cachedData = localStorage.getItem(`messages_${chatId}`);
          if (cachedData) {
            const parsed = JSON.parse(cachedData);
            cachedMessages = parsed.data || [];
            
            if (cachedMessages.length > 0) {
              console.log(`[CHAT DEBUG] Exibindo ${cachedMessages.length} mensagens do cache enquanto carrega do servidor`);
              setMessages(cachedMessages);
              // Não encerrar o carregamento, ainda buscaremos do servidor
            }
          }
        } catch (err) {
          console.warn(`[CHAT DEBUG] Erro ao acessar cache: ${err}`);
        }
        
        // Buscar mensagens do servidor
        const data = await fetchMessages(currentUserId, chatId);
        console.log(`[CHAT DEBUG] ${data?.length || 0} mensagens carregadas para conversa ${chatId}`);
        
        // Ordenar mensagens por timestamp
        const sortedMessages = [...data].sort((a, b) => {
          const dateA = new Date(a.timestamp || 0);
          const dateB = new Date(b.timestamp || 0);
          return dateA.getTime() - dateB.getTime();
        });
        
        // Se não temos mensagens do servidor mas temos do cache, manter o cache
        if (sortedMessages.length === 0 && cachedMessages.length > 0) {
          console.log(`[CHAT DEBUG] Mantendo ${cachedMessages.length} mensagens do cache pois não há novas do servidor`);
        } else {
          setMessages(sortedMessages || []);
        }
        
        setLoadError(null);
        
        // Rolar para o final após carregar mensagens
        setTimeout(() => {
          if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
          }
        }, 100);
      } catch (error) {
        console.error("[CHAT DEBUG] Erro ao carregar mensagens:", error);
        setLoadError(`Falha ao carregar mensagens: ${error instanceof Error ? error.message : String(error)}`);
        
        // Se temos mensagens do cache, manter mesmo com erro
        try {
          const cachedData = localStorage.getItem(`messages_${chatId}`);
          if (cachedData) {
            const parsed = JSON.parse(cachedData);
            if (parsed.data && parsed.data.length > 0) {
              console.log(`[CHAT DEBUG] Usando ${parsed.data.length} mensagens do cache após erro`);
              setMessages(parsed.data);
            }
          }
        } catch (cacheErr) {
          console.error(`[CHAT DEBUG] Erro ao usar cache após falha de carregamento: ${cacheErr}`);
        }
      } finally {
        setIsLoading(false);
        setInitialLoadAttempted(true);
      }
    };
    
    // Configurar listener para novas mensagens - abordagem aprimorada
    const setupRealtimeListener = () => {
      // Cancelar assinatura anterior, se existir
      if (realtimeChannel.current) {
        console.log("[CHAT DEBUG] Cancelando inscrição antiga do canal realtime...");
        try {
          supabase.removeChannel(realtimeChannel.current);
        } catch (err) {
          console.error(`[CHAT DEBUG] Erro ao remover canal: ${err}`);
        }
        realtimeChannel.current = null;
      }
      
      if (!chatId) {
        console.error("[CHAT DEBUG] Não é possível configurar listener: ID da conversa ausente");
        return;
      }
      
      console.log(`[CHAT DEBUG] Configurando listener em tempo real para conversa ${chatId}`);
      
      // Criar um novo canal específico para esta conversa
      const channelName = `messages-${chatId}-realtime`;
      console.log(`[CHAT DEBUG] Nome do canal: ${channelName}`);
      
      try {
        // Inscrever-se em mudanças na tabela de mensagens filtradas por conversation_id
        const channel = supabase
          .channel(channelName)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'messages',
              filter: `conversation_id=eq.${chatId}`
            },
            async (payload) => {
              console.log("[CHAT DEBUG] NOVA MENSAGEM DETECTADA:", payload);
              
              try {
                if (!payload.new || !payload.new.id) {
                  console.warn("[CHAT DEBUG] Recebido evento sem dados de mensagem válidos");
                  return;
                }
                
                // Extrair detalhes da mensagem recebida
                const messageData = payload.new;
                
                // Verificar se já temos esta mensagem (evitar duplicatas)
                setMessages(prevMessages => {
                  // Verificar duplicatas
                  if (prevMessages.some(m => m.id === messageData.id)) {
                    console.log(`[CHAT DEBUG] Mensagem ${messageData.id} já existe no estado, ignorando`);
                    return prevMessages;
                  }
                  
                  console.log("[CHAT DEBUG] Processando nova mensagem:", messageData);
                  
                  // Criar objeto de mensagem no formato esperado
                  const newMessage: Message = {
                    id: messageData.id,
                    chatId: messageData.conversation_id,
                    // Usar o campo correto para o conteúdo (message_text ou content)
                    content: messageData.message_text || messageData.content || "",
                    type: messageData.type || "text",
                    // Determinar se é mensagem enviada ou recebida
                    sender: messageData.sender_id === currentUserId ? "agent" : "customer",
                    timestamp: messageData.created_at || messageData.timestamp || new Date().toISOString(),
                    fileName: messageData.file_name,
                    fileSize: messageData.file_size
                  };
                  
                  console.log("[CHAT DEBUG] Mensagem formatada para exibição:", newMessage);
                  
                  // Adicionar e ordenar
                  const updated = [...prevMessages, newMessage].sort((a, b) => {
                    const dateA = new Date(a.timestamp || 0);
                    const dateB = new Date(b.timestamp || 0);
                    return dateA.getTime() - dateB.getTime();
                  });
                  
                  console.log(`[CHAT DEBUG] Estado de mensagens atualizado: ${updated.length} mensagens`);
                  
                  // Atualizar cache local
                  try {
                    localStorage.setItem(`messages_${chatId}`, JSON.stringify({
                      timestamp: new Date().toISOString(),
                      data: updated
                    }));
                  } catch (err) {
                    console.warn(`[CHAT DEBUG] Erro ao atualizar cache: ${err}`);
                  }
                  
                  // Rolar para o final
                  setTimeout(() => {
                    if (messagesEndRef.current) {
                      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
                    }
                  }, 100);
                  
                  return updated;
                });
                
                // Se a mensagem é de outro usuário e não temos detalhes sobre ele, buscar
                if (messageData.sender_id !== currentUserId && messageData.sender_id && 
                    (localRecipientName === "Usuário" || !localRecipientEmail)) {
                  console.log(`[CHAT DEBUG] Buscando detalhes do remetente ${messageData.sender_id}`);
                  
                  try {
                    const { data: senderProfile } = await supabase
                      .from("profiles")
                      .select("first_name, last_name, email, avatar_url")
                      .eq("id", messageData.sender_id)
                      .single();
                      
                    if (senderProfile) {
                      console.log(`[CHAT DEBUG] Perfil do remetente encontrado:`, senderProfile);
                      
                      // Atualizar dados do destinatário
                      const fullName = [senderProfile.first_name, senderProfile.last_name]
                        .filter(Boolean)
                        .join(' ') || "Usuário";
                        
                      setLocalRecipientName(fullName);
                      
                      if (senderProfile.email) {
                        setLocalRecipientEmail(senderProfile.email);
                      }
                      
                      if (senderProfile.avatar_url) {
                        setLocalRecipientAvatar(senderProfile.avatar_url);
                      }
                      
                      // Salvar no localStorage
                      const recipientKey = `recipient_${chatId}`;
                      const recipientData = {
                        name: fullName,
                        email: senderProfile.email || "",
                        avatar: senderProfile.avatar_url || ""
                      };
                      
                      localStorage.setItem(recipientKey, JSON.stringify(recipientData));
                    }
                  } catch (profileErr) {
                    console.error(`[CHAT DEBUG] Erro ao buscar perfil do remetente: ${profileErr}`);
                  }
                }
              } catch (error) {
                console.error("[CHAT DEBUG] Erro ao processar nova mensagem:", error);
              }
            }
          );
          
        // Estabelecer a conexão
        channel.subscribe((status, err) => {
          console.log(`[CHAT DEBUG] Status da inscrição para conversa ${chatId}:`, status);
          if (err) {
            console.error("[CHAT DEBUG] Erro na subscrição do canal:", err);
          } else {
            console.log(`[CHAT DEBUG] Canal ${channelName} inscrito com sucesso!`);
          }
        });
        
        // Guardar referência ao canal para limpeza posterior
        realtimeChannel.current = channel;
        
        console.log("[CHAT DEBUG] Listener em tempo real configurado com sucesso");
      } catch (err) {
        console.error(`[CHAT DEBUG] Erro ao configurar listener em tempo real: ${err}`);
      }
    };
    
    if (chatId && currentUserId && mounted) {
      console.log("[CHAT DEBUG] Iniciando carregamento de mensagens e configuração de listener");
      loadMessages();
      fetchRecipientDetails(chatId); // Buscar detalhes do destinatário mesmo com cache
      setupRealtimeListener();
    }
    
    // Limpeza ao desmontar ou mudar de conversa
    return () => {
      console.log("[CHAT DEBUG] Limpando recursos do componente ChatView");
      
      if (realtimeChannel.current) {
        console.log(`[CHAT DEBUG] Removendo canal para conversa ${chatId}...`);
        try {
          supabase.removeChannel(realtimeChannel.current);
        } catch (e) {
          console.error(`[CHAT DEBUG] Erro ao remover canal: ${e}`);
        }
        realtimeChannel.current = null;
      }
    };
  }, [chatId, currentUserId, mounted]);

  // Rolar para o final quando novas mensagens são carregadas
  useEffect(() => {
    if (messagesEndRef.current && mounted && messages.length > 0) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, mounted]);

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;

    // Não definimos isLoading como true aqui para evitar recarregar toda a interface
    const newMessageContent = newMessage.trim();
    setNewMessage("");
    
    // Criar uma mensagem otimista para melhor UX
    const optimisticId = `temp-${Date.now()}`;
    const timestamp = new Date().toISOString();
    const optimisticMessage: Message = {
      id: optimisticId,
      chatId,
      content: newMessageContent,
      type: "text",
      sender: "agent",
      timestamp
    };
    
    // Adicionar a mensagem otimista imediatamente ao estado
    setMessages(prev => [...prev, optimisticMessage]);
    
    // Rolar para o final automaticamente após adicionar a mensagem otimista
    setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }, 50);
    
    try {
      // Extrair o id do recipient se possível a partir do ID da conversa
      let recipientId = null;
      
      // Para conversas diretas, o ID é no formato user1_user2
      if (chatId && chatId.includes('_')) {
        const userIds = chatId.split('_');
        recipientId = userIds[0] === currentUserId ? userIds[1] : userIds[0];
        console.log(`ID do destinatário detectado a partir do chatId: ${recipientId}`);
      }
      
      // Enviar a mensagem para o servidor
      const response = await sendMessage({
        chatId,
        content: newMessageContent,
        type: "text",
        sender: "agent",
        receiverId: recipientId
      });
      
      if (response) {
        console.log("[CHAT DEBUG] Mensagem enviada com sucesso:", response);
        
        // Atualizar a mensagem otimista com a real
        setMessages(prev => 
          prev.map(msg => 
            msg.id === optimisticMessage.id 
              ? {
                  ...msg,
                  id: response.id || msg.id,
                  timestamp: response.created_at || response.timestamp || msg.timestamp
                }
              : msg
          )
        );
        
        // Salvar a conversa ativa no localStorage
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(`active_conversation_${chatId}`, 'true');
            localStorage.setItem('last_active_conversation', chatId);
            
            // Salvar as mensagens localmente também
            const messagesKey = `messages_${chatId}`;
            const currentMessages = [...messages, {
              ...optimisticMessage,
              id: response.id || optimisticMessage.id
            }];
            
            localStorage.setItem(messagesKey, JSON.stringify({
              data: currentMessages,
              timestamp: new Date().toISOString()
            }));
            
            // IMPORTANTE: Disparar um evento customizado para notificar a lista de conversas
            // Garantir que usamos os dados mais recentes do destinatário
            const effectiveRecipientName = localRecipientName || recipientName || "Usuário";
            const effectiveRecipientEmail = localRecipientEmail || recipientEmail || "";
            
            console.log("[CHAT DEBUG] Disparando evento com detalhes do destinatário:", {
              name: effectiveRecipientName,
              email: effectiveRecipientEmail
            });
            
            const messageEvent = new CustomEvent('messageWasSent', {
              detail: {
                conversationId: chatId,
                message: {
                  content: newMessageContent,
                  type: "text",
                  id: response.id || optimisticId,
                  created_at: timestamp
                },
                timestamp: new Date().toISOString(),
                recipientName: effectiveRecipientName,
                recipientEmail: effectiveRecipientEmail
              }
            });
            
            window.dispatchEvent(messageEvent);
            console.log("[CHAT DEBUG] Evento messageWasSent disparado com sucesso para a conversa:", chatId);
          } catch (e) {
            console.error("[CHAT DEBUG] Erro ao salvar estado da conversa:", e);
          }
        }
      } else {
        console.error("[CHAT DEBUG] Erro ao enviar mensagem - resposta vazia");
        toast({
          title: "Erro ao enviar mensagem",
          description: "Não foi possível enviar sua mensagem. Tente novamente.",
          variant: "destructive"
        });
        
        // Remover a mensagem otimista em caso de erro
        setMessages(prev => prev.filter(msg => msg.id !== optimisticId));
      }
    } catch (err) {
      console.error("[CHAT DEBUG] Erro inesperado ao enviar mensagem:", err);
      
      // Remover a mensagem otimista em caso de erro
      setMessages(prev => prev.filter(msg => msg.id !== optimisticId));
      
      toast({
        title: "Erro ao enviar mensagem",
        description: "Não foi possível enviar sua mensagem. Tente novamente mais tarde.",
        variant: "destructive"
      });
    }
  };

  const handleAudioComplete = async (blob: Blob) => {
    try {
      const file = new File([blob], "audio.webm", { type: "audio/webm" })
      
      // Extrair o id do recipient se possível
      let recipientId = null;
      
      // Para conversas diretas, o ID é no formato user1_user2
      if (chatId && chatId.includes('_')) {
        const userIds = chatId.split('_');
        recipientId = userIds[0] === currentUserId ? userIds[1] : userIds[0];
        console.log(`ID do destinatário para áudio detectado: ${recipientId}`);
      }
      
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
        receiverId: recipientId,
        fileName: file.name,
        fileSize: file.size
      })
    } catch (error) {
      console.error("Erro ao enviar áudio:", error)
      toast({
        title: "Erro ao enviar áudio",
        description: "Não foi possível enviar seu áudio. Por favor, tente novamente.",
        variant: "destructive"
      })
    }
  }

  const handleFileUpload = async (url: string, name: string, size: number) => {
    try {
      // Extrair o id do recipient se possível
      let recipientId = null;
      
      // Para conversas diretas, o ID é no formato user1_user2
      if (chatId && chatId.includes('_')) {
        const userIds = chatId.split('_');
        recipientId = userIds[0] === currentUserId ? userIds[1] : userIds[0];
        console.log(`ID do destinatário para arquivo detectado: ${recipientId}`);
      }
      
      await sendMessage({
        chatId,
        content: url,
        type: "file",
        fileName: name,
        fileSize: size,
        receiverId: recipientId,
        sender: "agent", // Assumindo que o usuário atual é um agente
      })
    } catch (error) {
      console.error("Erro ao enviar arquivo:", error)
      toast({
        title: "Erro ao enviar arquivo",
        description: "Não foi possível enviar seu arquivo. Por favor, tente novamente.",
        variant: "destructive"
      })
    }
  }

  // Renderizar mensagens de forma mais eficiente
  const renderMessages = () => {
    if (isLoading) {
      // Skeleton loader silencioso para mensagens
      return (
        <>
          {[1, 2, 3].map((i) => (
            <div key={`skeleton-${i}`} className="flex gap-3 mb-4 animate-pulse">
              <div className="h-8 w-8 bg-muted rounded-full"></div>
              <div className="flex flex-col max-w-[80%]">
                <div className="bg-muted rounded-lg p-3 w-48 h-12"></div>
                <div className="h-3 w-20 bg-muted mt-1 rounded"></div>
              </div>
            </div>
          ))}
          {[1, 2].map((i) => (
            <div key={`skeleton-agent-${i}`} className="flex gap-3 justify-end mb-4 animate-pulse">
              <div className="flex flex-col max-w-[80%]">
                <div className="bg-muted rounded-lg p-3 w-40 h-10"></div>
                <div className="h-3 w-20 bg-muted mt-1 rounded ml-auto"></div>
              </div>
            </div>
          ))}
        </>
      );
    }
    
    if (loadError) {
      // Exibir erro de forma discreta
      return (
        <div className="flex flex-col items-center justify-center h-full opacity-70 text-sm">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => {
              setIsLoading(true);
              fetchMessages(currentUserId || "", chatId || "")
                .then(data => {
                  setMessages(data || []);
                  setLoadError(null);
                })
                .catch(err => {
                  console.error("Erro ao carregar mensagens:", err);
                  setLoadError(`Falha ao carregar mensagens`);
                })
                .finally(() => {
                  setIsLoading(false);
                });
            }}
          >
            Houve um problema ao carregar mensagens. Clique para tentar novamente.
          </Button>
        </div>
      );
    }
    
    if (!messages.length) {
      return (
        <div className="flex justify-center items-center h-full text-muted-foreground text-sm">
          <p>Envie uma mensagem para iniciar a conversa</p>
        </div>
      );
    }
    
    return (
      <>
        {messages.map((message) => (
          <div 
            key={`${chatId}-${message.id}`} 
            className={`flex gap-3 ${message.sender === "agent" ? "justify-end" : ""}`}
            suppressHydrationWarning
          >
            {message.sender !== "agent" && (
              <Avatar className="h-8 w-8">
                <AvatarImage src={localRecipientAvatar || recipientAvatar || "/placeholder.svg"} />
                <AvatarFallback>{localRecipientName ? localRecipientName[0] : recipientName ? recipientName[0] : "?"}</AvatarFallback>
              </Avatar>
            )}
            <div className="flex flex-col max-w-[80%]">
              <div
                className={`rounded-lg p-3 ${
                  message.sender === "agent" ? "bg-primary text-primary-foreground" : "bg-accent"
                }`}
              >
                {message.type === "text" && (
                  <span suppressHydrationWarning>{message.content}</span>
                )}
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
                    <span suppressHydrationWarning>{message.fileName}</span>
                    <span className="text-xs opacity-70" suppressHydrationWarning>
                      ({Math.round((message.fileSize || 0) / 1024)}KB)
                    </span>
                  </a>
                )}
                {message.type === "audio" && (
                  <audio controls src={message.content} className="max-w-full" suppressHydrationWarning />
                )}
              </div>
              {typeof window !== 'undefined' && mounted && <MessageTime timestamp={message.timestamp} />}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} className="h-1" />
      </>
    );
  };

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
      <div className="border-b p-4 flex items-center justify-between bg-gradient-to-r from-muted/50 to-background shadow-sm">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9 border-2 border-primary/10">
            <AvatarImage src={localRecipientAvatar || recipientAvatar || "/placeholder.svg"} />
            <AvatarFallback className="bg-primary/10 text-primary">
              {localRecipientName ? localRecipientName[0].toUpperCase() : recipientName ? recipientName[0].toUpperCase() : "?"}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="font-semibold text-lg">{localRecipientName || recipientName || "Usuário"}</div>
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <span>{localRecipientEmail || recipientEmail || "Sem email"}</span>
              {(localRecipientEmail || recipientEmail) && (
                <Copy 
                  className="h-4 w-4 cursor-pointer hover:text-primary transition-colors" 
                  onClick={() => {
                    navigator.clipboard.writeText(localRecipientEmail || recipientEmail || "");
                    toast({
                      title: "Email copiado",
                      description: "O email foi copiado para a área de transferência.",
                    });
                  }}
                  aria-label="Copiar email"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      navigator.clipboard.writeText(localRecipientEmail || recipientEmail || "")
                    }
                  }}
                />
              )}
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
        {renderMessages()}
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

