import type { Metadata } from "next";
import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Roofing Lead CRM · Miami-Dade",
  description: "Find aging roofs and stalled roofing permits around a point in Miami-Dade County, and turn them into tracked leads.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
