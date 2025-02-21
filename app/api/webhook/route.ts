import { NextResponse } from "next/server"
import { getSupabase } from "@/lib/supabase"

export async function POST(req: Request) {
  const body = await req.json()
  const supabase = getSupabase()

  // Handle WhatsApp webhook verification
  if (body.type === "verification") {
    return NextResponse.json({ challenge: body.challenge })
  }

  // Handle incoming messages
  if (body.type === "message") {
    const { message } = body

    // Find or create chat
    const { data: chat } = await supabase.from("chats").select().eq("customer_number", message.from).single()

    if (!chat) {
      // Create new chat
      const { data: newChat } = await supabase
        .from("chats")
        .insert({
          company_id: message.to,
          customer_number: message.from,
          customer_name: message.sender_name,
          status: "queue",
          last_message: message.text,
        })
        .single()
    }

    // Store message
    await supabase.from("messages").insert({
      chat_id: chat?.id,
      content: message.text,
      type: "text",
      sender: "customer",
    })
  }

  return NextResponse.json({ status: "ok" })
}

