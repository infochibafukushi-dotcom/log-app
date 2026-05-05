export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        time TEXT,
        status TEXT,
        lat REAL,
        lng REAL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    await ensureColumn(env, "logs", "session_id", "TEXT");
    await ensureColumn(env, "logs", "created_at", "TEXT");

    if (url.pathname === "/logs" && request.method === "POST") {
      const data = await request.json();

      if (!Array.isArray(data)) {
        return json({ ok: false, message: "配列データではありません" }, 400, corsHeaders);
      }

      for (const log of data) {
        await env.DB.prepare(
          "INSERT INTO logs (session_id, time, status, lat, lng) VALUES (?, ?, ?, ?, ?)"
        ).bind(
          log.session_id || "",
          log.time || "",
          log.status || "",
          log.lat ?? null,
          log.lng ?? null
        ).run();
      }

      return json({ ok: true, message: "保存OK", count: data.length }, 200, corsHeaders);
    }

    if (url.pathname === "/report" && request.method === "GET") {
      const month = url.searchParams.get("month") || new Date().toISOString().slice(0, 7);
      const start = `${month}-01T00:00:00.000Z`;
      const endDate = nextMonth(month);
      const end = `${endDate}-01T00:00:00.000Z`;

      const result = await env.DB.prepare(
        "SELECT * FROM logs WHERE time >= ? AND time < ? ORDER BY time ASC"
      ).bind(start, end).all();

      const logs = result.results || [];
      const report = buildReport(logs);

      return json(report, 200, corsHeaders);
    }

    if (url.pathname === "/logs" && request.method === "GET") {
      const result = await env.DB.prepare("SELECT * FROM logs ORDER BY id DESC LIMIT 300").all();
      return json({ ok: true, logs: result.results || [] }, 200, corsHeaders);
    }

    const result = await env.DB.prepare("SELECT * FROM logs ORDER BY id DESC LIMIT 50").all();
    return json({
      ok: true,
      message: "timecard API",
      endpoints: ["/logs", "/report?month=YYYY-MM"],
      latest: result.results || []
    }, 200, corsHeaders);
  }
};

async function ensureColumn(env, tableName, columnName, columnType) {
  const info = await env.DB.prepare(`PRAGMA table_info(${tableName})`).all();
  const exists = (info.results || []).some(col => col.name === columnName);
  if (!exists) {
    await env.DB.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`).run();
  }
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" }
  });
}

function nextMonth(month) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function buildReport(logs) {
  const byDay = {};
  const sessions = new Set();
  let work = 0;
  let rest = 0;

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    const day = (log.time || "").slice(0, 10);

    if (!byDay[day]) {
      byDay[day] = {
        date: day,
        sessionIds: new Set(),
        work_minutes: 0,
        break_minutes: 0,
        log_count: 0
      };
    }

    byDay[day].log_count += 1;
    if (log.session_id) {
      sessions.add(log.session_id);
      byDay[day].sessionIds.add(log.session_id);
    }

    if (i < logs.length - 1) {
      const next = logs[i + 1];

      if (log.session_id && next.session_id && log.session_id !== next.session_id) {
        continue;
      }

      const diff = Math.max(0, Math.floor((new Date(next.time) - new Date(log.time)) / 1000 / 60));

      if (log.status === "ON") {
        work += diff;
        byDay[day].work_minutes += diff;
      }

      if (log.status === "BREAK") {
        rest += diff;
        byDay[day].break_minutes += diff;
      }
    }
  }

  const daily = Object.values(byDay).map(d => ({
    date: d.date,
    session_count: d.sessionIds.size,
    work_minutes: d.work_minutes,
    break_minutes: d.break_minutes,
    log_count: d.log_count
  }));

  return {
    ok: true,
    meta: { generated_at: new Date().toISOString() },
    summary: {
      session_count: sessions.size,
      work_minutes: work,
      break_minutes: rest,
      log_count: logs.length
    },
    daily,
    logs
  };
}
