"use client";

import { useId, useState } from "react";
import { Dialog, btn, input } from "@/components/ui/primitives";

/** One-field dialog for naming or renaming a folder, query or notebook. */
export default function NameDialog({
  title,
  label,
  initial = "",
  placeholder,
  action,
  onSubmit,
  onClose,
}: {
  title: string;
  label: string;
  initial?: string;
  placeholder?: string;
  action: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial);
  const formId = useId();
  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    onClose();
  };
  return (
    <Dialog
      title={title}
      onClose={onClose}
      width="max-w-sm"
      footer={
        <>
          <button type="button" onClick={onClose} className={btn.secondary}>
            Cancel
          </button>
          <button type="submit" form={formId} disabled={!name.trim()} className={btn.primary}>
            {action}
          </button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="block">
          <span className="mb-1 block text-[12px] text-muted">{label}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            placeholder={placeholder}
            className={input}
            aria-label={label}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            required
          />
        </label>
      </form>
    </Dialog>
  );
}
