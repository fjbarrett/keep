"use client";
import { signOut } from "next-auth/react";
import { clearOwnerData } from "./offlineDb";

export async function signOutAccount(ownerId: string) {
  await clearOwnerData(ownerId).catch(() => {});
  try {
    localStorage.setItem("keep.signout", JSON.stringify({ ownerId, at: Date.now() }));
    localStorage.removeItem("keep.signout");
  } catch { /* Other tabs also revalidate their server session on their next request. */ }
  await signOut({ callbackUrl: "/signin" });
}
