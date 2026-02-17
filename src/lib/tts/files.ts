import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"

import type { TtsFormat } from "./types.js"

const MAX_TITLE_SLUG_LENGTH = 80
const MAX_VOICE_SLUG_LENGTH = 40
const SHORT_ID_LENGTH = 6

type FriendlyFilenameInput = {
  itemId: number
  title: string | null
  voice: string
  format: TtsFormat
  now?: Date
}

function pad2(value: number): string {
  return String(value).padStart(2, "0")
}

function formatDateLocal(date: Date): string {
  const year = date.getFullYear()
  const month = pad2(date.getMonth() + 1)
  const day = pad2(date.getDate())
  return `${year}-${month}-${day}`
}

function formatTimeLocal(date: Date): string {
  return `${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`
}

export function slugify(input: string, maxLength: number): string {
  const ascii = input
    .normalize("NFKD")
    .replaceAll(/[^\p{ASCII}]/gu, "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/-+/g, "-")
    .replaceAll(/^-|-$/g, "")

  if (ascii.length === 0) {
    return ""
  }
  if (ascii.length <= maxLength) {
    return ascii
  }
  return ascii.slice(0, maxLength).replaceAll(/-+$/g, "")
}

function randomShortId(): string {
  let value = ""
  while (value.length < SHORT_ID_LENGTH) {
    value += crypto
      .randomBytes(6)
      .toString("base64url")
      .replaceAll(/[^a-z0-9]/gi, "")
      .toLowerCase()
  }
  return value.slice(0, SHORT_ID_LENGTH)
}

function extension(format: TtsFormat): string {
  return format === "wav" ? "wav" : "mp3"
}

export function buildFriendlyFilename(input: FriendlyFilenameInput): string {
  const now = input.now ?? new Date()
  const date = formatDateLocal(now)
  const time = formatTimeLocal(now)
  const titleSlug =
    slugify(input.title ?? "", MAX_TITLE_SLUG_LENGTH) || `untitled-item-${input.itemId}`
  const normalizedVoice = input.voice.replaceAll(/([a-z])([A-Z])/g, "$1-$2")
  const voiceSlug = slugify(normalizedVoice, MAX_VOICE_SLUG_LENGTH) || "voice"
  const shortId = randomShortId()
  const ext = extension(input.format)
  return `${date}_${titleSlug}_id-${input.itemId}_${voiceSlug}_${time}_${shortId}.${ext}`
}

function splitNameAndExtension(fileName: string): { stem: string; ext: string } {
  const ext = path.extname(fileName)
  const stem = ext.length > 0 ? fileName.slice(0, -ext.length) : fileName
  return { stem, ext }
}

export function ensureUniqueFilePath(targetPath: string): string {
  if (!fs.existsSync(targetPath)) {
    return targetPath
  }

  const dir = path.dirname(targetPath)
  const fileName = path.basename(targetPath)
  const { stem, ext } = splitNameAndExtension(fileName)

  let index = 2
  while (index < Number.MAX_SAFE_INTEGER) {
    const candidate = path.join(dir, `${stem}_${index}${ext}`)
    if (!fs.existsSync(candidate)) {
      return candidate
    }
    index += 1
  }

  throw new Error(`Could not find a unique output path for ${targetPath}`)
}
