export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
    try {
      if (url.pathname === "/admin") return Response.redirect(env.ADMIN_UI_URL || "https://YOUR-GITHUB-USER.github.io/YOUR-REPO/admin.html", 302);
      if (url.pathname === "/logs" && request.method === "POST") return cors(await saveLogs(request, env));
      if (url.pathname === "/logs" && request.method === "GET") return cors(await getLogs(url, env));
      if (url.pathname === "/report" && request.method === "GET") return cors(await getReport(url, env));
      if (url.pathname === "/report-by-user" && request.method === "GET") return cors(await getReportByUser(url, env));
      if (url.pathname === "/shifts" && request.method === "POST") return cors(await saveShift(request, env));
      if (url.pathname === "/shifts" && request.method === "GET") return cors(await getShifts(url, env));
      if (url.pathname.startsWith("/shifts/") && request.method === "DELETE") return cors(await deleteShift(url, env));
      return cors(json({ error: "not found" }, 404));
    } catch (e) {
      return cors(json({ error: e.message || String(e) }, 500));
    }
  }
};

const HOURLY_RATE = 3000;
const FARE_PER_KM = 500;

function cors(res) {
  const h = new Headers(res.headers);
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type,Authorization");
  return new Response(res.body, { status: res.status, headers: h });
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
}
function monthRange(month) {
  if (!/^\d{4}-\d{2}$/.test(month || "")) throw new Error("month is required: YYYY-MM");
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01T00:00:00.000Z`;
  const next = new Date(Date.UTC(y, m, 1)).toISOString();
  return { start, next };
}
function secondsBetween(a, b) { return Math.max(0, Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 1000)); }
function dateKey(iso) { return iso.slice(0, 10); }

async function saveLogs(request, env) {
  const body = await request.json();
  const logs = Array.isArray(body.logs) ? body.logs : [];
  const stmt = env.DB.prepare(`INSERT INTO logs (session_id, user_id, user_name, time, status, lat, lng, distance, fare, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`);
  const batch = logs.map(l => stmt.bind(l.session_id, l.user_id || "", l.user_name || "", l.time, l.status, l.lat, l.lng, Number(l.distance || 0), Number(l.fare || 0)));
  if (batch.length) await env.DB.batch(batch);
  return json({ ok: true, saved: batch.length });
}

async function getLogs(url, env) {
  const month = url.searchParams.get("month");
  let rows;
  if (month) {
    const { start, next } = monthRange(month);
    rows = await env.DB.prepare(`SELECT * FROM logs WHERE time >= ? AND time < ? ORDER BY time DESC`).bind(start, next).all();
  } else {
    rows = await env.DB.prepare(`SELECT * FROM logs ORDER BY time DESC LIMIT 500`).all();
  }
  return json({ logs: rows.results || [] });
}

async function loadMonthLogs(env, month) {
  const { start, next } = monthRange(month);
  const res = await env.DB.prepare(`SELECT * FROM logs WHERE time >= ? AND time < ? ORDER BY session_id, time ASC`).bind(start, next).all();
  return res.results || [];
}

function buildSummaries(rows) {
  const bySession = new Map();
  for (const r of rows) {
    if (!bySession.has(r.session_id)) bySession.set(r.session_id, []);
    bySession.get(r.session_id).push(r);
  }
  const daily = new Map();
  const users = new Map();
  let totalWork = 0, totalBreak = 0, totalDistance = 0, totalSales = 0;
  for (const [sid, arr] of bySession) {
    arr.sort((a,b)=>new Date(a.time)-new Date(b.time));
    let work = 0, br = 0, distance = 0;
    for (let i=0;i<arr.length;i++) {
      const cur = arr[i], next = arr[i+1];
      if (next) {
        const diff = secondsBetween(cur.time, next.time);
        if (cur.status === "ON") work += diff;
        if (cur.status === "BREAK") br += diff;
      }
      distance += Number(cur.distance || 0);
    }
    const sales = (work / 3600) * HOURLY_RATE + distance * FARE_PER_KM;
    const first = arr[0];
    const dkey = dateKey(first.time);
    const uid = first.user_id || "";
    const uname = first.user_name || "";
    if (!daily.has(dkey)) daily.set(dkey, { date: dkey, work_seconds: 0, break_seconds: 0, sessions: 0, distance: 0, sales: 0 });
    const d = daily.get(dkey); d.work_seconds += work; d.break_seconds += br; d.sessions += 1; d.distance += distance; d.sales += sales;
    if (!users.has(uid)) users.set(uid, { user_id: uid, user_name: uname, work_seconds: 0, break_seconds: 0, sessions: 0, distance: 0, sales: 0 });
    const u = users.get(uid); u.user_name = u.user_name || uname; u.work_seconds += work; u.break_seconds += br; u.sessions += 1; u.distance += distance; u.sales += sales;
    totalWork += work; totalBreak += br; totalDistance += distance; totalSales += sales;
  }
  return { total_work_seconds: totalWork, total_break_seconds: totalBreak, total_sessions: bySession.size, total_distance: totalDistance, total_sales: totalSales, daily: Array.from(daily.values()).sort((a,b)=>a.date.localeCompare(b.date)), users: Array.from(users.values()).sort((a,b)=>String(a.user_id).localeCompare(String(b.user_id))) };
}
async function getReport(url, env) { const month = url.searchParams.get("month"); const rows = await loadMonthLogs(env, month); const s = buildSummaries(rows); return json(s); }
async function getReportByUser(url, env) { const month = url.searchParams.get("month"); const rows = await loadMonthLogs(env, month); const s = buildSummaries(rows); return json({ users: s.users }); }
async function saveShift(request, env) {
  const b = await request.json();
  if (!b.user_id || !b.date || !b.start_time || !b.end_time) throw new Error("shift fields required");
  const res = await env.DB.prepare(`INSERT INTO shifts (user_id, user_name, date, start_time, end_time, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`).bind(b.user_id, b.user_name || "", b.date, b.start_time, b.end_time).run();
  return json({ ok: true, id: res.meta?.last_row_id });
}
async function getShifts(url, env) {
  const month = url.searchParams.get("month");
  if (!month) throw new Error("month required");
  const res = await env.DB.prepare(`SELECT * FROM shifts WHERE date >= ? AND date < ? ORDER BY date ASC, start_time ASC`).bind(`${month}-01`, nextMonthDate(month)).all();
  return json({ shifts: res.results || [] });
}
function nextMonthDate(month) { const [y,m]=month.split("-").map(Number); return new Date(Date.UTC(y,m,1)).toISOString().slice(0,10); }
async function deleteShift(url, env) { const id = url.pathname.split("/").pop(); await env.DB.prepare(`DELETE FROM shifts WHERE id = ?`).bind(id).run(); return json({ ok: true }); }
