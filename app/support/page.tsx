"use client"

import { Mail, MessageCircle, Phone } from "lucide-react"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

export default function SupportPage() {
  return (
    <div className="container mx-auto p-6">
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
              <Accordion type="single" collapsible>
                <AccordionItem value="item-1">
                  <AccordionTrigger>Como transferir uma conversa?</AccordionTrigger>
                  <AccordionContent>
                    Para transferir uma conversa, clique no botão "Transferir" no topo do chat e selecione o agente
                    desejado.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-2">
                  <AccordionTrigger>Como usar gatilhos rápidos?</AccordionTrigger>
                  <AccordionContent>
                    Digite "/" no campo de mensagem para abrir o menu de gatilhos rápidos. Selecione o gatilho desejado
                    ou continue digitando para filtrar.
                  </AccordionContent>
                </AccordionItem>
                {/* Add more FAQ items */}
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

