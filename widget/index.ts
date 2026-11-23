import { cardSizes, renderCardMarkup, safeImageUrl } from '../shared/card.ts';
import type { CardProfile, CardStyle } from '../shared/card.ts';

export interface CardOptions {
  shareId?: string;
  layout?: CardStyle;
  apiBase?: string;
  input?: Record<string, unknown>;
}

export interface MountedCard {
  update(options: Partial<CardOptions>): void;
  destroy(): void;
}

const moduleUrl = import.meta.url;
const palette = {
  accent: 'var(--card-accent, #d4e954)',
  background: 'var(--card-background, #0e1621)',
  text: 'var(--card-text, #eaf0f6)',
  panel: 'var(--card-panel, #17212e)',
  panelBorder: 'var(--card-panel-border, #2b3847)',
};
const styles = `
::host { display: block; width: 100%; }
.frame { position: relative; width: 100%; overflow: hidden; border-radius: var(--card-radius, 0px); background: var(--card-background, #0e1621); color: var(--card-text, #eaf0f6); font-family: system-ui, sans-serif; }
.canvas { position: absolute; top: 0; left: 0; transform-origin: top left; }
.status { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 16px; box-sizing: border-box; font-size: 14px; line-height: 1.5; text-align: center; overflow-wrap: anywhere; }
.status[hidden], .canvas[hidden] { display: none; }
`;

function cardEndpoint(apiBase?: string): string {
  const base = new URL(apiBase || new URL(moduleUrl).origin, moduleUrl);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) {
    throw new Error('apiBase 必须为不含凭据的 HTTP(S) 地址');
  }
  base.search = '';
  base.hash = '';
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  return new URL('api/card', base).href;
}

function requestBody(options: CardOptions): string {
  if (options.input !== undefined && (!options.input || typeof options.input !== 'object' || Array.isArray(options.input))) {
    throw new Error('input 必须为对象');
  }
  if (options.shareId !== undefined && typeof options.shareId !== 'string') {
    throw new Error('shareId 必须为字符串');
  }
  return JSON.stringify({ ...options.input, ...(options.shareId ? { id: options.shareId } : {}) });
}

class CardView {
  private readonly frame: HTMLDivElement;
  private readonly canvas: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly observer: ResizeObserver;
  private request?: AbortController;
  private revision = 0;
  private identity?: string;
  private profile?: CardProfile;
  private layout: CardStyle = 'large';
  private destroyed = false;

  constructor(private readonly host: HTMLElement, root: ShadowRoot) {
    const style = document.createElement('style');
    style.textContent = styles;
    this.frame = document.createElement('div');
    this.frame.className = 'frame';
    this.frame.setAttribute('role', 'region');
    this.frame.setAttribute('aria-label', '明日方舟名片');
    this.canvas = document.createElement('div');
    this.canvas.className = 'canvas';
    this.status = document.createElement('div');
    this.status.className = 'status';
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    this.frame.append(this.canvas, this.status);
    root.replaceChildren(style, this.frame);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(this.frame);
  }

  update(options: CardOptions): void {
    if (this.destroyed) return;
    let endpoint: string;
    let body: string;
    try {
      const layout = options.layout ?? 'large';
      if (layout !== 'large' && layout !== 'compact') throw new Error('layout 必须为 large 或 compact');
      this.layout = layout;
      this.setSize();
      endpoint = cardEndpoint(options.apiBase);
      body = requestBody(options);
    } catch (error) {
      this.cancel();
      this.identity = undefined;
      this.clearProfile();
      this.showError(error);
      return;
    }
    const identity = `${endpoint}\n${body}`;
    if (identity === this.identity) {
      if (this.profile) this.render();
      return;
    }
    this.cancel();
    this.identity = identity;
    this.clearProfile();
    this.showStatus('正在加载名片…');
    this.frame.setAttribute('aria-busy', 'true');
    const request = new AbortController();
    this.request = request;
    const revision = this.revision;
    void this.load(endpoint, body, request, revision);
  }

  private async load(endpoint: string, body: string, request: AbortController, revision: number): Promise<void> {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        credentials: 'omit',
        redirect: 'error',
        signal: request.signal,
      });
      if (!response.ok) throw new Error(`名片加载失败（HTTP ${response.status}）`);
      const profile = await response.json() as CardProfile;
      if (this.destroyed || revision !== this.revision || request.signal.aborted) return;
      this.profile = profile;
      this.render();
      this.request = undefined;
      this.host.dispatchEvent(new CustomEvent('card-load', { detail: { profile }, bubbles: true, composed: true }));
    } catch (error) {
      if (this.destroyed || revision !== this.revision || request.signal.aborted) return;
      this.request = undefined;
      this.clearProfile();
      this.showError(error);
    }
  }

  private setSize(): void {
    const { width, height } = cardSizes[this.layout];
    this.frame.style.maxWidth = `${width}px`;
    this.frame.style.aspectRatio = `${width} / ${height}`;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.resize();
  }

  private resize(): void {
    this.canvas.style.transform = `scale(${this.frame.clientWidth / cardSizes[this.layout].width})`;
  }

  private render(): void {
    this.canvas.innerHTML = renderCardMarkup(this.profile!, this.layout, safeImageUrl, palette);
    this.canvas.hidden = false;
    this.status.hidden = true;
    this.status.textContent = '';
    this.frame.setAttribute('aria-busy', 'false');
    this.resize();
  }

  private clearProfile(): void {
    this.profile = undefined;
    this.canvas.replaceChildren();
    this.canvas.hidden = true;
  }

  private showStatus(message: string): void {
    this.status.textContent = message;
    this.status.hidden = false;
    this.frame.setAttribute('aria-busy', 'false');
  }

  private showError(reason: unknown): void {
    const error = reason instanceof Error ? reason : new Error('名片加载失败');
    this.showStatus(error.message);
    this.host.dispatchEvent(new CustomEvent('card-error', { detail: { error }, bubbles: true, composed: true }));
  }

  private cancel(): void {
    this.revision++;
    this.request?.abort();
    this.request = undefined;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.cancel();
    this.observer.disconnect();
    this.clearProfile();
    this.status.textContent = '';
  }
}

export class ArknightsCardElement extends HTMLElement {
  static readonly observedAttributes = ['share-id', 'layout', 'api-base'];
  private options: CardOptions = {};
  private view?: CardView;

  configure(options: Partial<CardOptions>): void {
    this.options = { ...this.options, ...options };
    this.view?.update(this.options);
  }

  connectedCallback(): void {
    if (this.view) return;
    this.view = new CardView(this, this.shadowRoot ?? this.attachShadow({ mode: 'open' }));
    this.view.update(this.options);
  }

  disconnectedCallback(): void {
    this.view?.destroy();
    this.view = undefined;
    this.shadowRoot?.replaceChildren();
  }

  attributeChangedCallback(name: string, previous: string | null, value: string | null): void {
    if (previous === value) return;
    if (name === 'share-id') this.configure({ shareId: value ?? undefined });
    else if (name === 'layout') this.configure({ layout: (value ?? 'large') as CardStyle });
    else if (name === 'api-base') this.configure({ apiBase: value ?? undefined });
  }
}

if (!customElements.get('arknights-card')) customElements.define('arknights-card', ArknightsCardElement);

export function mountCard(container: HTMLElement, options: CardOptions = {}): MountedCard {
  const element = document.createElement('arknights-card') as ArknightsCardElement;
  element.configure(options);
  container.append(element);
  let destroyed = false;
  return {
    update(partial) {
      if (!destroyed) element.configure(partial);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      element.remove();
    },
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'arknights-card': ArknightsCardElement;
  }
}
