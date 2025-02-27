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
import { toast } from "@/components/ui/use-toast"

function getTimeColor(minutes: number) {
  if (minutes <= 5) return "text-green-500"
  if (minutes <= 15) return "text-yellow-500"
  return "text-red-500"
}

// Componente separado para exibir o tempo da última mensagem
function TimeDisplay({ timestamp }: { timestamp: string | Date | null | undefined }) {
  const [formattedTime, setFormattedTime] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const timeRef = useRef<{lastUpdate: number}>({lastUpdate: 0})
  
  useEffect(() => {
    // Marcar que o componente está montado no cliente
    setMounted(true)
    
    if (!timestamp) {
      setFormattedTime(null)
      return
    }
    
    const updateTime = () => {
      try {
        // Converter para Date se for string
        const date = timestamp instanceof Date ? timestamp : new Date(timestamp)
        
        // Verificar se a data é válida
        if (isNaN(date.getTime())) {
          console.error("Data inválida:", timestamp)
          setFormattedTime(null)
          return
        }
        
        // Obter a data atual
        const now = new Date()
        
        // Calcular a diferença em dias
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
        const diffTime = today.getTime() - messageDate.getTime()
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
        
        let formattedOutput = ""
        
        // Formatar com base na diferença de dias
        if (diffDays === 0) {
          // Hoje - mostrar apenas hora:minuto
          formattedOutput = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
        } else if (diffDays === 1) {
          // Ontem
          formattedOutput = "ontem"
        } else {
          // Dias anteriores - mostrar dia da semana abreviado e dia do mês
          const diasSemana = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
          const diaSemana = diasSemana[date.getDay()]
          const diaMes = date.getDate()
          formattedOutput = `${diaSemana}, ${diaMes}`
        }
        
        setFormattedTime(formattedOutput)
        
        // Atualizar a referência de última atualização
        timeRef.current.lastUpdate = Date.now()
      } catch (error) {
        console.error("Erro ao formatar data:", error)
        setFormattedTime(null)
      }
    }
    
    // Atualizar imediatamente
    updateTime()
    
    // Configurar intervalo para atualizar o tempo apenas a cada minuto
    // em vez de a cada renderização
    const interval = setInterval(() => {
      updateTime()
    }, 60000) // Atualizar a cada minuto
    
    return () => clearInterval(interval)
  }, [timestamp])
  
  // Apenas no cliente e quando montado, renderizar o conteúdo
  if (!mounted) {
    // Retornar um placeholder vazio com tamanho idêntico para evitar layout shift
    return <span className="text-xs font-medium invisible">------</span>;
  }
  
  // Se não tiver formato definido, não renderizar
  if (!formattedTime) return null;
  
  return (
    <span className="text-xs font-medium text-gray-400" suppressHydrationWarning>
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
  const [activeTab, setActiveTab] = useState<"groups" | "conversations">("conversations")
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
  
  // Referência para controlar atualizações em segundo plano
  const backgroundUpdateRef = useRef<{
    lastUpdate: number;
    isUpdating: boolean;
    pendingUpdate: boolean;
  }>({
    lastUpdate: 0,
    isUpdating: false,
    pendingUpdate: false
  })

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
  const fetchConversations = async (userId: string, options?: { silent?: boolean; force?: boolean }) => {
    const silent = options?.silent || false;
    const force = options?.force || false;
    
    // Verificar se já estamos atualizando ou se a última atualização foi muito recente (menos de 30 segundos)
    const now = Date.now();
    if (!force && backgroundUpdateRef.current.isUpdating) {
      console.log("[CONV LIST DEBUG] Atualização já em andamento, marcando como pendente");
      backgroundUpdateRef.current.pendingUpdate = true;
      return;
    }
    
    if (!force && !silent && now - backgroundUpdateRef.current.lastUpdate < 30000) {
      console.log("[CONV LIST DEBUG] Última atualização muito recente, ignorando");
      return;
    }
    
    // Marcar que estamos atualizando
    backgroundUpdateRef.current.isUpdating = true;
    
    // Apenas mostrar loading se não for uma atualização silenciosa
    if (!silent) {
      setIsLoading(true);
    }
    
    setLoadError(null);
    
    try {
      console.log(`Buscando conversas para usuário ${userId}${silent ? ' (silenciosamente)' : ''}`);
      
      // Verificar se temos conversas em cache
      let cachedConversations = [];
      try {
        const cachedData = localStorage.getItem(`conversations_${userId}`);
        if (cachedData) {
          const parsed = JSON.parse(cachedData);
          // Usar dados em cache apenas se forem recentes (menos de 5 minutos)
          const cacheTime = new Date(parsed.timestamp).getTime();
          const now = new Date().getTime();
          
          // Se o cache for recente e não estamos forçando atualização, usar o cache
          if (!force && now - cacheTime < 5 * 60 * 1000) {
            console.log(`Usando ${parsed.data.length} conversas do cache (${Math.floor((now - cacheTime) / 1000)}s atrás)`);
            cachedConversations = parsed.data;
            
            // Se for uma atualização silenciosa e temos dados em cache, atualizar o estado sem mostrar loading
            if (silent) {
              setConversations(cachedConversations);
              backgroundUpdateRef.current.lastUpdate = now;
              backgroundUpdateRef.current.isUpdating = false;
              
              // Verificar se há uma atualização pendente
              if (backgroundUpdateRef.current.pendingUpdate) {
                backgroundUpdateRef.current.pendingUpdate = false;
                // Agendar uma nova atualização em segundo plano após um pequeno delay
                setTimeout(() => fetchConversations(userId, { silent: true }), 1000);
              }
              
              return;
            }
          }
        }
      } catch (err) {
        console.error("Erro ao carregar conversas do cache:", err);
      }
      
      // Buscar conversas do servidor
      const data = await fetchUserConversations(userId);
      console.log(`Recebidas ${data.length} conversas do servidor`);
      
      // Salvar no cache
      try {
        localStorage.setItem(`conversations_${userId}`, JSON.stringify({
          timestamp: new Date().toISOString(),
          data
        }));
      } catch (err) {
        console.error("Erro ao salvar conversas no cache:", err);
      }
      
      // Atualizar estado apenas se houver mudanças ou se for forçado
      const hasChanges = !cachedConversations.length || 
                         JSON.stringify(data) !== JSON.stringify(cachedConversations);
      
      if (hasChanges || force) {
        setConversations(data);
      } else if (silent) {
        console.log("[CONV LIST DEBUG] Nenhuma mudança detectada, mantendo estado atual");
      }
      
      // Atualizar timestamp da última atualização
      backgroundUpdateRef.current.lastUpdate = now;
      
      // Se tiver uma conversa selecionada anteriormente, verificar se ainda existe
      if (lastSelectedConversationId) {
        const conversationExists = data.some(c => c.id === lastSelectedConversationId);
        if (!conversationExists) {
          console.log(`Conversa selecionada ${lastSelectedConversationId} não existe mais`);
          setLastSelectedConversationId(null);
        }
      }
    } catch (error) {
      console.error("Erro ao buscar conversas:", error);
      setLoadError("Não foi possível carregar suas conversas. Tente novamente mais tarde.");
      
      // Em caso de erro, tentar usar o cache
      try {
        const cachedData = localStorage.getItem(`conversations_${userId}`);
        if (cachedData) {
          const parsed = JSON.parse(cachedData);
          console.log(`Usando ${parsed.data.length} conversas do cache devido a erro`);
          setConversations(parsed.data);
        }
      } catch (err) {
        console.error("Erro ao usar cache após falha:", err);
      }
    } finally {
      // Finalizar loading apenas se não for silencioso
      if (!silent) {
        setIsLoading(false);
      }
      
      // Marcar que não estamos mais atualizando
      backgroundUpdateRef.current.isUpdating = false;
      
      // Verificar se há uma atualização pendente
      if (backgroundUpdateRef.current.pendingUpdate) {
        backgroundUpdateRef.current.pendingUpdate = false;
        // Agendar uma nova atualização em segundo plano após um pequeno delay
        setTimeout(() => fetchConversations(userId, { silent: true }), 1000);
      }
    }
  };

  useEffect(() => {
    setMounted(true)
    
    // Carregar última conversa selecionada do localStorage
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
    
    // Configurar verificação periódica de autenticação (a cada 2 minutos em vez de 30 segundos)
    const authInterval = setInterval(() => {
      if (typeof window !== 'undefined' && document.visibilityState === 'visible') {
        checkAuthentication();
      }
    }, 120000); // Aumentado para 2 minutos (120000ms)
    
    // Configurar atualização periódica em segundo plano
    const backgroundUpdateInterval = setInterval(() => {
      if (typeof window !== 'undefined' && currentUserId) {
        // Atualizar silenciosamente em segundo plano
        fetchConversations(currentUserId, { silent: true });
      }
    }, 60000); // Atualizar a cada 1 minuto
    
    // Verificar quando o documento volta a ficar visível
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && currentUserId) {
        // Quando a página volta a ficar visível, atualizar silenciosamente
        fetchConversations(currentUserId, { silent: true });
        
        // Verificar autenticação apenas se a última verificação foi há mais de 2 minutos
        const now = Date.now();
        if (now - (backgroundUpdateRef.current.lastUpdate || 0) > 120000) {
          checkAuthentication();
        }
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
      
      // Atualizar a lista em segundo plano após um evento de mensagem
      if (userId) {
        setTimeout(() => {
          console.log("[CONV DEBUG] Atualizando lista de conversas após evento de mensagem");
          fetchConversations(userId, { silent: true });
        }, 1000); // Reduzido para 1 segundo e silencioso
      }
    };
    
    fetchAllUsers();
    
    return () => {
      clearInterval(authInterval);
      clearInterval(backgroundUpdateInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('messageWasSent', handleMessageSent);
      
      if (authTimerRef.current) {
        clearTimeout(authTimerRef.current);
      }
    };
  }, [checkAuthentication, currentUserId, conversations]);

  // Função para filtrar conversas com base na aba ativa
  const filterConversationsByTab = (convs: Conversation[], tab: "groups" | "conversations"): Conversation[] => {
    return convs.filter(conversation => {
      // Garantir que a conversa tem todos os campos necessários
      if (!conversation || typeof conversation !== 'object') return false;
      
      // Filtrar conforme a aba
      if (tab === "conversations") {
        // Na aba de conversas, mostrar apenas conversas diretas
        return conversation.type === "direct";
      } else if (tab === "groups") {
        // Na aba de grupos, mostrar apenas grupos
        return conversation.type === "group";
      }
      
      return false;
    });
  };

  // Filtrar conversas diretas para a aba de Conversas
  const filteredDirectConversations = conversations.filter(conversation => {
    // Garantir que a conversa tem todos os campos necessários
    if (!conversation || typeof conversation !== 'object') return false;
    
    // Mostrar apenas conversas diretas
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
    
    return false;
  });

  // Filtrar grupos para a aba de Grupos
  const filteredGroupConversations = conversations.filter(conversation => {
    // Garantir que a conversa tem todos os campos necessários
    if (!conversation || typeof conversation !== 'object') return false;
    
    // Mostrar apenas grupos
    if (conversation.type === "group" && conversation.title) {
      return conversation.title.toLowerCase().includes(searchTerm.toLowerCase());
    }
    
    return false;
  });

  // Filtrar usuários para a lista de contatos (para iniciar novas conversas)
  const filteredUsers = users.filter(user => {
    if (user.id === currentUserId) return false
    
    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.toLowerCase()
    const email = (user.email || '').toLowerCase()
    const term = searchTerm.toLowerCase()
    
    return fullName.includes(term) || email.includes(term)
  });

  // Função de fallback para seleção de conversa em caso de erro
  const fallbackSelection = (conversationId: string) => {
    // Verificar se temos dados do destinatário salvos no localStorage
    try {
      const savedData = getSavedRecipientData(conversationId);
      
      if (savedData) {
        console.log("Usando dados do destinatário salvos para fallback:", savedData);
        onSelectConversation(conversationId, { 
          id: conversationId,
          type: "direct",
          recipientData: savedData
        });
      } else {
        // Dados genéricos como último recurso
        const genericData = {
          id: conversationId,
          type: "direct",
          recipientData: {
            id: "",
            name: "Usuário",
            email: "Conversa direta",
            avatar: null
          }
        };
        
        console.log("Selecionando conversa com dados genéricos (fallback)");
        onSelectConversation(conversationId, genericData);
      }
    } catch (err) {
      console.error("Erro no fallback de seleção:", err);
      // Último recurso
      onSelectConversation(conversationId, { 
        id: conversationId,
        type: "direct" 
      });
    }
  };

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
        await fetchConversations(currentUserId, { silent: false, force: true });
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
  }

  const handleConversationClick = (conversation: Conversation) => {
    // Evitar processamento se a conversa não tiver ID
    if (!conversation || !conversation.id) {
      console.error("Tentativa de selecionar conversa inválida:", conversation);
      return;
    }

    // Atualizar o ID da última conversa selecionada
    setLastSelectedConversationId(conversation.id);

    // Preparar os dados para passar ao callback
    let conversationData: any = {
      id: conversation.id,
      type: conversation.type
    };

    if (conversation.type === "direct") {
      // Para conversas diretas, extrair informações do outro participante
      const profiles = conversation.profiles || [];
      const otherParticipants = profiles.filter(
        profile => profile && profile.id !== currentUserId
      );
      
      if (otherParticipants.length > 0) {
        const otherUser = otherParticipants[0];
        conversationData = {
          ...conversationData,
          profiles: conversation.profiles,
          recipientName: `${otherUser.first_name || ''} ${otherUser.last_name || ''}`.trim() || 'Usuário',
          recipientEmail: otherUser.email || '',
          recipientAvatar: otherUser.avatar_url || "/placeholder.svg"
        };
      } else {
        // Fallback se não encontrar participantes
        conversationData = {
          ...conversationData,
          profiles: conversation.profiles,
          recipientName: 'Usuário',
          recipientEmail: 'Conversa direta',
          recipientAvatar: "/placeholder.svg"
        };
      }
    } else if (conversation.type === "group") {
      // Para grupos
      conversationData = {
        ...conversationData,
        title: conversation.title || 'Grupo',
        profiles: conversation.profiles,
        avatar_url: conversation.avatar_url || "/placeholder.svg"
      };
    }

    // Chamar o callback com os dados processados
    onSelectConversation(conversation.id, conversationData);
  };

  // Renderizar um estado de carregamento até que o componente seja montado no cliente
  if (!mounted) {
    return (
      <div className="flex flex-col h-full border-r w-80">
        <div className="p-4 border-b">
          <div className="h-9 bg-muted animate-pulse rounded-md"></div>
        </div>
        <div className="flex-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={`skeleton-${i}`} className="flex items-center gap-3 p-4 animate-pulse">
              <div className="h-10 w-10 bg-muted rounded-full"></div>
              <div className="flex-1">
                <div className="h-4 w-32 bg-muted rounded mb-2"></div>
                <div className="h-3 w-40 bg-muted rounded"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full border-r w-80">
      <div className="p-4 border-b">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
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
        onValueChange={(value) => setActiveTab(value as "groups" | "conversations")}
        className="w-full h-full flex flex-col"
      >
        <TabsList className="w-full justify-start px-4 h-12">
          <TabsTrigger value="conversations" className="flex items-center gap-1">
            <MessageSquare className="h-4 w-4" />
            <span>Conversas</span>
          </TabsTrigger>
          <TabsTrigger value="groups" className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            <span>Grupos</span>
          </TabsTrigger>
        </TabsList>
        
        {/* Aba de Conversas (antigas Usuários) */}
        <TabsContent value="conversations" className="mt-0 flex-1 overflow-y-auto">
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
              {/* Lista unificada de conversas e contatos */}
              {filteredDirectConversations.length === 0 && filteredUsers.length === 0 ? (
                <div className="flex justify-center items-center p-6 text-sm text-muted-foreground">
                  <p>Nenhuma conversa ou contato encontrado.</p>
                </div>
              ) : (
                <>
                  {/* Mostrar todas as conversas diretas existentes */}
                  {filteredDirectConversations.map((conversation) => {
                    // Para conversas diretas, mostrar o nome do outro participante
                    let displayName = "";
                    let displayEmail = "";
                    let avatarSrc = "";
                    
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
                    
                    // Extrair a última mensagem
                    const lastMessageContent = conversation.lastMessage 
                      ? conversation.lastMessage.type === "text" 
                        ? conversation.lastMessage.message_text || conversation.lastMessage.content || "Mensagem"
                        : "Arquivo enviado" 
                      : "Nenhuma mensagem";
                    
                    return (
                      <button
                        key={conversation.id}
                        className="flex items-center gap-3 p-4 hover:bg-accent text-left w-full"
                        onClick={() => handleConversationClick(conversation)}
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
                  })}
                  
                  {/* Mostrar usuários que ainda não têm conversas */}
                  {filteredUsers
                    .filter(user => {
                      // Filtrar usuários que já têm conversas diretas
                      const hasExistingConversation = filteredDirectConversations.some(conv => {
                        const profiles = conv.profiles || [];
                        return profiles.some(profile => profile && profile.id === user.id);
                      });
                      return !hasExistingConversation;
                    })
                    .map((user) => (
                      <button
                        key={user.id}
                        className="flex items-center gap-3 p-4 hover:bg-accent text-left w-full"
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
                    ))
                  }
                </>
              )}
            </div>
          )}
        </TabsContent>
        
        {/* Aba de Grupos (antigas Conversas) */}
        <TabsContent value="groups" className="mt-0 flex-1 overflow-y-auto">
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
              {/* Skeleton loaders para grupos */}
              {[1, 2, 3].map((i) => (
                <div key={`skeleton-group-${i}`} className="flex items-center gap-3 p-4 animate-pulse">
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
              {filteredGroupConversations.length === 0 ? (
                <div className="flex justify-center items-center p-6 text-sm text-muted-foreground">
                  <p>Ainda não há grupos. Crie um novo grupo para começar.</p>
                </div>
              ) : (
                filteredGroupConversations.map((conversation) => {
                  // Para grupos
                  const displayName = conversation.title || 'Grupo';
                  const profiles = conversation.profiles || [];
                  const displayEmail = `${profiles.length} participantes`;
                  const avatarSrc = conversation.avatar_url || "/placeholder.svg";
                  
                  // Extrair a última mensagem
                  const lastMessageContent = conversation.lastMessage 
                    ? conversation.lastMessage.type === "text" 
                      ? conversation.lastMessage.message_text || conversation.lastMessage.content || "Mensagem"
                      : "Arquivo enviado" 
                    : "Nenhuma mensagem";
                  
                  return (
                    <button
                      key={conversation.id}
                      className="flex items-center gap-3 p-4 hover:bg-accent text-left w-full"
                      onClick={() => handleConversationClick(conversation)}
                    >
                      <Avatar>
                        <AvatarImage src={avatarSrc} />
                        <AvatarFallback>
                          {displayName[0] || "G"}
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
      </Tabs>
    </div>
  )
}

