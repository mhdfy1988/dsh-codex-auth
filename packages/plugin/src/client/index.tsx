/** Browser settings section for the native Codex authorization Consumer. */

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import codexAuthRemote from 'dsh-codex-auth/remote'
import type { CodexAuthMode, CodexAuthNoticeView, CodexAuthView } from 'dsh-codex-auth/types'
import { installStyles } from './styles.js'

const NS = 'settings.codex-auth'

const en = {
  nav: 'Codex', title: 'ChatGPT authorization', kicker: 'OPENAI CODEX',
  intro: 'Use the ChatGPT sign-in already supported by the Harness provider. Tokens stay in the Host credential store and never enter this page.',
  flow: 'Authorization flow', credential: 'ChatGPT credential', route: 'Codex model route',
  available: 'Available', unavailable: 'Unavailable', signedIn: 'Signed in', signedOut: 'Not signed in',
  enabled: 'Enabled', disabled: 'Disabled', signIn: 'Sign in with ChatGPT', device: 'Use device code',
  cancel: 'Cancel sign-in', configure: 'Enable Codex model', signOut: 'Sign out', remove: 'Remove model route',
  working: 'Working…', progress: 'Sign-in progress', retry: 'Refresh', callback: 'Waiting for the browser callback.',
  localOnly: 'Signing out deletes the local grant; it does not revoke the grant at the issuer.',
} as const

const zh: Record<keyof typeof en, string> = {
  nav: 'Codex', title: 'ChatGPT 授权', kicker: 'OPENAI CODEX',
  intro: '直接使用 Harness 模型提供方已经支持的 ChatGPT 登录。令牌只保存在宿主凭据仓库，不会进入这个页面。',
  flow: '授权流程', credential: 'ChatGPT 凭据', route: 'Codex 模型路线',
  available: '可用', unavailable: '不可用', signedIn: '已登录', signedOut: '未登录',
  enabled: '已启用', disabled: '未启用', signIn: '使用 ChatGPT 登录', device: '使用设备码',
  cancel: '取消登录', configure: '启用 Codex 模型', signOut: '退出登录', remove: '移除模型路线',
  working: '处理中…', progress: '登录进度', retry: '刷新状态', callback: '正在等待浏览器回调。',
  localOnly: '退出登录只删除本地授权记录，不会向签发方发起吊销。',
}

type Key = keyof typeof en

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Codex authorization settings copy. */
    'settings.codex-auth': Key
  }
}

interface CodexSectionInjected {
  remote: ClientContext['remote']['codexAuth']
  t(key: Key): string
}

type CodexSectionProps = Partial<InjectFace<CodexSectionInjected>>

/** Required browser services; the generated contribution is mounted inside apply. */
export const inject = ['slots', 'locale', 'remote']

/** Mount this package's generated Remote contribution and settings section. */
export async function apply(ctx: ClientContext): Promise<void> {
  installStyles(ctx)
  const disposeRemote = await ctx.remote.$mount(codexAuthRemote)
  ctx.effect(() => disposeRemote, 'codex-auth: generated Remote contribution')
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'codex-auth: dictionaries')
  const t = ctx.locale.bind(NS) as CodexSectionInjected['t']
  ctx.inject(['remote.codexAuth'], (scope: ClientContext) => {
    scope.slots.inject('settings.section', () => scope.slots.register({
      name: 'settings.section',
      id: 'codex-auth',
      order: 15,
      label: () => t('nav'),
      inject: (): CodexSectionInjected => ({ remote: scope.remote.codexAuth, t }),
    }, CodexSection))
  })
}

function unwrap(result: RemoteResult<CodexAuthView>): CodexAuthView {
  if (!result.ok) throw new Error(`${result.error.message} (${result.error.code})`)
  return result.value
}

function latestUrl(view: CodexAuthView | undefined): string | undefined {
  return [...view?.attempt?.notices ?? []].reverse().find(notice => notice.url !== undefined)?.url
}

function stateLabel(t: CodexSectionInjected['t'], yes: boolean, positive: Key, negative: Key): string {
  return t(yes ? positive : negative)
}

function Stat({ label, value, tone }: { label: string; value: string; tone: 'ok' | 'warn' | 'idle' }): ReactNode {
  return <div className="dca-stat"><span className="dca-stat-label">{label}</span><span className="dca-stat-value"><i className={`dca-dot ${tone === 'idle' ? '' : tone}`} />{value}</span></div>
}

function Progress({ notices }: { notices: readonly CodexAuthNoticeView[] }): ReactNode {
  if (notices.length === 0) return null
  return <ul className="dca-progress">{notices.slice(-4).map(notice => <li key={notice.sequence}>
    <span className="dca-seq">{notice.sequence}</span>
    <div><strong>{notice.message}</strong>
      {notice.url === undefined ? null : <a href={notice.url} target="_blank" rel="noreferrer">{notice.url}</a>}
      {notice.code === undefined ? null : <span className="dca-code">{notice.code}</span>}
    </div>
  </li>)}</ul>
}

/** Render the independent Codex settings section. */
export function CodexSection(props: CodexSectionProps): ReactNode {
  const { remote, t } = props
  if (remote === undefined || t === undefined) return null
  return <Loaded remote={remote} t={t} />
}

function Loaded({ remote, t }: CodexSectionInjected): ReactNode {
  const [view, setView] = useState<CodexAuthView>()
  const [error, setError] = useState<string>()
  const [action, setAction] = useState<string>()
  const popup = useRef<Window | null>(null)
  const openedUrl = useRef<string>()

  const refresh = async (): Promise<void> => {
    try {
      setView(unwrap(await remote.status()))
      setError(undefined)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  useEffect(() => { void refresh() }, [])
  useEffect(() => {
    if (view?.attempt?.phase !== 'running') return
    const timer = window.setInterval(() => { void refresh() }, 700)
    return () => { window.clearInterval(timer) }
  }, [view?.attempt?.phase])
  useEffect(() => {
    const url = latestUrl(view)
    if (url === undefined || openedUrl.current === url) return
    openedUrl.current = url
    if (popup.current !== null && !popup.current.closed) popup.current.location.href = url
  }, [view?.revision])

  const run = async (name: string, operation: () => Promise<RemoteResult<CodexAuthView>>): Promise<void> => {
    if (action !== undefined) return
    setAction(name)
    setError(undefined)
    try {
      setView(unwrap(await operation()))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setAction(undefined)
    }
  }

  const start = (mode: CodexAuthMode): void => {
    if (mode === 'browser') {
      popup.current = window.open('about:blank', 'dsh-codex-auth')
      if (popup.current !== null) popup.current.opener = null
      openedUrl.current = undefined
    }
    void run('start', () => remote.start({ mode }))
  }

  const running = view?.attempt?.phase === 'running'
  const busy = action !== undefined
  const credential = view?.credentialConfigured === true
  const route = view?.routeConfigured === true

  return <div className="dca-shell">
    <section className="dca-hero">
      <p className="dca-kicker">{t('kicker')}</p><h2 className="dca-title">{t('title')}</h2><p className="dca-copy">{t('intro')}</p>
    </section>
    <div className="dca-grid">
      <Stat label={t('flow')} value={stateLabel(t, view?.flowAvailable === true, 'available', 'unavailable')} tone={view?.flowAvailable === true ? 'ok' : 'warn'} />
      <Stat label={t('credential')} value={stateLabel(t, credential, 'signedIn', 'signedOut')} tone={credential ? 'ok' : 'idle'} />
      <Stat label={t('route')} value={stateLabel(t, route, 'enabled', 'disabled')} tone={route ? 'ok' : 'idle'} />
    </div>
    {error === undefined ? null : <div className="dca-alert error" role="alert">{error}</div>}
    {view?.attempt?.message === undefined ? null : <div className={`dca-alert ${view.attempt.phase === 'failed' ? 'error' : ''}`}>{view.attempt.message}</div>}
    <section className="dca-panel">
      <div className="dca-panel-head"><div><h3>{running ? t('progress') : t('title')}</h3><p>{running && view?.attempt?.waitingPrompt !== undefined ? t('callback') : t('intro')}</p></div>
        <button className="dca-button" type="button" disabled={busy} onClick={() => { void refresh() }}>{t('retry')}</button>
      </div>
      <div className="dca-actions">
        {!credential && !running ? <button className="dca-button primary" type="button" disabled={busy || view?.flowAvailable !== true} onClick={() => { start('browser') }}>{t('signIn')}</button> : null}
        {!credential && !running ? <button className="dca-button" type="button" disabled={busy || view?.flowAvailable !== true} onClick={() => { start('device_code') }}>{t('device')}</button> : null}
        {running ? <button className="dca-button danger" type="button" disabled={busy} onClick={() => { void run('cancel', () => remote.cancel()) }}>{t('cancel')}</button> : null}
        {credential && !route ? <button className="dca-button primary" type="button" disabled={busy} onClick={() => { void run('configure', () => remote.configure()) }}>{t('configure')}</button> : null}
        {credential && !running ? <button className="dca-button danger" type="button" disabled={busy || view?.credentialWritable !== true} onClick={() => { void run('signout', () => remote.signOut()) }}>{t('signOut')}</button> : null}
        {route && !running ? <button className="dca-button" type="button" disabled={busy} onClick={() => { void run('remove', () => remote.removeRoute()) }}>{t('remove')}</button> : null}
      </div>
      <Progress notices={view?.attempt?.notices ?? []} />
    </section>
    <p className="dca-footnote">{t('localOnly')}</p>
  </div>
}
