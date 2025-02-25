-- Script para corrigir o problema de recursão infinita na política de conversation_participants

-- Remover a política que está causando recursão
DROP POLICY IF EXISTS "Usuários podem ver participantes de conversas que estão" ON public.conversation_participants;

-- Criar uma nova política corrigida
CREATE POLICY "Usuários podem ver participantes de conversas que estão"
ON public.conversation_participants FOR SELECT
TO authenticated
USING (
    profile_id = auth.uid() OR
    EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = conversation_id AND
        EXISTS (
            SELECT 1 FROM public.conversation_participants cp
            WHERE cp.conversation_id = c.id AND cp.profile_id = auth.uid()
        )
    )
);

-- Melhoria na política de inserção para evitar ambiguidades
DROP POLICY IF EXISTS "Usuários podem adicionar participantes em conversas onde são admin" ON public.conversation_participants;

CREATE POLICY "Usuários podem adicionar participantes em conversas onde são admin"
ON public.conversation_participants FOR INSERT
TO authenticated
WITH CHECK (
    -- O próprio usuário pode se adicionar a uma conversa
    profile_id = auth.uid() OR
    -- Usuários podem adicionar outros a conversas onde são admin
    EXISTS (
        SELECT 1 FROM public.conversation_participants cp
        WHERE cp.conversation_id = conversation_id 
        AND cp.profile_id = auth.uid() 
        AND cp.role = 'admin'
    )
);

-- Comentário explicativo
/*
COMO APLICAR ESTE FIX:

1. Acesse o projeto no Supabase
2. Vá para SQL Editor
3. Cole este script completo
4. Execute o script
5. Verifique na seção "Authentication > Policies" se as políticas foram atualizadas
*/ 