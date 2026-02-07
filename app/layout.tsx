import React from "react"
export const metadata = {
  title: "Tracker",
  description: "Personal tracker dashboard",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  )
}
