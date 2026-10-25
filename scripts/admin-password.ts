/**
 * Sets an admin's login password from the command line (recovery when nobody can log in).
 *   npm run admin:password -- someone@gmail.com              # generates and prints a password
 *   npm run admin:password -- someone@gmail.com 'new-pass'   # uses the given password
 * The email is added to the admin list if it is not there yet.
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

async function main() {
  const [emailArg, passwordArg] = process.argv.slice(2);
  const email = emailArg?.trim().toLowerCase();
  if (!email?.includes("@")) throw new Error("Usage: npm run admin:password -- <email> [password]");

  const { getDb } = await import("@/db");
  const { admins } = await import("@/db/schema");
  const { passwordSchema, setLoginPassword, temporaryPassword } = await import("@/modules/auth/accounts");
  const { audit } = await import("@/modules/audit/audit");

  const password = passwordArg ?? temporaryPassword();
  passwordSchema.parse(password);

  const db = getDb();
  await db.insert(admins).values({ email, addedBy: "cli" }).onConflictDoNothing();
  await setLoginPassword(email, password);
  await audit({ actor: "cli", action: "admin.password_reset", entity: "admin", entityId: email }, db);

  console.log(`Password set for ${email}`);
  if (!passwordArg) console.log(`Temporary password: ${password}\nLog in, then change it in Admin → My account.`);
  process.exit(0);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
