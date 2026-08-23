import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

const STYLE_ID = 'dsh-codex-auth/styles'

const CSS = `
.dca-shell{display:grid;gap:20px;max-width:880px;color:var(--dsw-alias-label-primary)}
.dca-hero{position:relative;overflow:hidden;padding:28px;border:1px solid var(--dsw-alias-border-l1);border-radius:18px;background:linear-gradient(135deg,color-mix(in srgb,var(--dsw-alias-bg-layer-1) 92%,#0b805f 8%),var(--dsw-alias-bg-layer-1))}
.dca-hero:after{content:"";position:absolute;right:-44px;top:-58px;width:190px;height:190px;border:1px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 30%,transparent);border-radius:50%;box-shadow:0 0 0 26px color-mix(in srgb,var(--dsw-alias-brand-primary) 5%,transparent),0 0 0 54px color-mix(in srgb,var(--dsw-alias-brand-primary) 3%,transparent)}
.dca-kicker{margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--dsw-alias-brand-primary)}
.dca-title{position:relative;z-index:1;margin:0;font-size:28px;line-height:1.15;letter-spacing:-.02em}
.dca-copy{position:relative;z-index:1;max-width:620px;margin:10px 0 0;color:var(--dsw-alias-label-secondary);line-height:1.65}
.dca-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.dca-stat{padding:16px;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-layer-1)}
.dca-stat-label{display:block;margin-bottom:9px;font-size:12px;color:var(--dsw-alias-label-secondary)}
.dca-stat-value{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:650}
.dca-dot{width:9px;height:9px;border-radius:50%;background:var(--dsw-alias-label-secondary);box-shadow:0 0 0 4px color-mix(in srgb,var(--dsw-alias-label-secondary) 12%,transparent)}
.dca-dot.ok{background:var(--dsw-alias-state-success-primary);box-shadow:0 0 0 4px color-mix(in srgb,var(--dsw-alias-state-success-primary) 13%,transparent)}
.dca-dot.warn{background:var(--dsw-alias-state-warn-primary);box-shadow:0 0 0 4px color-mix(in srgb,var(--dsw-alias-state-warn-primary) 13%,transparent)}
.dca-panel{padding:22px;border:1px solid var(--dsw-alias-border-l1);border-radius:16px;background:var(--dsw-alias-bg-layer-1)}
.dca-panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px}
.dca-panel h3{margin:0;font-size:17px}.dca-panel p{margin:6px 0 0;color:var(--dsw-alias-label-secondary);line-height:1.55}
.dca-actions{display:flex;flex-wrap:wrap;gap:9px}.dca-button{appearance:none;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:9px 14px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;font-weight:650;cursor:pointer;transition:transform .15s ease,border-color .15s ease,background .15s ease}
.dca-button:hover:not(:disabled){transform:translateY(-1px);border-color:var(--dsw-alias-brand-primary)}.dca-button:disabled{opacity:.45;cursor:not-allowed}
.dca-button.primary{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-brand-primary);color:#fff}.dca-button.danger{color:var(--dsw-alias-state-error-primary)}
.dca-alert{padding:12px 14px;border-radius:11px;background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 10%,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5}.dca-alert.error{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-state-error-primary)}
.dca-progress{display:grid;gap:10px;margin:16px 0 0;padding:0;list-style:none}.dca-progress li{display:grid;grid-template-columns:26px minmax(0,1fr);gap:10px;align-items:start;padding:12px;border-left:2px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);border-radius:0 10px 10px 0}.dca-seq{display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:var(--dsw-alias-bg-layer-1);font-size:11px;font-variant-numeric:tabular-nums}.dca-progress strong{display:block;font-size:13px}.dca-progress a{display:inline-block;max-width:100%;margin-top:5px;color:var(--dsw-alias-brand-primary);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dca-code{display:inline-block;margin-top:7px;padding:5px 8px;border:1px dashed var(--dsw-alias-border-l2);border-radius:7px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.08em}
.dca-footnote{font-size:12px;color:var(--dsw-alias-label-secondary)}
@media(max-width:760px){.dca-grid{grid-template-columns:1fr}.dca-panel-head{display:grid}.dca-hero{padding:22px}.dca-title{font-size:24px}}
`

/** Install package-owned styles and remove them with the browser plugin fiber. */
export function installStyles(ctx: ClientContext): void {
  ctx.effect(() => {
    if (typeof document === 'undefined') return () => {}
    if (document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`) !== null) return () => {}
    const style = document.createElement('style')
  style.dataset.plugin = 'dsh-codex-auth'
    style.dataset.pluginCss = STYLE_ID
    style.textContent = CSS
    document.head.appendChild(style)
    return () => { style.remove() }
  }, 'codex-auth: browser styles')
}
