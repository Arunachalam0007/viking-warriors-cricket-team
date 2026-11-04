"use client";

import { AlertTriangle, Check, ImagePlus, Loader2, ScanLine, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDate } from "@/lib/dates";
import { rupees } from "@/lib/format";
import { scanPaymentScreenshot } from "@/modules/ai/actions";
import type { ScanResult } from "@/modules/ai/scan";

export type ScanFill = { playerId: string | null; amount: number | null; paidOn: string | null; reference: string | null; note: string | null };

/** Shrinks a photo to at most 1600 px on its long side (JPEG), so uploads stay small and quick. */
async function toDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

/**
 * "Scan screenshot": an admin uploads (or pastes) a GPay / PhonePe / bank screenshot, the AI reads
 * amount, date, payer and reference and guesses the player, and the Record-payment form is filled
 * in. Nothing is saved until the admin presses Record payment. The image is not kept.
 */
export function PaymentScanButton({ onApply }: { onApply: (fill: ScanFill) => void }) {
  const [open, setOpen] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const reset = () => {
    setImage(null);
    setResult(null);
  };

  const read = (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    void toDataUrl(file).then((url) => {
      setImage(url);
      setResult(null);
      start(async () => {
        const res = await scanPaymentScreenshot(url);
        if (res.ok && res.data) {
          setResult(res.data);
          if (!res.data.ok) toast.error(res.data.error ?? "Could not read this screenshot");
        } else if (!res.ok) toast.error(res.error);
      });
    });
  };

  // Paste a screenshot straight from the clipboard while the dialog is open
  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => read([...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/")));
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  const ok = result?.ok;

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)} className="ai-scan-button h-9 gap-1.5">
        <Sparkles className="text-[oklch(0.56_0.2_352)]" /> Scan screenshot
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-heading text-2xl tracking-wide">
              <ScanLine className="size-5" /> Read a payment screenshot
            </DialogTitle>
            <DialogDescription>GPay, PhonePe, Paytm or a bank app. The AI fills in the payment form; you check it and record it.</DialogDescription>
          </DialogHeader>

          {!image ? (
            <button
              type="button"
              onClick={() => input.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                read(e.dataTransfer.files[0]);
              }}
              className="grid place-items-center gap-2 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 px-4 py-10 text-center hover:bg-primary/10"
            >
              <ImagePlus className="size-8 text-primary" />
              <span className="font-semibold">Choose a screenshot</span>
              <span className="text-xs text-muted-foreground">or drop / paste it here</span>
            </button>
          ) : (
            <div className="grid gap-4 sm:grid-cols-[minmax(0,10rem)_1fr]">
              <div className="relative mx-auto w-40 overflow-hidden rounded-xl ring-1 ring-foreground/10 sm:w-full">
                {/* eslint-disable-next-line @next/next/no-img-element -- local preview of a data URL */}
                <img src={image} alt="Payment screenshot" className="w-full" />
                {pending && (
                  <>
                    <div className="absolute inset-0 bg-primary/10" />
                    <motion.div className="ai-scan-line absolute inset-x-0 h-10" animate={{ top: ["-10%", "100%"] }} transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut", repeatType: "reverse" }} />
                  </>
                )}
              </div>
              <div className="min-w-0">
                <AnimatePresence mode="wait">
                  {pending ? (
                    <motion.div key="reading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" /> Reading the screenshot…
                    </motion.div>
                  ) : result ? (
                    <motion.div key="result" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-2 text-sm">
                      {ok ? (
                        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                          <Row label="Player" value={result.playerName ?? <span className="text-warning">not matched</span>} />
                          <Row label="Payer" value={result.payerName} />
                          <Row label="Amount" value={result.amount !== null && result.amount !== undefined ? <b className="tabular">{rupees(result.amount)}</b> : null} />
                          <Row label="Date" value={result.paidOn ? formatDate(result.paidOn) : null} />
                          <Row label="App" value={result.app} />
                          <Row label="Reference" value={result.reference && <span className="break-all">{result.reference}</span>} />
                          <Row label="Status" value={result.status} />
                        </dl>
                      ) : (
                        <p className="text-destructive">{result.error}</p>
                      )}
                      {result.warnings.map((w) => (
                        <p key={w} className="flex gap-1.5 rounded-md bg-warning/10 px-2 py-1 text-[12.5px] text-foreground">
                          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" /> {w}
                        </p>
                      ))}
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            </div>
          )}

          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => read(e.target.files?.[0])} />

          <DialogFooter className="gap-2">
            {image && (
              <Button type="button" variant="outline" onClick={reset} disabled={pending}>
                Another screenshot
              </Button>
            )}
            <Button
              type="button"
              disabled={!ok || pending}
              onClick={() => {
                if (!result) return;
                onApply({
                  playerId: result.playerId ?? null,
                  amount: result.amount ?? null,
                  paidOn: result.paidOn ?? null,
                  reference: result.reference ?? null,
                  note: [result.app, result.payerName && `from ${result.payerName}`].filter(Boolean).join(" ") || null,
                });
                setOpen(false);
                reset();
                toast.success("Form filled in — check it and press Record payment");
              }}
            >
              <Check /> Use these details
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{value ?? <span className="text-muted-foreground">–</span>}</dd>
    </>
  );
}
