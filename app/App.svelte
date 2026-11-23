<script lang="ts">
  import { onMount } from 'svelte';
  import ProfileEditor from './components/ProfileEditor.svelte';
  import AccountSource from './components/AccountSource.svelte';
  import CardOutput from './components/CardOutput.svelte';
  import { request } from './lib/api';
  import { defaultProfile, cardParameters, type SourceMode, type CardStyle, type CardFormat } from './lib/profile';
  let profile = $state(defaultProfile());
  let mode = $state<SourceMode>('custom');
  let style = $state<CardStyle>('large');
  let format = $state<CardFormat>('png');
  let shareId = $state('');
  let singleUser = $state<boolean>();
  let error = $state('');
  const prepared = $derived.by(() => {
    try { return { query: cardParameters(profile, mode, shareId, style, format).toString(), error: '' }; }
    catch (cause) { return { query: '', error: cause instanceof Error ? cause.message : '配置无效。' }; }
  });
  onMount(() => {
    const controller = new AbortController();
    void request<{ singleUser: boolean }>('/api/config', { signal: controller.signal }).then(config => {
      if (typeof config.singleUser !== 'boolean') throw new Error('站点配置无效，登录入口保持关闭。');
      singleUser = config.singleUser;
      if (singleUser) {
        shareId = '';
        mode = 'custom';
      }
    }).catch(cause => { if (!controller.signal.aborted) error = cause instanceof Error ? cause.message : '无法加载站点配置。'; });
    return () => controller.abort();
  });
</script>

<header class="topbar"><a class="brand" href="/" aria-label="博士档案工作台首页"><span class="brand-mark" aria-hidden="true">RI</span><span>RHODES ISLAND<small>人事档案终端 / PERSONNEL ARCHIVE</small></span></a></header>
<main id="workbench">
  <section class="intro"><div><h1>展示<span>你的方舟履历</span></h1></div><span class="edition">ARKNIGHTS<br /><b>DOCTOR IDENTIFICATION</b></span></section>
  <div class="workspace">
    <aside class="configuration" aria-label="名片配置">
      {#if singleUser === false}
        <AccountSource bind:mode bind:shareId {singleUser} onerror={message => error = message} onrevoked={() => { shareId = ''; error = ''; }} />
      {/if}
      {#if error}<p id="error" class="error" role="alert">{error}</p>{/if}
      <section class="panel layout-panel"><div class="section-heading"><h2>版式与输出</h2><span class="micro">LAYOUT</span></div>
        <fieldset class="layout-options"><legend class="sr-only">名片版式</legend><label><input type="radio" name="style" value="large" bind:group={style} /><span><i class="layout-icon large"></i><b>完整档案</b><small>1280 × 720</small></span></label><label><input type="radio" name="style" value="compact" bind:group={style} /><span><i class="layout-icon compact"></i><b>紧凑签名</b><small>800 × 280</small></span></label></fieldset>
        <label class="field inline-field">图片格式<select name="format" bind:value={format}><option value="png">PNG</option><option value="webp">WebP</option><option value="svg">SVG</option></select></label>
      </section>
      {#if mode === 'custom'}<ProfileEditor bind:profile />{/if}
    </aside>
    <CardOutput query={prepared.query} validationError={prepared.error} {style} {format} />
  </div>
</main>
<footer><span>RHODES ISLAND // PERSONNEL DEPARTMENT</span><span>非官方作品</span></footer>
