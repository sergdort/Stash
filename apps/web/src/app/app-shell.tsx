import { Box, Container } from "@mui/material"
import type { JSX } from "react"
import { Outlet } from "react-router-dom"

export function AppShell(): JSX.Element {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        pt: "calc(10px + env(safe-area-inset-top))",
        pb: { xs: 1.25, sm: 2 },
      }}
    >
      <Container
        component="main"
        maxWidth="md"
        sx={{
          px: { xs: 1.25, sm: 2 },
          pb: "calc(16px + env(safe-area-inset-bottom))",
        }}
      >
        <Outlet />
      </Container>
    </Box>
  )
}
