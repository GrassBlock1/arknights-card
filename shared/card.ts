export type CardProfile = {
  name: string; uid: string; level: number | null; server: string; signature: string;
  registered: string; days: number | null; avatar: string;
  secretary: { id: string; name: string; portrait: string; avatar: string };
  stats: { operators: number | null; skins: number | null; furniture: number | null; modules: number | null; moduleStage3: number | null; moduleOperators: number | null };
  factions: { name: string; owned: number; total: number }[];
  assists: { id: string; name: string; avatar: string; level: number | null; elite: number | null; skillName: string; skillIcon: string; mastery: number | null; module: string }[];
  updatedAt: string;
};

export type CardStyle = "large" | "compact";
export const cardSizes = {
  large: { width: 1280, height: 720 },
  compact: { width: 800, height: 280 },
} as const;
export interface CardPalette {
  accent: string;
  background: string;
  text: string;
  panel: string;
  panelBorder: string;
}

const defaultPalette: CardPalette = {
  accent: "#d4e954",
  background: "#0e1621",
  text: "#eaf0f6",
  panel: "#17212e",
  panelBorder: "#2b3847",
};

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]!);
}

export function safeImageUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !["web.hycdn.cn", "bbs.hycdn.cn"].includes(url.hostname)) return "";
    return url.href;
  } catch {
    return "";
  }
}

const number = (value: number | null) => value === null ? "—" : String(value);
const box = (css: string, content: string) => `<div style="box-sizing:border-box;${css}">${content}</div>`;
const label = (content: string, size = 11) => box(`font-size:${size}px;letter-spacing:2px;color:#8c9aab;line-height:1.5;`, content);
const text = (content: unknown, css = "") => box(`min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${css}`, escapeHtml(content));

type ImageResolver = (url: string) => string;

/** The same fixed-pixel scene is used by the HTML embed, image renderer, and browser widget. */
export function renderCardMarkup(profile: CardProfile, style: CardStyle = "large", resolveImage: ImageResolver = safeImageUrl, palette: Partial<CardPalette> = {}): string {
  const colors = { ...defaultPalette, ...palette };
  const compact = style === "compact";
  const { width, height } = cardSizes[style];
  const image = (source: string, css: string, fallback = "") => {
    const src = resolveImage(safeImageUrl(source));
    return src
      ? `<img src="${escapeHtml(src)}" alt="" referrerpolicy="no-referrer" style="display:block;${css}" />`
      : fallback;
  };
  const panel = `background:${colors.panel};border:1px solid ${colors.panelBorder};`;
  const factionLimit = compact ? 4 : 6;
  const factions = profile.factions.slice(0, factionLimit);
  const factionSummary = profile.factions.length > factionLimit
    ? ` · 另 ${profile.factions.length - factionLimit} 个阵营` : "";
  const metrics: [string, number | null, string][] = [
    ["干员", profile.stats.operators, "OPERATORS"],
    ["时装", profile.stats.skins, "OUTFITS"],
    ["家具", profile.stats.furniture, "FURNITURE"],
    ["模组", profile.stats.modules, "MODULES"],
    ["三级模组", profile.stats.moduleStage3, "STAGE III"],
    ["模组干员", profile.stats.moduleOperators, "EQUIPPED"],
  ];
  const metricsHtml = metrics.map(([name, value, en]) => box(
    `${compact ? "width:87px;padding:6px 8px;" : "width:236px;padding:10px 17px;"}${panel}border-left:2px solid ${colors.accent};`,
    box(`display:flex;${compact ? 'flex-direction:column;gap:2px;' : 'align-items:baseline;justify-content:space-between;'}`, text(number(value), `font-size:${compact ? 21 : 35}px;font-weight:700;color:${colors.text};line-height:1.1;`) + text(name, `font-size:${compact ? 9 : 13}px;color:#a9b6c5;`)) +
    (compact ? "" : label(en, 9)),
  )).join("");
  const factionHtml = factions.map((faction) => {
    const percent = faction.total > 0 ? Math.max(0, Math.min(100, faction.owned / faction.total * 100)) : 0;
    return box(compact ? "width:262px;" : "width:354px;", box("display:flex;justify-content:space-between;align-items:center;gap:8px;",
      text(faction.name, `font-size:${compact ? 10 : 12}px;color:#c9d3df;`) +
      text(`${faction.owned} / ${faction.total}`, `font-size:${compact ? 10 : 12}px;color:${colors.accent};flex-shrink:0;`)) +
      box(`height:${compact ? 2 : 3}px;margin-top:5px;background:#2e3945;`, box(`width:${percent}%;height:100%;background:${colors.accent};`, "")));
  }).join("");
  const assistsHtml = profile.assists.slice(0, 3).map((assist, index) => {
    const portrait = image(assist.avatar, `width:${compact ? 28 : 58}px;height:${compact ? 28 : 58}px;object-fit:cover;`, box(`width:${compact ? 28 : 58}px;height:${compact ? 28 : 58}px;background:#273647;display:flex;align-items:center;justify-content:center;color:${colors.accent};font-size:20px;`, `0${index + 1}`));
    const details = compact
      ? `精${number(assist.elite)} Lv.${number(assist.level)} · 专${number(assist.mastery)}`
      : `精英 ${number(assist.elite)} · Lv.${number(assist.level)} · 专精 ${number(assist.mastery)}`;
    return box(`width:${compact ? 176 : 236}px;${panel}padding:${compact ? 5 : 11}px;`,
      box(`display:flex;align-items:center;gap:${compact ? 7 : 10}px;`, portrait + box("min-width:0;flex:1;", text(assist.name || assist.id, `font-size:${compact ? 11 : 15}px;font-weight:700;`) + text(details, `font-size:${compact ? 8 : 10}px;color:#9daabc;margin-top:3px;`))) +
      box(`display:flex;align-items:center;gap:5px;margin-top:${compact ? 3 : 9}px;`, image(assist.skillIcon, `width:${compact ? 10 : 20}px;height:${compact ? 10 : 20}px;object-fit:contain;`) + text(assist.skillName || "未展示技能", `font-size:${compact ? 9 : 11}px;color:#cbd4de;`)) +
      text(`模组 · ${assist.module || "未展示"}`, `font-size:${compact ? 8 : 10}px;color:#8495a9;margin-top:4px;`));
  }).join("");
  const avatarSize = compact ? 37 : 64;
  const avatar = image(profile.avatar, `width:${avatarSize}px;height:${avatarSize}px;object-fit:cover;border:1px solid #60713b;`, box(`width:${avatarSize}px;height:${avatarSize}px;background:#273544;display:flex;align-items:center;justify-content:center;color:${colors.accent};font-size:${compact ? 18 : 30}px;`, "D"));
  const date = profile.updatedAt ? profile.updatedAt.replace("T", " ").slice(0, 16) : "—";
  const header = box(`display:flex;align-items:center;gap:${compact ? 10 : 16}px;`, avatar + box("flex:1;min-width:0;",
    box("display:flex;align-items:baseline;gap:12px;", text(profile.name, `font-size:${compact ? 24 : 38}px;font-weight:700;line-height:1.2;color:${colors.text};`) + text(`Lv.${number(profile.level)}`, `color:${colors.accent};font-size:${compact ? 13 : 19}px;flex-shrink:0;`)) +
    text(`UID ${profile.uid || "—"}  /  ${profile.server || "—"}`, `font-size:${compact ? 9 : 12}px;letter-spacing:1px;color:#91a1b5;margin-top:3px;`)));
  const registration = `入职 ${profile.registered || "—"} · 在岛 ${number(profile.days)} 天`;
  const left = compact
    ? box("position:absolute;left:20px;top:12px;width:554px;", header +
      text(Array.from(profile.signature || "暂无签名").slice(0, 55).join(""), "font-size:10px;color:#9cabbc;margin-top:4px;line-height:1.4;") +
      box("display:flex;gap:6px;margin-top:6px;", metricsHtml) +
      box("display:flex;justify-content:space-between;margin-top:5px;", label(`阵营档案${escapeHtml(factionSummary)}`, 8) + text(registration, "font-size:8px;color:#798ca1;")) +
      box("display:flex;flex-wrap:wrap;gap:3px 15px;margin-top:3px;", factionHtml || text("暂无阵营数据", "font-size:10px;color:#718398;")) +
      box("display:flex;gap:7px;margin-top:5px;", assistsHtml || text("暂无助战干员", "font-size:10px;color:#718398;")))
    : box("position:absolute;left:38px;top:36px;width:748px;", label("RHODES ISLAND  /  PERSONNEL ARCHIVE", 10) +
      box("margin-top:16px;", header) +
      text(Array.from(profile.signature || "暂无签名").slice(0, 70).join(""), "font-size:14px;color:#a7b5c6;margin-top:15px;line-height:1.6;") +
      text(registration, "font-size:11px;color:#71869d;margin-top:7px;letter-spacing:1px;") +
      box("display:flex;flex-wrap:wrap;gap:10px;margin-top:25px;", metricsHtml) +
      box("display:flex;justify-content:space-between;align-items:center;margin-top:23px;", label("阵营收集 / FACTIONS", 11) + text(factionSummary.replace(/^ · /, ""), "font-size:10px;color:#8192a6;")) +
      box("display:flex;flex-wrap:wrap;gap:12px 24px;margin-top:12px;", factionHtml || text("暂无阵营数据", "font-size:12px;color:#718398;")) +
      box("margin-top:16px;", label("助战编队 / SUPPORT UNIT", 11)) +
      box("display:flex;gap:10px;margin-top:10px;", assistsHtml || text("暂无助战干员", "font-size:12px;color:#718398;")));
  const rightWidth = compact ? 202 : 440;
  const portrait = image(profile.secretary.portrait || profile.secretary.avatar,
    `position:absolute;right:${compact ? -16 : -25}px;bottom:0;width:${compact ? 226 : 460}px;height:${height}px;object-fit:contain;object-position:center bottom;`);
  const secretaryAvatar = image(profile.secretary.avatar, `width:${compact ? 23 : 36}px;height:${compact ? 23 : 36}px;object-fit:cover;border:1px solid #60713b;`);
  return `<div lang="zh-CN" style="width:${width}px;height:${height}px;position:relative;overflow:hidden;background:${colors.background};color:${colors.text};font-family:'Noto Sans SC',sans-serif;line-height:1.25;box-sizing:border-box;">` +
    box(`position:absolute;right:0;top:0;width:${rightWidth}px;height:${height}px;background:linear-gradient(155deg,#29394a 0%,#182534 55%,${colors.background} 100%);border-left:1px solid ${colors.panelBorder};`, "") +
    box(`position:absolute;right:${compact ? 17 : 26}px;top:${compact ? 12 : 22}px;font-size:${compact ? 38 : 79}px;color:#3a4953;font-weight:900;letter-spacing:-3px;`, "RHODES") +
    box(`position:absolute;right:${compact ? 18 : 31}px;top:${compact ? 50 : 104}px;font-size:${compact ? 10 : 18}px;color:#5c6e7a;letter-spacing:${compact ? 5 : 9}px;`, "ISLAND") +
    portrait +
    box(`position:absolute;right:0;bottom:0;width:${rightWidth}px;height:${compact ? 90 : 190}px;background:linear-gradient(to bottom,transparent,#0b121ddd);`, "") +
    box(`position:absolute;right:${compact ? 13 : 26}px;bottom:${compact ? 26 : 50}px;width:${compact ? 170 : 368}px;display:flex;align-items:center;gap:9px;`, secretaryAvatar + box("min-width:0;", label("ASSISTANT / 当值助理", compact ? 7 : 10) + text(profile.secretary.name || profile.secretary.id || "未设置助理", `font-size:${compact ? 15 : 25}px;font-weight:700;margin-top:3px;`))) +
    left +
    box(`position:absolute;left:0;top:0;width:${compact ? 5 : 8}px;height:${height}px;background:${colors.accent};`, "") +
    box(`position:absolute;left:${compact ? 20 : 38}px;bottom:${compact ? 7 : 15}px;font-size:${compact ? 7 : 9}px;letter-spacing:1px;color:#687d93;`, `ARKNIGHTS / 明日方舟 · ${escapeHtml(date)}`) +
    box(`position:absolute;right:${compact ? 13 : 26}px;bottom:${compact ? 7 : 15}px;font-size:${compact ? 7 : 9}px;letter-spacing:1px;color:#8b9caf;`, "PERSONNEL FILE / 罗德岛人事档案") +
    "</div>";
}
