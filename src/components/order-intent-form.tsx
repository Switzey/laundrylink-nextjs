"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

const DRAFT_PREFIX = "laundrylink:order-draft:";
const allowedDraftField = /^(service_\d+|pickup_date|pickup_time_window|delivery_date|delivery_time_window|pickup_address_id|delivery_address_id|pickup_address|delivery_address|pickup_notes|delivery_notes|notes)$/;

type Draft = Record<string, string>;

function readDraft(key: string): Draft | null {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(key) ?? "null") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const entries = Object.entries(parsed).filter(
      ([name, value]) => allowedDraftField.test(name) && typeof value === "string" && value.length <= 1000,
    );
    return Object.fromEntries(entries.slice(0, 100));
  } catch {
    return null;
  }
}

function restoreDraft(form: HTMLFormElement, draft: Draft) {
  for (const [name, value] of Object.entries(draft)) {
    if ((name === "pickup_address_id" || name === "delivery_address_id") && !value) continue;
    const control = form.elements.namedItem(name);
    if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) {
      control.value = value;
    }
  }
}

function saveDraft(form: HTMLFormElement, key: string) {
  const draft: Draft = {};
  for (const [name, value] of new FormData(form).entries()) {
    if (allowedDraftField.test(name) && typeof value === "string") draft[name] = value.slice(0, 1000);
  }
  try {
    sessionStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Authentication can still continue when browser storage is unavailable.
  }
}

export function OrderIntentForm({
  action,
  authenticated,
  cleanerId,
  returnTo,
  resumeDraft,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  authenticated: boolean;
  cleanerId: number;
  returnTo: string;
  resumeDraft: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const draftKey = `${DRAFT_PREFIX}${cleanerId}`;

  useEffect(() => {
    if (!resumeDraft || !formRef.current) return;
    const draft = readDraft(draftKey);
    if (draft) {
      restoreDraft(formRef.current, draft);
    }
  }, [draftKey, resumeDraft]);

  return (
    <form
      ref={formRef}
      action={action}
      className="grid gap-6 lg:grid-cols-[1.3fr_.7fr]"
      onSubmit={(event) => {
        saveDraft(event.currentTarget, draftKey);
        if (authenticated) return;
        event.preventDefault();
        router.push(`/login?returnTo=${encodeURIComponent(returnTo)}`);
      }}
    >
      <input type="hidden" name="return_to" value={returnTo} />
      {children}
    </form>
  );
}
