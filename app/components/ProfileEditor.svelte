<script lang="ts">
  import { createAssistSlot, type ProfileForm } from '../lib/profile';
  import ArtworkPicker from './ArtworkPicker.svelte';

  let { profile = $bindable() }: { profile: ProfileForm } = $props();

  const tabs = [
    { id: 'basic', label: '基础信息' },
    { id: 'appearance', label: '外观' },
    { id: 'support', label: '助战' },
  ] as const;

  let active = $state<'basic' | 'appearance' | 'support'>('basic');
  let tablist = $state<HTMLDivElement>();

  const stats = [
    { key: 'operators', label: '干员数' },
    { key: 'skins', label: '时装数' },
    { key: 'furniture', label: '家具数' },
    { key: 'modules', label: '模组数' },
    { key: 'moduleStage3', label: '三级模组' },
    { key: 'moduleOperators', label: '模组干员' },
  ] as const;

  function navigate(event: KeyboardEvent, index: number) {
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    active = tabs[next].id;
    tablist?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }

  function addAssist() {
    if (profile.assists.length >= 3) return;
    profile.assists = [...profile.assists, createAssistSlot()];
  }

  function removeAssist(index: number) {
    profile.assists = profile.assists.filter((_, itemIndex) => itemIndex !== index);
  }
</script>

<fieldset id="custom-fields" class="custom-fields">
  <legend class="sr-only">自定义档案内容</legend>
  <div class="editor-tabs" role="tablist" aria-label="档案配置" bind:this={tablist}>
    {#each tabs as tab, index (tab.id)}
      <button
        type="button"
        id={`profile-tab-${tab.id}`}
        role="tab"
        aria-selected={active === tab.id}
        aria-controls={`profile-panel-${tab.id}`}
        tabindex={active === tab.id ? 0 : -1}
        onclick={() => (active = tab.id)}
        onkeydown={(event) => navigate(event, index)}
      >
        {tab.label}
      </button>
    {/each}
  </div>

  <div
    id="profile-panel-basic"
    class="panel"
    role="tabpanel"
    aria-labelledby="profile-tab-basic"
    hidden={active !== 'basic'}
    tabindex="0"
  >
    <div class="section-heading">
      <h2>博士信息</h2>
      <span class="micro">IDENTITY</span>
    </div>
    <div class="field-grid">
      <label class="field">
        博士代号
        <input name="name" bind:value={profile.name} maxlength="40" />
      </label>
      <label class="field">
        UID
        <input name="uid" bind:value={profile.uid} maxlength="30" inputmode="numeric" />
      </label>
      <label class="field">
        等级
        <input name="level" type="number" min="1" max="120" step="1" bind:value={profile.level} />
      </label>
      <label class="field">
        服务器
        <select name="server" bind:value={profile.server}>
          <option value="官服">官服</option>
          <option value="B服">B服</option>
          <option value="国际服">国际服</option>
        </select>
      </label>
    </div>
    <label class="field">
      个性签名
      <textarea name="signature" rows="2" maxlength="160" bind:value={profile.signature}></textarea>
    </label>
    <label class="field">
      入职日期
      <input name="registered" type="date" bind:value={profile.registered} />
    </label>

    <div class="section-heading collection-heading">
      <h2>收藏统计</h2>
      <span class="micro">COLLECTION</span>
    </div>
    <div class="field-grid stats-grid">
      {#each stats as stat (stat.key)}
        <label class="field">
          {stat.label}
          <input name={stat.key} type="number" min="0" step="1" bind:value={profile[stat.key]} />
        </label>
      {/each}
    </div>
  </div>

  <div
    id="profile-panel-appearance"
    class="panel"
    role="tabpanel"
    aria-labelledby="profile-tab-appearance"
    hidden={active !== 'appearance'}
    tabindex="0"
  >
    <div class="section-heading">
      <h2>助理与头像</h2>
      <span class="micro">ARTWORK</span>
    </div>
    <ArtworkPicker
      kind="operator"
      idPrefix="operator"
      label="搜索助理干员"
      onselect={(artwork) => {
        profile.secretary = artwork.id;
        profile.secretaryName = artwork.name;
      }}
    />
    <label class="field">
      助理干员 ID
      <input
        name="secretary"
        bind:value={profile.secretary}
        oninput={() => {
          profile.secretaryName = '';
        }}
        placeholder="char_002_amiya"
        spellcheck="false"
      />
    </label>
    {#if profile.secretaryName}
      <p class="hint">当前助理：{profile.secretaryName}</p>
    {/if}

    <div class="section-heading collection-heading">
      <h2>博士头像</h2>
      <span class="micro">AVATAR</span>
    </div>
    <ArtworkPicker
      kind="avatar"
      idPrefix="avatar"
      label="搜索博士头像"
      onselect={(artwork) => {
        profile.avatarId = artwork.id;
        profile.avatarType = artwork.type ?? '';
        profile.avatarName = artwork.name;
      }}
    />
    <input name="avatarId" type="hidden" value={profile.avatarId} />
    <input name="avatarType" type="hidden" value={profile.avatarType} />
    <p id="avatar-current" class="hint" aria-live="polite">
      {profile.avatarId
        ? `当前独立头像：${profile.avatarName || profile.avatarId}（不改变助理立绘）`
        : '当前头像：跟随助理干员默认头像。'}
    </p>
    {#if profile.avatarId}
      <button
        id="avatar-reset"
        type="button"
        class="text-button"
        onclick={() => {
          profile.avatarId = '';
          profile.avatarType = '';
          profile.avatarName = '';
        }}
      >
        恢复跟随助理头像
      </button>
    {/if}
  </div>

  <div
    id="profile-panel-support"
    class="panel"
    role="tabpanel"
    aria-labelledby="profile-tab-support"
    hidden={active !== 'support'}
    tabindex="0"
  >
    <div class="section-heading">
      <h2>助战干员</h2>
      <span class="micro">SUPPORT · {profile.assists.length} / 3</span>
    </div>

    <div class="assist-list">
      {#each profile.assists as slot, index (index)}
        <div class="assist-card">
          <div class="assist-card-header">
            <div class="assist-identity">
              {#if slot.avatar && /^https?:\/\//.test(slot.avatar)}
                <img referrerpolicy="no-referrer" src={slot.avatar} alt="" width="36" height="36" />
              {/if}
              <div>
                <strong>助战位 0{index + 1} · {slot.name || slot.id || '未选择干员'}</strong>
              </div>
            </div>
            <button
              type="button"
              class="text-button danger"
              aria-label={`移除助战位 ${index + 1}`}
              onclick={() => removeAssist(index)}
            >
              移除
            </button>
          </div>

          <ArtworkPicker
            kind="operator"
            idPrefix={`assist-${index}`}
            label="搜索更换助战干员"
            onselect={(artwork) => {
              slot.id = artwork.id;
              slot.name = artwork.name;
              slot.avatar = artwork.avatar;
            }}
          />

          <div class="field-grid">
            <label class="field">
              等级
              <input
                name={`assist-level-${index}`}
                type="number"
                min="1"
                max="90"
                step="1"
                bind:value={slot.level}
              />
            </label>
            <label class="field">
              精英化阶段
              <select name={`assist-elite-${index}`} bind:value={slot.elite}>
                <option value={0}>精英 0</option>
                <option value={1}>精英 1</option>
                <option value={2}>精英 2</option>
              </select>
            </label>
            <label class="field">
              携带技能
              <select name={`assist-skill-${index}`} bind:value={slot.skillIndex}>
                <option value={1}>一技能</option>
                <option value={2}>二技能</option>
                <option value={3}>三技能</option>
              </select>
            </label>
            <label class="field">
              技能专精
              <select name={`assist-mastery-${index}`} bind:value={slot.mastery}>
                <option value={0}>无专精</option>
                <option value={1}>专精一</option>
                <option value={2}>专精二</option>
                <option value={3}>专精三</option>
              </select>
            </label>
          </div>

          <div class="field-grid">
            <label class="field">
              模组名称或 ID（可选）
              <input
                name={`assist-module-${index}`}
                bind:value={slot.module}
                placeholder="如：战术咏唱·γ型"
                spellcheck="false"
              />
            </label>
            <label class="field">
              干员 ID
              <input
                name={`assist-id-${index}`}
                bind:value={slot.id}
                oninput={() => {
                  slot.name = '';
                }}
                placeholder="char_002_amiya"
                spellcheck="false"
              />
            </label>
          </div>
        </div>
      {/each}
    </div>

    {#if profile.assists.length < 3}
      <button id="add-assist" type="button" class="button secondary full" onclick={addAssist}>
        + 添加助战干员（{profile.assists.length} / 3）
      </button>
    {/if}
  </div>
</fieldset>
