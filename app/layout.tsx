import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Maitreo | Intelligent Reputation',
  description: 'Monitor every review. Get alerted and respond by text, only when it matters.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased selection:bg-white selection:text-black">
        {children}
      </body>
    </html>
  )
}
