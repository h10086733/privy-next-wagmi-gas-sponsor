import type { Metadata } from "next";
import "react-toastify/dist/ReactToastify.css";
import "./globals.css";
import Providers from "@/providers/providers";

export const metadata: Metadata = {
  title: "Privy 7702 Gas Sponsor",
  description: "Privy 7702 + Backend Sponsor minimal demo",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
