"use client"

import { useEffect, useState } from "react"
import { Search, Plus, Users, MessageSquare } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { fetchUserConversations, createConversation, getCurrentUser, supabase } from "@/lib/supabase"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"

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
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [mounted, setMounted] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false)
  const [groupName, setGroupName] = useState("")
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [groupAvatar, setGroupAvatar] = useState<File | null>(null)
  const [activeTab, setActiveTab] = useState("conversations")
  const [isCreatingConversation, setIsCreatingConversation] = useState(false)

  useEffect(() => {
    // Marcar que estamos no cliente
    setMounted(true)
    
    const fetchCurrentUser = async () => {
      try {
        const user = await getCurrentUser()
        if (user) {
          setCurrentUserId(user.id)
          fetchConversations(user.id)
        }
      } catch (error) {
        console.error("Erro ao obter usuário atual:", error)
      }
    }
    
    const fetchConversations = async (userId: string) => {
      setIsLoading(true)
      try {
        const data = await fetchUserConversations(userId)
        setConversations(data || [])
      } catch (error) {
        console.error("Erro ao buscar conversas:", error)
      } finally {
        setIsLoading(false)
      }
    }
    
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
    
    fetchCurrentUser()
    fetchAllUsers()
    
    // Configurar listener para atualizações em tempo real
    const conversationsSubscription = supabase
      .channel('public:conversations')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'conversations' 
      }, (payload) => {
        if (currentUserId) {
          fetchConversations(currentUserId)
        }
      })
      .subscribe()
    
    const messagesSubscription = supabase
      .channel('public:messages')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'messages' 
      }, (payload) => {
        if (currentUserId) {
          fetchConversations(currentUserId)
        }
      })
      .subscribe()
    
    return () => {
      conversationsSubscription.unsubscribe()
      messagesSubscription.unsubscribe()
    }
  }, [currentUserId])

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

  // Função que gera um ID determinístico para uma sala entre dois usuários
  // Garante que o mesmo par de usuários sempre terá o mesmo ID de sala
  const getRoomId = (userIdA: string, userIdB: string): string => {
    // Não vamos mais concatenar IDs, mas gerar um UUID v4 aleatório
    // que será associado a este par de usuários
    return crypto.randomUUID();
  };

  // Função simplificada para obter ou criar uma sala de chat
  const getOrCreateChatRoom = async (otherUserId: string): Promise<string | null> => {
    try {
      if (!currentUserId) {
        console.error("Usuário não autenticado");
        return null;
      }
      
      console.log(`Verificando sala de chat entre usuários: ${currentUserId} e ${otherUserId}`);
      
      // Usar a função RPC segura para buscar salas compartilhadas
      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc(
          'get_user_conversations',
          { user_id: currentUserId }
        );
        
        if (rpcError) {
          console.error("Erro ao chamar RPC get_user_conversations:", rpcError);
        } else if (rpcData && Array.isArray(rpcData)) {
          // Filtrar apenas conversas diretas e que tenham o outro usuário como participante
          const sharedConversation = rpcData.find(conversation => {
            // Verificar se é uma conversa direta
            if (conversation.type !== 'direct') return false;
            
            // Verificar se o outro usuário é participante nesta conversa
            const participants = conversation.profiles || [];
            return participants.some((profile: any) => profile && profile.id === otherUserId);
          });
          
          if (sharedConversation) {
            console.log(`Conversa existente encontrada via RPC: ${sharedConversation.id}`);
            return sharedConversation.id;
          }
        }
      } catch (rpcError) {
        console.warn("RPC falhou, tentando método alternativo:", rpcError);
        // Continuar com fluxo alternativo se a RPC falhar
      }
      
      // Se chegou aqui, vamos tentar uma abordagem alternativa mais direta e segura
      console.log("Usando método alternativo para verificar conversas...");
      
      // Usar nossa função auxiliar para gerar o ID da sala a partir dos IDs dos usuários
      const expectedRoomId = getRoomId(currentUserId, otherUserId);
      
      // Verificar se esta sala específica já existe
      const { data: existingRoom, error: roomCheckError } = await supabase
        .from('conversations')
        .select('id')
        .eq('id', expectedRoomId)
        .maybeSingle();
      
      if (roomCheckError) {
        console.error("Erro ao verificar sala existente:", roomCheckError);
      } else if (existingRoom) {
        console.log(`Sala de chat existente encontrada por ID: ${existingRoom.id}`);
        return existingRoom.id;
      }
      
      // Se chegou aqui, não encontrou conversa existente, então vamos criar uma nova
      console.log("Criando nova sala de chat");
      
      // Usar o ID determinístico gerado para os dois usuários
      const newRoomId = expectedRoomId;
      
      // Criar a conversa com o ID determinístico
      const { data: conversationData, error: createError } = await supabase
        .from("conversations")
        .insert({
          id: newRoomId,
          type: "direct",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select();
      
      if (createError) {
        console.error("Erro ao criar sala:", createError);
        
        // Verificar se o erro é de chave duplicada, o que significa que a sala já existe
        if (createError.code === '23505') { // código de erro para chave duplicada
          console.log("Sala já existe (erro de duplicação), usando ID existente");
          return newRoomId;
        }
        
        alert("Não foi possível criar a sala de chat. Erro: " + createError.message);
        return null;
      }
      
      // Adicionar ambos os participantes simultaneamente
      const participantsToAdd = [
        {
          conversation_id: newRoomId,
          profile_id: currentUserId,
          role: "admin",
          created_at: new Date().toISOString()
        },
        {
          conversation_id: newRoomId,
          profile_id: otherUserId,
          role: "member",
          created_at: new Date().toISOString()
        }
      ];
      
      const { error: addParticipantsError } = await supabase
        .from("conversation_participants")
        .insert(participantsToAdd);
      
      if (addParticipantsError) {
        console.error("Erro ao adicionar participantes:", addParticipantsError);
        
        // Limpar a conversa criada para evitar órfãos
        try {
          await supabase
            .from("conversations")
            .delete()
            .eq("id", newRoomId);
          console.log("Sala excluída após falha ao adicionar participantes.");
        } catch (deleteError) {
          console.error("Erro ao excluir sala após falha:", deleteError);
        }
        
        return null;
      }
      
      console.log(`Nova sala criada com ID: ${newRoomId} e participantes adicionados com sucesso`);
      return newRoomId;
    } catch (error) {
      console.error("Erro ao acessar sala de chat:", error);
      return null;
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
      console.log("Iniciando criação de sala para o usuário:", user.id, user.email);
      
      // Obter ou criar uma sala para este par de usuários
      const roomId = await getOrCreateChatRoom(user.id);
      
      if (!roomId) {
        console.error("Falha ao obter/criar sala de chat com o usuário:", user.id);
        alert("Não foi possível acessar a sala de chat. Tente novamente.");
        setIsCreatingConversation(false);
        return;
      }
      
      // Dados do outro usuário para exibir no chat
      const userData = {
        name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Usuário',
        email: user.email || '',
        avatar: user.avatar_url
      };
      
      console.log("Sala de chat criada ou obtida com sucesso:", roomId);
      console.log("Dados do usuário para a conversa:", userData);
      
      console.log("Mudando para a aba de conversas...");
      setActiveTab("conversations");
      
      // Atualizar a lista de conversas antes de selecionar
      console.log("Recarregando lista de conversas...");
      const data = await fetchUserConversations(currentUserId);
      setConversations(data || []);
        
      // Verificar se a conversa está na lista atualizada
      const conversationExists = data?.some((c: Conversation) => c.id === roomId);
      console.log("Conversa encontrada na lista atualizada:", conversationExists ? "Sim" : "Não");
      
      // Pequeno atraso para garantir que a aba de conversas foi carregada e os estados atualizados
      console.log("Aguardando atualização de estados...");
      setTimeout(() => {
        // Validação final antes de selecionar a conversa
        if (!onSelectConversation) {
          console.error("Callback onSelectConversation não disponível");
          return;
        }
        
        // Enviar para o componente de chat
        console.log("Chamando onSelectConversation com:", roomId, userData);
        onSelectConversation(roomId, userData);
        console.log("Processo de seleção de conversa concluído com sucesso");
      }, 300); // Aumentar o tempo de espera para garantir que todos os estados foram atualizados
    } catch (error) {
      console.error("Erro ao processar sala de chat:", error);
      alert("Ocorreu um erro ao acessar a sala de chat. Por favor, tente novamente.");
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
      console.error("Callback onSelectConversation não fornecido");
      return;
    }
    
    if (!currentUserId) {
      console.error("Usuário não autenticado, não é possível selecionar conversa");
      return;
    }
    
    console.log("Processando clique na conversa:", conversation.id);
    
    try {
      // Para conversas diretas, obter informações do outro participante
      if (conversation.type === "direct") {
        // Verificar se profiles existe e é um array
        const profiles = conversation.profiles || [];
        
        const otherParticipants = profiles.filter(
          profile => profile && profile.id !== currentUserId
        );
        
        if (otherParticipants.length > 0) {
          const otherUser = otherParticipants[0];
          const name = `${otherUser.first_name || ''} ${otherUser.last_name || ''}`.trim() || 'Usuário';
          
          const conversationData = {
            name,
            email: otherUser.email || '',
            avatar: otherUser.avatar_url
          };
          
          console.log("Selecionando conversa direta com usuário:", name);
          onSelectConversation(conversation.id, conversationData);
          return;
        } else {
          // Se não encontrar outro participante, extrair informações do ID da sala
          // já que estamos usando o formato userIdA_userIdB
          try {
            if (conversation.id && conversation.id.includes('_')) {
              // Tentar encontrar o ID do outro usuário
              const userIds = conversation.id.split('_');
              const otherUserId = userIds.find(id => id !== currentUserId);
              
              if (otherUserId) {
                // Buscar informações do usuário diretamente
                const { data: userData } = await supabase
                  .from('profiles')
                  .select('first_name, last_name, email, avatar_url')
                  .eq('id', otherUserId)
                  .single();
                
                if (userData) {
                  const name = `${userData.first_name || ''} ${userData.last_name || ''}`.trim() || 'Usuário';
                  const conversationData = {
                    name,
                    email: userData.email || '',
                    avatar: userData.avatar_url
                  };
                  
                  console.log("Selecionando conversa com usuário (via lookup):", name);
                  onSelectConversation(conversation.id, conversationData);
                  return;
                }
              }
            }
            
            // Se não conseguir extrair do ID, usar dados genéricos
            console.warn("Não foi possível identificar o outro participante:", conversation.id);
            const conversationData = {
              name: 'Usuário',
              email: 'Conversa direta',
              avatar: null
            };
            
            console.log("Selecionando conversa com dados genéricos");
            onSelectConversation(conversation.id, conversationData);
          } catch (userLookupError) {
            console.error("Erro ao buscar detalhes do usuário:", userLookupError);
            const conversationData = {
              name: 'Usuário',
              email: 'Conversa direta',
              avatar: null
            };
            
            console.log("Selecionando conversa após erro de lookup");
            onSelectConversation(conversation.id, conversationData);
          }
        }
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
      if (groupAvatar) {
        try {
          const fileExt = groupAvatar.name.split(".").pop()
          const fileName = `group_${Date.now()}.${fileExt}`
          
          const { data, error } = await supabase.storage
            .from("avatars")
            .upload(fileName, groupAvatar, {
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
        const data = await fetchUserConversations(currentUserId);
        setConversations(data || []);
        
        // Selecionar o novo grupo
        const foundConversation = data?.find((conversation: Conversation) => conversation.id === conversationId);
        if (foundConversation) {
          // Como handleConversationClick agora é async, precisamos tratar corretamente
          await handleConversationClick(foundConversation);
        }
      }
      
      // Resetar o formulário
      setGroupName("")
      setSelectedUsers([])
      setGroupAvatar(null)
      setIsCreateGroupOpen(false)
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
      setGroupAvatar(e.target.files[0])
    }
  }

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
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
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
            <Dialog open={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen}>
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
                    {groupAvatar && (
                      <div className="mt-2 flex justify-center">
                        <Avatar className="h-16 w-16">
                          <AvatarImage src={URL.createObjectURL(groupAvatar)} />
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
            <div className="flex justify-center items-center p-4">
              <p>Carregando conversas...</p>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="flex justify-center items-center p-4">
              <p>Nenhuma conversa encontrada</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {filteredConversations.map((conversation) => {
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
                    ? conversation.lastMessage.content 
                    : "Arquivo enviado" 
                  : "Nenhuma mensagem";
                
                return (
                  <button
                    key={conversation.id}
                    className="flex items-center gap-3 p-4 hover:bg-accent text-left"
                    onClick={() => {
                      // Como handleConversationClick agora é async, envolvemos em uma função anônima
                      handleConversationClick(conversation).catch(err => {
                        console.error("Erro ao clicar na conversa:", err);
                      });
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
              })}
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
                  onClick={() => handleUserClick(user)}
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

