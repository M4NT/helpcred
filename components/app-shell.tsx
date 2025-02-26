"use client"

import { useEffect, useState } from "react"
import { Inbox, MessagesSquare, User, Settings, Bell, HelpCircle } from "lucide-react"
import Image from "next/image"

import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Conversation } from "@/components/conversation"
import { NotificationsView } from "@/components/notifications-view"
import { ProfileView } from "@/components/profile-view"
import { SettingsView } from "@/components/settings-view"
import { SupportView } from "@/components/support-view"
import { ChatView } from "@/components/chat-view"
import { supabase, getCurrentUser } from "@/lib/supabase"

type View = "chat" | "profile" | "notifications" | "support" | "settings"

export function AppShell() {
  const [currentView, setCurrentView] = useState<View>("chat")
  const [currentUser, setCurrentUser] = useState<any | null>(null)
  
  // Carregar usuário atual ao iniciar
  useEffect(() => {
    const loadCurrentUser = async () => {
      try {
        const user = await getCurrentUser();
        setCurrentUser(user);
      } catch (error) {
        console.error("Erro ao carregar usuário atual:", error);
      }
    };
    
    loadCurrentUser();
  }, []);

  const renderMainContent = () => {
    switch (currentView) {
      case "chat":
        return <Conversation userId={currentUser?.id} />
      case "profile":
        return <ProfileView />
      case "notifications":
        return <NotificationsView />
      case "support":
        return <SupportView />
      case "settings":
        return <SettingsView />
      default:
        return <Conversation userId={currentUser?.id} />
    }
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <div className="w-16 border-r flex flex-col items-center py-4 gap-4">
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "rounded-xl h-10 w-10",
            currentView === "chat" && "bg-primary text-primary-foreground"
          )}
          onClick={() => setCurrentView("chat")}
        >
          <MessagesSquare className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "rounded-xl h-10 w-10",
            currentView === "profile" && "bg-primary text-primary-foreground"
          )}
          onClick={() => setCurrentView("profile")}
        >
          <User className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "rounded-xl h-10 w-10",
            currentView === "notifications" &&
              "bg-primary text-primary-foreground"
          )}
          onClick={() => setCurrentView("notifications")}
        >
          <Bell className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "rounded-xl h-10 w-10",
            currentView === "support" && "bg-primary text-primary-foreground"
          )}
          onClick={() => setCurrentView("support")}
        >
          <HelpCircle className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "rounded-xl h-10 w-10",
            currentView === "settings" && "bg-primary text-primary-foreground"
          )}
          onClick={() => setCurrentView("settings")}
        >
          <Settings className="h-5 w-5" />
        </Button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">{renderMainContent()}</div>
    </div>
  )
}

