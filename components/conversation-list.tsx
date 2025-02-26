"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { Search, Plus, Users, MessageSquare } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { fetchUserConversations, createConversation, getCurrentUser, supabase, findDirectConversation, startDirectConversation as initDirectConversation } from "@/lib/supabase"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { toast } from "@/components/ui/use-toast"

function getTimeColor(minutes: number) {
  if (minutes <= 5) return "text-green-500"
  if (minutes <= 15) return "text-yellow-500"
  return "text-red-500"
}

// Componente separado para exibir o tempo da última mensagem
function TimeDisplay({ timestamp }: { timestamp: string | Date | null | undefined }) {
  const [formattedTime, setFormattedTime] = useState<string | null>(null)
  const [timeColor, setTimeColor] = useState<string>("text-muted-foreground")
  const [mounted, setMounted] = useState(false)
  
  useEffect(() => {
    // Marcar que o componente está montado no cliente
    setMounted(true)
    
    if (!timestamp) {
      setFormattedTime(null)
      return
    }
    
    try {
      // Converter para Date se for string
      const date = timestamp instanceof Date ? timestamp : new Date(timestamp)
      
      // Verificar se a data é válida
      if (isNaN(date.getTime())) {
        console.error("Data inválida:", timestamp)
        setFormattedTime(null)
        return
      }
      
      const timeAgo = formatDistanceToNow(date, { locale: ptBR, addSuffix: true })
      
      // Calcular minutos desde a última mensagem
      const minutesAgo = Math.floor((Date.now() - date.getTime()) / (1000 * 60))
      setTimeColor(getTimeColor(minutesAgo))
      setFormattedTime(timeAgo)
    } catch (error) {
      console.error("Erro ao formatar data:", error)
      setFormattedTime(null)
    }
  }, [timestamp])
  
  // Apenas no cliente e quando montado, renderizar o conteúdo
  if (!mounted) {
    // Retornar um placeholder vazio com tamanho idêntico para evitar layout shift
    return <span className="text-xs font-medium invisible">------</span>;
  }
  
  // Se não tiver formato definido, não renderizar
  if (!formattedTime) return null;
  
  return (
    <span className={`text-xs font-medium ${timeColor}`} suppressHydrationWarning>
      {formattedTime}
    </span>
  )
}

interface Conversation {
  id: string;
  type: "direct" | "group";
  title?: string;
  avatar_url?: string;
  lastMessage?: any;
  lastMessageTime?: string;
  profiles: any[];
}

interface User {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  avatar_url?: string;
}

interface ConversationListProps {
  onSelectConversation: (conversationId: string, conversationData: any) => void;
}

export function ConversationList({ onSelectConversation }: ConversationListProps) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [isCreatingGroup, setIsCreatingGroup] = useState(false)
  const [groupName, setGroupName] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<"conversations" | "users">("conversations")
  const [fileToUpload, setFileToUpload] = useState<File | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [isCreatingConversation, setIsCreatingConversation] = useState(false)
  const [lastSelectedConversationId, setLastSelectedConversationId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Adicionar estado para controlar tentativas de re-autenticação
  const [authAttempted, setAuthAttempted] = useState(false)
  const authTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Função para recuperar o ID do usuário do localStorage
  const getPersistedUserId = (): string | null => {
    if (typeof window !== 'undefined') {
      try {
        const id = localStorage.getItem('currentUserId');
        if (id) {
          console.log("[CONV LIST DEBUG] Recuperado ID de usuário do localStorage:", id);
          return id;
        }
      } catch (err) {
        console.error("[CONV LIST DEBUG] Erro ao recuperar ID do usuário:", err);
      }
    }
    return null;
  };

  // Função para persistir o ID do usuário
  const persistUserId = (id: string) => {
    if (typeof window !== 'undefined') {
      try {
        console.log("[CONV LIST DEBUG] Persistindo ID do usuário:", id);
        localStorage.setItem('currentUserId', id);
      } catch (err) {
        console.error("[CONV LIST DEBUG] Erro ao persistir ID do usuário:", err);
      }
    }
  };

  // Função para verificar autenticação
  const checkAuthentication = useCallback(async () => {
    try {
      console.log("[CONV LIST DEBUG] Verificando autenticação...");
      
      // Primeiro, tentar obter do localStorage
      const cachedUserId = getPersistedUserId();
      if (cachedUserId) {
        console.log("[CONV LIST DEBUG] Usando ID de usuário em cache:", cachedUserId);
        setCurrentUserId(cachedUserId);
        fetchConversations(cachedUserId);
        return cachedUserId;
      }
      
      // Se não estiver em cache, buscar da API
      const user = await getCurrentUser();
      
      if (user) {
        console.log("[CONV LIST DEBUG] Usuário autenticado:", user.id);
        setCurrentUserId(user.id);
        persistUserId(user.id);
        fetchConversations(user.id);
        return user.id;
      } else {
        console.warn("[CONV LIST DEBUG] Nenhum usuário autenticado encontrado");
        setCurrentUserId(null);
        return null;
      }
    } catch (error) {
      console.error("[CONV LIST DEBUG] Erro ao verificar autenticação:", error);
      return null;
    } finally {
      setAuthAttempted(true);
    }
  }, []);

  // Função para buscar lista de conversas
  const fetchConversations = async (userId: string) => {
    setIsLoading(true);
    setLoadError(null);
    
    try {
      console.log(`Buscando conversas para usuário ${userId}`);
      
      // Verificar se temos conversas em cache
      let cachedConversations = [];
      try {
        const cachedData = localStorage.getItem(`conversations_${userId}`);
        if (cachedData) {
          const parsed = JSON.parse(cachedData);
          // Usar dados em cache apenas se forem recentes (menos de 5 minutos)
          const cacheTime = new Date(parsed.timestamp).getTime();
          const now = new Date().getTime();
          const fiveMinutes = 5 * 60 * 1000;
          
          if (now - cacheTime < fiveMinutes) {
            cachedConversations = parsed.conversations || [];
            console.log(`Carregadas ${cachedConversations.length} conversas do cache`);
            
            if (cachedConversations.length > 0) {
              setConversations(cachedConversations);
              // Filtrar conversas conforme a aba atual (Conversas ou Usuários)
              const filtered = filterConversationsByTab(cachedConversations, activeTab);
              setConversations(filtered);
              setIsLoading(false);
            }
          }
        }
      } catch (err) {
        console.warn("Erro ao acessar cache de conversas:", err);
      }
      
      // Buscar conversas diretas
      const { data: directData, error: directError } = await supabase
        .from("direct_conversations_with_profiles")
        .select("*")
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`);
      
      if (directError) {
        console.error("Erro ao buscar conversas diretas:", directError);
        throw directError;
      }
      
      // Buscar conversas em grupo
      const { data: groupData, error: groupError } = await supabase
        .from("group_conversations_with_participants")
        .select("*")
        .contains("participants", [userId]);
      
      if (groupError) {
        console.error("Erro ao buscar conversas em grupo:", groupError);
        throw groupError;
      }

      // Combinar conversas do servidor e do localStorage
      const allConversations = [...directData, ...groupData];
      
      // Ordenar por data da última mensagem (mais recente primeiro)
      allConversations.sort((a, b) => {
        const dateA = new Date(a.lastMessageTime || a.updated_at || 0);
        const dateB = new Date(b.lastMessageTime || b.updated_at || 0);
        return dateB.getTime() - dateA.getTime();
      });
      
      console.log(`[CONV DEBUG] Carregadas ${allConversations.length} conversas para exibição`);
      setConversations(allConversations || [])
      
      // Tentar recuperar a última conversa ativa do localStorage
      let lastActiveConversation = null;
      try {
        lastActiveConversation = localStorage.getItem('last_active_conversation');
      } catch (err) {
        console.warn("Erro ao recuperar última conversa ativa:", err);
      }
      
      // Se temos uma conversa prioritária ou salva, verificar se ela está na lista
      const targetId = lastActiveConversation || lastSelectedConversationId;
      
      if (targetId) {
        console.log(`[CONV DEBUG] Verificando existência da conversa prioritária: ${targetId}`);
        
        const targetConversation = allConversations.find(
          (conv: Conversation) => conv.id === targetId
        );
        
        // Se encontramos a conversa, podemos restaurá-la
        if (targetConversation) {
          console.log("[CONV DEBUG] Restaurando conversa prioritária:", targetConversation.id);
          setTimeout(() => {
            handleConversationClick(targetConversation);
          }, 500);
        } else {
          console.log(`[CONV DEBUG] Conversa prioritária ${targetId} não encontrada na lista final`);
        }
      }
    } catch (error) {
      console.error("[CONV DEBUG] Erro ao buscar conversas:", error)
      toast({
        title: "Erro ao carregar conversas",
        description: "Não foi possível carregar suas conversas. Tente novamente mais tarde.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    // Marcar que estamos no cliente
    setMounted(true)
    
    // Tentar carregar a última conversa selecionada
    if (typeof window !== 'undefined') {
      try {
        const savedConversation = localStorage.getItem('lastSelectedConversation');
        if (savedConversation) {
          const parsedConversation = JSON.parse(savedConversation);
          setLastSelectedConversationId(parsedConversation.id);
        }
      } catch (err) {
        console.error("Erro ao carregar última conversa:", err);
      }
    }
    
    // Verificar autenticação imediatamente
    checkAuthentication();
    
    // Configurar verificação periódica de autenticação (a cada 30 segundos)
    const authInterval = setInterval(() => {
      if (typeof window !== 'undefined' && document.visibilityState === 'visible') {
        checkAuthentication();
      }
    }, 30000);
    
    // Verificar quando o documento volta a ficar visível
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkAuthentication();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    const fetchAllUsers = async () => {
      try {
        const { data, error } = await supabase.from("profiles").select("*")
        
        if (error) {
          console.error("Erro ao buscar perfis:", error.message)
          return
        }
        
        setUsers(data || [])
      } catch (error) {
        console.error("Erro ao buscar perfis:", error)
      }
    }
    
    // Adicionar listener para o evento de mensagem enviada
    const handleMessageSent = (event: any) => {
      if (!currentUserId) {
        console.warn("[CONV DEBUG] Evento recebido sem usuário autenticado, tentando re-autenticar...");
        checkAuthentication().then(userId => {
          if (userId) {
            console.log("[CONV DEBUG] Re-autenticação bem-sucedida, processando evento agora");
            processMessageEvent(event, userId);
          }
        });
        return;
      }
      
      processMessageEvent(event, currentUserId);
    };
    
    // Função auxiliar para processar o evento de mensagem
    const processMessageEvent = (event: any, userId: string) => {
      console.log("[CONV DEBUG] Processando evento de mensagem enviada:", event.detail);
      
      // Verificar se a conversa da mensagem já está na lista
      const conversationId = event.detail?.conversationId;
      
      if (conversationId) {
        // Verificar primeiro no localStorage
        try {
          if (typeof window !== 'undefined') {
            localStorage.setItem(`active_conversation_${conversationId}`, 'true');
            localStorage.setItem('last_active_conversation', conversationId);
            
            // Extrair informações do destinatário diretamente do evento, se disponíveis
            const recipientName = event.detail?.recipientName;
            const recipientEmail = event.detail?.recipientEmail;
            
            // Verificar se já temos esta conversa no estado
            const conversationExists = conversations.some(c => c.id === conversationId);
            
            if (!conversationExists) {
              console.log(`[CONV DEBUG] Conversa ${conversationId} não encontrada no estado, forçando atualização imediata`);
              
              // Se temos informações do destinatário no evento, podemos criar a conversa imediatamente
              if (recipientName && conversationId.includes('_')) {
                // Extrair o ID do outro usuário
                const userIds = conversationId.split('_');
                const otherUserId = userIds[0] === userId ? userIds[1] : userIds[0];
                
                // Criar um objeto de perfil temporário
                const tempProfile = {
                  id: otherUserId,
                  first_name: recipientName.split(' ')[0] || '',
                  last_name: recipientName.split(' ').slice(1).join(' ') || '',
                  email: recipientEmail || '',
                };
                
                // Adicionar a conversa provisoriamente à lista
                setConversations(prev => {
                  // Verificar se a conversa foi adicionada entre a verificação e a atualização
                  if (prev.some(c => c.id === conversationId)) {
                    return prev;
                  }
                  
                  console.log(`[CONV DEBUG] Adicionando conversa temporária ${conversationId} com ${recipientName}`);
                  
                  // Criar objeto de conversa
                  const newConversation: Conversation = {
                    id: conversationId,
                    type: "direct",
                    profiles: [tempProfile],
                    lastMessage: event.detail?.message ? {
                      content: event.detail.message.content || event.detail.message.message_text,
                      type: event.detail.message.type || "text",
                      created_at: event.detail.timestamp
                    } : null,
                    lastMessageTime: event.detail?.timestamp || new Date().toISOString()
                  };
                  
                  // Ordenar para mostrar a conversa mais recente primeiro
                  return [newConversation, ...prev].sort((a, b) => {
                    const timeA = a?.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
                    const timeB = b?.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
                    return timeB - timeA;
                  });
                });
              }
            } else {
              console.log(`[CONV DEBUG] Conversa ${conversationId} já existe, atualizando dados`);
              
              // Atualizar dados da conversa existente (ex: última mensagem)
              setConversations(prevConversations => {
                const updatedConversations = [...prevConversations];
                
                // Encontrar e atualizar a conversa específica
                const index = updatedConversations.findIndex(c => c.id === conversationId);
                
                if (index !== -1) {
                  // Tentar buscar a última mensagem do localStorage
                  try {
                    const messagesKey = `messages_${conversationId}`;
                    const messagesData = localStorage.getItem(messagesKey);
                    
                    if (messagesData) {
                      const parsedData = JSON.parse(messagesData);
                      if (parsedData.data && parsedData.data.length > 0) {
                        // Pegar a última mensagem
                        const lastMsg = parsedData.data[parsedData.data.length - 1];
                        
                        // Atualizar a conversa
                        updatedConversations[index] = {
                          ...updatedConversations[index],
                          lastMessage: {
                            content: lastMsg.content,
                            type: lastMsg.type,
                            created_at: lastMsg.timestamp
                          },
                          lastMessageTime: lastMsg.timestamp || new Date().toISOString()
                        };
                      }
                    }
                  } catch (e) {
                    console.error("[CONV DEBUG] Erro ao atualizar conversa com mensagem local:", e);
                  }
                }
                
                // Reordenar para mostrar a conversa atualizada no topo
                return updatedConversations.sort((a, b) => {
                  const timeA = a?.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
                  const timeB = b?.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
                  return timeB - timeA;
                });
              });
            }
          }
        } catch (e) {
          console.error("[CONV DEBUG] Erro ao processar evento de mensagem:", e);
        }
      }
      
      // De qualquer forma, atualizar a lista completa para garantir
      setTimeout(() => {
        console.log("[CONV DEBUG] Atualizando lista de conversas após evento de mensagem");
        fetchConversations(userId);
      }, 500); // Reduzido para 500ms para ser mais rápido
    };
    
    // Registrar o listener
    if (typeof window !== 'undefined') {
      window.addEventListener('messageWasSent', handleMessageSent);
      
      // Verificar também se há alguma conversa ativa no localStorage que não está sendo mostrada
      if (currentUserId) {
        try {
          const lastActiveConversation = localStorage.getItem('last_active_conversation');
          if (lastActiveConversation && !conversations.some(c => c.id === lastActiveConversation)) {
            console.log(`[CONV DEBUG] Há uma conversa ativa (${lastActiveConversation}) que não está sendo mostrada`);
            fetchConversations(currentUserId);
          }
        } catch (e) {
          console.error("[CONV DEBUG] Erro ao verificar conversa ativa:", e);
        }
      }
    }
    
    fetchAllUsers();
    
    // Limpar os listeners e intervalos na desmontagem
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('messageWasSent', handleMessageSent);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        clearInterval(authInterval);
      }
      if (authTimerRef.current) {
        clearTimeout(authTimerRef.current);
      }
    };
  }, [currentUserId, conversations, checkAuthentication]);

  // Função para filtrar conversas com base na aba ativa
  const filterConversationsByTab = (convs: Conversation[], tab: "conversations" | "users"): Conversation[] => {
    return convs.filter(conversation => {
      // Garantir que a conversa tem todos os campos necessários
      if (!conversation || typeof conversation !== 'object') return false;
      
      // Filtrar conforme a aba
      if (tab === "users") {
        // Na aba de usuários, não mostrar conversas
        return false;
      }
      
      // Na aba de conversas, filtrar pelo termo de busca
      // Para conversas diretas, filtrar pelo nome do outro participante
      if (conversation.type === "direct") {
        // Verificar se profiles existe e é um array
        const profiles = conversation.profiles || [];
        
        const otherParticipants = profiles.filter(
          profile => profile && profile.id !== currentUserId
        );
        
        if (otherParticipants.length > 0) {
          const otherUser = otherParticipants[0];
          const fullName = `${otherUser.first_name || ''} ${otherUser.last_name || ''}`.trim().toLowerCase();
          const email = (otherUser.email || '').toLowerCase();
          
          return fullName.includes(searchTerm.toLowerCase()) || email.includes(searchTerm.toLowerCase());
        }
      } else {
        // Para grupos
        const title = (conversation.title || '').toLowerCase();
        return title.includes(searchTerm.toLowerCase());
      }
      
      return false;
    });
  };

  const filteredConversations = conversations.filter(conversation => {
    // Garantir que a conversa tem todos os campos necessários
    if (!conversation || typeof conversation !== 'object') return false;
    
    // Para conversas diretas, filtrar pelo nome do outro participante
    if (conversation.type === "direct") {
      // Verificar se profiles existe e é um array
      const profiles = conversation.profiles || [];
      
      const otherParticipants = profiles.filter(
        profile => profile && profile.id !== currentUserId
      );
      
      if (otherParticipants.length > 0) {
        const otherUser = otherParticipants[0];
        const fullName = `${otherUser.first_name || ''} ${otherUser.last_name || ''}`.toLowerCase();
        const email = (otherUser.email || '').toLowerCase();
        const term = searchTerm.toLowerCase();
        
        return fullName.includes(term) || email.includes(term);
      }
    }
    
    // Para grupos, filtrar pelo título
    if (conversation.type === "group" && conversation.title) {
      return conversation.title.toLowerCase().includes(searchTerm.toLowerCase());
    }
    
    return false;
  })

  const filteredUsers = users.filter(user => {
    if (user.id === currentUserId) return false
    
    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.toLowerCase()
    const email = (user.email || '').toLowerCase()
    const term = searchTerm.toLowerCase()
    
    return fullName.includes(term) || email.includes(term)
  })

  // Versão simplificada para obter ou criar uma sala de chat
  const getOrCreateChatRoom = async (otherUserId: string): Promise<string | null> => {
    if (!currentUserId) {
      console.error("[CHAT DEBUG] Usuário não autenticado, não é possível iniciar conversa");
      return null;
    }
    
    console.log("[CHAT DEBUG] Buscando ou criando conversa entre", currentUserId, "e", otherUserId);
    
    try {
      // ESTRATÉGIA 1: Verificar na lista de conversas local
      console.log("[CHAT DEBUG] Estratégia 1: Verificando lista de conversas local");
      const localConversation = conversations.find(conversation => {
        if (conversation.type === "direct") {
          // Verificar por participantes
          if (conversation.profiles) {
            return conversation.profiles.some((profile: any) => profile.id === otherUserId);
          }
          
          // Verificar por ID determinístico
          const userIds = [currentUserId, otherUserId].sort();
          const deterministicId = `${userIds[0]}_${userIds[1]}`;
          
          if (conversation.id === deterministicId || 
              conversation.id.includes(deterministicId)) {
            return true;
          }
        }
        return false;
      });
      
      if (localConversation) {
        console.log("[CHAT DEBUG] Encontrada conversa na lista local:", localConversation.id);
        return localConversation.id;
      }
      
      // ESTRATÉGIA 2: Usar a nova função simplificada que sempre retorna um ID válido
      try {
        console.log("[CHAT DEBUG] Estratégia 2: Usando função robusta startDirectConversation");
        const conversationId = await initDirectConversation(currentUserId, otherUserId);
        
        console.log("[CHAT DEBUG] Conversa iniciada com sucesso:", conversationId);
        
        // Salvando no cache para uso futuro
        try {
          if (typeof window !== 'undefined') {
            const cachedConversationIds = JSON.parse(localStorage.getItem('conversationIds') || '[]');
            if (!cachedConversationIds.some((entry: any) => entry.id === conversationId)) {
              cachedConversationIds.push({ 
                id: conversationId, 
                users: [currentUserId, otherUserId],
                timestamp: new Date().toISOString() 
              });
              localStorage.setItem('conversationIds', JSON.stringify(cachedConversationIds));
            }
          }
        } catch (cacheError) {
          console.warn("[CHAT DEBUG] Erro ao salvar ID no cache:", cacheError);
        }
        
        return conversationId;
      } catch (error) {
        console.error("[CHAT DEBUG] Erro ao usar startDirectConversation:", error);
        // Continuar para o fallback
      }
      
      // ESTRATÉGIA 3: Fallback - criar ID determinístico localmente
      console.log("[CHAT DEBUG] Estratégia 3: Criando ID determinístico como fallback");
      const userIds = [currentUserId, otherUserId].sort();
      const fallbackId = `local_${userIds[0]}_${userIds[1]}`;
      console.log("[CHAT DEBUG] Usando ID determinístico como fallback:", fallbackId);
      
      return fallbackId;
      
    } catch (error) {
      console.error("[CHAT DEBUG] Erro geral ao obter/criar sala de chat:", error);
      
      // Em caso de erro total, ainda retornar um ID utilizável
      const userIds = [currentUserId, otherUserId].sort();
      const emergencyId = `emergency_${userIds[0]}_${userIds[1]}`;
      console.log("[CHAT DEBUG] Usando ID de emergência:", emergencyId);
      
      return emergencyId;
    }
  };

  // Versão simplificada da função de clique em usuário
  const handleUserClick = async (user: User) => {
    if (isCreatingConversation) {
      console.log("Já está criando outra conversa, ignorando clique");
      return;
    }
    
    if (!currentUserId) {
      console.error("Usuário não autenticado, não é possível iniciar conversa");
      return;
    }
    
    try {
      setIsCreatingConversation(true);
      console.log("[CHAT DEBUG] Iniciando criação de sala para o usuário:", user.id, user.email);
      
      // PASSO 1: Verificar na cache local para respostas imediatas
      // Verificar conversas existentes com este usuário
      const existingConversation = conversations.find(conversation => {
        // Para conversas diretas
        if (conversation.type === "direct") {
          // Verificar se o ID da conversa contém os IDs dos dois usuários
          const conversationId = conversation.id;
          return conversationId.includes(currentUserId) && conversationId.includes(user.id);
        }
        return false;
      });
      
      if (existingConversation) {
        console.log("[CHAT DEBUG] Conversa existente encontrada localmente:", existingConversation.id);
        // Usar a conversa existente
        handleConversationClick(existingConversation);
        setTimeout(() => {
          setIsCreatingConversation(false);
        }, 500);
        return;
      }
      
      // PASSO 2: Obter ou criar uma sala para este par de usuários (camada robusta)
      console.log("[CHAT DEBUG] Buscando ou criando sala de chat...");
      const roomId = await getOrCreateChatRoom(user.id);
      
      if (!roomId) {
        console.error("[CHAT DEBUG] Falha ao obter/criar sala de chat, criando ID temporário...");
        
        // Criar um ID determinístico como fallback
        const userIds = [currentUserId, user.id].sort();
        const fallbackId = `temp_${userIds[0]}_${userIds[1]}`;
        
        console.log("[CHAT DEBUG] Usando ID temporário para conversa:", fallbackId);
        
        // Dados do outro usuário para exibir no chat
        const userData = {
          name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Usuário',
          email: user.email || '',
          avatar: user.avatar_url
        };
        
        // Salvar o ID da conversa
        setLastSelectedConversationId(fallbackId);
        
        // Passar diretamente para o modo de visualização de conversa
        console.log("[CHAT DEBUG] Chamando onSelectConversation com ID temporário:", fallbackId);
        onSelectConversation(fallbackId, userData);
        
        // Atualizar a interface
        setActiveTab("conversations");
        
        toast({
          title: "Aviso de conexão",
          description: "Usando modo offline temporário. Suas mensagens serão sincronizadas quando a conexão for restaurada.",
          variant: "default"
        });
        
        setTimeout(() => {
          setIsCreatingConversation(false);
        }, 500);
        return;
      }
      
      // Dados do outro usuário para exibir no chat
      const userData = {
        name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Usuário',
        email: user.email || '',
        avatar: user.avatar_url
      };
      
      console.log("[CHAT DEBUG] Sala de chat criada ou obtida com sucesso:", roomId);
      console.log("[CHAT DEBUG] Dados do usuário para a conversa:", userData);
      
      // Salvar o ID da conversa
      setLastSelectedConversationId(roomId);
      
      // Passar diretamente para o modo de visualização de conversa, sem esperar atualizações
      console.log("[CHAT DEBUG] Chamando onSelectConversation diretamente com:", roomId, userData);
      onSelectConversation(roomId, userData);
      
      // Apenas depois disso, atualizar a interface
      setActiveTab("conversations");
      
      // Salvar os dados do usuário no localStorage para recuperação
      try {
        if (typeof window !== 'undefined') {
          const recipientKey = `recipient_${roomId}`;
          localStorage.setItem(recipientKey, JSON.stringify(userData));
          
          const tempConversation: Conversation = {
            id: roomId,
            type: "direct",
            profiles: [user],
            lastMessageTime: new Date().toISOString()
          };
          
          // Adicionar a conversa à lista local se não existir
          setConversations(prev => {
            if (prev.some(c => c.id === roomId)) {
              return prev;
            }
            return [tempConversation, ...prev];
          });
        }
      } catch (cacheError) {
        console.warn("[CHAT DEBUG] Erro ao salvar dados de conversa:", cacheError);
      }
      
      // Atualizar a lista de conversas em segundo plano
      if (currentUserId) {
        fetchConversations(currentUserId)
          .then(() => {
            console.log("[CHAT DEBUG] Lista de conversas atualizada em segundo plano");
          })
          .catch(err => {
            console.error("[CHAT DEBUG] Erro ao atualizar lista de conversas:", err);
          });
      }
    } catch (error) {
      console.error("[CHAT DEBUG] Erro ao processar sala de chat:", error);
      
      // Criar ID determinístico e dados temporários para garantir a UX
      const userIds = [currentUserId, user.id].sort();
      const emergencyId = `emergency_${userIds[0]}_${userIds[1]}`;
      
      const userData = {
        name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Usuário',
        email: user.email || '',
        avatar: user.avatar_url
      };
      
      console.log("[CHAT DEBUG] Usando ID de emergência:", emergencyId);
      setLastSelectedConversationId(emergencyId);
      onSelectConversation(emergencyId, userData);
      setActiveTab("conversations");
      
      toast({
        title: "Modo de emergência ativado",
        description: "Usando conversa temporária devido a problemas técnicos. Suas mensagens serão sincronizadas quando possível.",
        variant: "destructive"
      });
    } finally {
      // Definir um pequeno atraso antes de permitir nova criação de conversa
      // para evitar cliques duplicados acidentais
      setTimeout(() => {
        setIsCreatingConversation(false);
      }, 500);
    }
  };

  // Simplificar também o clique em conversa existente
  const handleConversationClick = async (conversation: Conversation) => {
    if (!onSelectConversation) {
      console.error("[CONV LIST DEBUG] Callback onSelectConversation não fornecido");
      return;
    }
    
    let userId = currentUserId;
    
    if (!userId) {
      console.warn("[CONV LIST DEBUG] Usuário não autenticado, tentando recuperar autenticação");
      
      // Primeiro, tentar recuperar do localStorage
      userId = getPersistedUserId();
      
      // Se não encontrou no localStorage, tentar re-autenticar
      if (!userId) {
        userId = await checkAuthentication();
      }
      
      // Se ainda não temos userId, não podemos prosseguir
      if (!userId) {
        console.error("[CONV LIST DEBUG] Não foi possível autenticar usuário para selecionar conversa");
        toast({
          title: "Erro de autenticação",
          description: "Você precisa estar logado para acessar conversas. Faça login e tente novamente.",
          variant: "destructive"
        });
        return;
      }
      
      // Se obtivemos o userId, atualizar o estado
      setCurrentUserId(userId);
    }
    
    console.log("[CONV LIST DEBUG] Processando clique na conversa:", conversation.id);
    
    try {
      setLastSelectedConversationId(conversation.id);
      
      // Se for uma conversa direta, tentar resolver o destinatário
      if (conversation.type === "direct") {
        // Verificar se o ID segue o formato user1_user2
        if (conversation.id && conversation.id.includes('_')) {
          const userIds = conversation.id.split('_');
          const otherUserId = userIds[0] === currentUserId ? userIds[1] : userIds[0];
          
          console.log(`Possível ID de destinatário encontrado: ${otherUserId}`);
          
          // Buscar dados do outro usuário
          if (otherUserId) {
            const otherUserData = users.find(u => u.id === otherUserId);
            
            if (otherUserData) {
              const conversationData = {
                name: `${otherUserData.first_name || ''} ${otherUserData.last_name || ''}`.trim() || 'Usuário',
                email: otherUserData.email || '',
                avatar: otherUserData.avatar_url
              };
              
              console.log("Selecionando conversa com dados do usuário encontrado:", otherUserData.email);
              onSelectConversation(conversation.id, conversationData);
              return;
            }
            
            // Se não encontrou dados do usuário na lista local, buscar do banco
            fetchUserProfileById(otherUserId).then(profile => {
              if (profile) {
                const conversationData = {
                  name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Usuário',
                  email: profile.email || '',
                  avatar: profile.avatar_url
                };
                
                console.log("Selecionando conversa com dados do usuário buscados do banco:", profile.email);
                onSelectConversation(conversation.id, conversationData);
              } else {
                // Se ainda não conseguiu dados, tentar buscar informações salvas
                const savedData = getSavedRecipientData(conversation.id);
                if (savedData) {
                  console.log("Usando dados do destinatário salvos localmente:", savedData);
                  onSelectConversation(conversation.id, savedData);
                } else {
                  fallbackSelection();
                }
              }
            }).catch(() => {
              fallbackSelection();
            });
            return;
          }
        }
        
        // Função de seleção com dados genéricos como fallback
        const fallbackSelection = () => {
          // Verificar se temos dados do destinatário salvos no localStorage
          const savedData = getSavedRecipientData(conversation.id);
          
          if (savedData && (savedData.name !== 'Usuário' || savedData.email !== 'Conversa direta')) {
            console.log("Usando dados do destinatário salvos:", savedData);
            onSelectConversation(conversation.id, savedData);
          } else {
            const conversationData = {
              name: 'Usuário',
              email: 'Conversa direta',
              avatar: null
            };
            
            console.log("Selecionando conversa com dados genéricos");
            onSelectConversation(conversation.id, conversationData);
          }
        };
        
        fallbackSelection();
      } else { // Para grupos
        const profiles = conversation.profiles || [];
        const conversationData = {
          name: conversation.title || 'Grupo',
          email: `${profiles.length} participantes`,
          avatar: conversation.avatar_url
        };
        
        console.log("Selecionando conversa de grupo:", conversation.title || 'Grupo');
        onSelectConversation(conversation.id, conversationData);
      }
    } catch (error) {
      console.error("Erro ao selecionar conversa:", error);
      // Fallback para garantir que algo seja selecionado mesmo em caso de erro
      const conversationData = {
        name: 'Conversa',
        email: '',
        avatar: null
      };
      
      console.log("Selecionando conversa após erro");
      onSelectConversation(conversation.id, conversationData);
    }
  };

  // Função segura para criar um grupo
  const createGroupConversation = async (): Promise<string | null> => {
    try {
      if (!currentUserId || !groupName.trim() || selectedUsers.length === 0) {
        return null
      }
      
      let avatarUrl = null
      
      // Upload da imagem do grupo, se houver
      if (fileToUpload) {
        try {
          const fileExt = fileToUpload.name.split(".").pop()
          const fileName = `group_${Date.now()}.${fileExt}`
          
          const { data, error } = await supabase.storage
            .from("avatars")
            .upload(fileName, fileToUpload, {
              cacheControl: "3600",
              upsert: false
            })
          
          if (error) throw error
          
          // Obter URL pública
          const { data: urlData } = supabase.storage
            .from("avatars")
            .getPublicUrl(fileName)
          
          avatarUrl = urlData.publicUrl
        } catch (uploadError) {
          console.error("Erro ao fazer upload da imagem do grupo:", uploadError)
          // Continuar sem a imagem
        }
      }
      
      // Criar o grupo
      const { data, error } = await supabase
        .from("conversations")
        .insert({
          type: "group",
          title: groupName,
          avatar_url: avatarUrl,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
      
      if (error) {
        console.error("Erro ao criar grupo:", error)
        return null
      }
      
      if (!data || data.length === 0) {
        console.error("Falha ao criar grupo")
        return null
      }
      
      const conversationId = data[0].id
      
      // Adicionar o criador como participante
      const { error: creatorError } = await supabase
        .from("conversation_participants")
        .insert({
          conversation_id: conversationId,
          profile_id: currentUserId,
          role: "admin",
          created_at: new Date().toISOString()
        })
      
      if (creatorError) {
        console.error("Erro ao adicionar criador como participante:", creatorError)
        return null
      }
      
      // Adicionar outros participantes
      const participantsData = selectedUsers.map(participantId => ({
        conversation_id: conversationId,
        profile_id: participantId,
        role: "member",
        created_at: new Date().toISOString()
      }))
      
      const { error: participantsError } = await supabase
        .from("conversation_participants")
        .insert(participantsData)
      
      if (participantsError) {
        console.error("Erro ao adicionar participantes:", participantsError)
        return null
      }
      
      return conversationId
    } catch (error) {
      console.error("Erro ao criar grupo:", error)
      return null
    }
  }

  const handleCreateGroup = async () => {
    if (isCreatingConversation) return
    
    try {
      setIsCreatingConversation(true)
      
      const conversationId = await createGroupConversation()
      
      if (!conversationId) {
        console.error("Falha ao criar grupo")
        return
      }
      
      // Recarregar conversas
      if (currentUserId) {
        await fetchConversations(currentUserId);
        console.log("Conversas recarregadas após criação de grupo");
      }
      
      // Resetar o formulário
      setGroupName("")
      setSelectedUsers([])
      setFileToUpload(null)
      setIsCreatingGroup(false)
      setActiveTab("conversations")
    } catch (error) {
      console.error("Erro ao criar grupo:", error)
    } finally {
      setIsCreatingConversation(false)
    }
  }

  const toggleUserSelection = (userId: string) => {
    if (selectedUsers.includes(userId)) {
      setSelectedUsers(selectedUsers.filter(id => id !== userId))
    } else {
      setSelectedUsers([...selectedUsers, userId])
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFileToUpload(e.target.files[0])
    }
  }

  const startDirectConversation = async (userId: string) => {
    if (!currentUserId) return;
    
    try {
      setIsCreatingConversation(true);
      
      // Buscar primeiro se já existe uma conversa entre esses usuários
      console.log(`Tentando iniciar conversa entre ${currentUserId} e ${userId}`);
      
      // Verificar se já temos uma conversa direta com este usuário
      const existingConversationId = await findDirectConversation(currentUserId, userId);
      let conversationId;
      
      if (existingConversationId) {
        console.log(`Conversa existente encontrada: ${existingConversationId}`);
        conversationId = existingConversationId;
      } else {
        // Criar uma nova conversa se não existir
        console.log("Criando nova conversa direta...");
        
        // ID determinístico para conversas diretas - ordenar IDs para garantir consistência
        const userIds = [currentUserId, userId].sort();
        const deterministicId = `${userIds[0]}_${userIds[1]}`;
        
        // Verificar se este ID já existe no banco
        const { data: existingConv } = await supabase
          .from("conversations")
          .select("id")
          .eq("id", deterministicId);
        
        if (existingConv && existingConv.length > 0) {
          console.log(`Conversa com ID determinístico já existe: ${deterministicId}`);
          conversationId = deterministicId;
        } else {
          // Criar nova conversa com ID determinístico
          conversationId = await createConversation("direct", [userId]);
          console.log(`Nova conversa criada: ${conversationId}`);
        }
      }
      
      // Buscar os detalhes do usuário para passar ao seletor de conversa
      const otherUser = users.find(u => u.id === userId);
      
      if (otherUser) {
        const conversationData = {
          id: conversationId,
          type: "direct",
          profiles: [otherUser],
          recipientName: `${otherUser.first_name || ''} ${otherUser.last_name || ''}`.trim(),
          recipientEmail: otherUser.email || '',
          recipientAvatar: otherUser.avatar_url
        };
        
        // Atualizar a lista de conversas para incluir esta
        setConversations(prev => {
          // Verificar se esta conversa já existe na lista
          const exists = prev.some(conv => conv.id === conversationId);
          
          if (exists) {
            return prev; // Não duplicar conversas
          }
          
          // Adicionar a nova conversa à lista
          return [...prev, {
            id: conversationId,
            type: "direct",
            profiles: [otherUser],
            lastMessage: null,
            lastMessageTime: new Date().toISOString()
          }];
        });
        
        // Selecionar a conversa após criá-la
        onSelectConversation(conversationId, conversationData);
        
        // Mudar para a aba de conversas
        setActiveTab("conversations");
      }
    } catch (error) {
      console.error("Erro ao iniciar conversa:", error);
      toast({
        title: "Erro ao iniciar conversa",
        description: "Não foi possível iniciar a conversa. Tente novamente mais tarde.",
        variant: "destructive"
      });
    } finally {
      setIsCreatingConversation(false);
    }
  };
  
  // Atualizar a lista de conversas periodicamente para garantir sincronização
  useEffect(() => {
    if (!currentUserId || !mounted) return;
    
    // Atualizar a cada 30 segundos para manter sincronizado
    const interval = setInterval(() => {
      if (currentUserId) {
        fetchConversations(currentUserId)
          .then(() => {
            console.log("Lista de conversas atualizada automaticamente");
          })
          .catch(err => console.error("Erro ao atualizar conversas:", err));
      }
    }, 30000);
    
    return () => clearInterval(interval);
  }, [currentUserId, mounted]);

  // Função para buscar perfil de usuário pelo ID
  const fetchUserProfileById = async (userId: string): Promise<any | null> => {
    try {
      console.log(`Buscando perfil do usuário ${userId} do banco de dados`);
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, avatar_url')
        .eq('id', userId)
        .single();
        
      if (error) {
        console.error(`Erro ao buscar perfil do usuário ${userId}:`, error);
        return null;
      }
      
      if (!data) {
        console.warn(`Nenhum perfil encontrado para o usuário ${userId}`);
        return null;
      }
      
      console.log(`Perfil do usuário ${userId} obtido com sucesso:`, data);
      return data;
    } catch (err) {
      console.error(`Erro inesperado ao buscar perfil do usuário ${userId}:`, err);
      return null;
    }
  };
  
  // Função para recuperar dados do destinatário do localStorage
  const getSavedRecipientData = (conversationId: string): { name: string; email: string; avatar: string | null } | null => {
    if (typeof window === 'undefined') return null;
    
    try {
      const recipientKey = `recipient_${conversationId}`;
      const savedData = localStorage.getItem(recipientKey);
      
      if (savedData) {
        const parsedData = JSON.parse(savedData);
        console.log(`Dados do destinatário recuperados do localStorage para conversa ${conversationId}:`, parsedData);
        return {
          name: parsedData.name || 'Usuário',
          email: parsedData.email || 'Conversa direta',
          avatar: parsedData.avatar || null
        };
      }
    } catch (err) {
      console.error(`Erro ao recuperar dados do destinatário do localStorage para conversa ${conversationId}:`, err);
    }
    
    return null;
  };

  // Renderizar um estado de carregamento até que o componente seja montado no cliente
  if (!mounted) {
    return null
  }

  return (
    <div className="w-80 border-r h-full flex flex-col" suppressHydrationWarning>
      <div className="p-4">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar..." 
            className="pl-8" 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>
      
      <Tabs 
        defaultValue="conversations" 
        value={activeTab} 
        onValueChange={(value) => setActiveTab(value as "conversations" | "users")}
        className="w-full h-full flex flex-col"
      >
        <TabsList className="w-full justify-start px-4 h-12">
          <TabsTrigger value="conversations" className="flex items-center gap-1">
            <MessageSquare className="h-4 w-4" />
            <span>Conversas</span>
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            <span>Usuários</span>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="conversations" className="mt-0 flex-1 overflow-y-auto">
          <div className="p-2">
            <Dialog open={isCreatingGroup} onOpenChange={setIsCreatingGroup}>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  <span>Criar Grupo</span>
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Criar Novo Grupo</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label htmlFor="group-name">Nome do Grupo</Label>
                    <Input
                      id="group-name"
                      placeholder="Digite o nome do grupo"
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="group-avatar">Foto do Grupo</Label>
                    <Input
                      id="group-avatar"
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                    />
                    {fileToUpload && (
                      <div className="mt-2 flex justify-center">
                        <Avatar className="h-16 w-16">
                          <AvatarImage src={URL.createObjectURL(fileToUpload)} />
                          <AvatarFallback>{groupName[0] || "G"}</AvatarFallback>
                        </Avatar>
                      </div>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Selecione os Participantes</Label>
                    <div className="border rounded-md h-40 overflow-y-auto p-2">
                      {users
                        .filter(user => user.id !== currentUserId)
                        .map(user => (
                          <div
                            key={user.id}
                            className={`flex items-center gap-2 p-2 rounded-md cursor-pointer ${
                              selectedUsers.includes(user.id) ? "bg-accent" : ""
                            }`}
                            onClick={() => toggleUserSelection(user.id)}
                          >
                            <input
                              type="checkbox"
                              checked={selectedUsers.includes(user.id)}
                              onChange={() => {}}
                              className="h-4 w-4"
                            />
                            <Avatar className="h-6 w-6">
                              <AvatarImage src={user.avatar_url || "/placeholder.svg"} />
                              <AvatarFallback>
                                {user.first_name?.[0] || ''}
                                {user.last_name?.[0] || ''}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm">
                              {user.first_name || ''} {user.last_name || ''}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                  
                  <Button 
                    className="w-full" 
                    onClick={handleCreateGroup}
                    disabled={!groupName.trim() || selectedUsers.length === 0 || isCreatingConversation}
                  >
                    {isCreatingConversation ? "Criando..." : "Criar Grupo"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          
          {isLoading ? (
            <div className="flex flex-col">
              {/* Skeleton loaders para conversas */}
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={`skeleton-${i}`} className="flex items-center gap-3 p-4 animate-pulse">
                  <div className="h-10 w-10 bg-muted rounded-full"></div>
                  <div className="flex-1">
                    <div className="h-4 w-32 bg-muted rounded mb-2"></div>
                    <div className="h-3 w-40 bg-muted rounded"></div>
                  </div>
                  <div className="h-3 w-12 bg-muted rounded"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col">
              {filteredConversations.length === 0 ? (
                <div className="flex justify-center items-center p-6 text-sm text-muted-foreground">
                  <p>Ainda não há conversas. Inicie uma conversa com um usuário.</p>
                </div>
              ) : (
                filteredConversations.map((conversation) => {
                  // Para conversas diretas, mostrar o nome do outro participante
                  let displayName = "";
                  let displayEmail = "";
                  let avatarSrc = "";
                  
                  if (conversation.type === "direct") {
                    // Verificar se profiles existe e é um array
                    const profiles = conversation.profiles || [];
                    
                    const otherParticipants = profiles.filter(
                      profile => profile && profile.id !== currentUserId
                    );
                    
                    if (otherParticipants.length > 0) {
                      const otherUser = otherParticipants[0];
                      displayName = `${otherUser.first_name || ''} ${otherUser.last_name || ''}`.trim() || 'Usuário';
                      displayEmail = otherUser.email || '';
                      avatarSrc = otherUser.avatar_url || "/placeholder.svg";
                    } else {
                      // Extrair informação do ID da sala se não encontrar participantes
                      displayName = 'Usuário';
                      displayEmail = 'Conversa direta';
                      avatarSrc = "/placeholder.svg";
                    }
                  } else {
                    // Para grupos
                    displayName = conversation.title || 'Grupo';
                    const profiles = conversation.profiles || [];
                    displayEmail = `${profiles.length} participantes`;
                    avatarSrc = conversation.avatar_url || "/placeholder.svg";
                  }
                  
                  // Extrair a última mensagem
                  const lastMessageContent = conversation.lastMessage 
                    ? conversation.lastMessage.type === "text" 
                      ? conversation.lastMessage.message_text || conversation.lastMessage.content || "Mensagem"
                      : "Arquivo enviado" 
                    : "Nenhuma mensagem";
                  
                  return (
                    <button
                      key={conversation.id}
                      className="flex items-center gap-3 p-4 hover:bg-accent text-left"
                      onClick={() => {
                        console.log("Clique na conversa com ID:", conversation.id);
                        console.log("Dados do destinatário:", { 
                          name: displayName, 
                          email: displayEmail, 
                          avatar: avatarSrc 
                        });
                        
                        // Passar diretamente os dados da conversa e o destinatário
                        const conversationData = {
                          name: displayName,
                          email: displayEmail,
                          avatar: avatarSrc
                        };
                        
                        // Chamar diretamente onSelectConversation com os dados corretos
                        onSelectConversation(conversation.id, conversationData);
                      }}
                    >
                      <Avatar>
                        <AvatarImage src={avatarSrc} />
                        <AvatarFallback>
                          {displayName[0] || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 overflow-hidden">
                        <div className="font-medium">
                          {displayName}
                        </div>
                        <div className="text-sm text-muted-foreground truncate">
                          {lastMessageContent}
                        </div>
                      </div>
                      {mounted && conversation.lastMessageTime && <TimeDisplay timestamp={conversation.lastMessageTime} />}
                    </button>
                  )
                })
              )}
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="users" className="mt-0 flex-1 overflow-y-auto">
          {filteredUsers.length === 0 ? (
            <div className="flex justify-center items-center p-4">
              <p>Nenhum usuário encontrado</p>
            </div>
          ) : (
          <div className="flex flex-col">
              {filteredUsers.map((user) => (
                <button
                  key={user.id}
                  className="flex items-center gap-3 p-4 hover:bg-accent text-left"
                  onClick={() => startDirectConversation(user.id)}
                  disabled={isCreatingConversation}
                >
                <Avatar>
                    <AvatarImage src={user.avatar_url || "/placeholder.svg"} />
                    <AvatarFallback>
                      {user.first_name?.[0] || ''}
                      {user.last_name?.[0] || ''}
                    </AvatarFallback>
                </Avatar>
                <div className="flex-1 overflow-hidden">
                    <div className="font-medium">
                      {user.first_name || ''} {user.last_name || ''}
                    </div>
                    <div className="text-sm text-muted-foreground truncate">
                      {user.email || ''}
                    </div>
                </div>
              </button>
            ))}
          </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

