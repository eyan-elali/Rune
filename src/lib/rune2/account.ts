/** Who is signed in, as the account menu shows it. */
export type Account = { penName: string | null; email: string };

/** The account menu's identity: the pen name, and the email signed in with. */
export function accountOf(
  user: { email?: string | null },
  profile: { display_name?: string | null } | null | undefined
): Account {
  return { penName: profile?.display_name?.trim() || null, email: user.email ?? "" };
}
