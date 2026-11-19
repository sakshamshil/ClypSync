'use client';

import { useState, useRef } from 'react';
import { Send, ClipboardPaste, Image as ImageIcon, FileText, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { uploadImage, uploadDocument } from '@/lib/supabase';

const MAX_CHARS = 500000;
const MAX_FILES = 10;

interface PasteInputProps {
  onSubmit: (
    content: string,
    type: 'text' | 'image' | 'document',
    meta?: { fileName?: string; fileSize?: number; silent?: boolean }
  ) => Promise<boolean>;
  disabled?: boolean;
  roomCode: string;
}

export function PasteInput({ onSubmit, disabled, roomCode }: PasteInputProps) {
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);

  const charCount = content.length;
  const isOverLimit = charCount > MAX_CHARS;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  // Upload every file first (in parallel), then add one paste per file in
  // the order the user picked them. One summary toast for the whole batch.
  const handleFiles = async (input: FileList | File[]) => {
    let files = Array.from(input);
    if (files.length === 0) return;
    if (files.length > MAX_FILES) {
      toast.error(`You can upload ${MAX_FILES} files at a time. Uploading the first ${MAX_FILES}.`);
      files = files.slice(0, MAX_FILES);
    }
    setIsSubmitting(true);
    try {
      const uploads = await Promise.all(
        files.map(async (file) => {
          const isImage = file.type.startsWith('image/');
          try {
            const res = isImage ? await uploadImage(file, roomCode) : await uploadDocument(file, roomCode);
            if (res.error) {
              toast.error(files.length > 1 ? `${file.name}: ${res.error}` : res.error);
              return null;
            }
            return { file, isImage, res };
          } catch {
            return null;
          }
        })
      );

      let ok = 0;
      let images = 0;
      for (const u of uploads) {
        if (!u) continue;
        const meta = u.isImage
          ? { silent: true }
          : { fileName: u.file.name, fileSize: u.file.size, silent: true };
        if (await onSubmit(u.res.url, u.isImage ? 'image' : 'document', meta)) {
          ok += 1;
          if (u.isImage) images += 1;
        }
      }

      if (ok === 0) {
        toast.error(files.length > 1 ? 'Failed to upload the files' : 'Failed to upload the file');
      } else if (files.length === 1) {
        toast.success(images ? 'Image uploaded!' : 'Document uploaded!');
      } else {
        const noun = images === ok ? 'images' : images === 0 ? 'documents' : 'files';
        toast.success(ok === files.length ? `${ok} ${noun} uploaded!` : `${ok} of ${files.length} files uploaded`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragCounter.current += 1;
    if (!disabled && !isSubmitting) {
      setIsDragActive(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragActive(false);
    if (disabled || isSubmitting) return;
    handleFiles(files);
  };

  const handleSubmit = async () => {
    if (!content.trim() || isSubmitting || isOverLimit) return;

    setIsSubmitting(true);
    try {
      await onSubmit(content.trim(), 'text');
      setContent('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) handleFiles(e.target.files);
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDocumentSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) handleFiles(e.target.files);
    // Reset input so same file can be selected again
    if (documentInputRef.current) {
      documentInputRef.current.value = '';
    }
  };

  const handleClipboardPaste = async (e: React.ClipboardEvent) => {
    // Pasted files (e.g. several images copied in Finder or Photos).
    const files = Array.from(e.clipboardData.files);
    if (files.length > 0) {
      e.preventDefault();
      handleFiles(files);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Submit on Ctrl+Enter or Cmd+Enter
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setContent(text);
        toast.success('Pasted from clipboard');
      } else {
        toast.error('Clipboard is empty');
      }
    } catch {
      toast.error('Could not access clipboard');
    }
  };

  return (
    <div className="space-y-3">
      <div
        className={`relative rounded-md ${isDragActive ? 'ring-2 ring-primary' : ''}`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <Textarea
          placeholder="Paste or type text here..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handleClipboardPaste}
          disabled={disabled || isSubmitting}
          className="min-h-[120px] resize-none pr-20"
        />
        {isDragActive && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-primary bg-background/90">
            <Upload className="h-6 w-6 text-primary" />
            <p className="text-sm font-medium text-primary">Drop images or documents to upload</p>
          </div>
        )}
        <div className="absolute top-2 right-2 flex gap-1">
          <input
            type="file"
            accept="image/*"
            multiple
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isSubmitting}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title="Upload images"
          >
            <ImageIcon className="h-4 w-4" />
          </Button>
          <input
            type="file"
            accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            multiple
            ref={documentInputRef}
            onChange={handleDocumentSelect}
            className="hidden"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => documentInputRef.current?.click()}
            disabled={disabled || isSubmitting}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title="Upload documents"
          >
            <FileText className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handlePasteFromClipboard}
            disabled={disabled || isSubmitting}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title="Paste from clipboard"
          >
            <ClipboardPaste className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Press Ctrl+Enter to send · Paste image with Ctrl+V · Drag files to upload</span>
        <span className={isOverLimit ? 'text-destructive font-medium' : ''}>
          {charCount.toLocaleString()} / {MAX_CHARS.toLocaleString()}
        </span>
      </div>

      <Button
        onClick={handleSubmit}
        disabled={!content.trim() || disabled || isSubmitting || isOverLimit}
        className="w-full h-12"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Sending...
          </>
        ) : (
          <>
            <Send className="h-4 w-4 mr-2" />
            Send to Cloud
          </>
        )}
      </Button>
    </div>
  );
}
