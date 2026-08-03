"use client";

import { useAppUser, useAppAuth } from "@/hooks/use-auth";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

export function AppUserButton() {
  const { user, isSignedIn } = useAppUser();
  const { signOut } = useAppAuth();
  const router = useRouter();

  if (!isSignedIn || !user) {
    return null;
  }

  const initials = user.fullName
    ? user.fullName.charAt(0).toUpperCase()
    : user.email.charAt(0).toUpperCase();

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="relative flex-shrink-0 cursor-pointer select-none outline-none group">
          <div className="absolute -inset-0.5 rounded-xl bg-gradient-to-br from-[var(--color-brand-500)] to-[var(--color-accent-400)] opacity-75 group-hover:opacity-100 transition-opacity" />
          <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--color-brand-600)] to-[var(--color-accent-500)] flex items-center justify-center text-white text-sm font-bold font-display shadow-md">
            {initials}
          </div>
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 w-56 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-50)]/90 backdrop-blur-xl p-2 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200"
        >
          <div className="px-3 py-2">
            <p className="text-xs font-bold font-display text-[var(--color-text-primary)] truncate">
              {user.fullName}
            </p>
            <p className="text-[10px] font-mono text-[var(--color-text-muted)] truncate mt-0.5">
              {user.email}
            </p>
          </div>

          <DropdownMenu.Separator className="my-1.5 h-px bg-[var(--color-border)]" />

          <DropdownMenu.Item
            onClick={handleSignOut}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold text-red-600 hover:text-red-500 hover:bg-red-500/10 cursor-pointer outline-none transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign out</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
