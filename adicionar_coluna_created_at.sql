-- Script para adicionar coluna created_at à tabela messages
-- Verifica se a coluna já existe e a adiciona se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'messages'
        AND column_name = 'created_at'
    ) THEN
        ALTER TABLE public.messages
        ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;
        
        -- Adiciona um comentário explicativo
        COMMENT ON COLUMN public.messages.created_at IS 'Timestamp de quando a mensagem foi criada';
    END IF;
END
$$; 