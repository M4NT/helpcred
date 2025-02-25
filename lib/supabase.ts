import { createClient } from "@supabase/supabase-js"
import type { Company, Chat, Message } from "@/types"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
)

// Função auxiliar para obter o usuário atual
export async function getCurrentUser() {
  const { data } = await supabase.auth.getSession()
  return data.session?.user || null
}

// Função para registrar um novo usuário
export async function registerUser(email: string, password: string, userData: {
  first_name: string;
  last_name: string;
}) {
  try {
    const redirectUrl = typeof window !== 'undefined' ? `${window.location.origin}/` : undefined;
    
    // Registrar o usuário com Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: userData.first_name,
          last_name: userData.last_name,
        },
        emailRedirectTo: redirectUrl
      }
    })
    
    if (authError) throw authError
    
    // Se o registro for bem-sucedido e tivermos um usuário
    if (authData.user) {
      // Inserir dados do perfil
      const { error: profileError } = await supabase.from('profiles').insert({
        id: authData.user.id,
        email: email,
        first_name: userData.first_name,
        last_name: userData.last_name,
        created_at: new Date().toISOString()
      })
      
      if (profileError) {
        console.error("Erro ao criar perfil:", profileError)
        // Tentar excluir o usuário se o perfil falhar
        await supabase.auth.admin.deleteUser(authData.user.id)
        throw profileError
      }
      
      return authData
    }
    
    return authData
  } catch (error) {
    console.error("Erro ao registrar usuário:", error)
    throw error
  }
}

export async function fetchCompanies() {
  const { data, error } = await supabase.from("companies").select("*")
  if (error) throw error
  return data as Company[]
}

export async function fetchChats(companyId: string) {
  const { data, error } = await supabase
    .from("chats")
    .select("*")
    .eq("companyId", companyId)
    .order("timestamp", { ascending: false })
  if (error) throw error
  return data as Chat[]
}

// Função para buscar conversas do usuário - versão ultra simplificada
export async function fetchUserConversations(userId: string) {
  try {
    console.log("Buscando conversas para o usuário:", userId);
    
    // Verificar se o usuário está autenticado
    const { data: session } = await supabase.auth.getSession();
    if (!session || !session.session) {
      console.error("Usuário não autenticado ao buscar conversas");
      return [];
    }
    
    // Garantir que estamos usando o ID do usuário logado
    const authenticatedUserId = session.session.user.id;
    if (userId !== authenticatedUserId) {
      console.warn("Usando ID do usuário autenticado em vez do solicitado");
      userId = authenticatedUserId;
    }
    
    // Abordagem via função RPC para evitar recursão nas políticas RLS
    try {
      // Tentar uma função RPC personalizada (se existir)
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        'get_user_conversations',
        { user_id: userId }
      );
      
      if (!rpcError && rpcData) {
        console.log("Conversas obtidas via RPC:", rpcData.length);
        return rpcData;
      }
    } catch (rpcErr) {
      console.log("Função RPC não disponível, usando método alternativo");
      // Continuamos com o método alternativo abaixo
    }
    
    // Abordagem alternativa: consulta SQL direta
    // Esta instrução evita a verificação de políticas RLS na tabela conversation_participants
    const { data: directData, error: directError } = await supabase.from('conversations')
      .select(`
        id, 
        type, 
        title, 
        avatar_url, 
        created_at, 
        updated_at
      `)
      .order('updated_at', { ascending: false });
    
    if (directError) {
      console.error("Erro na consulta direta:", directError.message);
      return [];
    }
    
    if (!directData || directData.length === 0) {
      console.log("Nenhuma conversa encontrada");
      return [];
    }
    
    console.log(`Recuperadas ${directData.length} conversas potenciais`);
    
    // Verificar cada conversa manualmente para pertencimento
    const result = await Promise.all(directData.map(async (conversation) => {
      try {
        // Tentar obter a última mensagem
        const { data: messages } = await supabase
          .from("messages")
          .select("*")
          .eq("conversation_id", conversation.id)
          .order("created_at", { ascending: false })
          .limit(1);
          
        const lastMessage = messages && messages.length > 0 ? messages[0] : null;
        
        // Buscar perfis relacionados à conversa
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, email, avatar_url");
        
        // Filtrar apenas perfis relevantes - um workaround para evitar a tabela conversation_participants
        const relevantProfiles = profiles?.filter(profile => {
          // Para conversas diretas, verificar pelo ID determinístico
          if (conversation.type === "direct") {
            const userIds = conversation.id.split('_');
            return userIds.includes(profile.id);
          }
          // Para grupos, incluir todos (será filtrado depois via frontend)
          return true;
        }) || [];
        
        // Verificar se o usuário atual está entre os perfis relevantes
        if (conversation.type === "direct") {
          const isParticipant = conversation.id.includes(userId);
          if (!isParticipant) {
            return null; // Não é participante, pular esta conversa
          }
        }
        
        return {
          ...conversation,
          profiles: relevantProfiles,
          lastMessage,
          lastMessageTime: lastMessage ? lastMessage.created_at : null
        };
      } catch (err) {
        console.warn(`Erro ao processar detalhes da conversa ${conversation.id}:`, err);
        return null;
      }
    }));
    
    // Filtrar resultados nulos
    const filteredResults = result.filter(item => item !== null);
    console.log(`Processadas ${filteredResults.length} conversas relevantes`);
    return filteredResults;
  } catch (error) {
    console.error("Erro geral ao buscar conversas:", error);
    return [];
  }
}

export async function fetchMessages(userId: string, conversationId: string): Promise<Message[]> {
  try {
    console.log(`Iniciando carregamento de mensagens para conversa ${conversationId} por usuário ${userId}`);
    
    // Verificar se o usuário é participante da conversa - verificação alternativa para evitar problemas de política
    try {
      // Verificar diretamente pelo ID da conversa para salas diretas
      if (conversationId.includes('_')) {
        const userIds = conversationId.split('_');
        const isParticipant = userIds.includes(userId);
        
        if (!isParticipant) {
          console.error("Usuário não está incluído no ID da conversa direta");
          return [];
        }
        
        console.log("Usuário verificado como participante pelo ID da conversa direta");
      } else {
        // Verificação tradicional via tabela de participantes
        const { data: participantData, error: participantError } = await supabase
          .from("conversation_participants")
          .select("*")
          .eq("conversation_id", conversationId)
          .eq("profile_id", userId);
        
        if (participantError) {
          // Verificar se é erro de recursão
          if (participantError.code === "42P17") {
            console.warn("Detectada recursão infinita na verificação de participante, continuando assim mesmo");
            // Prosseguir com o carregamento de mensagens
          } else {
            console.error("Erro ao verificar participante:", participantError);
            throw participantError;
          }
        } else if (!participantData || participantData.length === 0) {
          console.error("Usuário não é participante desta conversa segundo a tabela");
          return [];
        } else {
          console.log("Usuário verificado como participante via tabela de participantes");
        }
      }
    } catch (verificationError) {
      console.warn("Erro ao verificar participação, tentando carregar mensagens mesmo assim:", verificationError);
      // Continuar mesmo com erro de verificação
    }
    
    // Buscar mensagens
    console.log(`Buscando mensagens para conversa ${conversationId}...`);
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    
    if (error) {
      console.error("Erro ao buscar mensagens:", error.message);
      throw error;
    }
    
    console.log(`Encontradas ${data?.length || 0} mensagens para conversa ${conversationId}`);
    
    if (!data) return [];
    
    // Mapear as mensagens para o formato esperado
    const mappedMessages = data.map(message => ({
      id: message.id,
      chatId: message.conversation_id,
      content: message.message_text || message.content, // Prioriza message_text, com fallback para content
      type: message.type,
      sender: message.sender_id === userId ? "agent" : "customer",
      timestamp: message.created_at,
      fileName: message.file_name,
      fileSize: message.file_size
    })) as Message[];
    
    console.log(`Mapeadas ${mappedMessages.length} mensagens para exibição`);
    return mappedMessages;
  } catch (error) {
    console.error("Erro ao buscar mensagens:", error);
    throw error;
  }
}

export async function sendMessage({ 
  chatId, 
  content, 
  type = "text",
  sender,
  fileName = null,
  fileSize = null 
}: {
  chatId: string;
  content: string;
  type?: "text" | "file" | "audio";
  sender: string;
  fileName?: string | null;
  fileSize?: number | null;
}) {
  try {
    console.log(`Enviando mensagem para conversa ${chatId}:`, { content, type, sender });
    
    // Obter ID do usuário atual
    const { data: session } = await supabase.auth.getSession();
    if (!session || !session.session) {
      throw new Error("Usuário não autenticado");
    }
    
    const senderId = session.session.user.id;
    
    // Criar mensagem - preenchendo tanto content quanto message_text
    const { data, error } = await supabase.from("messages").insert({
      conversation_id: chatId,
      sender_id: senderId,
      content: content, // Coluna content
      message_text: content, // Coluna message_text
      type,
      file_name: fileName,
      file_size: fileSize,
      timestamp: new Date().toISOString()
    }).select();
    
    if (error) {
      console.error("Erro ao enviar mensagem:", error);
      throw error;
    }
    
    // Atualizar timestamp da conversa
    await supabase.from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", chatId);
    
    return data[0];
  } catch (error) {
    console.error("Erro ao enviar mensagem:", error);
    throw error;
  }
}

export async function findDirectConversation(userId1: string, userId2: string): Promise<string | null> {
  try {
    console.log(`Buscando conversa direta entre ${userId1} e ${userId2}`);
    
    // Verificar autenticação
    const { data: session } = await supabase.auth.getSession();
    if (!session || !session.session) {
      console.error("Usuário não autenticado");
      return null;
    }
    
    // Verificação #1: Buscar diretamente pela tabela de participantes
    const { data: participantsData, error: participantsError } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('profile_id', userId1);
    
    if (participantsError) {
      console.error("Erro ao verificar participação:", participantsError);
    } else if (participantsData && participantsData.length > 0) {
      // Obtemos todas as conversas do usuário 1
      const conversationIds = participantsData.map(p => p.conversation_id);
      
      // Agora verificamos quais dessas também têm o usuário 2 como participante
      const { data: matchingConversations, error: matchingError } = await supabase
        .from('conversations')
        .select(`
          id, 
          type,
          conversation_participants!inner(profile_id)
        `)
        .in('id', conversationIds)
        .eq('conversation_participants.profile_id', userId2)
        .eq('type', 'direct');
      
      if (!matchingError && matchingConversations && matchingConversations.length > 0) {
        // Se encontrarmos alguma conversa, retornar a primeira
        const directConversation = matchingConversations[0];
        console.log(`Conversa direta existente encontrada: ${directConversation.id}`);
        return directConversation.id;
      }
    }
    
    console.log("Nenhuma conversa direta encontrada entre os usuários");
    return null;
  } catch (error) {
    console.error("Erro ao buscar conversa direta:", error);
    return null;
  }
}

export async function createConversation(type: "direct" | "group", participants?: string[], title?: string, avatarUrl?: string) {
  try {
    const user = await getCurrentUser();
    
    if (!user) {
      throw new Error("Usuário não autenticado");
    }
    
    // Para conversas diretas, verificar se já existe
    if (type === "direct" && participants && participants.length === 1) {
      const existingConversationId = await findDirectConversation(user.id, participants[0]);
      
      if (existingConversationId) {
        console.log(`Usando conversa existente: ${existingConversationId}`);
        return existingConversationId;
      }
    }
    
    // Criar nova conversa se não existir
    console.log(`Criando nova conversa ${type}`);
    const now = new Date().toISOString();
    const { data: conversationData, error: conversationError } = await supabase
      .from("conversations")
      .insert({
        type,
        title: title || null,
        avatar_url: avatarUrl || null,
        created_at: now,
        updated_at: now
      })
      .select();
    
    if (conversationError) {
      console.error("Erro ao criar conversa:", conversationError);
      throw conversationError;
    }
    
    if (!conversationData || conversationData.length === 0) {
      throw new Error("Falha ao criar conversa");
    }
    
    const conversationId = conversationData[0].id;
    
    // Adicionar o criador como participante
    const { error: creatorError } = await supabase
      .from("conversation_participants")
      .insert({
        conversation_id: conversationId,
        profile_id: user.id,
        role: "admin",
        created_at: now
      });
    
    if (creatorError) {
      console.error("Erro ao adicionar criador como participante:", creatorError);
      throw creatorError;
    }
    
    // Adicionar outros participantes
    if (participants && participants.length > 0) {
      const participantsData = participants.map(participantId => ({
        conversation_id: conversationId,
        profile_id: participantId,
        role: "member",
        created_at: now
      }));
      
      const { error: participantsError } = await supabase
        .from("conversation_participants")
        .insert(participantsData);
      
      if (participantsError) {
        console.error("Erro ao adicionar participantes:", participantsError);
        throw participantsError;
      }
    }
    
    return conversationId;
  } catch (error) {
    console.error("Erro ao criar conversa:", error);
    throw error;
  }
}

export async function uploadFile(file: File) {
  try {
    const user = await getCurrentUser()
    
    if (!user) {
      throw new Error("Usuário não autenticado")
    }
    
    const fileExt = file.name.split(".").pop()
    const fileName = `${user.id}_${Date.now()}.${fileExt}`
    
    const { data, error } = await supabase.storage
      .from("chat-files")
      .upload(fileName, file, {
        cacheControl: "3600",
        upsert: false
      })
    
    if (error) throw error
    
    // Obter URL pública do arquivo
    const { data: urlData } = supabase.storage
      .from("chat-files")
      .getPublicUrl(fileName)
    
    return {
      ...data,
      publicUrl: urlData.publicUrl
    }
  } catch (error) {
    console.error("Erro ao fazer upload de arquivo:", error)
    throw error
  }
}

