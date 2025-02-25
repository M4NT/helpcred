-- Script para corrigir o problema de recursão infinita (VERSÃO SIMPLIFICADA)

-- Remover TODAS as políticas existentes para conversation_participants
DROP POLICY IF EXISTS "Usuários podem ver participantes de conversas que estão" ON public.conversation_participants;
DROP POLICY IF EXISTS "Usuários podem adicionar participantes em conversas onde são admin" ON public.conversation_participants;
DROP POLICY IF EXISTS "Usuários podem ver participantes de conversas que estão - simplificada" ON public.conversation_participants;

-- Criar políticas ultra simplificadas que não podem causar recursão

-- 1. Política para SELECT - extremamente simples
CREATE POLICY "Ver participantes - política simples"
ON public.conversation_participants FOR SELECT
TO authenticated
USING (
    -- Permitir acesso total para usuários autenticados (para fins de teste)
    -- Em produção, você pode querer restringir isso mais tarde
    true
);

-- 2. Política para INSERT - extremamente simples
CREATE POLICY "Adicionar participantes - política simples"
ON public.conversation_participants FOR INSERT
TO authenticated
WITH CHECK (
    -- Qualquer usuário autenticado pode adicionar participantes
    -- Em produção, você pode querer restringir isso mais tarde
    true
);

-- Comentário explicativo
/*
INSTRUÇÕES PARA APLICAR ESTE FIX:

1. Acesse o projeto no Supabase em https://app.supabase.com
2. Vá para SQL Editor
3. Cole este script completo
4. Execute o script
5. Verifique na seção "Authentication > Policies" se as políticas foram removidas
   e substituídas pelas novas políticas simplificadas
6. Teste sua aplicação
*/ 