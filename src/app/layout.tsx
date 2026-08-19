import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

// Poppins é a família tipográfica única da marca (Manual da Marca NIX, seção 09).
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

// O ícone vem de src/app/icon.png e src/app/apple-icon.png pela convenção do
// App Router; aqui só declaramos o SVG, que os navegadores modernos preferem.
export const metadata: Metadata = {
  title: "NIX Gestor",
  description:
    "Gestão da produção de conteúdo da Agência NIX. Foco. Energia. Precisão.",
  icons: { icon: [{ url: "/brand/simbolo.svg", type: "image/svg+xml" }] },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${poppins.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
