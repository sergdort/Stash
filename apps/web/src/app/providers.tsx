import type { PropsWithChildren } from "react"
import { CssBaseline, ThemeProvider } from "@mui/material"

import { appTheme } from "../shared/theme/theme"

export function AppProviders({ children }: PropsWithChildren): JSX.Element {
  return (
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  )
}
