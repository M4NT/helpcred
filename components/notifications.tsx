import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export function Notifications() {
  const [notifications, setNotifications] = useState([])

  useEffect(() => {
    const fetchNotifications = async () => {
      const { data, error } = await supabase.from("notifications").select("*")
      if (error) console.error("Erro ao buscar notificações:", error.message)
      else setNotifications(data)
    }
    fetchNotifications()
  }, [])

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Notificações</h2>
      <ul>
        {notifications.map((notification) => (
          <li key={notification.id} className="mb-2">
            {notification.message}
          </li>
        ))}
      </ul>
    </div>
  )
} 