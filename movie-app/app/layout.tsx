import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'CineMatch — Movie Predictions',
  description: 'Discover movies you\'ll love',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
