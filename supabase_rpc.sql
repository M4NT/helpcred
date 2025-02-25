-- Função para buscar conversas de um usuário com suas informações
-- Esta função contorna as restrições de RLS usando SECURITY DEFINER
CREATE OR REPLACE FUNCTION get_user_conversations(user_id UUID)
RETURNS SETOF JSON AS $$
DECLARE
    result JSON;
BEGIN
    -- Retorna as conversas que o usuário participa com todos os detalhes necessários
    FOR result IN
        WITH user_convs AS (
            SELECT cp.conversation_id
            FROM conversation_participants cp
            WHERE cp.profile_id = user_id
        ),
        conversation_details AS (
            SELECT 
                c.id,
                c.type,
                c.title,
                c.avatar_url,
                c.created_at,
                c.updated_at
            FROM conversations c
            JOIN user_convs uc ON c.id = uc.conversation_id
        ),
        last_messages AS (
            SELECT DISTINCT ON (conversation_id)
                m.conversation_id,
                m.content,
                m.type AS message_type,
                m.timestamp,
                m.file_name,
                m.file_size
            FROM messages m
            JOIN user_convs uc ON m.conversation_id = uc.conversation_id
            ORDER BY m.conversation_id, m.timestamp DESC
        ),
        participants AS (
            SELECT 
                cp.conversation_id,
                json_agg(
                    json_build_object(
                        'id', p.id,
                        'first_name', p.first_name,
                        'last_name', p.last_name,
                        'email', p.email,
                        'avatar_url', p.avatar_url
                    )
                ) AS profiles
            FROM conversation_participants cp
            JOIN profiles p ON cp.profile_id = p.id
            JOIN user_convs uc ON cp.conversation_id = uc.conversation_id
            GROUP BY cp.conversation_id
        )
        SELECT json_build_object(
            'id', cd.id,
            'type', cd.type,
            'title', cd.title,
            'avatar_url', cd.avatar_url,
            'created_at', cd.created_at,
            'updated_at', cd.updated_at,
            'profiles', COALESCE(p.profiles, '[]'::json),
            'lastMessage', CASE 
                WHEN lm.conversation_id IS NOT NULL THEN
                    json_build_object(
                        'content', lm.content,
                        'type', lm.message_type,
                        'file_name', lm.file_name,
                        'file_size', lm.file_size
                    )
                ELSE NULL
            END,
            'lastMessageTime', lm.timestamp
        )
        FROM conversation_details cd
        LEFT JOIN participants p ON cd.id = p.conversation_id
        LEFT JOIN last_messages lm ON cd.id = lm.conversation_id
    LOOP
        RETURN NEXT result;
    END LOOP;
    
    RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comentário explicativo para adicionar no Supabase SQL Editor
/*
Esta função deve ser adicionada no SQL Editor do Supabase.
Ela contorna as políticas RLS para buscar conversas de um usuário.
Para usar, chame: 
  SELECT * FROM get_user_conversations('USER_ID_AQUI');
Ou no código:
  supabase.rpc('get_user_conversations', { user_id: 'USER_ID_AQUI' });
*/ 