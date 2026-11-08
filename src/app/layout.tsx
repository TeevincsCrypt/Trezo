import type { Metadata, Viewport } from "next";
import "./globals.css";
import { GameProvider } from "@/components/providers/GameProvider";
import { WalletProvider } from "@/components/providers/WalletProvider";
import { LocationProvider } from "@/components/providers/LocationProvider";

export const metadata: Metadata = {
  title: "TREZO — The world is your playground",
  description: "A real-world treasure hunting game powered by NEAR Protocol. Explore, discover treasures, complete missions and own your collectibles.",
  applicationName: "TREZO",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#e9e8e5",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <GameProvider>
          <WalletProvider>
            <LocationProvider>{children}</LocationProvider>
          </WalletProvider>
        </GameProvider>
      </body>
    </html>
  );
}
