export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,POST,OPTIONS,DELETE","Access-Control-Allow-Headers":"Content-Type"};
    if (request.method === "OPTIONS") return new Response(null,{headers:cors});
    try {
      if (url.pathname === "/logs" && request.method === "POST") return withCors(await saveLogs(request, env), cors);
      if (url.pathname === "/logs" && request.method === "GET") return withCors(await getLogs(url, env), cors);
      if (url.pathname === "/report" && request.method === "GET") return withCors(await report(url, env), cors);
      return withCors(json({ok:false,error:"not found"},404), cors);
    } catch (e) {
      return withCors(json({ok:false,error:String(e?.message||e)},500), cors);
    }
  }
};
function withCors(res,cors){Object.entries(cors).forEach(([k,v])=>res.headers.set(k,v));return res}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8"}})}
function toNum(v){return v==null||v===""?null:Number(v)}
async function saveLogs(request, env){const body=await request.json();const logs=Array.isArray(body.logs)?body.logs:[];for(const l of logs){await env.DB.prepare(`INSERT INTO logs (session_id,time,status,lat,lng,user_id,user_name,distance,fare,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(l.session_id,l.time,l.status,toNum(l.lat),toNum(l.lng),l.user_id||"",l.user_name||"",toNum(l.distance),toNum(l.fare),l.created_at||new Date().toISOString()).run()}return json({ok:true,count:logs.length})}
async function getLogs(url, env){const month=url.searchParams.get("month");const user=url.searchParams.get("user_id");let sql="SELECT * FROM logs WHERE 1=1";const params=[];if(month){sql+=" AND substr(time,1,7)=?";params.push(month)}if(user){sql+=" AND user_id=?";params.push(user)}sql+=" ORDER BY time DESC LIMIT 1000";const res=await env.DB.prepare(sql).bind(...params).all();return json({ok:true,logs:res.results||[]})}
function dist(a,b){if(!a||!b||a.lat==null||b.lat==null)return 0;const R=6371,dLat=(b.lat-a.lat)*Math.PI/180,dLng=(b.lng-a.lng)*Math.PI/180,la1=a.lat*Math.PI/180,la2=b.lat*Math.PI/180;const x=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLng/2)**2;return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))}
async function report(url, env){const month=url.searchParams.get("month")||new Date().toISOString().slice(0,7);const user=url.searchParams.get("user_id");const hourly=Number(url.searchParams.get("hourly_rate")||3000);const kmRate=Number(url.searchParams.get("km_rate")||500);let sql="SELECT * FROM logs WHERE substr(time,1,7)=?";const params=[month];if(user){sql+=" AND user_id=?";params.push(user)}sql+=" ORDER BY session_id,time ASC";const rows=(await env.DB.prepare(sql).bind(...params).all()).results||[];const dailyMap=new Map();const sessions=new Set();let work=0, br=0, distance=0;for(let i=0;i<rows.length;i++){const cur=rows[i];sessions.add(cur.session_id);const date=cur.time.slice(0,10);const key=`${date}|${cur.user_id||""}`;if(!dailyMap.has(key))dailyMap.set(key,{date,user_id:cur.user_id,user_name:cur.user_name,work_ms:0,break_ms:0,distance_km:0,sales:0,fare:0,total:0});const d=dailyMap.get(key);const next=rows[i+1];if(next && next.session_id===cur.session_id){const diff=new Date(next.time)-new Date(cur.time);if(cur.status==="ON"){work+=diff;d.work_ms+=diff}if(cur.status==="BREAK"){br+=diff;d.break_ms+=diff}const dk=dist(cur,next);distance+=dk;d.distance_km+=dk}}
let daily=[...dailyMap.values()].map(d=>{d.sales=(d.work_ms/3600000)*hourly;d.fare=d.distance_km*kmRate;d.total=d.sales+d.fare;return d});const sales=(work/3600000)*hourly;const fare=distance*kmRate;const total=sales+fare;return json({ok:true,month,summary:{sessions:sessions.size,work_ms:work,break_ms:br,distance_km:distance,sales,fare,total,avg_unit:sessions.size?total/sessions.size:0},daily,logs:rows})}
