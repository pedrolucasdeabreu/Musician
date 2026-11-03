import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Musician",
  description: "Sua biblioteca musical, com players oficiais e letras licenciadas.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
