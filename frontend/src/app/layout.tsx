import "./globals.css";
import Providers from "../components/providers";
import AppLayout from "@/components/app-layout";
import AuthGuard from "@/components/auth-guard";
import { Toaster } from "sonner";
import { NotificationListener } from "@/components/shared/NotificationListener";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <Toaster position="top-center" richColors />
      <Providers>
        <AuthGuard>
          <AppLayout>
            {children}
          </AppLayout>
          <NotificationListener />
        </AuthGuard>
      </Providers>
    </>
  );
}
