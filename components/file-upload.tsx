"use client"

import type React from "react"

import { useState } from "react"
import { Paperclip, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { uploadFile } from "@/lib/supabase"

interface FileUploadProps {
  onFileUpload: (url: string, name: string, size: number) => void
}

export function FileUpload({ onFileUpload }: FileUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.size > 50 * 1024 * 1024) {
      alert("Arquivo muito grande. O tamanho máximo é 50MB.")
      return
    }

    setSelectedFile(file)
  }

  const handleUpload = async () => {
    if (!selectedFile) return

    setIsUploading(true)
    try {
      // Simulate upload progress
      const interval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 10, 90))
      }, 100)

      const data = await uploadFile(selectedFile)

      clearInterval(interval)
      setUploadProgress(100)

      if (data?.path) {
        onFileUpload(data.path, selectedFile.name, selectedFile.size)
      }
    } catch (error) {
      console.error("Error uploading file:", error)
      alert("Erro ao fazer upload do arquivo")
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
      setSelectedFile(null)
    }
  }

  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => document.getElementById("file-upload")?.click()}>
        <Paperclip className="h-5 w-5" />
      </Button>
      <input
        id="file-upload"
        type="file"
        className="hidden"
        onChange={handleFileSelect}
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
      />

      <Dialog open={!!selectedFile} onOpenChange={() => setSelectedFile(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload de Arquivo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Paperclip className="h-4 w-4" />
                <span className="text-sm font-medium">{selectedFile?.name}</span>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSelectedFile(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            {isUploading && <Progress value={uploadProgress} className="w-full" />}
            <Button onClick={handleUpload} disabled={isUploading} className="w-full">
              {isUploading ? "Enviando..." : "Enviar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

