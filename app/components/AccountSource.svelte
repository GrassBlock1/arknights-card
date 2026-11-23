<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import { request } from '../lib/api';
  import type { SourceMode } from '../lib/profile';

  let {
    mode = $bindable(),
    shareId = $bindable(),
    singleUser,
    onerror,
    onrevoked,
  }: {
    mode: SourceMode;
    shareId: string;
    singleUser: boolean | undefined;
    onerror: (message: string) => void;
    onrevoked: () => void;
  } = $props();

  type AccountSummary = { uid: string; name: string; server: string };
  type AuthStatus = {
    status: 'waiting' | 'scanned' | 'expired' | 'ready';
    accounts?: AccountSummary[];
  };
  let authMethod = $state<'qr' | 'manual'>('qr');
  let credentialType = $state<'token' | 'cred'>('token');
  let accounts = $state<AccountSummary[]>([]);
  let selectedUid = $state('');
  let qr = $state('');
  let authStatus = $state('');
  let authBusy = $state(false);
  let bindingBusy = $state(false);
  let revokeBusy = $state(false);
  let credentialInput = $state<HTMLInputElement>();
  let authVersion = 0;
  let mutationVersion = 0;
  let authTimer: number | undefined;
  let authController: AbortController | undefined;
  let mutationController: AbortController | undefined;
  let destroyed = false;

  function message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  function clearCredential() {
    if (credentialInput) credentialInput.value = '';
  }

  function stopAuth() {
    ++authVersion;
    window.clearTimeout(authTimer);
    authTimer = undefined;
    authController?.abort();
    authController = undefined;
    authBusy = false;
    qr = '';
  }

  function stopMutation() {
    ++mutationVersion;
    mutationController?.abort();
    mutationController = undefined;
    bindingBusy = false;
    revokeBusy = false;
  }

  function resetSession() {
    stopAuth();
    stopMutation();
    clearCredential();
    accounts = [];
    selectedUid = '';
    authStatus = '';
  }

  function authIsCurrent(version: number, method: 'qr' | 'manual') {
    return !destroyed && singleUser === false && mode === 'skland'
      && authMethod === method && version === authVersion;
  }

  function readyAccounts(nextAccounts: AccountSummary[]) {
    stopAuth();
    accounts = nextAccounts;
    selectedUid = nextAccounts[0]?.uid ?? '';
    authStatus = nextAccounts.length
      ? '登录成功 · 请选择游戏账号'
      : '该账号下未找到可绑定的明日方舟角色。';
    if (!nextAccounts.length) onerror(authStatus);
  }

  function beginAuth() {
    stopAuth();
    stopMutation();
    accounts = [];
    selectedUid = '';
    authBusy = true;
    const controller = new AbortController();
    authController = controller;
    return { version: authVersion, controller };
  }

  async function pollAuth(version: number, controller: AbortController) {
    if (!authIsCurrent(version, 'qr') || controller.signal.aborted) return;
    try {
      const result = await request<AuthStatus>('/api/auth/status', { signal: controller.signal });
      if (!authIsCurrent(version, 'qr') || controller.signal.aborted) return;
      const messages = {
        waiting: '等待扫码 · 请使用森空岛 App',
        scanned: '已扫码 · 请在手机上确认登录',
        expired: '二维码已过期，请重新获取',
        ready: '登录成功 · 请选择游戏账号',
      };
      authStatus = messages[result.status];
      if (result.status === 'ready') {
        readyAccounts(result.accounts ?? []);
      } else if (result.status === 'expired') {
        stopAuth();
      } else {
        authTimer = window.setTimeout(() => { void pollAuth(version, controller); }, 2000);
      }
    } catch (error) {
      if (!authIsCurrent(version, 'qr') || controller.signal.aborted) return;
      stopAuth();
      authStatus = '登录状态获取失败，请重新获取二维码。';
      onerror(message(error));
    }
  }

  async function startQr() {
    if (singleUser !== false || mode !== 'skland' || authMethod !== 'qr' || authBusy || bindingBusy || revokeBusy) return;
    const { version, controller } = beginAuth();
    authStatus = '正在获取登录二维码…';
    try {
      const result = await request<{ qr: string }>('/api/auth/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: controller.signal,
      });
      if (!authIsCurrent(version, 'qr') || controller.signal.aborted) return;
      if (!result.qr.startsWith('data:image/')) throw new Error('登录服务未返回有效二维码。');
      qr = result.qr;
      authStatus = '等待扫码 · 请使用森空岛 App';
      void pollAuth(version, controller);
    } catch (error) {
      if (!authIsCurrent(version, 'qr') || controller.signal.aborted) return;
      stopAuth();
      authStatus = '二维码获取失败，请重试。';
      onerror(message(error));
    }
  }

  async function loginManual() {
    if (singleUser !== false || mode !== 'skland' || authMethod !== 'manual' || authBusy || bindingBusy || revokeBusy) return;
    const body = JSON.stringify({ type: credentialType, value: credentialInput?.value.trim() ?? '' });
    clearCredential();
    const { version, controller } = beginAuth();
    authStatus = '正在验证凭证…';
    try {
      const result = await request<{ accounts: AccountSummary[] }>('/api/auth/manual', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: controller.signal,
      });
      if (authIsCurrent(version, 'manual') && !controller.signal.aborted) readyAccounts(result.accounts);
    } catch (error) {
      if (!authIsCurrent(version, 'manual') || controller.signal.aborted) return;
      stopAuth();
      authStatus = '凭证验证失败，请检查类型或重新获取凭证。';
      onerror(message(error));
    }
  }

  function mutationIsCurrent(version: number, initialId: string, controller: AbortController) {
    return !destroyed && singleUser === false && mode === 'skland'
      && version === mutationVersion && shareId === initialId && !controller.signal.aborted;
  }

  async function bindAccount() {
    if (singleUser !== false || mode !== 'skland' || !selectedUid || authBusy || bindingBusy || revokeBusy) return;
    stopMutation();
    const version = mutationVersion;
    const initialId = shareId;
    const controller = new AbortController();
    mutationController = controller;
    bindingBusy = true;
    try {
      const result = await request<{ id: string }>('/api/bindings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: selectedUid }), signal: controller.signal,
      });
      if (!mutationIsCurrent(version, initialId, controller)) return;
      shareId = result.id;
      authStatus = '绑定成功 · 名片已更新。';
    } catch (error) {
      if (mutationIsCurrent(version, initialId, controller)) onerror(message(error));
    } finally {
      if (version === mutationVersion) bindingBusy = false;
    }
  }

  async function revokeBinding() {
    if (singleUser !== false || mode !== 'skland' || bindingBusy || revokeBusy || !shareId.trim()) return;
    const initialId = shareId;
    if (!window.confirm('撤销此名片绑定？已有分享链接将停止提供档案数据。')) return;
    stopMutation();
    const version = mutationVersion;
    const controller = new AbortController();
    mutationController = controller;
    revokeBusy = true;
    try {
      await request<{ revoked: boolean }>('/api/bindings', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: initialId.trim() }), signal: controller.signal,
      });
      if (!mutationIsCurrent(version, initialId, controller)) return;
      shareId = '';
      authStatus = '绑定已撤销。可重新登录并绑定其他账号。';
      onrevoked();
    } catch (error) {
      if (mutationIsCurrent(version, initialId, controller)) onerror(message(error));
    } finally {
      if (version === mutationVersion) revokeBusy = false;
    }
  }

  $effect(() => {
    mode;
    singleUser;
    authMethod;
    untrack(resetSession);
    return resetSession;
  });

  onMount(() => {
    window.addEventListener('pagehide', resetSession);
    return () => window.removeEventListener('pagehide', resetSession);
  });

  onDestroy(() => {
    destroyed = true;
    resetSession();
  });
</script>

<section class="panel" aria-label="档案来源">
  <div class="section-heading"><h2>档案来源</h2><span class="micro">DATA SOURCE</span></div>
    <fieldset class="segmented">
      <legend class="sr-only">档案来源</legend>
      <label><input type="radio" name="mode" value="custom" bind:group={mode}><span>手动配置</span></label>
      <label><input type="radio" name="mode" value="skland" bind:group={mode}><span>森空岛同步</span></label>
    </fieldset>
    {#if mode === 'skland'}
      <p class="hint">凭证通过 JSON 请求提交给本站服务端，不写入链接或浏览器存储。仅在信任本站运营者时登录；凭证可访问你的森空岛账号资料，请勿分享或截图。</p>
      <fieldset class="segmented">
        <legend class="sr-only">登录方式</legend>
        <label><input type="radio" name="auth-method" value="qr" bind:group={authMethod}><span>扫码登录</span></label>
        <label><input type="radio" name="auth-method" value="manual" bind:group={authMethod}><span>手动凭证</span></label>
      </fieldset>
      {#if authMethod === 'qr'}
        <button type="button" class="button secondary full" disabled={authBusy || bindingBusy || revokeBusy} onclick={startQr}>{authBusy ? '等待扫码登录…' : '获取登录二维码'} <span aria-hidden="true">↗</span></button>
      {:else}
        <label class="field">凭证类型<select bind:value={credentialType} disabled={authBusy}><option value="token">鹰角账号 token</option><option value="cred">森空岛 cred</option></select></label>
        <label class="field">登录凭证<input bind:this={credentialInput} type="password" maxlength="4096" autocomplete="off" spellcheck="false" autocapitalize="off" placeholder="只粘贴凭证字符串，不含引号" disabled={authBusy} onkeydown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void loginManual(); } }}></label>
        <details>
          <summary>如何获取自己的已有登录凭证</summary>
          <ol class="hint">
            <li>在同一浏览器打开 <a href="https://www.skland.com/" target="_blank" rel="noopener noreferrer">森空岛官网</a>，正常登录你自己的账号。</li>
            <li>打开 <a href="https://web-api.skland.com/account/info/hg" target="_blank" rel="noopener noreferrer">官方登录会话查询接口</a>，从返回 JSON 中复制 <code>data.content</code> 的字符串，选择“鹰角账号 token”后粘贴。不复制整个 JSON；若未返回该字段，先回官网完成登录。</li>
            <li>如需直接使用 cred：在官网按 F12 打开开发者工具的“网络 / Network”，刷新并打开游戏角色资料，在发往 <code>zonai.skland.com</code> 的已登录请求中查看请求头 <code>cred</code>，复制其值并选择“森空岛 cred”。没有该请求时使用上面的账号 token 方式。</li>
          </ol>
          <p class="hint">账号 token 是 <code>data.content</code>，不是接口签名用的 <code>token</code> 请求头。无需执行控制台脚本，也不要把凭证发给他人。</p>
        </details>
        <button type="button" class="button secondary full" disabled={authBusy || bindingBusy || revokeBusy} onclick={loginManual}>{authBusy ? '正在验证凭证…' : '验证凭证并登录'}</button>
      {/if}
      {#if qr}
        <div class="qr-wrap"><img src={qr} alt="使用森空岛 App 扫描此登录二维码" width="192" height="192"></div>
      {/if}
      <p class="hint" role="status" aria-live="polite">{authStatus}</p>
      {#if accounts.length}
        <label class="field">选择游戏账号<select bind:value={selectedUid} disabled={bindingBusy || revokeBusy}>{#each accounts as account (account.uid)}<option value={account.uid}>{account.name} · {account.server} · {account.uid}</option>{/each}</select></label>
        <button type="button" class="button primary full" disabled={!selectedUid || authBusy || bindingBusy || revokeBusy} onclick={bindAccount}>{bindingBusy ? '正在绑定…' : '绑定并生成名片'}</button>
      {/if}
      <div class="binding-row">
        <label class="field">公开名片 ID<input bind:value={shareId} placeholder="绑定后自动填入，也可粘贴已有 ID" autocomplete="off" spellcheck="false" disabled={bindingBusy || revokeBusy}></label>
        <button type="button" class="text-button danger" disabled={!shareId.trim() || bindingBusy || revokeBusy} onclick={revokeBinding}>{revokeBusy ? '正在撤销…' : '撤销绑定'}</button>
      </div>
      <p class="hint">名片链接为公开链接。撤销绑定后，该 ID 将不再提供档案数据。</p>
    {/if}
</section>
