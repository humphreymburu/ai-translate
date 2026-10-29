import { Geist, Geist_Mono, Noto_Sans_Arabic } from 'next/font/google'
import './globals.css'

const geist = Geist({ subsets: ['latin', 'latin-ext', 'cyrillic'], variable: '--font-geist', display: 'swap' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' })
const arabic = Noto_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '600'],
  variable: '--font-arabic',
  display: 'swap',
  preload: false,
})

export const metadata = {
  title: 'Translate · Workbench',
  description: 'English → multilingual translations with Qwen (DashScope) or Amazon Nova (Bedrock)',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${arabic.variable}`}>
      <body>{children}</body>
    </html>
  )
}
