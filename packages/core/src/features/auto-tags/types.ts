export type AutoTagSource = "embedding" | "rule"

export type AutoTagBackend = "python" | "rule"

export type AutoTagScore = {
  tag: string
  score: number
  source: AutoTagSource
}

export type AutoTagApplyResult = {
  applied: string[]
  scores: AutoTagScore[]
  backend: AutoTagBackend
  warning?: string
}

export type AutoTagConfig = {
  enabled: boolean
  maxTags: number
  minScore: number
  model: string
  backend: AutoTagBackend
  pythonBin: string | null
  helperPath: string
  seedTagsPath: string
}

export type AutoTagDependencyCheckId =
  | "python"
  | "helper_script"
  | "sentence_transformers"
  | "helper_runtime"

export type AutoTagDependencyCheck = {
  id: AutoTagDependencyCheckId
  required: boolean
  ok: boolean
  path: string | null
  message: string | null
}

export type AutoTagsDoctorReport = {
  backend: AutoTagBackend
  healthy: boolean
  model: string
  helper_path: string
  python_path: string | null
  checks: AutoTagDependencyCheck[]
}

export type SeedTag = {
  tag: string
  descriptor: string
}

export type SeedTagsConfig = {
  version: number
  description?: string
  tags: SeedTag[]
}

export type AutoTagCandidate = {
  tag: string
  descriptor: string
}

export type AutoTagInput = {
  itemId: number
  url: string
  title: string | null
  domain: string | null
  content: string | null
}
