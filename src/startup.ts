/**
 * Command-line parser for the Codex authorization proof surface.
 * @module dsh-codex-auth-cli-proof/startup
 */

import { Command } from 'commander'
import type { Context } from '@deepseek-ai/cordis'
import { parseCmdline } from '@deepseek-ai/dsh-cmdline'
import { isCredentialKeySegment } from '@deepseek-ai/dsh-credentials'

/** Stable Cordis plugin name. */
export const name = 'codex-auth-startup'

/** Launcher service required to parse the application-owned arguments. */
export const inject = ['cmdlineArgs']

/** Service published after the command line is validated. */
export const CODEX_AUTH_STARTUP_SERVICE = 'codexAuthStartup'

/** Parsed invocation consumed by the one-shot runner. */
export interface CodexAuthStartupValues {
  /** Begin authorization instead of only listing registered flows. */
  login: boolean
  /** pi-ai provider id whose owned credential is addressed. */
  provider: string
  /** Authorization seam method; omitted to use the flow's preferred method. */
  method?: string
  /** Answer a matching select prompt automatically, used by deterministic smoke tests. */
  select?: string
  /** Withdraw the attempt after this many milliseconds. */
  cancelAfterMs?: number
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Validated invocation for this bundle's CLI runner. */
    codexAuthStartup: CodexAuthStartupValues
  }
}

interface CliOptions {
  login: boolean
  provider: string
  method?: string
  select?: string
  cancelAfter?: string
}

/**
 * Build a fresh command parser for one invocation.
 * @returns the application-owned command.
 */
function authCommand(): Command {
  return new Command()
    .name('dsh --profile codex-auth')
    .description('Inspect or run DeepSeek Harness authorization flows. The default action only lists flows.')
    .helpOption('-h, --help', 'show this help')
    .option('--login', 'start an authorization attempt')
    .option('--provider <id>', 'pi-ai provider id', 'openai-codex')
    .option('--method <id>', 'authorization method id; defaults to the flow preference')
    .option('--select <id>', 'automatically answer a select prompt with this option id')
    .option('--cancel-after <milliseconds>', 'cancel the attempt after a positive number of milliseconds')
    .addHelpText('after', `
Examples:
  dsh --profile codex-auth
  dsh --profile codex-auth --login
  dsh --profile codex-auth --login --select browser --cancel-after 500
`)
}

/**
 * Parse the immutable launcher arguments and publish the runner values.
 * @param ctx - plugin context carrying the command-line handoff.
 */
export function apply(ctx: Context): void {
  const program = authCommand()
  program.action(() => {
    const options = program.opts<CliOptions>()
    if (!isCredentialKeySegment(options.provider)) {
      program.error(`error: --provider must be a lowercase hyphenated id, got ${JSON.stringify(options.provider)}`)
    }
    if (options.method !== undefined && options.method.trim() === '') {
      program.error('error: --method must not be empty')
    }
    if (options.select !== undefined && options.select.trim() === '') {
      program.error('error: --select must not be empty')
    }
    if (options.provider === 'openai-codex'
      && options.select !== undefined
      && options.select !== 'browser'
      && options.select !== 'device_code') {
      program.error(`error: OpenAI Codex --select must be "browser" or "device_code", got ${JSON.stringify(options.select)}`)
    }
    let cancelAfterMs: number | undefined
    if (options.cancelAfter !== undefined) {
      if (!/^\d+$/.test(options.cancelAfter) || Number(options.cancelAfter) <= 0) {
        program.error(`error: --cancel-after must be a positive integer, got ${JSON.stringify(options.cancelAfter)}`)
      }
      cancelAfterMs = Number(options.cancelAfter)
    }
    ctx.provide(CODEX_AUTH_STARTUP_SERVICE, {
      login: options.login,
      provider: options.provider,
      ...(options.method === undefined ? {} : { method: options.method }),
      ...(options.select === undefined ? {} : { select: options.select }),
      ...(cancelAfterMs === undefined ? {} : { cancelAfterMs }),
    } satisfies CodexAuthStartupValues)
  })
  parseCmdline(ctx, program)
}
