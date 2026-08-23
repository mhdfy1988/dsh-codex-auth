import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { AuthorizationService } from '@deepseek-ai/dsh-authorization'
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import type { SettingsProvider } from '@deepseek-ai/dsh-settings'
import CodexAuthService from '../src/index.ts'
import { apply as applyClient } from '../src/client/index.tsx'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

interface Harness {
  ctx: Context
  service: CodexAuthService
  authorization: {
    describe: ReturnType<typeof vi.fn>
    begin: ReturnType<typeof vi.fn>
    cancel: ReturnType<typeof vi.fn>
  }
  credentials: {
    describeRecord: ReturnType<typeof vi.fn>
    deleteRecord: ReturnType<typeof vi.fn>
  }
  settings: {
    get: ReturnType<typeof vi.fn>
    mutate: ReturnType<typeof vi.fn>
  }
  setRoute(value: boolean): void
}

const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

function harness(options?: { credential?: Record<string, unknown>; route?: boolean }): Harness {
  const ctx = new Context()
  contexts.push(ctx)
  let route = options?.route ?? false
  const authorization = {
    describe: vi.fn(() => ({
      key: 'llm-pi-ai/openai-codex',
      label: 'ChatGPT (Codex)',
      methods: [{ id: 'oauth', label: 'Sign in with ChatGPT' }],
      inFlight: false,
    })),
    begin: vi.fn(),
    cancel: vi.fn(),
  }
  const credentials = {
    describeRecord: vi.fn(() => Promise.resolve(options?.credential ?? {
      configured: false,
      writable: true,
    })),
    deleteRecord: vi.fn(() => Promise.resolve()),
  }
  const settings = {
    get: vi.fn(() => ({ providers: route ? { 'openai-codex': {} } : {} })),
    mutate: vi.fn((_ns: unknown, operations: readonly { op: string; path: readonly string[] }[]) => {
      route = operations.some(operation => operation.op === 'set')
      return Promise.resolve()
    }),
  }
  ctx.reflect.provide('authorization', authorization as unknown as AuthorizationService)
  ctx.reflect.provide('credentials', credentials as unknown as CredentialProvider)
  ctx.reflect.provide('settings', settings as unknown as SettingsProvider)
  const service = new CodexAuthService(ctx)
  return {
    ctx,
    service,
    authorization,
    credentials,
    settings,
    setRoute(value) { route = value },
  }
}

async function terminal(service: CodexAuthService): Promise<Awaited<ReturnType<CodexAuthService['status']>>> {
  let view = await service.status()
  await vi.waitFor(async () => {
    view = await service.status()
    expect(view.attempt?.phase).not.toBe('running')
  })
  return view
}

describe('CodexAuthService browser view', () => {
  it('returns credential metadata without forwarding an extra credential payload', async () => {
    const { service } = harness({
      credential: {
        configured: true,
        kind: 'grant',
        writable: true,
        payload: { access: 'access-secret', refresh: 'refresh-secret' },
      },
      route: true,
    })

    const view = await service.status()

    expect(view).toMatchObject({ credentialConfigured: true, credentialKind: 'grant', routeConfigured: true })
    expect(JSON.stringify(view)).not.toContain('access-secret')
    expect(JSON.stringify(view)).not.toContain('refresh-secret')
  })

  it('keeps a login URL only while running and clears transient fields after authorization', async () => {
    const { service, authorization, settings } = harness()
    const settled = Promise.withResolvers<{ status: 'authorized' }>()
    authorization.begin.mockImplementation(async ({ interaction }) => {
      interaction.notify({
        message: 'Complete login in the browser.',
        url: 'https://auth.example/authorize?state=state-secret',
        code: 'DEVICE-SECRET',
      })
      return await settled.promise
    })

    const running = await service.start({ mode: 'browser' })
    expect(running.attempt?.notices).toEqual([{
      sequence: 1,
      message: 'Complete login in the browser.',
      url: 'https://auth.example/authorize?state=state-secret',
      code: 'DEVICE-SECRET',
    }])

    settled.resolve({ status: 'authorized' })
    const view = await terminal(service)

    expect(view.attempt).toMatchObject({ phase: 'authorized' })
    expect(view.attempt?.notices).toEqual([{ sequence: 1, message: 'Complete login in the browser.' }])
    expect(view.routeConfigured).toBe(true)
    expect(settings.mutate).toHaveBeenCalledTimes(1)
  })

  it('cancels its active flow, refuses a concurrent start, and clears a device code', async () => {
    const { service, authorization } = harness()
    const settled = Promise.withResolvers<{ status: 'cancelled' }>()
    authorization.begin.mockImplementation(async ({ interaction }) => {
      interaction.notify({ message: 'Enter this code.', code: 'DEVICE-SECRET' })
      return await settled.promise
    })
    authorization.cancel.mockImplementation(() => { settled.resolve({ status: 'cancelled' }) })

    await service.start({ mode: 'device_code' })
    await expect(service.start({ mode: 'browser' })).rejects.toThrow('already owns')
    const view = await service.cancel()

    expect(authorization.cancel).toHaveBeenCalledTimes(1)
    expect(view.attempt).toMatchObject({ phase: 'cancelled' })
    expect(view.attempt?.notices).toEqual([{ sequence: 1, message: 'Enter this code.' }])
  })

  it('redacts OAuth query values, token fields, and API keys from failures', async () => {
    const { service, authorization } = harness()
    authorization.begin.mockImplementation(async ({ interaction }) => {
      interaction.notify({
        message: 'Browser opened.',
        url: 'https://auth.example/callback?code=notice-code&state=notice-state',
      })
      throw new Error('callback?code=error-code&state=error-state {"access_token":"token-secret"} sk-test-secret')
    })

    await service.start({ mode: 'browser' })
    const view = await terminal(service)
    const serialized = JSON.stringify(view)

    expect(view.attempt?.phase).toBe('failed')
    expect(view.attempt?.message).toContain('[redacted]')
    expect(serialized).not.toMatch(/notice-code|notice-state|error-code|error-state|token-secret|sk-test-secret/u)
  })

  it('deletes only the Codex record and removes only the Codex route', async () => {
    const { service, credentials, settings } = harness({
      credential: { configured: true, kind: 'grant', writable: true },
      route: true,
    })

    await service.signOut()
    await service.removeRoute()

    expect(credentials.deleteRecord).toHaveBeenCalledWith('llm-pi-ai/openai-codex')
    expect(settings.mutate).toHaveBeenCalledWith('llm-pi-ai', [
      { op: 'unset', path: ['providers', 'openai-codex'] },
    ])
  })
})

describe('Codex settings client registration', () => {
  it('waits for the generated codexAuth Remote before registering the settings section', async () => {
    const disposeRemote = vi.fn()
    const registerSection = vi.fn(() => vi.fn())
    const injectSlot = vi.fn((_name: string, mount: () => unknown) => mount())
    let dependency: readonly string[] | undefined
    let activate: ((scope: ClientContext) => void) | undefined
    const remote = { status: vi.fn() }
    const ctx = {
      effect: vi.fn((install: () => unknown) => install()),
      remote: { $mount: vi.fn(() => Promise.resolve(disposeRemote)), codexAuth: remote },
      locale: {
        register: vi.fn(() => vi.fn()),
        bind: vi.fn(() => (key: string) => key),
      },
      inject: vi.fn((keys: readonly string[], callback: (scope: ClientContext) => void) => {
        dependency = keys
        activate = callback
      }),
      slots: { inject: injectSlot, register: registerSection },
    } as unknown as ClientContext

    await applyClient(ctx)

    expect(ctx.remote.$mount).toHaveBeenCalledTimes(1)
    expect(dependency).toEqual(['remote.codexAuth'])
    expect(registerSection).not.toHaveBeenCalled()
    activate?.(ctx)
    expect(registerSection).toHaveBeenCalledTimes(1)
    const contribution = registerSection.mock.calls[0]?.[0] as { inject(): { remote: unknown } }
    expect(contribution.inject().remote).toBe(remote)
  })
})
