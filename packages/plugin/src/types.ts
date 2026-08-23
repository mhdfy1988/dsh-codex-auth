/** Client-safe views for the Codex authorization Web Consumer. */

/** OAuth interaction mode offered by the current OpenAI Codex provider. */
export type CodexAuthMode = 'browser' | 'device_code'

/** One user-facing authorization progress item. */
export interface CodexAuthNoticeView {
  /** Monotonic item number within the current attempt. */
  readonly sequence: number
  /** Provider-owned progress text. */
  readonly message: string
  /** Page the user may need to open. */
  readonly url?: string
  /** Device code intended for display to the user. */
  readonly code?: string
}

/** A prompt the browser-callback path is currently racing. */
export interface CodexAuthWaitingPromptView {
  /** Prompt category; values are never returned to the browser by this package. */
  readonly kind: 'text' | 'secret'
  /** Provider-owned prompt text. */
  readonly message: string
}

/** Current attempt phase retained until the next attempt starts. */
export type CodexAuthAttemptPhase = 'running' | 'authorized' | 'cancelled' | 'failed'

/** Public state of one authorization attempt, with no credential payload. */
export interface CodexAuthAttemptView {
  /** Opaque process-local attempt identity. */
  readonly id: string
  /** Selected interaction mode. */
  readonly mode: CodexAuthMode
  /** Current or terminal phase. */
  readonly phase: CodexAuthAttemptPhase
  /** Attempt start time in Unix milliseconds. */
  readonly startedAt: number
  /** Terminal time in Unix milliseconds. */
  readonly finishedAt?: number
  /** Bounded provider progress history. */
  readonly notices: readonly CodexAuthNoticeView[]
  /** Prompt waiting for the provider's browser callback, when present. */
  readonly waitingPrompt?: CodexAuthWaitingPromptView
  /** Redacted failure or post-login route warning. */
  readonly message?: string
}

/** Complete configuration-safe view returned to the browser. */
export interface CodexAuthView {
  /** Monotonic process-local state revision. */
  readonly revision: number
  /** Whether llm-pi-ai currently registered the Codex authorization flow. */
  readonly flowAvailable: boolean
  /** Whether any surface currently owns the provider flow. */
  readonly authorizationInFlight: boolean
  /** Whether a local credential record exists. */
  readonly credentialConfigured: boolean
  /** Stored record tag, never its payload. */
  readonly credentialKind?: 'grant' | 'api-key'
  /** Whether the current credential provider permits deletion. */
  readonly credentialWritable: boolean
  /** Whether the llm-pi-ai OpenAI Codex route is enabled in settings. */
  readonly routeConfigured: boolean
  /** Latest attempt owned by this Consumer. */
  readonly attempt?: CodexAuthAttemptView
}

/** Start request accepted by the Web Consumer. */
export interface CodexAuthStartRequest {
  /** Browser callback or device-code interaction. */
  readonly mode: CodexAuthMode
}
