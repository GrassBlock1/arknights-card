<script lang="ts">
  import { onDestroy } from 'svelte';
  import { responseError } from '../lib/api';
  import type { CardStyle, CardFormat } from '../lib/profile';
  let { query, validationError = '', style, format }: { query: string; validationError?: string; style: CardStyle; format: CardFormat } = $props();
  let view = $state<'image' | 'embed'>('image');
  let blobUrl = $state('');
  let readyQuery = $state('');
  let loading = $state(true);
  let error = $state('');
  let refresh = $state(0);
  let copyStatus = $state('');
  const size = $derived(style === 'compact' ? { width: 800, height: 280 } : { width: 1280, height: 720 });
  const imageUrl = $derived(readyQuery ? new URL(`/card?${readyQuery}`, location.origin).href : '');
  const embedUrl = $derived(readyQuery ? new URL(`/embed?${readyQuery}`, location.origin).href : '');
  const snippets = $derived.by(() => {
    const image = imageUrl.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
    const embed = embedUrl.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
    return [
      { key: 'url', label: '图片直链', code: imageUrl },
      { key: 'img', label: 'HTML 图片', code: `<img src="${image}" alt="明日方舟博士名片" width="${size.width}" height="${size.height}" style="max-width:100%;height:auto">` },
      { key: 'iframe', label: 'iframe 嵌入', code: `<iframe src="${embed}" title="明日方舟博士名片" width="${size.width}" height="${size.height}" style="border:0;max-width:100%;aspect-ratio:${size.width}/${size.height}" loading="lazy"></iframe>` },
      { key: 'markdown', label: 'Markdown', code: `![明日方舟博士名片](${imageUrl})` },
    ];
  });
  $effect(() => {
    const currentQuery = query;
    const invalid = validationError;
    refresh;
    const controller = new AbortController();
    let active = true;
    loading = true;
    error = invalid;
    readyQuery = '';
    copyStatus = '';
    if (invalid || !currentQuery) {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      blobUrl = '';
      loading = false;
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/card?${currentQuery}`, { signal: controller.signal });
        if (!response.ok) throw await responseError(response);
        if (!response.headers.get('content-type')?.startsWith('image/')) throw new Error('服务器未返回有效图片。');
        const blob = await response.blob();
        if (!active) return;
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        blobUrl = URL.createObjectURL(blob);
        readyQuery = currentQuery;
      } catch (cause) {
        if (active && !controller.signal.aborted) error = cause instanceof Error ? cause.message : '生成失败，请重试。';
      } finally { if (active) loading = false; }
    }, 350);
    return () => { active = false; window.clearTimeout(timer); controller.abort(); };
  });
  onDestroy(() => { if (blobUrl) URL.revokeObjectURL(blobUrl); });
  async function copy(code: string) {
    try { await navigator.clipboard.writeText(code); copyStatus = '已复制到剪贴板。'; }
    catch { copyStatus = '剪贴板不可用，请选中代码后手动复制。'; }
  }
</script>

<section class="output" aria-label="名片预览与分享">
  <div class="preview-heading"><div><h2>档案预览 <span class="live-dot" aria-hidden="true"></span></h2></div>
    <div class="preview-tabs" role="group" aria-label="预览方式"><button id="view-image" type="button" aria-pressed={view === 'image'} onclick={() => view = 'image'}>图片</button><button id="view-embed" type="button" aria-pressed={view === 'embed'} onclick={() => view = 'embed'}>网页嵌入</button></div>
  </div>
  <div class="preview-stage" id="preview-stage" aria-busy={loading}>
    <div id="preview-media" style:aspect-ratio={`${size.width} / ${size.height}`}>
      {#if readyQuery && view === 'embed'}
        <iframe title="明日方舟博士名片网页预览" src={embedUrl} sandbox="allow-scripts"></iframe>
      {:else if blobUrl}
        <img src={blobUrl} alt="当前配置生成的明日方舟博士名片" class:stale={!readyQuery} />
      {/if}
      {#if loading}<span class="render-badge" role="status" aria-live="polite">正在生成…</span>{/if}
    </div>
    <div class="stage-caption"><span>RHODES ISLAND / PUBLIC RECORD</span></div>
  </div>
  <div class="preview-meta"><button id="refresh" type="button" class="text-button" onclick={() => refresh++}>↻ 刷新预览</button></div>
  {#if error}<p id="preview-error" class="error" role="alert">{error}</p>{/if}
  <details class="panel export-panel" open>
    <summary>导出与分享 <span class="micro">DISTRIBUTE</span></summary>
    <div class="export-actions"><a id="download" class="button primary" href={imageUrl || undefined} download={`rhodes-island-card.${format}`} aria-disabled={!readyQuery}>下载名片 ↓</a><a id="open" class="button secondary" href={imageUrl || undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!readyQuery}>打开原图 ↗</a></div>
    {#each snippets as snippet (snippet.key)}
      <div class="snippet"><label for={`snippet-${snippet.key}`}>{snippet.label}</label><div><input id={`snippet-${snippet.key}`} readonly value={readyQuery ? snippet.code : ''} aria-label={`${snippet.label}代码`} /><button type="button" disabled={!readyQuery} onclick={() => copy(snippet.code)}>复制</button></div></div>
    {/each}
    <p class="hint" role="status">{copyStatus || '手动配置内容公开存放于分享链接中，请勿填写隐私信息。'}</p>
  </details>
</section>
