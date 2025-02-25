-- Script para limpar e simplificar políticas RLS
-- Primeiro, desabilitar RLS para limpar tudo com segurança
ALTER TABLE public.conversation_participants DISABLE ROW LEVEL SECURITY;

-- Remover TODAS as políticas existentes
DROP POLICY IF EXISTS "Acesso total para usuários autenticados" ON public.conversation_participants;
DROP POLICY IF EXISTS "Enable insert access for users" ON public.conversation_participants;
DROP POLICY IF EXISTS "Enable read access for users" ON public.conversation_participants;
DROP POLICY IF EXISTS "insert_conversation_participants" ON public.conversation_participants;
DROP POLICY IF EXISTS "Participantes visíveis para membros da mesma conversa" ON public.conversation_participants;
DROP POLICY IF EXISTS "select_conversation_participants" ON public.conversation_participants;
DROP POLICY IF EXISTS "Usuários podem ver participantes de conversas que pertencem" ON public.conversation_participants;
DROP POLICY IF EXISTS "Usuários podem ver suas próprias participações" ON public.conversation_participants;

-- Reativar RLS
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;

-- Criar apenas duas políticas simples - uma para SELECT e uma para INSERT
CREATE POLICY "conversation_participants_select"
ON public.conversation_participants FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "conversation_participants_insert"
ON public.conversation_participants FOR INSERT
TO authenticated
WITH CHECK (true);

-- Adicionar comentário explicativo
COMMENT ON TABLE public.conversation_participants IS 'Tabela com políticas RLS simplificadas para evitar recursão infinita'; 