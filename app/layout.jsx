import './globals.css'

export const metadata = {
  title: 'Nova Translate · Workbench',
  description: 'English → multilingual translations with Amazon Nova 2 Lite (Bedrock)',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
