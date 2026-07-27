import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Monitor Legal",
    template: "%s · Monitor Legal",
  },
  description: "Dashboard diario para estudios jurídicos argentinos.",
  applicationName: "Monitor Legal",
};

export const viewport: Viewport = {
  themeColor: "#f6f7f8",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
