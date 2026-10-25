"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          toast.success("Copied");
          setTimeout(() => setCopied(false), 2000);
        } catch {
          toast.error("Could not copy. Select the text and copy it manually.");
        }
      }}
    >
      {copied ? <Check /> : <Copy />}
      {label}
    </Button>
  );
}
