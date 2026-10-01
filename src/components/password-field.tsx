"use client";

import { useState } from "react";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";

export function PasswordField({
  name,
  label = "Password",
  autoComplete,
  minLength,
  hint,
  hideLabel = false,
}: {
  name: string;
  label?: string;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
  hint?: string;
  hideLabel?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label>
      {!hideLabel && <span className="field-label">{label}</span>}
      <span className="relative block">
        <LockKeyhole aria-hidden="true" className="absolute left-3 top-3 text-zinc-400" size={18} />
        <input
          className="field px-10"
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          minLength={minLength}
          maxLength={128}
          required
        />
        <button
          type="button"
          className="absolute right-1.5 top-1.5 flex size-8 items-center justify-center rounded text-zinc-500 hover:bg-zinc-100 hover:text-brand-blue"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        >
          {visible ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
        </button>
      </span>
      {hint && <span className="mt-1.5 block text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}
