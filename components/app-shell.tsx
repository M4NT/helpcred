"use client"

import { useState } from "react"
import { Bell, Cog, HelpCircle, MessageSquare, Users } from "lucide-react"
import Image from "next/image"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ChatView } from "@/components/chat-view"
import { ConversationList } from "@/components/conversation-list"
import { NotificationsView } from "@/components/notifications-view"
import { ProfileView } from "@/components/profile-view"
import { SettingsView } from "@/components/settings-view"
import { SupportView } from "@/components/support-view"

type View = "chat" | "profile" | "notifications" | "support" | "settings"

export function AppShell() {
  const [currentView, setCurrentView] = useState<View>("chat")

  const renderMainContent = () => {
    switch (currentView) {
      case "chat":
        return <ChatView />
      case "profile":
        return <ProfileView />
      case "notifications":
        return <NotificationsView />
      case "support":
        return <SupportView />
      case "settings":
        return <SettingsView />
      default:
        return <ChatView />
    }
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <div className="w-20 border-r flex flex-col items-center py-4 gap-6">
        <div className="w-12 h-12">
          <Image src="/placeholder.svg" alt="Logo" width={48} height={48} className="rounded-lg" />
        </div>
        <Separator />
        <Button
          variant={currentView === "chat" ? "default" : "ghost"}
          size="icon"
          onClick={() => setCurrentView("chat")}
        >
          <MessageSquare className="h-5 w-5" />
        </Button>
        <Button
          variant={currentView === "profile" ? "default" : "ghost"}
          size="icon"
          onClick={() => setCurrentView("profile")}
        >
          <Users className="h-5 w-5" />
        </Button>
        <div className="mt-auto flex flex-col gap-4">
          <Button
            variant={currentView === "notifications" ? "default" : "ghost"}
            size="icon"
            onClick={() => setCurrentView("notifications")}
          >
            <Bell className="h-5 w-5" />
          </Button>
          <Button
            variant={currentView === "support" ? "default" : "ghost"}
            size="icon"
            onClick={() => setCurrentView("support")}
          >
            <HelpCircle className="h-5 w-5" />
          </Button>
          <Button
            variant={currentView === "settings" ? "default" : "ghost"}
            size="icon"
            onClick={() => setCurrentView("settings")}
          >
            <Cog className="h-5 w-5" />
          </Button>
          <Separator />
          <Avatar className="h-9 w-9">
            <AvatarImage src="/placeholder.svg" />
            <AvatarFallback>OP</AvatarFallback>
          </Avatar>
        </div>
      </div>

      {/* Conversations List */}
      <ConversationList />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">{renderMainContent()}</div>
    </div>
  )
}

