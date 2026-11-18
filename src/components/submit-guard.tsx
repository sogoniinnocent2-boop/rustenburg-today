"use client";

import { useEffect } from "react";

/** Blocks a second submit on the same form. Server actions redirect, so the next page is a fresh form. */
export function SubmitGuard() {
  useEffect(() => {
    const onSubmit = (event: Event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.dataset.pending === "1") {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      form.dataset.pending = "1";
      window.setTimeout(() => {
        form.querySelectorAll("button").forEach((node) => {
          if (!(node instanceof HTMLButtonElement)) return;
          if (node.type === "submit") node.disabled = true;
        });
      }, 0);
    };
    document.addEventListener("submit", onSubmit, true);
    return () => document.removeEventListener("submit", onSubmit, true);
  }, []);
  return null;
}
