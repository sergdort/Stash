import type { PropsWithChildren } from "react"

export function Panel({ children }: PropsWithChildren): JSX.Element {
  return (
    <section
      style={{
        border: "1px solid #d1d5db",
        borderRadius: 8,
        background: "#ffffff",
        padding: 12,
      }}
    >
      {children}
    </section>
  )
}
