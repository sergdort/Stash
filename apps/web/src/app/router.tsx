import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"

import { AppShell } from "./app-shell"
import { InboxScreen, ItemScreen, SaveScreen } from "./screens"

export function AppRouter(): JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<InboxScreen />} />
          <Route path="/save" element={<SaveScreen />} />
          <Route path="/item/:itemId" element={<ItemScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
