"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action";

/**
 * Calls a server action, shows a toast with the outcome, and exposes `pending`.
 *   const { run, pending } = useAction();
 *   run(() => markPaid({ chargeId }), "Marked as paid");
 */
export function useAction() {
  const [pending, startTransition] = useTransition();
  const run = <T,>(fn: () => Promise<ActionResult<T>>, success?: string, onDone?: (data: T | undefined) => void) =>
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        if (success) toast.success(success);
        onDone?.(res.data);
      } else {
        toast.error(res.error);
      }
    });
  return { run, pending };
}
