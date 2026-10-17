import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { requireUserFor } from "@/lib/auth/guard";
import { Nav } from "@/components/ui/Nav";
import { AccountSettings } from "@/components/account/AccountSettings";

/** Your email, which is how you sign in, and whether shares are emailed to you. */
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ changed?: string }>;
}) {
  const user = await requireUserFor("/account");
  const { changed } = await searchParams;
  const [me] = await db
    .select({ email: users.email, emailNotifications: users.emailNotifications })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  return (
    <>
      <Nav user={user} />
      <main className="sheet py-12">
        <h1 className="display text-5xl">Your account</h1>
        <AccountSettings
          email={me?.email ?? null}
          notifications={me?.emailNotifications ?? true}
          justChanged={changed === "1"}
        />
      </main>
    </>
  );
}
