import { createClient } from "@supabase/supabase-js"
import type { Company, Chat, Message } from "@/types"

let supabaseClient: ReturnType<typeof createClient> | null = null

export const initSupabase = (url: string, key: string) => {
  if (!supabaseClient) {
    console.log("Inicializando o cliente Supabase com:", url, key);
    supabaseClient = createClient(url, key)
  } else {
    console.log("Cliente Supabase já inicializado.");
  }
  return supabaseClient
}

export function getSupabase() {
  if (!supabaseClient) {
    console.error("Tentativa de acessar o cliente Supabase antes da inicialização.");
    throw new Error("Supabase client not initialized")
  }
  return supabaseClient
}

export async function fetchCompanies() {
  const supabase = getSupabase()
  const { data, error } = await supabase.from("companies").select("*")
  if (error) throw error
  return data as Company[]
}

export async function fetchChats(companyId: string) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from("chats")
    .select("*")
    .eq("companyId", companyId)
    .order("timestamp", { ascending: false })
  if (error) throw error
  return data as Chat[]
}

export async function fetchMessages(chatId: string) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("chatId", chatId)
    .order("timestamp", { ascending: true })
  if (error) throw error
  return data as Message[]
}

export async function sendMessage(message: Omit<Message, "id" | "timestamp">) {
  const supabase = getSupabase()
  const { data, error } = await supabase.from("messages").insert([{ ...message, timestamp: new Date() }])
  if (error) throw error
  return data
}

export async function uploadFile(file: File) {
  const supabase = getSupabase()
  const fileExt = file.name.split(".").pop()
  const fileName = `${Math.random()}.${fileExt}`
  const { data, error } = await supabase.storage.from("chat-files").upload(fileName, file)
  if (error) throw error
  return data
}

