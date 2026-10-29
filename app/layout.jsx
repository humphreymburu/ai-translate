import './globals.css'

export const metadata = {
  title: 'Nova Translate · Workbench',
  description: 'English → multilingual translations with Qwen (DashScope) or Amazon Nova (Bedrock)',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
