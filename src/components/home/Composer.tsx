"use client";

import { useEffect, useRef, useState } from "react";
import ModelPicker from "@/components/ai/ModelPicker";
import { Icon } from "@/components/ui/icons";
import { useAssistantStore } from "@/stores/assistant-store";
import { useUiStore } from "@/stores/ui-store";

/** Hand a question to the Assistant and reveal it. */
export function askAssistant(text: string): void {
  const q = text.trim();
  if (!q) return;
  useUiStore.getState().setAssistantOpen(true);
  void useAssistantStore.getState().send(q);
}

const MAX_HEIGHT = 112; // about four lines

export default function Composer() {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const busy = useAssistantStore((s) => s.status !== "idle");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [text]);

  function submit() {
    if (!text.trim() || busy) return;
    askAssistant(text);
    setText("");
  }

  return (
    <div className="qp-home-composer rounded-lg border border-line-strong bg-surface p-2.5">
      <textarea
        ref={ref}
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        aria-label="Ask about your data"
        placeholder="Ask about your tables, joins or results…"
        className="block max-h-28 w-full resize-none bg-transparent px-1.5 py-1 text-[15px] leading-6 text-ink outline-none placeholder:text-faint"
      />
      <div className="mt-1 flex items-center justify-between gap-3">
        <span className="hidden pl-1.5 text-[12px] text-faint sm:inline">Enter sends, Shift+Enter adds a line</span>
        <div className="ml-auto flex items-center gap-2">
          <ModelPicker compact />
          <button
            type="button"
            onClick={submit}
            disabled={!text.trim() || busy}
            aria-label="Ask the assistant"
            className="inline-flex size-8 items-center justify-center rounded-md bg-accent text-on-accent transition-[background-color,transform] hover:bg-accent-hover active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:pointer-events-none disabled:opacity-45"
          >
            <Icon name="arrowUp" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
