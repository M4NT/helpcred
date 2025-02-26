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

// Função para inicializar o cliente Supabase com credenciais fornecidas pelo usuário
export function initSupabase(url: string, key: string) {
  return createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
}

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
    
    if (!userId) {
      console.error("ID do usuário não fornecido");
      return [];
    }
    
    // Abordagem 1: Buscar todas as conversas onde o usuário é participante
    const { data: participations, error: participationsError } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("profile_id", userId);
      
    if (participationsError) {
      console.error("Erro ao buscar participações do usuário:", participationsError.message);
    }
    
    // Abordagem 2: Buscar conversas diretas pelo formato do ID (userId_outroId ou outroId_userId)
    // Este é um fallback caso a abordagem 1 não encontre todas as conversas
    const { data: allConversations, error: conversationsError } = await supabase
      .from("conversations")
      .select("*")
      .order("updated_at", { ascending: false });
      
    if (conversationsError) {
      console.error("Erro ao buscar todas as conversas:", conversationsError.message);
      // Se não conseguimos buscar todas as conversas, pelo menos tentamos com as participações
      if (participations && participations.length > 0) {
        const participationIds = participations.map(p => p.conversation_id);
        
        const { data: participationConversations } = await supabase
          .from("conversations")
          .select("*")
          .in("id", participationIds)
          .order("updated_at", { ascending: false });
          
        // Retornar o que conseguimos com as participações
        const conversations = participationConversations || [];
        console.log(`Recuperadas ${conversations.length} conversas via participações`);
        return processConversations(conversations, userId);
      }
      return [];
    }
    
    // Conversas potenciais são:
    // 1. Aquelas onde o usuário está explicitamente como participante
    // 2. Conversas diretas onde o ID contém o userId do usuário atual
    let potentialConversations = allConversations || [];
    
    // Adicionar IDs de participações que podem não estar cobertos na busca por ID
    if (participations && participations.length > 0) {
      const participationIds = participations.map(p => p.conversation_id);
      potentialConversations = potentialConversations.filter(conv => {
        // Já incluído nas participações
        if (participationIds.includes(conv.id)) return true;
        
        // Conversa direta que contém o ID do usuário
        if (conv.type === "direct" && conv.id.includes(userId)) return true;
        
        // Não é relevante para este usuário
        return false;
      });
    } else {
      // Se não temos participações, filtrar apenas por conversas diretas que contêm o ID
      potentialConversations = potentialConversations.filter(conv => 
        conv.type === "direct" && conv.id.includes(userId)
      );
    }
    
    console.log(`Encontradas ${potentialConversations.length} conversas potenciais para o usuário`);
    
    // Processar conversas para adicionar metadados
    return processConversations(potentialConversations, userId);
  } catch (error) {
    console.error("Erro geral ao buscar conversas:", error);
    return [];
  }
}

// Função auxiliar para processar as conversas
async function processConversations(conversations: any[], userId: string) {
  // Processar cada conversa para adicionar metadados (última mensagem, participantes, etc)
  const result = await Promise.all(conversations.map(async (conversation) => {
    try {
      // Buscar a última mensagem da conversa
      const { data: messages } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: false })
        .limit(1);
        
      const lastMessage = messages && messages.length > 0 ? messages[0] : null;
      
      // Buscar perfis relacionados à conversa
      let relevantProfiles: any[] = [];
      
      if (conversation.type === "direct") {
        // Para conversas diretas, extrair o ID do outro usuário
        const otherUserId = conversation.id.split('_').find((id: string) => id !== userId);
        
        if (otherUserId) {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("id, first_name, last_name, email, avatar_url")
            .eq("id", otherUserId);
            
          relevantProfiles = profileData || [];
        }
      } else {
        // Para grupos, buscar todos os participantes
        const { data: participantsData } = await supabase
          .from("conversation_participants")
          .select("profile_id")
          .eq("conversation_id", conversation.id);
          
        if (participantsData && participantsData.length > 0) {
          const profileIds = participantsData.map(p => p.profile_id);
          
          const { data: profilesData } = await supabase
            .from("profiles")
            .select("id, first_name, last_name, email, avatar_url")
            .in("id", profileIds);
            
          relevantProfiles = profilesData || [];
        }
      }
      
      return {
        ...conversation,
        profiles: relevantProfiles,
        lastMessage,
        lastMessageTime: lastMessage ? lastMessage.created_at : conversation.updated_at
      };
    } catch (err) {
      console.warn(`Erro ao processar detalhes da conversa ${conversation.id}:`, err);
      return null;
    }
  }));
  
  // Filtrar resultados nulos e ordenar por data da última mensagem
  const filteredResults = result
    .filter(item => item !== null)
    .sort((a, b) => {
      const timeA = a?.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
      const timeB = b?.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
      return timeB - timeA; // Ordenar do mais recente para o mais antigo
    });
  
  console.log(`Processadas ${filteredResults.length} conversas relevantes para o usuário`);
  return filteredResults;
}

export async function fetchMessages(userId: string, conversationId: string): Promise<Message[]> {
  try {
    console.log(`[CHAT DEBUG] Iniciando carregamento de mensagens para conversa ${conversationId} por usuário ${userId}`);
    
    if (!conversationId) {
      console.error("[CHAT DEBUG] ID da conversa não fornecido para busca de mensagens");
      return [];
    }
    
    if (!userId) {
      console.error("[CHAT DEBUG] ID do usuário não fornecido para busca de mensagens");
      return [];
    }
    
    // Verificar se o usuário é participante da conversa (para conversas diretas é mais simples)
    let isAuthorized = false;
    
    // Para conversas diretas, verificar pelo formato do ID
    if (conversationId.includes('_')) {
      const userIds = conversationId.split('_');
      isAuthorized = userIds.includes(userId);
      
      if (isAuthorized) {
        console.log(`[CHAT DEBUG] Usuário ${userId} autorizado para conversa direta ${conversationId}`);
      } else {
        console.error(`[CHAT DEBUG] Usuário ${userId} não autorizado para conversa ${conversationId}`);
        return [];
      }
    } else {
      // Para grupos, verificar pela tabela de participantes
      const { data: participantData, error: participantError } = await supabase
        .from("conversation_participants")
        .select("*")
        .eq("conversation_id", conversationId)
        .eq("profile_id", userId);
      
      if (participantError) {
        console.error(`[CHAT DEBUG] Erro ao verificar participação: ${participantError.message}`);
      } else {
        isAuthorized = participantData && participantData.length > 0;
        console.log(`[CHAT DEBUG] Usuário ${isAuthorized ? 'é' : 'não é'} participante da conversa ${conversationId}`);
      }
    }
    
    // Mesmo que não seja autorizado, tentaremos buscar as mensagens
    // O Supabase RLS pode bloquear a consulta se o usuário não tiver permissão
    console.log(`[CHAT DEBUG] Buscando TODAS as mensagens para conversa ${conversationId}...`);

    // Buscar mensagens com várias tentativas (pode haver delay no banco)
    let data = null;
    let error = null;
    
    for (let attempt = 1; attempt <= 2; attempt++) {
      const result = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      
      if (!result.error && result.data && result.data.length > 0) {
        data = result.data;
        console.log(`[CHAT DEBUG] Encontradas ${data.length} mensagens na tentativa ${attempt}`);
        break;
      } else {
        error = result.error;
        console.log(`[CHAT DEBUG] Tentativa ${attempt} falhou: ${error?.message || 'Sem mensagens'}`);
        // Aguardar um pouco antes da próxima tentativa
        if (attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }
    
    if (error) {
      console.error(`[CHAT DEBUG] Erro final ao buscar mensagens: ${error.message}`);
      throw error;
    }
    
    // Se não tivermos dados, verificar com uma consulta mais ampla
    if (!data || data.length === 0) {
      console.log(`[CHAT DEBUG] Tentando busca alternativa por mensagens...`);
      
      // Segunda tentativa: buscar sem filtrar por conversation_id
      const { data: allMessages } = await supabase
        .from("messages")
        .select("*");
        
      if (allMessages && allMessages.length > 0) {
        // Filtrar manualmente por conversation_id
        data = allMessages.filter(msg => msg.conversation_id === conversationId);
        console.log(`[CHAT DEBUG] Encontradas ${data.length} mensagens com busca alternativa`);
      } else {
        console.log(`[CHAT DEBUG] Nenhuma mensagem encontrada na busca alternativa`);
      }
    }
    
    if (!data || data.length === 0) {
      console.log(`[CHAT DEBUG] Nenhuma mensagem encontrada para conversa ${conversationId}`);
      return [];
    }
    
    // Log detalhado das mensagens encontradas
    console.log(`[CHAT DEBUG] Detalhes das mensagens encontradas:`);
    data.forEach((msg, index) => {
      console.log(`[CHAT DEBUG] Mensagem ${index + 1}: ID=${msg.id}, From=${msg.sender_id}, Content=${msg.message_text || msg.content}`);
    });
    
    // Mapear as mensagens para o formato esperado
    const mappedMessages = data.map(message => {
      const content = message.message_text || message.content || "";
      return {
        id: message.id,
        chatId: message.conversation_id,
        content: content,
        type: message.type || "text",
        sender: message.sender_id === userId ? "agent" : "customer",
        timestamp: message.created_at || message.timestamp || new Date().toISOString(),
        fileName: message.file_name,
        fileSize: message.file_size
      } as Message;
    });
    
    console.log(`[CHAT DEBUG] Mapeadas ${mappedMessages.length} mensagens para exibição`);
    
    // Salvar em localStorage para persistência local em caso de problemas de conexão
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(`messages_${conversationId}`, JSON.stringify({
          timestamp: new Date().toISOString(),
          data: mappedMessages
        }));
      }
    } catch (err) {
      console.warn(`[CHAT DEBUG] Não foi possível salvar mensagens localmente: ${err}`);
    }
    
    return mappedMessages;
  } catch (error) {
    console.error("[CHAT DEBUG] Erro geral ao buscar mensagens:", error);
    
    // Em caso de erro, tentar usar o cache local
    try {
      if (typeof window !== 'undefined') {
        const cachedData = localStorage.getItem(`messages_${conversationId}`);
        if (cachedData) {
          const parsed = JSON.parse(cachedData);
          console.log(`[CHAT DEBUG] Usando ${parsed.data.length} mensagens do cache local`);
          return parsed.data;
        }
      }
    } catch (err) {
      console.error(`[CHAT DEBUG] Erro ao usar cache local: ${err}`);
    }
    
    throw error;
  }
}

export async function sendMessage({ 
  chatId, 
  content, 
  type = "text",
  sender,
  receiverId = null,
  fileName = null,
  fileSize = null 
}: {
  chatId: string;
  content: string;
  type?: "text" | "file" | "audio";
  sender: string;
  receiverId?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
}) {
  try {
    console.log(`[CHAT DEBUG] Enviando mensagem para conversa ${chatId}:`, { content, type, sender, receiverId });
    
    // Obter ID do usuário atual
    const { data: session } = await supabase.auth.getSession();
    if (!session || !session.session) {
      console.error("[CHAT DEBUG] Erro ao enviar mensagem: Usuário não autenticado");
      throw new Error("Usuário não autenticado");
    }
    
    const senderId = session.session.user.id;
    console.log(`[CHAT DEBUG] ID do remetente autenticado: ${senderId}`);
    
    // Determinar o receiver_id se não foi fornecido
    let finalReceiverId = receiverId;
    
    if (!finalReceiverId && chatId.includes('_')) {
      // Para conversas diretas, o ID é formado por user1_user2
      // Então o receptor é o outro usuário que não o remetente
      const userIds = chatId.split('_');
      finalReceiverId = userIds[0] === senderId ? userIds[1] : userIds[0];
      console.log(`[CHAT DEBUG] Receptor detectado a partir do ID da conversa: ${finalReceiverId}`);
    }

    // Validar que temos um ID de conversa
    if (!chatId) {
      console.error("[CHAT DEBUG] Erro ao enviar mensagem: ID da conversa não fornecido");
      throw new Error("ID da conversa não fornecido");
    }
    
    // Verificar se a conversa existe
    const { data: conversationExists, error: convError } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", chatId)
      .single();
      
    if (convError && convError.code !== "PGRST116") {
      console.error("[CHAT DEBUG] Erro ao verificar existência da conversa:", convError);
    }
    
    // Se a conversa não existe ainda mas temos um ID válido (formato user1_user2), 
    // vamos criar a conversa automaticamente
    if (!conversationExists) {
      console.log(`[CHAT DEBUG] Conversa ${chatId} não encontrada, verificando se podemos criá-la...`);
      
      if (chatId.includes('_') && finalReceiverId) {
        // É uma conversa direta e temos o ID do receptor, podemos criar
        console.log(`[CHAT DEBUG] Criando conversa direta entre ${senderId} e ${finalReceiverId}`);
        
        try {
          // Criar a conversa
          const { data: newConversation, error: createError } = await supabase
            .from("conversations")
            .insert({
              id: chatId,
              type: "direct",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .select();
            
          if (createError) {
            console.error("[CHAT DEBUG] Erro ao criar conversa:", createError);
          } else {
            console.log("[CHAT DEBUG] Conversa criada com sucesso:", newConversation);
            
            // Adicionar os participantes
            const participantsToAdd = [
              { conversation_id: chatId, profile_id: senderId },
              { conversation_id: chatId, profile_id: finalReceiverId }
            ];
            
            const { error: participantsError } = await supabase
              .from("conversation_participants")
              .insert(participantsToAdd);
              
            if (participantsError) {
              console.error("[CHAT DEBUG] Erro ao adicionar participantes:", participantsError);
            } else {
              console.log("[CHAT DEBUG] Participantes adicionados com sucesso");
            }
          }
        } catch (err) {
          console.error("[CHAT DEBUG] Erro ao criar conversa automaticamente:", err);
          // Continuamos mesmo com erro para tentar enviar a mensagem
        }
      } else if (!chatId.includes('_')) {
        console.error("[CHAT DEBUG] Conversa não encontrada e não é um ID de conversa direta válido");
        throw new Error("Conversa não encontrada");
      }
    }
    
    // Dados da mensagem - garantindo campos corretos conforme o esquema do banco
    const messageData = {
      conversation_id: chatId,
      sender_id: senderId,
      receiver_id: finalReceiverId,
      // Preencher ambos os campos para compatibilidade
      content: content,
      message_text: content,
      type: type,
      file_name: fileName,
      file_size: fileSize,
      // Preencher ambos os campos de timestamp
      timestamp: new Date().toISOString(),
      created_at: new Date().toISOString()
    };
    
    console.log("[CHAT DEBUG] Enviando dados da mensagem:", messageData);
    
    // Inserir a mensagem
    const { data, error } = await supabase
      .from("messages")
      .insert(messageData)
      .select();
    
    if (error) {
      console.error("[CHAT DEBUG] Erro ao inserir mensagem:", error);
      throw error;
    }
    
    console.log("[CHAT DEBUG] Mensagem enviada com sucesso, ID:", data?.[0]?.id);
    
    // IMPORTANTE: Atualizar timestamp da conversa para que apareça no topo da lista
    try {
      const currentTime = new Date().toISOString();
      const { error: updateError } = await supabase
        .from("conversations")
        .update({ 
          updated_at: currentTime,
          last_message_at: currentTime, // Adicionar este campo se existir
          last_message: content.substring(0, 100) // Salvar um resumo da mensagem
        })
        .eq("id", chatId);
        
      if (updateError) {
        console.warn("[CHAT DEBUG] Aviso: Não foi possível atualizar o timestamp da conversa:", updateError);
      } else {
        console.log("[CHAT DEBUG] Timestamp da conversa atualizado com sucesso");
      }
    } catch (updateErr) {
      console.warn("[CHAT DEBUG] Erro ao atualizar timestamp da conversa:", updateErr);
      // Não vamos interromper o fluxo por causa disso
    }
    
    return data?.[0];
  } catch (error) {
    console.error("[CHAT DEBUG] Erro geral ao enviar mensagem:", error);
    throw error;
  }
}

// Função para encontrar conversa direta entre dois usuários
export async function findDirectConversation(userId1: string, userId2: string): Promise<string | null> {
  try {
    console.log("### INICIANDO BUSCA DE CONVERSA DIRETA ###");
    console.log(`Procurando conversa direta entre usuários: ${userId1} e ${userId2}`);
    
    if (!userId1 || !userId2) {
      console.error("IDs de usuários inválidos:", { userId1, userId2 });
      return null;
    }
    
    // Criar ID determinístico (ordenar para garantir consistência)
    const userIds = [userId1, userId2].sort();
    const deterministicId = `${userIds[0]}_${userIds[1]}`;
    
    console.log(`ID determinístico gerado: ${deterministicId}`);
    
    // ESTRATÉGIA 1: Tentar ver se a conversa com ID determinístico já existe
    try {
      console.log("Tentando buscar conversa pelo ID determinístico...");
      
      const { data: directConv, error: directConvError } = await supabase
        .from("conversations")
        .select("id")
        .eq("id", deterministicId)
        .maybeSingle();
      
      if (directConvError) {
        console.log("Erro ao buscar conversa pelo ID determinístico:", directConvError);
      } else if (directConv) {
        console.log(`Conversa direta encontrada pelo ID determinístico: ${directConv.id}`);
        return directConv.id;
      } else {
        console.log("Nenhuma conversa encontrada com este ID determinístico");
      }
    } catch (error) {
      console.warn("Erro ao verificar conversa pelo ID determinístico:", error);
      // Continuar com outras estratégias
    }
    
    // ESTRATÉGIA 2: Verificar no cache se já conhecemos esta conversa
    if (typeof window !== 'undefined') {
      try {
        const cachedConversations = localStorage.getItem(`conversations_${userId1}`);
        if (cachedConversations) {
          const parsed = JSON.parse(cachedConversations);
          
          // Verificar cada conversa
          for (const conv of parsed) {
            // Para conversas diretas, verificar se o outro usuário é o userId2
            if (conv.type === 'direct' && conv.id.includes(userId1) && conv.id.includes(userId2)) {
              console.log(`Conversa direta encontrada no cache: ${conv.id}`);
              return conv.id;
            }
            
            // Alternativa: verificar nos perfis
            if (conv.profiles && Array.isArray(conv.profiles)) {
              const outroUsuarioNosPerfis = conv.profiles.some((profile: any) => profile && profile.id === userId2);
              if (outroUsuarioNosPerfis) {
                console.log(`Conversa direta encontrada no cache via perfis: ${conv.id}`);
                return conv.id;
              }
            }
          }
        }
      } catch (cacheError) {
        console.warn("Erro ao verificar cache de conversas:", cacheError);
      }
    }
    
    // ESTRATÉGIA 3: Criar a conversa com ID determinístico (sempre retorna um ID)
    console.log("Nenhuma conversa existente encontrada. Criando nova conversa...");
    
    try {
      // Inserir a conversa usando o ID determinístico
      console.log(`Tentando criar conversa com ID determinístico: ${deterministicId}`);
      
      const { error: createError } = await supabase
        .from("conversations")
        .insert({
          id: deterministicId,
          type: "direct",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      
      if (createError) {
        console.warn("Erro ao criar conversa com ID determinístico:", createError);
        
        // Se falhou ao criar conversa com ID determinístico, tentar conversa com ID gerado
        console.log("Tentando criar conversa com ID gerado automaticamente...");
        
        const { data: autoIdConv, error: autoIdError } = await supabase
          .from("conversations")
          .insert({
            type: "direct",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select();
        
        if (autoIdError) {
          console.error("Erro ao criar conversa com ID automático:", autoIdError);
          // ÚLTIMO RECURSO: Retornar o ID determinístico mesmo sem conseguir criar
          // Isso permitirá que a UI funcione, e tentaremos criar a conversa posteriormente
          console.log("ÚLTIMO RECURSO: Usando ID determinístico sem criar conversa");
          return deterministicId;
        }
        
        if (!autoIdConv || autoIdConv.length === 0) {
          console.error("Nenhum dado retornado ao criar conversa com ID automático");
          return deterministicId;
        }
        
        const conversationId = autoIdConv[0].id;
        console.log(`Conversa criada com ID automático: ${conversationId}`);
        
        // Adicionar os participantes
        try {
          await supabase
            .from("conversation_participants")
            .insert([
              { conversation_id: conversationId, profile_id: userId1 },
              { conversation_id: conversationId, profile_id: userId2 }
            ]);
          
          console.log(`Participantes adicionados à conversa ${conversationId}`);
        } catch (participantsError) {
          console.warn("Erro ao adicionar participantes:", participantsError);
        }
        
        return conversationId;
      }
      
      // Adicionar os participantes para a conversa com ID determinístico
      try {
        await supabase
          .from("conversation_participants")
          .insert([
            { conversation_id: deterministicId, profile_id: userId1 },
            { conversation_id: deterministicId, profile_id: userId2 }
          ]);
        
        console.log(`Participantes adicionados à conversa ${deterministicId}`);
      } catch (participantsError) {
        console.warn("Erro ao adicionar participantes:", participantsError);
      }
      
      console.log(`Conversa criada com sucesso: ${deterministicId}`);
      return deterministicId;
    } catch (createError) {
      console.error("Erro ao criar conversa:", createError);
      // Mesmo com erro, retornar o ID para que a UI possa continuar
      return deterministicId;
    }
  } catch (error) {
    console.error("Erro geral ao buscar/criar conversa direta:", error);
    // Em caso de erro geral, gerar um ID temporário
    const tempId = `temp_${Date.now()}_${userId1}_${userId2}`;
    console.log(`Gerado ID temporário para conversa: ${tempId}`);
    return tempId;
  }
}

export async function createConversation(type: "direct" | "group", participants?: string[], title?: string, avatarUrl?: string) {
  try {
    const user = await getCurrentUser();
    
    if (!user) {
      throw new Error("Usuário não autenticado");
    }
    
    console.log(`Tentando criar conversa do tipo ${type} com ${participants?.length || 0} participantes`);
    
    // Para conversas diretas, verificar se já existe
    if (type === "direct" && participants && participants.length === 1) {
      const otherUserId = participants[0];
      
      // Verificar se já existe uma conversa entre esses usuários
      // Tentar as duas combinações possíveis de ID (user_other e other_user)
      const userIds = [user.id, otherUserId].sort();
      const deterministicId = `${userIds[0]}_${userIds[1]}`;
      
      console.log(`Verificando se já existe conversa com ID: ${deterministicId}`);
      
      // Verificar se esta conversa já existe
      const { data: existingConv, error: existingError } = await supabase
        .from("conversations")
        .select("id")
        .eq("id", deterministicId);
      
      if (existingError) {
        console.error("Erro ao verificar conversa existente:", existingError);
      }
      
      if (existingConv && existingConv.length > 0) {
        console.log(`Conversa direta já existe: ${deterministicId}. Reutilizando.`);
        
        // Verificar se ambos usuários estão como participantes
        const { data: participantsData, error: participantsError } = await supabase
          .from("conversation_participants")
          .select("profile_id")
          .eq("conversation_id", deterministicId);
        
        if (participantsError) {
          console.error("Erro ao verificar participantes:", participantsError);
        }
        
        // Verificar se precisamos adicionar algum dos usuários como participante
        if (participantsData) {
          const participantIds = participantsData.map(p => p.profile_id);
          
          // Adicionar o usuário atual se não estiver na lista
          if (!participantIds.includes(user.id)) {
            console.log(`Adicionando usuário atual ${user.id} como participante`);
            await supabase.from("conversation_participants").insert({
              conversation_id: deterministicId,
              profile_id: user.id,
              role: "member",
              created_at: new Date().toISOString()
            });
          }
          
          // Adicionar o outro usuário se não estiver na lista
          if (!participantIds.includes(otherUserId)) {
            console.log(`Adicionando outro usuário ${otherUserId} como participante`);
            await supabase.from("conversation_participants").insert({
              conversation_id: deterministicId,
              profile_id: otherUserId,
              role: "member",
              created_at: new Date().toISOString()
            });
          }
        }
        
        // Atualizar a data de atualização da conversa
        await supabase
          .from("conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", deterministicId);
        
        return deterministicId;
      }
      
      // Se não existe, criar uma nova com ID determinístico
      console.log(`Criando nova conversa direta com ID determinístico: ${deterministicId}`);
      const now = new Date().toISOString();
      
      const { data: newConversation, error: createError } = await supabase
        .from("conversations")
        .insert({
          id: deterministicId,
          type: "direct",
          created_at: now,
          updated_at: now
        })
        .select();
      
      if (createError) {
        console.error("Erro ao criar conversa com ID determinístico:", createError);
        throw new Error("Falha ao criar conversa direta");
      }
      
      const conversationId = deterministicId;
      
      // Adicionar os participantes
      const participantsData = [
        {
          conversation_id: conversationId,
          profile_id: user.id,
          role: "member",
          created_at: now
        },
        {
          conversation_id: conversationId,
          profile_id: otherUserId,
          role: "member",
          created_at: now
        }
      ];
      
      const { error: participantsError } = await supabase
        .from("conversation_participants")
        .insert(participantsData);
      
      if (participantsError) {
        console.error("Erro ao adicionar participantes à conversa direta:", participantsError);
      }
      
      console.log(`Conversa direta criada com sucesso: ${conversationId}`);
      return conversationId;
    }
    
    // Para grupos ou outros casos
    console.log(`Criando nova conversa do tipo ${type}`);
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
    console.log(`Nova conversa criada com ID: ${conversationId}`);
    
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
      // Não vamos lançar o erro, vamos tentar adicionar os outros participantes
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
        // Não vamos lançar o erro, a conversa já foi criada
      }
    }
    
    console.log(`Conversa criada com sucesso: ${conversationId}`);
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

// Função auxiliar para melhor tratamento de erros do Supabase
export function logSupabaseError(contexto: string, error: any) {
  console.error(`[SUPABASE ERROR] ${contexto}:`, {
    message: error?.message || 'Erro desconhecido',
    details: error?.details || 'Sem detalhes',
    hint: error?.hint || 'Sem dicas',
    code: error?.code || 'Sem código',
    stack: new Error().stack
  });
  
  // Se o erro estiver vazio (como está acontecendo), tentar fornecer mais contexto
  if (Object.keys(error || {}).length === 0) {
    console.error(`[DIAGNÓSTICO] Possíveis causas para erro vazio em ${contexto}:`);
    console.error('1. Problema de conexão com o Supabase (verifique sua internet)');
    console.error('2. Chaves de API incorretas (verifique suas variáveis de ambiente)');
    console.error('3. Tabela não existe ou não tem permissões adequadas');
    console.error('4. Sintaxe de consulta inválida para a estrutura atual do banco');
    
    // Tentativa de recuperação de erro vazio
    return {
      recuperar: true,
      mensagem: `Erro ao ${contexto.toLowerCase()} - usando dados em cache ou vazios`
    };
  }
  
  return {
    recuperar: false,
    mensagem: `Erro ao ${contexto.toLowerCase()}: ${error?.message || 'Erro desconhecido'}`
  };
}

// Nova função de fallback para recuperar de erros
export function criarFallbackData(tipo: 'conversation' | 'user' | 'message', dados?: any) {
  if (tipo === 'conversation') {
    return {
      id: dados?.id || `temp_${Date.now()}`,
      type: dados?.type || 'direct',
      created_at: dados?.created_at || new Date().toISOString(),
      updated_at: dados?.updated_at || new Date().toISOString(),
      profiles: dados?.profiles || [],
      lastMessage: dados?.lastMessage || null,
      lastMessageTime: dados?.lastMessageTime || new Date().toISOString()
    };
  }
  
  if (tipo === 'user') {
    return {
      id: dados?.id || `temp_${Date.now()}`,
      first_name: dados?.first_name || 'Usuário',
      last_name: dados?.last_name || 'Temporário',
      email: dados?.email || 'usuario@exemplo.com',
      avatar_url: dados?.avatar_url || null
    };
  }
  
  if (tipo === 'message') {
    return {
      id: `temp_${Date.now()}`,
      conversation_id: dados?.conversation_id || 'unknown',
      sender_id: dados?.sender_id || 'unknown',
      content: dados?.content || 'Mensagem temporária',
      created_at: dados?.created_at || new Date().toISOString()
    };
  }
  
  return {};
}

// Função simplificada para iniciar uma conversa direta
export async function startDirectConversation(userId1: string, userId2: string): Promise<string> {
  try {
    console.log(`[SUPABASE] Iniciando conversa direta entre ${userId1} e ${userId2}`);
    
    // Gerar ID determinístico ordenando os IDs dos usuários
    const userIds = [userId1, userId2].sort();
    const conversationId = `${userIds[0]}_${userIds[1]}`;
    
    // PASSO 1: Verificar se a conversa já existe
    try {
      console.log(`[SUPABASE] Verificando se conversa já existe com ID ${conversationId}`);
      const { data: existingConv, error: checkError } = await supabase
        .from("conversations")
        .select("id")
        .eq("id", conversationId)
        .maybeSingle();
        
      if (checkError) {
        console.log(`[SUPABASE] Erro ao verificar conversa existente:`, checkError);
        // Continuar para tentar criar
      }
      
      // Se encontrou uma conversa existente
      if (existingConv) {
        console.log(`[SUPABASE] Conversa encontrada: ${existingConv.id}`);
        
        // Verificar/adicionar participantes
        try {
          const { data: participants, error: participantsError } = await supabase
            .from("conversation_participants")
            .select("profile_id")
            .eq("conversation_id", conversationId);
            
          if (participantsError) {
            console.log(`[SUPABASE] Erro ao verificar participantes:`, participantsError);
          }
          
          // Se encontramos participantes, verificar se ambos usuários estão presentes
          if (participants) {
            const participantIds = participants.map(p => p.profile_id);
            
            // Adicionar o primeiro usuário se não estiver na lista
            if (!participantIds.includes(userId1)) {
              console.log(`[SUPABASE] Adicionando usuário ${userId1} à conversa existente`);
              await supabase
                .from("conversation_participants")
                .insert({ 
                  conversation_id: conversationId, 
                  profile_id: userId1,
                  created_at: new Date().toISOString()
                });
            }
            
            // Adicionar o segundo usuário se não estiver na lista
            if (!participantIds.includes(userId2)) {
              console.log(`[SUPABASE] Adicionando usuário ${userId2} à conversa existente`);
              await supabase
                .from("conversation_participants")
                .insert({ 
                  conversation_id: conversationId, 
                  profile_id: userId2,
                  created_at: new Date().toISOString()
                });
            }
          }
          
          // Atualizar data de atualização
          await supabase
            .from("conversations")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", conversationId);
        } catch (participantsUpdateError) {
          console.log(`[SUPABASE] Erro ao atualizar participantes:`, participantsUpdateError);
        }
        
        // Retornar o ID da conversa existente
        return conversationId;
      }
    } catch (checkConvError) {
      console.log(`[SUPABASE] Erro ao verificar conversa:`, checkConvError);
    }
    
    // PASSO 2: Criar uma nova conversa se não existir
    console.log(`[SUPABASE] Criando nova conversa com ID ${conversationId}`);
    try {
      const now = new Date().toISOString();
      
      // Criar a conversa
      const { error: createError } = await supabase
        .from("conversations")
        .insert({
          id: conversationId,
          type: "direct",
          created_at: now,
          updated_at: now
        });
        
      if (createError) {
        console.log(`[SUPABASE] Erro ao criar conversa:`, createError);
        // Retornar o ID mesmo assim, para permitir operações offline
        return conversationId;
      }
      
      // Adicionar os participantes
      try {
        await supabase
          .from("conversation_participants")
          .insert([
            { conversation_id: conversationId, profile_id: userId1, created_at: now },
            { conversation_id: conversationId, profile_id: userId2, created_at: now }
          ]);
          
        console.log(`[SUPABASE] Participantes adicionados à conversa ${conversationId}`);
      } catch (addParticipantsError) {
        console.log(`[SUPABASE] Erro ao adicionar participantes:`, addParticipantsError);
      }
      
      console.log(`[SUPABASE] Conversa criada com sucesso: ${conversationId}`);
      return conversationId;
    } catch (createConvError) {
      console.log(`[SUPABASE] Erro ao criar conversa:`, createConvError);
      // Retornar o ID mesmo com erro, para permitir operações offline
      return conversationId;
    }
  } catch (error) {
    console.error(`[SUPABASE] Erro geral ao iniciar conversa:`, error);
    
    // Em último caso, retornar um ID utilizável
    const userIds = [userId1, userId2].sort();
    const fallbackId = `local_${userIds[0]}_${userIds[1]}`;
    return fallbackId;
  }
}

