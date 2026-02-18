import type { ButtonHTMLAttributes, PropsWithChildren } from "react"

export function Button(props: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>): JSX.Element {
  return (
    <button
      {...props}
      style={{
        border: "1px solid #1f2937",
        background: "#111827",
        color: "#f9fafb",
        borderRadius: 6,
        padding: "6px 10px",
        cursor: "pointer",
        ...((props.style as Record<string, unknown> | undefined) ?? {}),
      }}
    />
  )
}
