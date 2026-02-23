import type { JSX } from "react"
import type { SvgIconProps } from "@mui/material"
import { SvgIcon } from "@mui/material"

export function AddIcon(props: SvgIconProps): JSX.Element {
  return (
    <SvgIcon {...props}>
      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z" />
    </SvgIcon>
  )
}

export function InboxIcon(props: SvgIconProps): JSX.Element {
  return (
    <SvgIcon {...props}>
      <path d="M19 3H5c-1.1 0-2 .9-2 2v13a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V5c0-1.1-.9-2-2-2m0 15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-2h4a2 2 0 1 0 4 0h6zM5 12V5h14v7h-6a2 2 0 1 0-4 0z" />
    </SvgIcon>
  )
}

export function ArticleIcon(props: SvgIconProps): JSX.Element {
  return (
    <SvgIcon {...props}>
      <path d="M19 5v14H5V5zm0-2H5c-1.1 0-2 .9-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5c0-1.1-.9-2-2-2M7 12h10v2H7zm0-4h10v2H7zm0 8h7v2H7z" />
    </SvgIcon>
  )
}

export function ExternalLinkIcon(props: SvgIconProps): JSX.Element {
  return (
    <SvgIcon {...props}>
      <path d="M14 3v2h3.59L7 15.59 8.41 17 19 6.41V10h2V3zm5 16H5V5h6V3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2v-6h-2z" />
    </SvgIcon>
  )
}

export function StatusIcon(props: SvgIconProps): JSX.Element {
  return (
    <SvgIcon {...props}>
      <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2m-1 15-4-4 1.4-1.4 2.6 2.6 5.6-5.6L18 10z" />
    </SvgIcon>
  )
}

export function TagIcon(props: SvgIconProps): JSX.Element {
  return (
    <SvgIcon {...props}>
      <path d="m21.41 11.58-9-9A2 2 0 0 0 11 2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 .59 1.41l9 9A2 2 0 0 0 13 22a2 2 0 0 0 1.41-.59l7-7A2 2 0 0 0 22 13a2 2 0 0 0-.59-1.42M13 20.01 4 11V4h7v-.01l9 9z" />
      <circle cx="6.5" cy="6.5" r="1.5" />
    </SvgIcon>
  )
}

export function ExtractIcon(props: SvgIconProps): JSX.Element {
  return (
    <SvgIcon {...props}>
      <path d="m12 2-2.91 6.26L2 9.27l5.2 5.05L5.82 22 12 18.56 18.18 22l-1.38-7.68L22 9.27l-7.09-1.01z" />
    </SvgIcon>
  )
}

export function AudioIcon(props: SvgIconProps): JSX.Element {
  return (
    <SvgIcon {...props}>
      <path d="M3 10v4h4l5 5V5L7 10zm13.5 2a4.5 4.5 0 0 0-2.5-4.03v8.06A4.5 4.5 0 0 0 16.5 12m0-9v2.06a7 7 0 0 1 0 13.88V21a9 9 0 0 0 0-18" />
    </SvgIcon>
  )
}

export function DownloadIcon(props: SvgIconProps): JSX.Element {
  return (
    <SvgIcon {...props}>
      <path d="M5 20h14v-2H5zM12 2h-2v10H7l5 5 5-5h-3z" />
    </SvgIcon>
  )
}

export function TimeIcon(props: SvgIconProps): JSX.Element {
  return (
    <SvgIcon {...props}>
      <path d="M12 1a11 11 0 1 0 11 11A11 11 0 0 0 12 1m1 11.59 3.29 3.3-1.41 1.41L11 13V6h2z" />
    </SvgIcon>
  )
}

export function PlayIcon(props: SvgIconProps): JSX.Element {
  return (
    <SvgIcon {...props}>
      <path d="M8 5v14l11-7z" />
    </SvgIcon>
  )
}

export function PauseIcon(props: SvgIconProps): JSX.Element {
  return (
    <SvgIcon {...props}>
      <path d="M6 5h5v14H6zm7 0h5v14h-5z" />
    </SvgIcon>
  )
}

export function ChevronLeftIcon(props: SvgIconProps): JSX.Element {
  return (
    <SvgIcon {...props}>
      <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
    </SvgIcon>
  )
}
