"use client"

import { Mail, MessageCircle, Phone } from "lucide-react"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

const faqs = [
  {
    question: "Como transferir uma conversa?",
    answer:
      "Para transferir uma conversa, clique no botão 'Transferir' no topo do chat e selecione o agente desejado. Você também pode adicionar uma nota para o próximo atendente.",
  },
  {
    question: "Como usar gatilhos rápidos?",
    answer:
      "Digite '/' no campo de mensagem para abrir o menu de gatilhos rápidos. Selecione o gatilho desejado ou continue digitando para filtrar as opções disponíveis.",
  },
  {
    question: "Como configurar um novo número de WhatsApp?",
    answer:
      "Acesse as Configurações > APIs > Configuração WhatsApp e clique no botão '+' para adicionar uma nova empresa. Preencha os dados necessários e o token de acesso do WhatsApp Business API.",
  },
  {
    question: "Como enviar arquivos para os clientes?",
    answer:
      "Clique no ícone de clipe no campo de mensagem para enviar arquivos. O sistema suporta imagens, documentos, áudios e vídeos de até 50MB.",
  },
  {
    question: "Como gravar e enviar áudios?",
    answer:
      "Clique no ícone de microfone no campo de mensagem para iniciar a gravação. Clique novamente para parar e enviar o áudio.",
  },
  {
    question: "Como verificar o tempo de resposta?",
    answer:
      "O tempo de resposta é exibido na lista de conversas em atendimento, com cores indicativas: verde (até 5min), amarelo (5-15min) e vermelho (mais de 15min).",
  },
  {
    question: "Como criar novos gatilhos rápidos?",
    answer:
      "Acesse Configurações > Gatilhos e clique em 'Novo Gatilho'. Digite o comando e a mensagem correspondente que será enviada.",
  },
  {
    question: "Como adicionar mais atendentes?",
    answer:
      "Vá em Configurações > Equipe e clique em 'Adicionar Membro'. Preencha os dados do novo atendente e defina suas permissões de acesso.",
  },
]

export function SupportView() {
  return (
    <div className="flex-1 p-6 overflow-auto">
      <h1 className="text-2xl font-bold mb-6">Suporte</h1>

      <Tabs defaultValue="faq">
        <TabsList>
          <TabsTrigger value="faq">FAQ</TabsTrigger>
          <TabsTrigger value="contact">Contato</TabsTrigger>
        </TabsList>

        <TabsContent value="faq">
          <Card>
            <CardHeader>
              <CardTitle>Perguntas Frequentes</CardTitle>
              <CardDescription>Encontre respostas para as dúvidas mais comuns sobre o sistema.</CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                {faqs.map((faq, index) => (
                  <AccordionItem key={index} value={`item-${index}`}>
                    <AccordionTrigger>{faq.question}</AccordionTrigger>
                    <AccordionContent>{faq.answer}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contact">
          <Card>
            <CardHeader>
              <CardTitle>Entre em Contato</CardTitle>
              <CardDescription>Precisa de ajuda? Nossa equipe está pronta para te atender.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex flex-col items-center space-y-2">
                        <Phone className="h-6 w-6" />
                        <h3 className="font-medium">Telefone</h3>
                        <p className="text-sm text-muted-foreground">0800 123 4567</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex flex-col items-center space-y-2">
                        <Mail className="h-6 w-6" />
                        <h3 className="font-medium">Email</h3>
                        <p className="text-sm text-muted-foreground">suporte@empresa.com</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex flex-col items-center space-y-2">
                        <MessageCircle className="h-6 w-6" />
                        <h3 className="font-medium">Chat</h3>
                        <p className="text-sm text-muted-foreground">Chat ao vivo</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Input placeholder="Nome" />
                    <Input placeholder="Email" type="email" />
                  </div>
                  <Input placeholder="Assunto" />
                  <Textarea placeholder="Mensagem" className="min-h-[100px]" />
                  <Button className="w-full">Enviar Mensagem</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

