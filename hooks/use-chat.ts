"use client"

import { useEffect, useState } from "react"
import { getSupabase } from "@/lib/supabase"
import type { Message } from "@/types"

export function useChat(chatId: string) {
  const [messages, setMessages] = useState<Message[]>([])

  useEffect(() => {
    const supabase = getSupabase()

    // Load initial messages
    const loadMessages = async () => {
      const { data } = await supabase
        .from("messages")
        .select()
        .eq("chat_id", chatId)
        .order("timestamp", { ascending: true })

      if (data) setMessages(data)
    }

    loadMessages()

    // Subscribe to new messages
    const subscription = supabase
      .channel("messages")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) => {
          setMessages((current) => [...current, payload.new as Message])
        },
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [chatId])

  return messages
}

