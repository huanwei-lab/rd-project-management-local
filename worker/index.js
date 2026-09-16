const page=Uint8Array.from(atob("__APP_HTML_BASE64__"),c=>c.charCodeAt(0));
const initialUsers=[
  ["kurtche0224@gmail.com","Yencheng Lin","admin"],
  ["feyza.su@kuentong.com","Feyza","member"],
  ["william.wu@kuentong.com","William","member"],
  ["teresa.yu@kuentong.com","Teresa","member"],
  ["benson.li@kuentong.com","Benson","member"],
  ["brian.lai@kuentong.com","伯承","member"],
  ["topentree@gmail.com","伯承","member"],
  ["wei-chih.lin@kuentong.com","威志","member"],
  ["kenny.li@kuentong.com","羿徵","member"]
];
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function identity(request){
  const email=(request.headers.get("oai-authenticated-user-email")||"").trim().toLowerCase();
  const userId=request.headers.get("oai-authenticated-user-id")||"";
  return {email,userId};
}
async function bootstrapUsers(db){
  const now=new Date().toISOString();
  await db.batch(initialUsers.map(([email,name,role])=>db.prepare("INSERT OR IGNORE INTO rd_app_users (email,display_name,access_role,created_at) VALUES (?,?,?,?)").bind(email,name,role,now)));
}
async function getUser(db,email){
  if(!email)return null;
  return db.prepare("SELECT email, display_name AS displayName, access_role AS accessRole FROM rd_app_users WHERE email=?").bind(email).first();
}
function validState(value){
  return value&&Array.isArray(value.projects)&&value.projects.length>0&&value.projects.every(p=>p&&typeof p.id==="string"&&typeof p.name==="string"&&p.members&&Array.isArray(p.tasks));
}
function projectAllowed(oldProject,newProject,user){
  const assignedRoles=Object.keys(oldProject.members||{}).filter(role=>(oldProject.members[role]||"").trim()===user.displayName);
  if(assignedRoles.includes("PM")||assignedRoles.includes("PE"))return true;
  if(!assignedRoles.length)return same(oldProject,newProject);
  const oldBase={...oldProject,tasks:undefined},newBase={...newProject,tasks:undefined};
  if(!same(oldBase,newBase)||oldProject.tasks.length!==newProject.tasks.length)return false;
  const oldTasks=new Map(oldProject.tasks.map(t=>[t.id,t]));
  return newProject.tasks.every(t=>{
    const before=oldTasks.get(t.id);
    if(!before)return false;
    return assignedRoles.includes(before.role)?before.role===t.role:same(before,t);
  });
}
function changeAllowed(previous,next,user){
  if(user.accessRole==="admin")return true;
  if(!validState(previous)||!validState(next)||previous.projects.length!==next.projects.length)return false;
  const newProjects=new Map(next.projects.map(p=>[p.id,p]));
  return previous.projects.every(p=>newProjects.has(p.id)&&projectAllowed(p,newProjects.get(p.id),user));
}
async function api(request,env,url){
  if(!env.DB)return json({error:"資料庫尚未連線"},503);
  await bootstrapUsers(env.DB);
  const auth=identity(request),user=await getUser(env.DB,auth.email);
  if(!user)return json({error:"此帳號尚未加入專案系統",email:auth.email||null},403);
  if(url.pathname==="/api/session")return json({user});
  if(url.pathname!=="/api/state")return json({error:"找不到此功能"},404);
  if(request.method==="GET"){
    const row=await env.DB.prepare("SELECT json,updated_at AS updatedAt,updated_by AS updatedBy FROM rd_app_state WHERE key='main'").first();
    return row?json({state:JSON.parse(row.json),updatedAt:row.updatedAt,updatedBy:row.updatedBy}):json({empty:true,user});
  }
  if(request.method!=="PUT")return json({error:"不支援此操作"},405);
  const origin=request.headers.get("origin");
  if(origin&&origin!==url.origin)return json({error:"來源驗證失敗"},403);
  let next;try{next=await request.json()}catch{return json({error:"資料格式錯誤"},400)}
  if(!validState(next))return json({error:"專案資料格式錯誤"},400);
  const current=await env.DB.prepare("SELECT json FROM rd_app_state WHERE key='main'").first();
  if(!current&&user.accessRole!=="admin")return json({error:"請由管理者先建立共用資料"},403);
  const previous=current?JSON.parse(current.json):null;
  if(current&&!changeAllowed(previous,next,user))return json({error:"你只能修改自己負責的任務；PM／PE 可管理自己負責的專案"},403);
  const now=new Date().toISOString(),body=JSON.stringify(next);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO rd_app_state (key,json,updated_at,updated_by) VALUES ('main',?,?,?) ON CONFLICT(key) DO UPDATE SET json=excluded.json,updated_at=excluded.updated_at,updated_by=excluded.updated_by").bind(body,now,user.email),
    env.DB.prepare("INSERT INTO rd_audit_log (email,action,created_at) VALUES (?,?,?)").bind(user.email,current?"update_state":"initialize_state",now)
  ]);
  return json({ok:true,updatedAt:now,updatedBy:user.email});
}
export default{
  async fetch(request,env,ctx){
    void ctx;
    const url=new URL(request.url);
    try{
      if(url.pathname.startsWith("/api/"))return await api(request,env,url);
      if(url.pathname!=="/")return new Response("Not found",{status:404});
      return new Response(page,{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}});
    }catch(error){
      console.error("request failed",error);
      return url.pathname.startsWith("/api/")?json({error:"服務暫時無法使用"},500):new Response("服務暫時無法使用",{status:500});
    }
  }
};
