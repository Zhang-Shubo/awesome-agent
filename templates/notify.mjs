/**
 * 零依赖通知模板 —— Telegram + Discord 可插拔,配置了哪个发哪个。
 *
 * 约定(见 docs/06-通知系统.md):
 *   - 未配置任何渠道 → 静默 no-op;发送失败 → console.error,绝不抛错。
 *   - alert(text)  fire-and-forget,99% 场景用它;
 *   - notify(text) 返回 Promise,仅在必须确认送达时 await。
 *   - 环境变量跨项目同名:TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID / DISCORD_WEBHOOK_URL。
 *   - 消息开头带分级 emoji(🚨/⚠️/✅/📊)+ 项目名前缀,如 "⚠️ [myapp] 抓取失败"。
 */

const APP = process.env.APP_NAME ?? "app"; // 项目名前缀,多项目共用一个 chat 时区分来源

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** parse_mode=HTML 下,正文里的 < > & 必须转义,否则整条 400。 */
export const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 按行分段,每段不超过 limit 字符(TG 上限 4096 取 4000,Discord 上限 2000 取 1900)。 */
function split(text, limit) {
  if (text.length <= limit) return [text];
  const chunks = [];
  let buf = [], len = 0;
  for (const line of text.split("\n")) {
    if (len + line.length + 1 > limit && buf.length) {
      chunks.push(buf.join("\n"));
      buf = []; len = 0;
    }
    buf.push(line); len += line.length + 1;
  }
  if (buf.length) chunks.push(buf.join("\n"));
  return chunks;
}

/** POST JSON,3 次重试;429 遵循 retry_after 退避。成功返回 true。 */
async function post(url, payload, timeoutMs = 10_000) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok || res.status === 204) return true;
      if (res.status === 429) {
        const body = await res.json().catch(() => ({}));
        const wait = body?.parameters?.retry_after ?? body?.retry_after ?? 1;
        await sleep(wait * 1000);
        continue;
      }
      console.error(`[notify] HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    } catch (e) {
      console.error(`[notify] ${e?.message ?? e}`);
    }
    await sleep(1000 * (attempt + 1));
  }
  return false;
}

async function sendTelegram(text) {
  const token = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
  const chatId = (process.env.TELEGRAM_CHAT_ID ?? "").trim();
  if (!token || !chatId) return false;
  let ok = true;
  for (const chunk of split(text, 4000)) {
    ok = (await post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: chunk,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    })) && ok;
  }
  return ok;
}

async function sendDiscord(text) {
  const url = (process.env.DISCORD_WEBHOOK_URL ?? "").trim();
  if (!url) return false;
  let ok = true;
  for (const chunk of split(text, 1900)) {
    ok = (await post(url, { content: chunk })) && ok;
  }
  return ok;
}

/** 同类告警限频:相同 key 在窗口内只发第一条。恢复时调用方补发 "✅ 已恢复"。 */
const lastSent = new Map();
export function throttled(key, windowMs = 10 * 60_000) {
  const now = Date.now();
  if ((lastSent.get(key) ?? 0) + windowMs > now) return true;
  lastSent.set(key, now);
  return false;
}

/** 发到所有已配置渠道;一个都没配则静默 no-op。需要确认送达时 await 它。 */
export async function notify(text) {
  const tag = `[${APP}]`;
  // 已带项目名则原样;否则插在开头分级 emoji(若有)之后
  const msg = text.includes(tag)
    ? text
    : text.replace(/^(\p{Extended_Pictographic}️?\s*)?/u, (m) => `${m}${tag} `);
  const results = await Promise.all([sendTelegram(msg), sendDiscord(msg)]);
  return results.some(Boolean);
}

/** fire-and-forget:不 await、不抛错。绝不阻塞主流程。 */
export function alert(text) {
  notify(text).catch(() => {});
}
