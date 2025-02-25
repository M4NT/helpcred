-- Políticas RLS para resolver problemas de permissão

-- ======= TABELA PROFILES =======
CREATE POLICY "Qualquer usuário autenticado pode ver perfis"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Usuários podem editar apenas seu próprio perfil"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id);

-- ======= TABELA CONVERSATIONS =======
CREATE POLICY "Usuários podem ver conversas que participam"
ON public.conversations FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.conversation_participants
        WHERE conversation_id = id AND profile_id = auth.uid()
    )
);

CREATE POLICY "Usuários autenticados podem criar conversas"
ON public.conversations FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Usuários participantes podem atualizar conversas"
ON public.conversations FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.conversation_participants
        WHERE conversation_id = id AND profile_id = auth.uid()
    )
);

-- ======= TABELA CONVERSATION_PARTICIPANTS =======
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

-- ======= TABELA MESSAGES =======
CREATE POLICY "Usuários podem ver mensagens de conversas que participam"
ON public.messages FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.conversation_participants
        WHERE conversation_id = conversation_id AND profile_id = auth.uid()
    )
);

CREATE POLICY "Usuários podem enviar mensagens em conversas que participam"
ON public.messages FOR INSERT
TO authenticated
WITH CHECK (
    sender_id = auth.uid() AND
    EXISTS (
        SELECT 1 FROM public.conversation_participants
        WHERE conversation_id = conversation_id AND profile_id = auth.uid()
    )
);

-- Comentário explicativo
/*
Estas políticas RLS devem ser adicionadas no SQL Editor do Supabase.

Para aplicar:
1. Acesse o projeto no Supabase
2. Vá para SQL Editor
3. Cole estas políticas
4. Execute o script

Antes de executar, verifique se as políticas já existem para evitar duplicação.
Você pode verificar as políticas existentes na seção "Authentication > Policies"
da interface do Supabase.
*/ 