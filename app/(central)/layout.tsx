import AppShell from "@/components/AppShell";

export default function CentralLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
