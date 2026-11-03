import type { ReactNode } from "react";
import { Box, type Metadata } from "@textjs/app";

export const metadata: Metadata = {
  title: { default: "Dead Signal", template: "%s · Dead Signal" },
  description: "A zombie rail shooter that runs in your browser's DevTools console.",
};

export default function RootLayout({ children }: { children?: ReactNode }): ReactNode {
  return <Box className="flex-col w-full h-full">{children}</Box>;
}
