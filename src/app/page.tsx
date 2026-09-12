import { getSession } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { LoginGate } from "@/components/login-gate";

// Server component: renders the login gate if there's no session, otherwise
// the app. Everything (including auth) stays in the Z cloud.
export default async function Home() {
  const session = await getSession();
  if (!session) return <LoginGate />;
  return <AppShell />;
}
