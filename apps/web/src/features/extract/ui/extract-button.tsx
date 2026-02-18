import { Button } from "../../../shared/ui/button"

type ExtractButtonProps = {
  itemId: number
  loading: boolean
  onExtract: (itemId: number, force?: boolean) => Promise<void>
}

export function ExtractButton({ itemId, loading, onExtract }: ExtractButtonProps): JSX.Element {
  return (
    <Button type="button" disabled={loading} onClick={() => void onExtract(itemId, true)}>
      Re-extract
    </Button>
  )
}
