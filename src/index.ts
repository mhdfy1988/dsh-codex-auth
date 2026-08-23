/**
 * One-shot CLI Consumer for the DeepSeek Harness authorization seam.
 * @module dsh-codex-auth-cli-proof
 */

import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'
import type { Context } from '@deepseek-ai/cordis'
import type {
  AuthorizationEntry,
  AuthorizationInteraction,
  AuthorizationNotice,
  AuthorizationPrompt,
  AuthorizationService,
} from '@deepseek-ai/dsh-authorization'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-cmdline'
import type { CodexAuthStartupValues } from './startup.js'

/** Stable Cordis plugin name. */
export const name = 'codex-auth-cli'

/** Services required before the one-shot Consumer can run. */
export const inject = ['authorization', 'codexAuthStartup']

interface TerminalIo {
  stdin: NodeJS.ReadableStream
  stdout: NodeJS.WritableStream
  stderr: NodeJS.WritableStream
  exit(code: number): void
}

/** Process IO separated for focused tests. */
export const internals: Omit<TerminalIo, 'exit'> = {
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
}

/** Return a readable error without printing credential fields embedded in a provider response. */
function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message
    .replace(/([?&](?:code|state|access_token|refresh_token|id_token)=)[^&\s]+/giu, '$1[redacted]')
    .replace(/("(?:access_token|refresh_token|id_token|access|refresh)"\s*:\s*")[^"]+/giu, '$1[redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]+\b/gu, 'sk-[redacted]')
}

/** Display the registered flows without exposing stored credential values. */
function printFlows(entries: readonly AuthorizationEntry[], stdout: NodeJS.WritableStream): void {
  if (entries.length === 0) {
    stdout.write('No authorization flows are registered.\n')
    return
  }
  stdout.write('Registered authorization flows:\n')
  for (const entry of entries) {
    const methods = entry.methods.map(method => `${method.id} (${method.label})`).join(', ')
    stdout.write(`- ${entry.key}: ${entry.label}; methods: ${methods}; state: ${entry.inFlight ? 'running' : 'idle'}\n`)
  }
}

/** Combine attempt and prompt withdrawal into the signal one terminal read observes. */
function promptSignal(attempt: AbortSignal, prompt: AuthorizationPrompt): AbortSignal {
  return prompt.signal === undefined ? attempt : AbortSignal.any([attempt, prompt.signal])
}

/** Ask one ordinary terminal question and close its readline handle afterwards. */
async function askText(
  io: TerminalIo,
  message: string,
  signal: AbortSignal,
): Promise<string> {
  const terminal = (io.stdin as NodeJS.ReadStream).isTTY === true
  const readline = createInterface({ input: io.stdin, output: io.stdout, terminal })
  try {
    return await readline.question(`${message} `, { signal })
  } finally {
    readline.close()
  }
}

/** Ask a terminal question while suppressing the typed value from output. */
async function askSecret(
  io: TerminalIo,
  message: string,
  signal: AbortSignal,
): Promise<string> {
  io.stdout.write(`${message} `)
  const sink = new Writable({
    write(_chunk, _encoding, callback) {
      callback()
    },
  })
  const terminal = (io.stdin as NodeJS.ReadStream).isTTY === true
  const readline = createInterface({ input: io.stdin, output: sink, terminal })
  try {
    return await readline.question('', { signal })
  } finally {
    readline.close()
    io.stdout.write('\n')
  }
}

/** Resolve one select prompt from an automatic answer or an interactive numbered choice. */
async function askSelect(
  io: TerminalIo,
  prompt: Extract<AuthorizationPrompt, { kind: 'select' }>,
  signal: AbortSignal,
  automatic: string | undefined,
): Promise<string> {
  if (automatic !== undefined) {
    const match = prompt.options.find(option => option.id === automatic)
    if (match === undefined) {
      throw new Error(`automatic selection ${JSON.stringify(automatic)} is not offered; choices: ${prompt.options.map(option => option.id).join(', ')}`)
    }
    io.stdout.write(`${prompt.message} ${match.label} [automatic]\n`)
    return match.id
  }
  io.stdout.write(`${prompt.message}\n`)
  prompt.options.forEach((option, index) => {
    io.stdout.write(`  ${index + 1}. ${option.label} [${option.id}]${option.description === undefined ? '' : ` - ${option.description}`}\n`)
  })
  while (true) {
    const answer = (await askText(io, 'Select by number or id:', signal)).trim()
    const byId = prompt.options.find(option => option.id === answer)
    if (byId !== undefined) return byId.id
    const number = Number(answer)
    if (Number.isInteger(number) && number >= 1 && number <= prompt.options.length) {
      return prompt.options[number - 1]!.id
    }
    io.stderr.write(`Invalid choice ${JSON.stringify(answer)}.\n`)
  }
}

/** Create the terminal half of one authorization attempt. */
function terminalInteraction(
  io: TerminalIo,
  attemptSignal: AbortSignal,
  automaticSelect: string | undefined,
): AuthorizationInteraction {
  return {
    notify(notice: AuthorizationNotice) {
      io.stdout.write(`${notice.message}\n`)
      if (notice.url !== undefined) io.stdout.write(`URL: ${notice.url}\n`)
      if (notice.code !== undefined) io.stdout.write(`Code: ${notice.code}\n`)
    },
    async prompt(prompt) {
      const signal = promptSignal(attemptSignal, prompt)
      switch (prompt.kind) {
        case 'select':
          return await askSelect(io, prompt, signal, automaticSelect)
        case 'secret':
          return await askSecret(io, prompt.message, signal)
        case 'text':
          return await askText(io, prompt.message, signal)
      }
    },
  }
}

/** Run the selected one-shot action after the complete plugin tree has settled. */
async function run(
  ctx: Context,
  authorization: AuthorizationService,
  options: CodexAuthStartupValues,
  io: TerminalIo,
): Promise<number> {
  await (ctx.get('loader') as { await(): Promise<void> } | undefined)?.await()
  const entries = authorization.list()
  if (!options.login) {
    printFlows(entries, io.stdout)
    return entries.length === 0 ? 1 : 0
  }

  const key = credentialKey('llm-pi-ai', options.provider)
  const entry = authorization.describe(key)
  if (entry === undefined) {
    io.stderr.write(`No authorization flow is registered for ${key}.\n`)
    return 1
  }
  printFlows([entry], io.stdout)

  const controller = new AbortController()
  const timer = options.cancelAfterMs === undefined
    ? undefined
    : setTimeout(() => { controller.abort(new Error('cancel timer elapsed')) }, options.cancelAfterMs)
  try {
    const outcome = await authorization.begin({
      key,
      ...(options.method === undefined ? {} : { method: options.method }),
      interaction: terminalInteraction(io, controller.signal, options.select),
      signal: controller.signal,
    })
    io.stdout.write(`Authorization result: ${outcome.status}\n`)
    return 0
  } finally {
    // Close every provider-owned listener even when the flow fails before the
    // caller's cancellation timer fires. A one-shot CLI must not leave a
    // rejected login holding stdin, a callback server, or another live handle.
    if (!controller.signal.aborted) controller.abort(new Error('authorization attempt finished'))
    if (timer !== undefined) clearTimeout(timer)
  }
}

/**
 * Mount the one-shot authorization Consumer.
 * @param ctx - plugin context carrying authorization, startup values, loader settlement, and app exit.
 */
export function apply(ctx: Context): void {
  const authorization = ctx.get('authorization')
  const options = ctx.get('codexAuthStartup')
  const exit = ctx.get('appExit')
  if (authorization === undefined || options === undefined || exit === undefined) {
    throw new Error('codex-auth-cli: authorization, codexAuthStartup, and appExit must be mounted')
  }
  const io: TerminalIo = { ...internals, exit }
  void run(ctx, authorization, options, io)
    .then(code => { io.exit(code) })
    .catch((error: unknown) => {
      io.stderr.write(`dsh-codex-auth: ${safeErrorMessage(error)}\n`)
      io.exit(1)
    })
}
