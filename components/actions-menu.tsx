import { Check, MessageSquare, Phone, Tag, UserPlus } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function ActionsMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md hover:bg-accent">
          <Check className="h-4 w-4" />
          Ações
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Ações Rápidas</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Tag className="mr-2 h-4 w-4" />
          Marcar como resolvido
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Phone className="mr-2 h-4 w-4" />
          Iniciar chamada
        </DropdownMenuItem>
        <DropdownMenuItem>
          <MessageSquare className="mr-2 h-4 w-4" />
          Criar nota
        </DropdownMenuItem>
        <DropdownMenuItem>
          <UserPlus className="mr-2 h-4 w-4" />
          Adicionar ao grupo
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

