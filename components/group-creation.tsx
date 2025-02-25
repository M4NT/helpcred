import { useState } from "react"
import { supabase } from "@/lib/supabase"

export function GroupCreation() {
  const [groupName, setGroupName] = useState("")
  const [members, setMembers] = useState([])

  const handleCreateGroup = async () => {
    const { data, error } = await supabase.from("groups").insert([{ name: groupName }])
    if (error) console.error("Erro ao criar grupo:", error.message)
    else console.log("Grupo criado:", data)
  }

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Criar Grupo</h2>
      <input
        type="text"
        placeholder="Nome do Grupo"
        value={groupName}
        onChange={(e) => setGroupName(e.target.value)}
        className="w-full p-2 mb-4 border rounded"
      />
      <button onClick={handleCreateGroup} className="w-full bg-blue-500 text-white p-2 rounded">
        Criar Grupo
      </button>
    </div>
  )
} 