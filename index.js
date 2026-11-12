(() => {
  const { registerCommand } = vendetta.commands;
  const { storage } = vendetta.plugin;
  const { findByProps } = vendetta.metro;

  const HOOK_RE = /^https:\/\/((canary|ptb)\.)?(discord|discordapp)\.com\/api(\/v\d+)?\/webhooks\/\d+\/[\w-]+$/;
  const VAR_RE = /\{(date|time|datetime|unix|day|month|year|random|randint:\d+-\d+|pick:[^{}]+)\}/gi;
  const NUM_EMOJI = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
  const unregs = [];

  const clone = (x) => JSON.parse(JSON.stringify(x));
  const get = (k, d) => (storage[k] === undefined || storage[k] === null ? d : storage[k]);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const nl = (s) => String(s).replace(/\\n/g, "\n");
  const yes = (s) => !!s && ["yes", "true", "1", "on", "y"].includes(String(s).toLowerCase());
  const clean = (u) => String(u || "").trim().split("?")[0].replace(/\/+$/, "");
  const hooks = () => clone(get("hooks", []));
  const history = () => clone(get("history", []));
  const templates = () => clone(get("templates", {}));

  function toast(text) {
    try {
      vendetta.ui.toasts.showToast(String(text).slice(0, 160));
    } catch (e) {}
  }

  function reply(ctx, res) {
    const channelId = ctx && ctx.channel && ctx.channel.id;
    const text = typeof res === "string" ? res : (res && res.text) || "";
    const embed = res && typeof res === "object" ? res.embed : null;
    try {
      const bot = findByProps("createBotMessage");
      const actions = findByProps("receiveMessage", "sendMessage");
      if (bot && actions && channelId) {
        const m = bot.createBotMessage({ channelId, content: text, embeds: embed ? [embed] : [] });
        try {
          m.author.username = "RandomCord";
        } catch (e) {}
        actions.receiveMessage(channelId, m);
        return;
      }
    } catch (e) {}
    try {
      const sb = findByProps("sendBotMessage");
      if (sb && channelId) {
        sb.sendBotMessage(channelId, text);
        return;
      }
    } catch (e) {}
    toast(text);
  }

  function parseArgs(args) {
    const out = {};
    (args || []).forEach((a) => {
      if (a && a.name !== undefined && a.value !== undefined && String(a.value).trim() !== "") out[a.name] = String(a.value).trim();
    });
    return out;
  }

  function cmd(name, desc, options, run) {
    const def = {
      name,
      displayName: name,
      description: desc,
      displayDescription: desc,
      applicationId: "-1",
      inputType: 1,
      type: 1,
      options: (options || []).map(([n, d, req]) => ({
        name: n,
        displayName: n,
        description: d,
        displayDescription: d,
        required: !!req,
        type: 3,
      })),
      execute: async (args, ctx) => {
        let res;
        try {
          res = await run(parseArgs(args), ctx);
        } catch (e) {
          res = "⚠ " + ((e && e.message) || String(e));
        }
        reply(ctx, res);
      },
    };
    unregs.push(registerCommand(def));
  }

  function vars(s) {
    if (typeof s !== "string" || s.indexOf("{") < 0) return s;
    const d = new Date();
    return s.replace(VAR_RE, (m, k) => {
      const l = k.toLowerCase();
      if (l === "date") return d.toLocaleDateString();
      if (l === "time") return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      if (l === "datetime") return d.toLocaleString();
      if (l === "unix") return String(Math.floor(d.getTime() / 1000));
      if (l === "day") return d.toLocaleDateString(undefined, { weekday: "long" });
      if (l === "month") return d.toLocaleDateString(undefined, { month: "long" });
      if (l === "year") return String(d.getFullYear());
      if (l === "random") return Math.random().toString(36).slice(2, 8);
      if (l.startsWith("randint:")) {
        const [a, b] = l.slice(8).split("-").map(Number);
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        return String(lo + Math.floor(Math.random() * (hi - lo + 1)));
      }
      if (l.startsWith("pick:")) {
        const o = k.slice(5).split("|");
        return o[Math.floor(Math.random() * o.length)];
      }
      return m;
    });
  }

  function deep(o) {
    if (typeof o === "string") return vars(o);
    if (Array.isArray(o)) return o.map(deep);
    if (o && typeof o === "object") {
      const r = {};
      Object.keys(o).forEach((k) => (r[k] = deep(o[k])));
      return r;
    }
    return o;
  }

  function current() {
    const u = String(get("cur", "")).trim();
    if (!HOOK_RE.test(u)) throw new Error("No webhook selected. Use /rc-use with a webhook URL or a saved name.");
    return u;
  }

  function base() {
    const p = {};
    const allowed = String(get("mentions", ""))
      .split(",")
      .map((x) => x.trim())
      .filter((x) => ["users", "roles", "everyone"].includes(x));
    p.allowed_mentions = { parse: allowed };
    if (get("user", "")) p.username = get("user", "");
    if (get("avatar", "")) p.avatar_url = get("avatar", "");
    if (get("thread_name", "") && !get("thread_id", "")) {
      p.thread_name = get("thread_name", "");
      const tags = String(get("thread_tags", "")).split(/[\s,]+/).filter((x) => /^\d+$/.test(x));
      if (tags.length) p.applied_tags = tags;
    }
    return p;
  }

  function embedChars(embeds) {
    return (embeds || []).reduce((n, e) => {
      n += (e.title || "").length + (e.description || "").length;
      n += e.footer && e.footer.text ? e.footer.text.length : 0;
      n += e.author && e.author.name ? e.author.name.length : 0;
      (e.fields || []).forEach((f) => (n += (f.name || "").length + (f.value || "").length));
      return n;
    }, 0);
  }

  async function http(method, url, json) {
    const init = { method, headers: {} };
    if (json !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = typeof json === "string" ? json : JSON.stringify(json);
    }
    const r = await fetch(url, init);
    const text = await r.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (e) {}
    return { ok: r.ok, code: r.status, data, text, message: (data && data.message) || String(text).slice(0, 160) };
  }

  const threadQuery = (thread) => {
    const t = thread !== undefined ? thread : get("thread_id", "");
    return t ? "&thread_id=" + t : "";
  };

  function remember(url, payload, d) {
    try {
      if (!d || !d.id) return;
      const h = hooks().find((x) => x.url === url);
      const e = d.embeds && d.embeds[0];
      let shown = d.content || "";
      if (!shown && e) shown = e.title || e.description || "";
      if (d.attachments && d.attachments.length) shown = (shown ? shown + " " : "") + "[file]";
      const item = {
        id: d.id,
        url,
        hook: h ? h.name : "…" + url.slice(-6),
        t: Date.now(),
        text: shown.slice(0, 120),
        content: d.content || "",
        thread: get("thread_id", "") || (payload.thread_name ? d.channel_id : ""),
        pl: payload,
      };
      storage.history = [item].concat(history()).slice(0, 30);
    } catch (e) {}
  }

  async function postTo(url, payload, extra, thread) {
    const body = JSON.stringify(deep(payload));
    const target = () => url + "?wait=true" + (extra || "") + threadQuery(thread);
    let r = await http("POST", target(), body);
    for (let i = 0; i < 3 && r.code === 429; i++) {
      const wait = (r.data && r.data.retry_after) || 2;
      await sleep(wait * 1000 + 250);
      r = await http("POST", target(), body);
    }
    if (r.ok) remember(url, payload, r.data);
    return r;
  }

  async function deliver(payload, extra) {
    const c = vars(payload.content || "");
    if (c.length > 2000) return "❌ That message is " + c.length + " characters (limit 2000). Use /rc-split instead.";
    if (payload.embeds && embedChars(deep(payload.embeds)) > 6000) return "❌ Embed text is over 6000 characters.";
    const r = await postTo(current(), payload, extra);
    return r.ok ? "✅ Sent (message " + (r.data && r.data.id) + ")" : "❌ HTTP " + r.code + ": " + r.message;
  }

  function colorInt(s) {
    const h = String(s || "").trim().replace(/^#/, "");
    return /^[0-9a-fA-F]{6}$/.test(h) ? parseInt(h, 16) : null;
  }

  function buildEmbed(a) {
    const e = {};
    if (a.title) e.title = nl(a.title);
    if (a.description) e.description = nl(a.description);
    const c = colorInt(a.color);
    e.color = c !== null ? c : 0x8b5cf6;
    if (a.url) e.url = a.url;
    if (a.author) e.author = { name: a.author };
    if (a.footer) e.footer = { text: nl(a.footer) };
    if (a.image) e.image = { url: a.image };
    if (a.thumbnail) e.thumbnail = { url: a.thumbnail };
    if (yes(a.timestamp)) e.timestamp = new Date().toISOString();
    if (a.fields) {
      const fields = a.fields
        .split(";")
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 25)
        .map((part) => part.split("|"))
        .filter((b) => b.length >= 2)
        .map((b) => ({ name: nl(b[0].trim()), value: nl(b[1].trim()), inline: (b[2] || "").trim() === "1" }));
      if (fields.length) e.fields = fields;
    }
    return e;
  }

  const embedOptions = [
    ["title", "Embed title"],
    ["description", "Embed text (use \\n for a new line)"],
    ["color", "Hex color like #8b5cf6"],
    ["fields", "Name|Value|1;Name2|Value2 (1 = inline)"],
    ["footer", "Footer text"],
    ["image", "Image URL"],
    ["thumbnail", "Thumbnail URL"],
    ["author", "Author name"],
    ["url", "Title link URL"],
    ["timestamp", "yes to add a timestamp"],
    ["content", "Message text above the embed"],
  ];

  const lines = (raw, limit) =>
    String(raw || "")
      .split("|")
      .map((x) => nl(x.trim()))
      .filter(Boolean)
      .slice(0, limit || 20);

  function splitText(t, max, numbered) {
    const lim = max - (numbered ? 14 : 0) - 8;
    const out = [];
    let rest = t.replace(/\r/g, "");
    let open = false;
    while (rest.length > lim) {
      let cut = rest.lastIndexOf("\n", lim);
      if (cut < lim * 0.5) cut = rest.lastIndexOf(" ", lim);
      if (cut < lim * 0.3) cut = lim;
      let chunk = rest.slice(0, cut);
      rest = rest.slice(cut).replace(/^[ \n]/, "");
      if (open) chunk = "```\n" + chunk;
      open = (chunk.match(/```/g) || []).length % 2 === 1;
      if (open) chunk += "\n```";
      out.push(chunk);
    }
    if (rest.length || !out.length) out.push(open ? "```\n" + rest : rest);
    return numbered && out.length > 1 ? out.map((c, i) => "(" + (i + 1) + "/" + out.length + ") " + c) : out;
  }

  function registerAll() {
    cmd("rc-send", "Send a message through your active webhook", [["message", "Text to send (use \\n for a new line)", true]], (a) =>
      deliver(Object.assign(base(), { content: nl(a.message || "") }))
    );

    cmd("rc-quick", "Send a quick embed", [["description", "Embed text", true], ["title", "Embed title"], ["color", "Hex color"]], (a) => {
      const e = { description: nl(a.description || ""), color: colorInt(a.color) !== null ? colorInt(a.color) : 0x8b5cf6 };
      if (a.title) e.title = a.title;
      return deliver(Object.assign(base(), { embeds: [e] }));
    });

    cmd("rc-embed", "Send a full embed", embedOptions, (a) => {
      const p = Object.assign(base(), { embeds: [buildEmbed(a)] });
      if (a.content) p.content = nl(a.content);
      return deliver(p);
    });

    cmd("rc-preview", "Preview an embed here without sending it", embedOptions, (a) => {
      const e = buildEmbed(a);
      const local = {
        type: "rich",
        title: e.title,
        rawTitle: e.title,
        description: e.description,
        rawDescription: e.description,
        color: e.color,
        fields: (e.fields || []).map((f) => ({ name: f.name, rawName: f.name, value: f.value, rawValue: f.value, inline: f.inline })),
      };
      return { text: "👀 Preview only. Nothing was sent.", embed: local };
    });

    cmd("rc-json", "Send a raw webhook JSON payload", [["payload", "JSON payload", true]], (a) => {
      const o = JSON.parse(a.payload || "{}");
      if (!o.allowed_mentions) o.allowed_mentions = base().allowed_mentions;
      return deliver(o);
    });

    cmd("rc-link", "Send a message with a link button", [["label", "Button label", true], ["url", "Button link (https://…)", true], ["message", "Message text"]], (a) => {
      if (!/^https?:\/\//.test(a.url || "")) return "❌ The button link must start with http.";
      const btn = { type: 2, style: 5, label: (a.label || "Open").slice(0, 80), url: a.url };
      const p = Object.assign(base(), { content: nl(a.message || "​"), components: [{ type: 1, components: [btn] }] });
      return deliver(p, "&with_components=true");
    });

    cmd("rc-hub", "Post a links embed", [["links", "Label|https://url;Label2|https://url2", true], ["message", "Message text"], ["buttons", "yes to add link buttons"]], (a) => {
      const items = String(a.links || "")
        .split(";")
        .map((x) => x.trim())
        .filter(Boolean)
        .map((x) => {
          const i = x.indexOf("|");
          return i > 0 ? [x.slice(0, i).trim(), x.slice(i + 1).trim()] : null;
        })
        .filter((x) => x && /^https?:\/\//.test(x[1]));
      if (!items.length) return "❌ No valid links. Use Label|https://url;Label2|https://url2";
      const e = { title: "🔗 Links", color: 0x8b5cf6, description: items.map((x) => "**[" + x[0] + "](" + x[1] + ")**").join("\n") };
      const p = Object.assign(base(), { content: nl(a.message || ""), embeds: [e] });
      let extra = "";
      if (yes(a.buttons)) {
        p.components = [{ type: 1, components: items.slice(0, 5).map((x) => ({ type: 2, style: 5, label: x[0].slice(0, 80), url: x[1] })) }];
        extra = "&with_components=true";
      }
      return deliver(p, extra);
    });

    cmd(
      "rc-poll",
      "Post a numbered poll",
      [["question", "The question", true], ["options", "Option A|Option B|Option C (2 to 10)", true], ["closes", "Minutes until it closes"], ["multiple", "yes if people can pick more than one"]],
      (a) => {
        const opts = String(a.options || "").split("|").map((x) => x.trim()).filter(Boolean).slice(0, 10);
        if (opts.length < 2) return "❌ Give at least 2 options separated by |";
        let desc = opts.map((o, i) => NUM_EMOJI[i] + "  " + o).join("\n\n");
        const mins = parseInt(a.closes, 10);
        if (!isNaN(mins)) desc += "\n\n⏰ Closes <t:" + (Math.floor(Date.now() / 1000) + mins * 60) + ":R>";
        const e = {
          title: "📊 " + (a.question || ""),
          description: desc,
          color: 0x8b5cf6,
          footer: { text: "React with the number of your choice" + (yes(a.multiple) ? " · you can pick more than one" : " · pick one") },
        };
        return deliver(Object.assign(base(), { embeds: [e] }));
      }
    );

    cmd("rc-edit", "Edit a message this webhook sent", [["id", "Message ID", true], ["content", "New text", true]], async (a) => {
      const r = await http("PATCH", current() + "/messages/" + a.id + "?wait=true" + threadQuery(), { content: nl(a.content || "") });
      return r.ok ? "✅ Edited message " + a.id : "❌ HTTP " + r.code + ": " + r.message;
    });

    cmd("rc-delete", "Delete a message this webhook sent", [["id", "Message ID", true]], async (a) => {
      const r = await http("DELETE", current() + "/messages/" + a.id + "?" + threadQuery().replace(/^&/, ""));
      return r.ok ? "🗑 Deleted message " + a.id : "❌ HTTP " + r.code + ": " + r.message;
    });

    cmd("rc-bulk", "Send several messages in a row", [["lines", "Message one|Message two|Message three (max 20)", true], ["delay", "Delay between messages in ms (min 1000)"]], async (a) => {
      const ls = lines(a.lines);
      if (!ls.length) return "❌ No messages.";
      const delay = Math.max(1000, parseInt(a.delay, 10) || 1500);
      let sent = 0;
      let failure = "";
      for (const l of ls) {
        const r = await postTo(current(), Object.assign(base(), { content: l }));
        if (!r.ok) {
          failure = "HTTP " + r.code + ": " + r.message;
          break;
        }
        sent++;
        if (sent < ls.length) await sleep(delay);
      }
      return failure ? "⚠ Sent " + sent + " of " + ls.length + ". Stopped: " + failure : "✅ Sent " + sent + " of " + ls.length + " messages.";
    });

    cmd("rc-rotate", "Send messages round-robin across your saved webhooks", [["lines", "Message one|Message two|… (max 20)", true], ["delay", "Delay in ms (min 1000)"]], async (a) => {
      const h = hooks();
      if (!h.length) return "❌ No saved webhooks. Use /rc-save first.";
      const ls = lines(a.lines);
      const delay = Math.max(1000, parseInt(a.delay, 10) || 1500);
      let sent = 0;
      let log = "";
      for (let i = 0; i < ls.length; i++) {
        const hook = h[i % h.length];
        const p = Object.assign(base(), { content: ls[i] });
        delete p.thread_name;
        delete p.applied_tags;
        if (hook.username) p.username = hook.username;
        if (hook.avatar) p.avatar_url = hook.avatar;
        const r = await postTo(hook.url, p, "", "");
        if (r.ok) sent++;
        else log += "\n• " + hook.name + ": HTTP " + r.code;
        if (i < ls.length - 1) await sleep(delay);
      }
      return "✅ Rotated " + sent + " of " + ls.length + " messages across " + h.length + " webhooks." + log;
    });

    cmd(
      "rc-split",
      "Split long text into several messages",
      [["text", "The long text (use \\n for new lines)", true], ["max", "Max characters per message"], ["numbered", "no to skip (1/3) numbering"], ["delay", "Delay in ms"]],
      async (a) => {
        const max = Math.min(2000, Math.max(200, parseInt(a.max, 10) || 2000));
        const numbered = String(a.numbered || "").toLowerCase() !== "no";
        const parts = splitText(nl(a.text || ""), max, numbered);
        const delay = Math.max(1000, parseInt(a.delay, 10) || 1500);
        let sent = 0;
        for (let i = 0; i < parts.length; i++) {
          const r = await postTo(current(), Object.assign(base(), { content: parts[i] }));
          if (!r.ok) return "⚠ Sent " + sent + " of " + parts.length + ". HTTP " + r.code + ": " + r.message;
          sent++;
          if (i < parts.length - 1) await sleep(delay);
        }
        return "✅ Sent " + parts.length + " message" + (parts.length === 1 ? "" : "s") + ".";
      }
    );

    cmd("rc-identity", "Set the name and picture your webhook posts with", [["username", "Display name (- to clear)"], ["avatar", "Avatar image URL (- to clear)"]], (a) => {
      if (!a.username && !a.avatar) return "Username: " + (get("user", "") || "(webhook default)") + "\nAvatar: " + (get("avatar", "") || "(webhook default)");
      if (a.username) storage.user = a.username === "-" ? "" : a.username;
      if (a.avatar) storage.avatar = a.avatar === "-" ? "" : a.avatar;
      return "✅ Identity saved.";
    });

    cmd("rc-mentions", "Choose which pings are allowed", [["allow", "users, roles, everyone (comma separated) or none", true]], (a) => {
      const set = String(a.allow || "none").toLowerCase().split(",").map((x) => x.trim()).filter((x) => ["users", "roles", "everyone"].includes(x));
      storage.mentions = set.join(",");
      return set.length ? "✅ Allowed pings: " + set.join(", ") : "✅ All pings blocked.";
    });

    cmd("rc-thread", "Post into a thread or create a forum post", [["id", "Existing thread ID (- to clear)"], ["name", "New forum post title (- to clear)"], ["tags", "Forum tag IDs, comma separated"]], (a) => {
      if (!a.id && !a.name && !a.tags) {
        return "Thread: " + (get("thread_id", "") || "(none)") + "\nNew post title: " + (get("thread_name", "") || "(none)") + "\nTags: " + (get("thread_tags", "") || "(none)");
      }
      if (a.id) storage.thread_id = a.id === "-" ? "" : a.id;
      if (a.name) storage.thread_name = a.name === "-" ? "" : a.name;
      if (a.tags) storage.thread_tags = a.tags === "-" ? "" : a.tags;
      return "✅ Thread settings saved.";
    });

    cmd("rc-use", "Pick the webhook to use (saved name or full URL)", [["webhook", "Saved name or https://discord.com/api/webhooks/…", true]], (a) => {
      const t = clean(a.webhook);
      if (HOOK_RE.test(t)) {
        storage.cur = t;
        return "✅ Using that webhook (ends …" + t.slice(-6) + ").";
      }
      const found = hooks().find((h) => h.name.toLowerCase() === t.toLowerCase());
      if (found) {
        storage.cur = found.url;
        storage.user = found.username || "";
        storage.avatar = found.avatar || "";
        return "✅ Now using “" + found.name + "”.";
      }
      return "❌ No saved webhook called “" + t + "” and that isn't a valid webhook URL.";
    });

    cmd("rc-save", "Save a webhook under a name", [["name", "Name for this webhook", true], ["url", "Webhook URL (defaults to the active one)"], ["username", "Display name for this webhook"], ["avatar", "Avatar URL for this webhook"]], (a) => {
      const url = clean(a.url || get("cur", ""));
      if (!HOOK_RE.test(url)) return "❌ That isn't a valid webhook URL.";
      const rest = hooks().filter((h) => h.name.toLowerCase() !== a.name.toLowerCase());
      rest.push({ name: a.name, url, username: a.username || "", avatar: a.avatar || "" });
      storage.hooks = rest;
      return "✅ Saved “" + a.name + "”.";
    });

    cmd("rc-remove", "Remove a saved webhook", [["name", "Saved name", true]], (a) => {
      const all = hooks();
      const rest = all.filter((h) => h.name.toLowerCase() !== a.name.toLowerCase());
      if (rest.length === all.length) return "❌ Nothing saved as “" + a.name + "”.";
      storage.hooks = rest;
      return "🗑 Removed “" + a.name + "”.";
    });

    cmd("rc-hooks", "List your saved webhooks", [], () => {
      const h = hooks();
      if (!h.length) return "No saved webhooks yet. Use /rc-save.";
      const cur = get("cur", "");
      return h.map((o) => (o.url === cur ? "▶ " : "• ") + o.name + "  (…" + o.url.slice(-6) + ")" + (o.username ? " · " + o.username : "")).join("\n");
    });

    cmd("rc-health", "Check every saved webhook", [], async () => {
      const h = hooks();
      if (!h.length) return "No saved webhooks to check.";
      let alive = 0;
      const out = [];
      for (const o of h) {
        const t = Date.now();
        try {
          const r = await http("GET", o.url);
          const ms = Date.now() - t;
          if (r.ok) {
            alive++;
            out.push("🟢 " + o.name + " · " + ms + " ms");
          } else if (r.code === 404) out.push("🔴 " + o.name + " · deleted");
          else if (r.code === 401) out.push("🔴 " + o.name + " · bad token");
          else out.push("🟠 " + o.name + " · HTTP " + r.code);
        } catch (e) {
          out.push("🟠 " + o.name + " · unreachable");
        }
        await sleep(150);
      }
      return out.join("\n") + "\n\n" + alive + " of " + h.length + " alive";
    });

    cmd("rc-info", "Show details about the active webhook", [], async () => {
      const r = await http("GET", current());
      if (!r.ok) return "❌ HTTP " + r.code + ": " + r.message;
      const d = r.data;
      return "Name: " + d.name + "\nID: " + d.id + "\nChannel: " + d.channel_id + "\nServer: " + (d.guild_id || "-") + "\nType: " + d.type;
    });

    cmd("rc-ping", "Test the active webhook", [["post", "yes to also post a ping message"]], async (a) => {
      const t = Date.now();
      const r = await http("GET", current());
      const ms = Date.now() - t;
      if (!r.ok) return "🔴 HTTP " + r.code + ": " + r.message;
      if (yes(a.post)) await postTo(current(), Object.assign(base(), { content: "🟣 RandomCord ping (" + ms + " ms)" }));
      return "🟢 Webhook alive · " + ms + " ms";
    });

    cmd("rc-tpl-save", "Save a reusable message template", [["name", "Template name", true], ["text", "Template text. Variables like {date} work.", true]], (a) => {
      const t = templates();
      t[a.name] = nl(a.text);
      storage.templates = t;
      return "✅ Saved template “" + a.name + "”.";
    });

    cmd("rc-tpl-send", "Send a saved template", [["name", "Template name", true]], (a) => {
      const t = templates();
      const key = Object.keys(t).find((k) => k.toLowerCase() === a.name.toLowerCase());
      if (!key) return "❌ No template called “" + a.name + "”.";
      return deliver(Object.assign(base(), { content: t[key] }));
    });

    cmd("rc-tpl-list", "List your templates", [], () => {
      const t = templates();
      const keys = Object.keys(t);
      if (!keys.length) return "No templates yet. Use /rc-tpl-save.";
      return keys.map((k) => "• " + k + ": " + t[k].slice(0, 60)).join("\n");
    });

    cmd("rc-tpl-delete", "Delete a template", [["name", "Template name", true]], (a) => {
      const t = templates();
      const key = Object.keys(t).find((k) => k.toLowerCase() === a.name.toLowerCase());
      if (!key) return "❌ No template called “" + a.name + "”.";
      delete t[key];
      storage.templates = t;
      return "🗑 Deleted “" + key + "”.";
    });

    cmd("rc-export", "Show a backup of your saved data", [], () =>
      "Backup (contains webhook tokens, keep it private):\n" +
      JSON.stringify({ hooks: hooks(), templates: templates(), user: get("user", ""), avatar: get("avatar", ""), mentions: get("mentions", "") })
    );

    cmd("rc-import", "Restore from a backup", [["data", "Backup text from /rc-export", true]], (a) => {
      const o = JSON.parse(a.data);
      if (Array.isArray(o.hooks)) storage.hooks = o.hooks;
      if (o.templates && typeof o.templates === "object") storage.templates = o.templates;
      storage.user = o.user || "";
      storage.avatar = o.avatar || "";
      storage.mentions = o.mentions || "";
      return "✅ Backup restored.";
    });

    cmd("rc-history", "Show your recent messages", [["count", "How many to show (default 10)"]], (a) => {
      const h = history();
      if (!h.length) return "Nothing sent yet.";
      const n = Math.min(h.length, Math.max(1, Math.min(30, parseInt(a.count, 10) || 10)));
      return h
        .slice(0, n)
        .map((o, i) => i + 1 + ". [" + new Date(o.t).toLocaleString() + "] " + o.hook + ": " + (o.text || "(no text)") + "\n    id " + o.id)
        .join("\n");
    });

    cmd("rc-resend", "Send a message from your history again", [["number", "Number from /rc-history", true]], async (a) => {
      const h = history();
      const i = (parseInt(a.number, 10) || 0) - 1;
      if (i < 0 || i >= h.length) return "❌ No history item with that number.";
      const o = h[i];
      if (!o.pl) return "❌ That message cannot be resent.";
      const r = await postTo(o.url, o.pl, "", o.pl.thread_name ? "" : o.thread);
      return r.ok ? "✅ Resent." : "❌ HTTP " + r.code + ": " + r.message;
    });

    cmd("rc-clear-history", "Clear your message history", [], () => {
      storage.history = [];
      return "✅ History cleared.";
    });

    cmd("rc-vars", "List the variables you can use in messages", [], () =>
      [
        "Variables are filled in when a message is sent:",
        "{date} {time} {datetime} {unix} {day} {month} {year}",
        "{random} a short random code",
        "{randint:1-100} a random number",
        "{pick:red|green|blue} a random choice",
      ].join("\n")
    );

    cmd("rc-help", "Show every RandomCord command", [], () =>
      [
        "RandomCord commands (replies are only visible to you)",
        "",
        "SEND\n/rc-send /rc-quick /rc-embed /rc-preview /rc-json /rc-link /rc-hub /rc-poll",
        "MANAGE\n/rc-edit /rc-delete",
        "BATCH\n/rc-bulk /rc-rotate /rc-split",
        "SETTINGS\n/rc-identity /rc-mentions /rc-thread",
        "WEBHOOKS\n/rc-use /rc-save /rc-remove /rc-hooks /rc-health /rc-info /rc-ping",
        "TEMPLATES\n/rc-tpl-save /rc-tpl-send /rc-tpl-list /rc-tpl-delete /rc-vars",
        "HISTORY & BACKUP\n/rc-history /rc-resend /rc-clear-history /rc-export /rc-import",
        "",
        "Start with /rc-use to pick a webhook.",
      ].join("\n")
    );
  }

  return {
    onLoad() {
      registerAll();
    },
    onUnload() {
      unregs.splice(0).forEach((u) => {
        try {
          u();
        } catch (e) {}
      });
    },
  };
})()
