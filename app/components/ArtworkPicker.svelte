<script lang="ts">
  import { request } from '../lib/api';

  export interface ArtworkItem {
    id: string;
    name: string;
    avatar: string;
    type?: string;
  }

  let {
    kind,
    idPrefix = kind === 'operator' ? 'operator' : 'avatar',
    label = kind === 'operator' ? '搜索助理干员' : '搜索博士头像',
    onselect,
  }: {
    kind: 'operator' | 'avatar';
    idPrefix?: string;
    label?: string;
    onselect: (artwork: ArtworkItem) => void;
  } = $props();

  let query = $state('');
  let results = $state<ArtworkItem[]>([]);
  let status = $state('');
  let version = 0;

  $effect(() => {
    const search = query.trim();
    const searchKind = kind;
    const current = ++version;
    const controller = new AbortController();
    results = [];
    if (!search) {
      status = '';
      return () => {
        ++version;
        controller.abort();
      };
    }
    status = '正在搜索…';
    const timer = window.setTimeout(async () => {
      try {
        const entries = await request<ArtworkItem[]>(
          `/api/${searchKind === 'operator' ? 'operators' : 'avatars'}?q=${encodeURIComponent(search)}`,
          { signal: controller.signal },
        );
        if (current !== version || controller.signal.aborted) return;
        results = entries.slice(0, 12);
        status = entries.length
          ? '点击下方结果即可选用。'
          : searchKind === 'operator'
            ? '未找到匹配干员，也可直接输入干员 ID。'
            : '未找到匹配头像，请尝试其他干员、皮肤或图标名称。';
      } catch (error) {
        if (current !== version || controller.signal.aborted) return;
        status = error instanceof Error ? error.message : '搜索失败';
      }
    }, 300);
    return () => {
      ++version;
      window.clearTimeout(timer);
      controller.abort();
    };
  });

  function select(artwork: ArtworkItem) {
    ++version;
    results = [];
    status = '';
    onselect(artwork);
  }
</script>

<label class="field">
  {label}
  <input
    id={`${idPrefix}-search`}
    type="search"
    bind:value={query}
    placeholder={kind === 'operator' ? '输入干员名称或 ID，如：阿米娅' : '输入干员、皮肤或头像图标名称'}
    autocomplete="off"
    aria-controls={`${idPrefix}-results`}
    aria-describedby={`${idPrefix}-status`}
  />
</label>
<p id={`${idPrefix}-status`} class="hint" role="status" aria-live="polite" hidden={!status}>{status}</p>
<div id={`${idPrefix}-results`} class="operator-results" aria-label={kind === 'operator' ? '干员搜索结果' : '游戏头像搜索结果'}>
  {#each results as artwork (artwork.id)}
    <button type="button" onclick={() => select(artwork)}>
      {#if /^https?:\/\//.test(artwork.avatar)}
        <img referrerpolicy="no-referrer" src={artwork.avatar} alt="" loading="lazy" />
      {/if}
      <span>{artwork.name}</span>
    </button>
  {/each}
</div>
