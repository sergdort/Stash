import { BrowserRouter, Route, Routes } from "react-router-dom"

import { AppShell } from "./app-shell"

export function AppRouter(): JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppShell />} />
      </Routes>
    </BrowserRouter>
  )
}
