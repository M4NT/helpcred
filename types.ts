export interface Message {
  id: string;
  chatId: string;
  content: string;
  type: string;
  sender: "customer" | "agent";
  timestamp: string;
  fileName?: string;
  fileSize?: number;
}

export interface User {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  avatar_url?: string;
  created_at: string;
}

export interface Conversation {
  id: string;
  type: "direct" | "group";
  title?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
  lastMessage?: {
    id: string;
    content: string;
    type: string;
    created_at: string;
    sender_id: string;
  };
  lastMessageTime?: string;
  participants: User[];
}

export interface ConversationParticipant {
  conversation_id: string;
  profile_id: string;
  role: "admin" | "member";
  created_at: string;
}

export interface Company {
  id: string;
  name: string;
  logo_url?: string;
}

export interface Chat {
  id: string;
  companyId: string;
  customerId: string;
  agentId?: string;
  status: "open" | "closed" | "pending";
  timestamp: string;
} 