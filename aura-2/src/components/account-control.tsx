"use client";

import { useState } from "react";
import { useAuraAuth } from "@/components/auth-provider";

export function AccountControl({ darkMode }: { darkMode: boolean }) {
  const { user, signOut } = useAuraAuth();
  const [signingOut, setSigningOut] = useState(false);

  return (
    <div className="flex max-w-full items-center gap-2">
      <span
        className={`hidden max-w-44 truncate rounded-full border px-3 py-2 text-xs font-semibold sm:inline-block sm:max-w-56 ${
          darkMode ? "border-white/10 bg-white/5 text-slate-200" : "border-slate-200 bg-white/80 text-slate-600"
        }`}
        title={user?.email ?? undefined}
      >
        {user?.email}
      </span>
      <button
        type="button"
        disabled={signingOut}
        onClick={async () => {
          setSigningOut(true);
          try {
            await signOut();
          } finally {
            setSigningOut(false);
          }
        }}
        className={`rounded-full border px-2.5 py-2 text-[11px] font-bold transition hover:-translate-y-0.5 disabled:opacity-60 sm:px-3 sm:text-xs ${
          darkMode ? "border-white/10 bg-white/5 text-slate-200" : "border-slate-200 bg-white/80 text-slate-600"
        }`}
      >
        {signingOut ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
