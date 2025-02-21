import { createClient } from "@supabase/supabase-js"
import type { Company, Chat, Message } from "@/types"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

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

export async function fetchMessages(chatId: string) {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("chatId", chatId)
    .order("timestamp", { ascending: true })
  if (error) throw error
  return data as Message[]
}

export async function sendMessage(message: Omit<Message, "id" | "timestamp">) {
  const { data, error } = await supabase.from("messages").insert([{ ...message, timestamp: new Date() }])
  if (error) throw error
  return data
}

export async function uploadFile(file: File) {
  const fileExt = file.name.split(".").pop()
  const fileName = `${Math.random()}.${fileExt}`
  const { data, error } = await supabase.storage.from("chat-files").upload(fileName, file)
  if (error) throw error
  return data
}

