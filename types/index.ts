export type Company = {
  id: string
  name: string
  whatsappNumber: string
  whatsappToken: string
}

export type Chat = {
  id: string
  companyId: string
  customerName: string
  customerNumber: string
  lastMessage: string
  timestamp: Date
  status: "queue" | "active"
  assignedTo?: string
  responseTime?: number
}

export type Message = {
  id: string
  chatId: string
  content: string
  type: "text" | "audio" | "file"
  fileUrl?: string
  fileName?: string
  fileSize?: number
  sender: "customer" | "agent"
  timestamp: Date
  receiverId?: string | null
}

