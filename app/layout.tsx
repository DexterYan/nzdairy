import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MilkCompass",
  description:
    "Compare the season's official Fonterra forecast with a milk-price futures reference and explore annual milk revenue.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
