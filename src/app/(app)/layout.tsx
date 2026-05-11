import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BottomNav from "@/components/bottom-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      {/* Page content — padded so it sits above the bottom nav */}
      <main className="flex-1 overflow-y-auto pb-24">
        {children}
      </main>

      <BottomNav />
    </div>
  );
}
