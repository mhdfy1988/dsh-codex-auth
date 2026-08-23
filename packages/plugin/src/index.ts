/**
 * Host-side Codex authorization Consumer over Harness-owned authorization,
 * credential, and settings services.
 * @module dsh-codex-auth
 */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type {
  AuthorizationInteraction,
  AuthorizationNotice,
  AuthorizationPrompt,
  AuthorizationService,
} from '@deepseek-ai/dsh-authorization'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { SettingsProvider } from '@deepseek-ai/dsh-settings'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {
  CodexAuthAttemptView,
  CodexAuthMode,
  CodexAuthNoticeView,
  CodexAuthStartRequest,
  CodexAuthView,
  CodexAuthWaitingPromptView,
} from './types.ts'

export type * from './types.ts'

/** Stable Cordis plugin name. */
export const name = 'codex-auth'

/** Host services required by the Consumer. */
export const inject = ['authorization', 'credentials', 'settings']

const CODEX_KEY = credentialKey('llm-pi-ai', 'openai-codex')
const LLM_PI_AI_NS = settingsNamespace('llm-pi-ai')
const MAX_NOTICES = 12

interface MutableAttempt {
  id: string
  mode: CodexAuthMode
  phase: CodexAuthAttemptView['phase']
  startedAt: number
  finishedAt: number | undefined
  notices: CodexAuthNoticeView[]
  waitingPrompt: CodexAuthWaitingPromptView | undefined
  message: string | undefined
}

interface WaitingPrompt {
  reject(error: Error): void
  removeAbort(): void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Remote-safe Codex authorization Consumer. */
    codexAuth: CodexAuthService
  }
}

/** Redact transient OAuth fields before an error reaches a UI or log. */
function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message
    .replace(/([?&](?:code|state|access_token|refresh_token|id_token)=)[^&\s]+/giu, '$1[redacted]')
    .replace(/("(?:access_token|refresh_token|id_token|access|refresh)"\s*:\s*")[^"]+/giu, '$1[redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]+\b/gu, 'sk-[redacted]')
}

/** Whether the resolved llm-pi-ai section contains the Codex route. */
function hasCodexRoute(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const providers = (value as Record<string, unknown>)['providers']
  return typeof providers === 'object'
    && providers !== null
    && !Array.isArray(providers)
    && Object.hasOwn(providers, 'openai-codex')
}

/** Clone one mutable attempt into its wire-safe readonly view. */
function attemptView(attempt: MutableAttempt): CodexAuthAttemptView {
  return {
    id: attempt.id,
    mode: attempt.mode,
    phase: attempt.phase,
    startedAt: attempt.startedAt,
    ...(attempt.finishedAt === undefined ? {} : { finishedAt: attempt.finishedAt }),
    notices: attempt.notices.map(notice => ({ ...notice })),
    ...(attempt.waitingPrompt === undefined ? {} : { waitingPrompt: { ...attempt.waitingPrompt } }),
    ...(attempt.message === undefined ? {} : { message: attempt.message }),
  }
}

/** Web-facing orchestration for exactly the llm-pi-ai/openai-codex record. */
export class CodexAuthService extends TypertRemoteService {
  static inject = inject

  private readonly authorization: AuthorizationService
  private readonly credentials: CredentialProvider
  private readonly settings: SettingsProvider
  private revision = 0
  private attempt?: MutableAttempt
  private active: Promise<void> | undefined
  private waiting: WaitingPrompt | undefined
  private disposed = false

  /**
   * @param ctx - Host context carrying the official authorization, credential, and settings seams.
   */
  constructor(ctx: Context) {
    super(ctx, 'codexAuth')
    const authorization = ctx.get('authorization')
    const credentials = ctx.get('credentials')
    const settings = ctx.get('settings')
    if (authorization === undefined || credentials === undefined || settings === undefined) {
      throw new Error('codex-auth: authorization, credentials, and settings must be mounted')
    }
    this.authorization = authorization
    this.credentials = credentials
    this.settings = settings
    ctx.effect(() => async () => {
      this.disposed = true
      if (this.active !== undefined) {
        this.authorization.cancel(CODEX_KEY)
        this.withdrawPrompt(new Error('codex-auth disposed'))
        await this.active
      }
    }, 'codex-auth: authorization attempt lifetime')
  }

  /**
   * Read current flow, credential metadata, route state, and this Consumer's latest attempt.
   * @returns a credential-payload-free browser view.
   */
  @Remote('status')
  async status(): Promise<CodexAuthView> {
    const flow = this.authorization.describe(CODEX_KEY)
    const credential = await this.credentials.describeRecord(CODEX_KEY)
    return {
      revision: this.revision,
      flowAvailable: flow !== undefined,
      authorizationInFlight: flow?.inFlight ?? false,
      credentialConfigured: credential.configured,
      ...(credential.kind === undefined ? {} : { credentialKind: credential.kind }),
      credentialWritable: credential.writable,
      routeConfigured: hasCodexRoute(this.settings.get(LLM_PI_AI_NS)),
      ...(this.attempt === undefined ? {} : { attempt: attemptView(this.attempt) }),
    }
  }

  /**
   * Start one OAuth attempt and return immediately while the provider continues in the background.
   * @param request - browser callback or device-code mode.
   * @returns the state after this Consumer owns the attempt.
   */
  @Remote('start')
  async start(request: CodexAuthStartRequest): Promise<CodexAuthView> {
    if (request.mode !== 'browser' && request.mode !== 'device_code') {
      throw new TypeError(`codex-auth: unsupported mode ${JSON.stringify(request.mode)}`)
    }
    if (this.disposed) throw new Error('codex-auth: service is disposed')
    if (this.active !== undefined) throw new Error('codex-auth: this page already owns an authorization attempt')
    const flow = this.authorization.describe(CODEX_KEY)
    if (flow === undefined) throw new Error('codex-auth: llm-pi-ai did not register the OpenAI Codex authorization flow')
    if (flow.inFlight) throw new Error('codex-auth: another surface already owns the OpenAI Codex authorization flow')

    this.attempt = {
      id: randomUUID(),
      mode: request.mode,
      phase: 'running',
      startedAt: Date.now(),
      finishedAt: undefined,
      notices: [],
      waitingPrompt: undefined,
      message: undefined,
    }
    this.bump()
    const task = this.runAttempt(this.attempt)
    this.active = task
    void task.finally(() => {
      if (this.active === task) this.active = undefined
    })
    return await this.status()
  }

  /**
   * Cancel the attempt this Consumer owns and wait until its public lifecycle has settled.
   * @returns the terminal state, or the unchanged state when nothing is running.
   */
  @Remote('cancel')
  async cancel(): Promise<CodexAuthView> {
    const active = this.active
    if (active === undefined) return await this.status()
    this.authorization.cancel(CODEX_KEY)
    this.withdrawPrompt(new Error('authorization cancelled'))
    await active
    return await this.status()
  }

  /**
   * Enable the installed pi-ai OpenAI Codex catalog route without replacing an existing profile.
   * @returns the state after the settings write.
   */
  @Remote('configure')
  async configure(): Promise<CodexAuthView> {
    await this.ensureRoute()
    return await this.status()
  }

  /**
   * Delete the local Codex grant. The issuer is not contacted.
   * @returns the state after deletion.
   */
  @Remote('signOut')
  async signOut(): Promise<CodexAuthView> {
    if (this.active !== undefined) {
      throw new Error('codex-auth: cancel the running authorization attempt before signing out')
    }
    await this.credentials.deleteRecord(CODEX_KEY)
    this.bump()
    return await this.status()
  }

  /**
   * Remove only the llm-pi-ai OpenAI Codex route; the stored grant is retained.
   * @returns the state after the settings write.
   */
  @Remote('removeRoute')
  async removeRoute(): Promise<CodexAuthView> {
    if (hasCodexRoute(this.settings.get(LLM_PI_AI_NS))) {
      await this.settings.mutate(LLM_PI_AI_NS, [
        { op: 'unset', path: ['providers', 'openai-codex'] },
      ])
      this.bump()
    }
    return await this.status()
  }

  /** Run the official flow and retain its terminal outcome for later status reads. */
  private async runAttempt(attempt: MutableAttempt): Promise<void> {
    try {
      const outcome = await this.authorization.begin({
        key: CODEX_KEY,
        method: 'oauth',
        interaction: this.interaction(attempt),
      })
      if (this.disposed) return
      attempt.phase = outcome.status
      attempt.finishedAt = Date.now()
      attempt.waitingPrompt = undefined
      this.clearTransientNoticeFields(attempt)
      if (outcome.status === 'authorized') {
        try {
          await this.ensureRoute()
        } catch (error) {
          attempt.message = `ChatGPT 登录已完成，但 Codex 模型路线启用失败：${safeMessage(error)}`
        }
      }
      this.bump()
    } catch (error) {
      if (this.disposed) return
      attempt.phase = 'failed'
      attempt.finishedAt = Date.now()
      attempt.waitingPrompt = undefined
      this.clearTransientNoticeFields(attempt)
      attempt.message = safeMessage(error)
      this.bump()
    } finally {
      this.withdrawPrompt(new Error('authorization attempt settled'))
    }
  }

  /** Build the neutral interaction surface consumed by the official provider flow. */
  private interaction(attempt: MutableAttempt): AuthorizationInteraction {
    return {
      notify: notice => { this.addNotice(attempt, notice) },
      prompt: prompt => this.handlePrompt(attempt, prompt),
    }
  }

  /** Append one bounded progress item without logging its URL or device code. */
  private addNotice(attempt: MutableAttempt, notice: AuthorizationNotice): void {
    if (this.attempt !== attempt || this.disposed) return
    const item: CodexAuthNoticeView = {
      sequence: (attempt.notices.at(-1)?.sequence ?? 0) + 1,
      message: notice.message,
      ...(notice.url === undefined ? {} : { url: notice.url }),
      ...(notice.code === undefined ? {} : { code: notice.code }),
    }
    attempt.notices = [...attempt.notices, item].slice(-MAX_NOTICES)
    this.bump()
  }

  /** Retain terminal progress text without keeping authorization URLs or device codes. */
  private clearTransientNoticeFields(attempt: MutableAttempt): void {
    attempt.notices = attempt.notices.map(notice => ({
      sequence: notice.sequence,
      message: notice.message,
    }))
  }

  /** Auto-answer the provider's mode choice and wait only for callback-raced prompts. */
  private handlePrompt(attempt: MutableAttempt, prompt: AuthorizationPrompt): Promise<string> {
    if (prompt.kind === 'select') {
      if (prompt.options.some(option => option.id === attempt.mode)) return Promise.resolve(attempt.mode)
      throw new Error(`codex-auth: provider did not offer requested mode ${JSON.stringify(attempt.mode)}`)
    }
    if (prompt.kind === 'secret') {
      throw new Error('codex-auth: provider requested a secret prompt that this non-secret Web transport refuses')
    }
    if (this.waiting !== undefined) throw new Error('codex-auth: provider opened two simultaneous text prompts')
    if (prompt.signal?.aborted === true) return Promise.reject(new Error('authorization prompt withdrawn'))
    attempt.waitingPrompt = { kind: 'text', message: prompt.message }
    this.bump()
    return new Promise<string>((_resolve, reject) => {
      const onAbort = (): void => {
        if (this.waiting !== waiting) return
        this.waiting = undefined
        attempt.waitingPrompt = undefined
        this.bump()
        reject(new Error('authorization prompt withdrawn'))
      }
      const removeAbort = (): void => { prompt.signal?.removeEventListener('abort', onAbort) }
      const waiting: WaitingPrompt = {
        reject: (error) => {
          if (this.waiting !== waiting) return
          this.waiting = undefined
          removeAbort()
          attempt.waitingPrompt = undefined
          reject(error)
        },
        removeAbort,
      }
      this.waiting = waiting
      prompt.signal?.addEventListener('abort', onAbort, { once: true })
    })
  }

  /** Reject and forget the current callback-raced prompt. */
  private withdrawPrompt(error: Error): void {
    const waiting = this.waiting
    if (waiting === undefined) return
    waiting.removeAbort()
    waiting.reject(error)
  }

  /** Add the catalog route only when the settings owner has not already configured it. */
  private async ensureRoute(): Promise<void> {
    const section = this.settings.get(LLM_PI_AI_NS)
    if (section === undefined) throw new Error('llm-pi-ai settings namespace is not registered')
    if (hasCodexRoute(section)) return
    await this.settings.mutate(LLM_PI_AI_NS, [
      { op: 'set', path: ['providers', 'openai-codex'], value: {} },
    ])
    this.bump()
  }

  /** Advance the observable process-local state. */
  private bump(): void {
    this.revision += 1
  }
}

export default CodexAuthService
