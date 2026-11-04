import { AppShell } from "@/components/shell/AppShell";

export default function GameLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
