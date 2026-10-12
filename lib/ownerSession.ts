// A page that has ended an account session must never repopulate its private
// cache during pagehide or from a late network response. A new sign-in reloads
// the page, creating a fresh module instance.
const endedOwners = new Set<string>();
export function endOwnerSession(owner: string) { endedOwners.add(owner); }
export function assertOwnerSession(owner: string) {
  if (endedOwners.has(owner)) throw new Error("This account was signed out. Reload before editing.");
}
