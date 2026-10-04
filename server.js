require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const QRCode = require("qrcode");

const app = express();
app.set("trust proxy", 1);
app.use(express.json({limit:"2mb"}));
app.use(express.urlencoded({extended:true}));
app.use(express.static(path.join(__dirname,"public")));
app.use("/api", (req,res,next)=>{ res.set("Cache-Control","no-store"); next(); });
app.use((req,res,next)=>{ res.set("X-Content-Type-Options","nosniff"); res.set("Referrer-Policy","strict-origin-when-cross-origin"); next(); });

const pool = new Pool({connectionString: process.env.DATABASE_URL});
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-change-me";
const PORT = Number(process.env.PORT || 3000);

const DEFAULT_PERMS = {
  add_repair:true, view_repairs:true, edit_repair:true, change_status:true,
  customers:true, edit_customers:true, inventory:true, accounts:false,
  profits:false, reports:false, delete_repairs:false, delete_customers:false,
  users:false, settings:false, activity_logs:false, backups:false
};
const STATUSES = ["قيد الاصلاح","تم اصلاحه","لايصلح"];

async function q(text, params=[]){ return (await pool.query(text,params)).rows; }
async function one(text, params=[]){ return (await pool.query(text,params)).rows[0]; }
async function init(){
  const schema=fs.readFileSync(path.join(__dirname,"db","schema.sql"),"utf8");
  await pool.query(schema);
  await pool.query("ALTER TABLE repair_orders ADD COLUMN IF NOT EXISTS supplier VARCHAR(80)");
  await pool.query(`CREATE TABLE IF NOT EXISTS supplier_purchases (
    id BIGSERIAL PRIMARY KEY, supplier VARCHAR(80) NOT NULL, items JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0, paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '', created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query("ALTER TABLE repair_orders ADD COLUMN IF NOT EXISTS customer_received BOOLEAN NOT NULL DEFAULT FALSE");
  await pool.query("ALTER TABLE repair_orders ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ");
  await pool.query("ALTER TABLE repair_orders ADD COLUMN IF NOT EXISTS received_by BIGINT");
  // Preserve legacy "تم التسليم" records as already received before normalizing statuses.
  await pool.query("UPDATE repair_orders SET customer_received=TRUE, received_at=COALESCE(received_at, updated_at, created_at) WHERE status='تم التسليم'");
  await pool.query("UPDATE repair_orders SET status=CASE WHEN status IN ('تم الإصلاح','جاهز للتسليم','تم التسليم') THEN 'تم اصلاحه' WHEN status='لايصلح' THEN 'لايصلح' ELSE 'قيد الاصلاح' END WHERE status NOT IN ('قيد الاصلاح','تم اصلاحه','لايصلح')");
  await pool.query("UPDATE repair_status_history SET status=CASE WHEN status IN ('تم الإصلاح','جاهز للتسليم','تم التسليم') THEN 'تم اصلاحه' WHEN status='لايصلح' THEN 'لايصلح' ELSE 'قيد الاصلاح' END WHERE status NOT IN ('قيد الاصلاح','تم اصلاحه','لايصلح')");
  const exists=await one("SELECT id FROM users LIMIT 1");
  if(!exists){
    const hash=await bcrypt.hash("Admin@12345",12);
    await pool.query("INSERT INTO users(username,full_name,password_hash,role,permissions) VALUES($1,$2,$3,'manager',$4)",
      ["admin","المدير الرئيسي",hash,JSON.stringify(Object.fromEntries(Object.keys(DEFAULT_PERMS).map(k=>[k,true])))]);
    await pool.query("INSERT INTO settings(key,value) VALUES ('shop', $1) ON CONFLICT(key) DO NOTHING",
      [JSON.stringify({name:"BN SMART",phone:"0668069475",whatsapp:"0668069475",address:"غرداية- كارفور مرغوب- بجانب الجزار"})]);
  }
  // Keep the customer-facing shop brand fixed to BN SMART.
  const shopRow=await one("SELECT value FROM settings WHERE key='shop'");
  const shopValue=shopRow?.value && typeof shopRow.value==='object' ? shopRow.value : {};
  const fixedShop={...shopValue,name:"BN SMART"};
  if(!shopRow || shopValue.name!=="BN SMART") {
    await pool.query("INSERT INTO settings(key,value) VALUES('shop',$1) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",[JSON.stringify(fixedShop)]);
  }
}
function auth(req,res,next){
  const h=req.headers.authorization||"";
  const token=h.startsWith("Bearer ")?h.slice(7):null;
  if(!token)return res.status(401).json({error:"تسجيل الدخول مطلوب"});
  try{req.user=jwt.verify(token,JWT_SECRET);next()}catch(e){res.status(401).json({error:"الجلسة غير صالحة"})}
}
function manager(req,res,next){ if(req.user.role!=="manager")return res.status(403).json({error:"هذه العملية للمدير فقط"}); next(); }
function can(permission){return (req,res,next)=>{ if(req.user.role==="manager" || req.user.permissions?.[permission]) return next(); res.status(403).json({error:"لا تملك هذه الصلاحية"}); }}
async function log(userId,action,repairId=null,details={}){await pool.query("INSERT INTO activity_logs(user_id,action,repair_id,details) VALUES($1,$2,$3,$4)",[userId,action,repairId,JSON.stringify(details)])}

app.post("/api/auth/login",async(req,res)=>{
  try{
    const {username,password}=req.body;
    const u=await one("SELECT * FROM users WHERE username=$1",[username]);
    if(!u || !u.active || !(await bcrypt.compare(password||"",u.password_hash))) return res.status(401).json({error:"اسم المستخدم أو كلمة المرور غير صحيحة"});
    await pool.query("UPDATE users SET last_login=NOW() WHERE id=$1",[u.id]);
    const permissions=u.role==="manager"?Object.fromEntries(Object.keys(DEFAULT_PERMS).map(k=>[k,true])):{...DEFAULT_PERMS,...u.permissions};
    const token=jwt.sign({id:u.id,username:u.username,full_name:u.full_name,role:u.role,permissions},JWT_SECRET,{expiresIn:"30d"});
    res.json({token,user:{id:u.id,username:u.username,full_name:u.full_name,role:u.role,permissions}});
  }catch(e){res.status(500).json({error:"خطأ في الخادم"})}
});
app.get("/api/auth/me",auth,(req,res)=>res.json({user:req.user}));
app.get("/health",(req,res)=>res.json({ok:true,service:"BN SMART"}));

app.get("/api/dashboard",auth,can("view_repairs"),async(req,res)=>{
  const stats=await one(`SELECT
    COUNT(*) FILTER(WHERE status='قيد الاصلاح') AS in_repair,
    COUNT(*) FILTER(WHERE status='تم اصلاحه') AS repaired,
    COUNT(*) FILTER(WHERE status='لايصلح') AS not_repairable,
    COUNT(*) FILTER(WHERE created_at::date=CURRENT_DATE) AS received_today,
    COUNT(*) FILTER(WHERE customer_received=TRUE) AS customer_received_count,
    COALESCE(SUM(paid_amount),0) AS revenue,
    COALESCE(SUM(expected_price-part_cost) FILTER(WHERE customer_received=TRUE),0) AS profit,
    COALESCE(SUM(expected_price-paid_amount),0) AS remaining
    FROM repair_orders`);
  const recent=await q(`SELECT r.*,c.name customer_name,c.phone FROM repair_orders r JOIN customers c ON c.id=r.customer_id ORDER BY r.created_at DESC LIMIT 8`);
  const statuses=await q("SELECT status,COUNT(*) count FROM repair_orders GROUP BY status");
  res.json({stats,recent,statuses});
});

app.get("/api/reports/daily",auth,can("reports"),async(req,res)=>{
  try{
    const period=String(req.query.period||"30");
    let where="";
    const params=[];
    if(period!=="all"){
      const days=Math.max(1,Math.min(3650,Number(period)||30));
      params.push(days);
      where=`WHERE r.created_at >= CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day'`;
    }
    const rows=await q(`SELECT r.created_at::date AS day, COUNT(*)::int AS repairs_count,
      COALESCE(SUM(r.paid_amount),0)::numeric AS paid,
      COALESCE(SUM(r.expected_price-r.part_cost) FILTER (WHERE r.customer_received=TRUE),0)::numeric AS profit
      FROM repair_orders r ${where}
      GROUP BY r.created_at::date ORDER BY repairs_count DESC, day DESC`,params);
    const total=rows.reduce((n,r)=>n+Number(r.repairs_count||0),0);
    const totalPaid=rows.reduce((n,r)=>n+Number(r.paid||0),0);
    const totalProfit=rows.reduce((n,r)=>n+Number(r.profit||0),0);
    const daysSpan=period==="all"?Math.max(rows.length,1):Math.max(1,Number(period)||30);
    res.json({
      total_repairs: total,
      total_paid: totalPaid,
      total_profit: totalProfit,
      average_daily_repairs: total/daysSpan,
      days: rows.map(r=>({...r,percent: total?Number(r.repairs_count)*100/total:0}))
    });
  }catch(e){console.error(e);res.status(500).json({error:"تعذر تحميل تقرير الأيام"})}
});

app.get("/api/repairs",auth,can("view_repairs"),async(req,res)=>{
  const {search="",status=""}=req.query;
  const params=[];let where=[];
  if(status){params.push(status);where.push(`r.status=$${params.length}`)}
  if(search){params.push(`%${search}%`);where.push(`(r.receipt_no::text ILIKE $${params.length} OR r.tracking_code ILIKE $${params.length} OR c.name ILIKE $${params.length} OR c.phone ILIKE $${params.length} OR r.brand ILIKE $${params.length} OR r.model ILIKE $${params.length})`)}
  const sql=`SELECT r.*,c.name customer_name,c.phone customer_phone,u.full_name created_by_name
             FROM repair_orders r JOIN customers c ON c.id=r.customer_id LEFT JOIN users u ON u.id=r.created_by
             ${where.length?"WHERE "+where.join(" AND "):""} ORDER BY r.created_at DESC`;
  res.json(await q(sql,params));
});
app.get("/api/repairs/:id",auth,can("view_repairs"),async(req,res)=>{
  const r=await one(`SELECT r.*,c.name customer_name,c.phone customer_phone,c.id customer_id,
    cu.full_name created_by_name,uu.full_name updated_by_name
    FROM repair_orders r JOIN customers c ON c.id=r.customer_id
    LEFT JOIN users cu ON cu.id=r.created_by LEFT JOIN users uu ON uu.id=r.updated_by WHERE r.id=$1`,[req.params.id]);
  if(!r)return res.status(404).json({error:"الإصلاح غير موجود"});
  r.history=await q(`SELECT h.*,u.full_name changed_by_name FROM repair_status_history h LEFT JOIN users u ON u.id=h.changed_by WHERE repair_id=$1 ORDER BY h.created_at`,[req.params.id]);
  r.payments=await q(`SELECT p.*,u.full_name recorded_by_name FROM payments p LEFT JOIN users u ON u.id=p.recorded_by WHERE repair_id=$1 ORDER BY p.created_at DESC`,[req.params.id]);
  r.parts=await q(`SELECT rp.*,sp.name part_name FROM repair_parts rp JOIN spare_parts sp ON sp.id=rp.part_id WHERE rp.repair_id=$1`,[req.params.id]);
  res.json(r);
});

app.post("/api/repairs",auth,can("add_repair"),async(req,res)=>{
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const b=req.body;
    const customerName=String(b.customerName||"عميل").trim()||"عميل";
    const phone=String(b.phone||"").trim();
    let customerId;
    // Never rename an existing customer when creating a new repair.
    // Empty phone numbers never match another customer.
    if(phone){
      const c=await client.query("SELECT id FROM customers WHERE phone=$1 ORDER BY id LIMIT 1",[phone]);
      if(c.rows[0]) customerId=c.rows[0].id;
      else customerId=(await client.query("INSERT INTO customers(name,phone) VALUES($1,$2) RETURNING id",[customerName,phone])).rows[0].id;
    }else{
      customerId=(await client.query("INSERT INTO customers(name,phone) VALUES($1,$2) RETURNING id",[customerName,""])).rows[0].id;
    }
    await client.query("SELECT pg_advisory_xact_lock(1842026)");
    const last=await client.query("SELECT COALESCE(MAX(receipt_no),184)+1 n FROM repair_orders");
    const no=last.rows[0].n, tracking="QF-"+String(no).padStart(4,"0");
    const r=(await client.query(`INSERT INTO repair_orders(receipt_no,tracking_code,customer_id,brand,model,color,serial_no,power_state,fault,diagnosis,expected_price,paid_amount,part_cost,labor_fee,status,accessories,accessory_notes,notes,supplier,created_by,updated_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'قيد الاصلاح',$15,$16,$17,$18,$19,$19) RETURNING *`,
      [no,tracking,customerId,b.brand,b.model,b.color,null,b.power,b.fault,b.diagnosis,Number(b.price)||0,Number(b.paid)||0,Number(b.partCost)||0,Math.max(0,(Number(b.price)||0)-(Number(b.partCost)||0)),JSON.stringify(b.accessories||[]),b.accessoryNotes||"",b.notes||"",b.supplier||"",req.user.id])).rows[0];
    await client.query("INSERT INTO repair_status_history(repair_id,status,changed_by) VALUES($1,$2,$3)",[r.id,r.status,req.user.id]);
    await client.query("COMMIT");
    await log(req.user.id,"إضافة وصل",r.id,{receipt_no:no});
    res.status(201).json(r);
  }catch(e){await client.query("ROLLBACK");console.error(e);res.status(500).json({error:"تعذر إنشاء الوصل"})}finally{client.release()}
});

app.patch("/api/repairs/:id",auth,can("edit_repair"),async(req,res)=>{
  const b=req.body;
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const existing=await client.query("SELECT * FROM repair_orders WHERE id=$1 FOR UPDATE",[req.params.id]);
    if(!existing.rows[0]){await client.query("ROLLBACK");return res.status(404).json({error:"غير موجود"})}
    const old=existing.rows[0];
    let customerId=old.customer_id;
    if(b.customerName!==undefined || b.phone!==undefined){
      const oldCustomer=(await client.query("SELECT id,name,phone FROM customers WHERE id=$1",[old.customer_id])).rows[0];
      const newName=String(b.customerName===undefined?(oldCustomer?.name||"عميل"):b.customerName).trim()||"عميل";
      const newPhone=String(b.phone===undefined?(oldCustomer?.phone||""):b.phone).trim();
      const oldName=String(oldCustomer?.name||"").trim();
      const oldPhone=String(oldCustomer?.phone||"").trim();
      if(newName!==oldName || newPhone!==oldPhone){
        // Never mutate a shared customer record when editing one repair.
        const same=await client.query("SELECT id FROM customers WHERE name=$1 AND phone=$2 ORDER BY id LIMIT 1",[newName,newPhone]);
        if(same.rows[0]) customerId=same.rows[0].id;
        else customerId=(await client.query("INSERT INTO customers(name,phone) VALUES($1,$2) RETURNING id",[newName,newPhone])).rows[0].id;
      }
    }
    const r=(await client.query(`UPDATE repair_orders SET
      customer_id=$1,
      brand=COALESCE($2,brand),model=COALESCE($3,model),color=COALESCE($4,color),
      power_state=COALESCE($5,power_state),fault=COALESCE($6,fault),diagnosis=COALESCE($7,diagnosis),
      expected_price=COALESCE($8,expected_price),paid_amount=COALESCE($9,paid_amount),part_cost=COALESCE($10,part_cost),
      labor_fee=GREATEST(0, COALESCE($8,expected_price)-COALESCE($10,part_cost)),
      accessories=COALESCE($11,accessories),accessory_notes=COALESCE($12,accessory_notes),
      notes=COALESCE($13,notes),supplier=COALESCE($14,supplier),updated_by=$15,updated_at=NOW() WHERE id=$16 RETURNING *`,
      [customerId,b.brand,b.model,b.color, b.power,b.fault,b.diagnosis,
       b.price==null?null:Number(b.price),b.paid==null?null:Number(b.paid),b.partCost==null?null:Number(b.partCost),
       b.accessories==null?null:JSON.stringify(b.accessories),b.accessoryNotes,b.notes,b.supplier,req.user.id,req.params.id])).rows[0];
    await client.query("COMMIT");
    await log(req.user.id,"تعديل بيانات الوصل",r.id,{changed_fields:Object.keys(b)});
    res.json(r);
  }catch(e){await client.query("ROLLBACK");console.error(e);res.status(500).json({error:"تعذر تعديل الوصل"})}finally{client.release()}
});

app.delete("/api/repairs/:id",auth,can("delete_repairs"),async(req,res)=>{
  try{
    const r=await one("SELECT id,receipt_no,tracking_code FROM repair_orders WHERE id=$1",[req.params.id]);
    if(!r)return res.status(404).json({error:"الوصل غير موجود"});
    await log(req.user.id,"حذف الوصل",r.id,{receipt_no:r.receipt_no,tracking_code:r.tracking_code});
    await pool.query("DELETE FROM repair_orders WHERE id=$1",[r.id]);
    res.json({ok:true});
  }catch(e){console.error(e);res.status(500).json({error:"تعذر حذف الوصل"})}
});

app.patch("/api/repairs/:id/status",auth,can("change_status"),async(req,res)=>{
  const status=req.body.status;
  if(!STATUSES.includes(status))return res.status(400).json({error:"حالة غير صالحة"});
  const r=await one("UPDATE repair_orders SET status=$1,updated_by=$2,updated_at=NOW() WHERE id=$3 RETURNING *",[status,req.user.id,req.params.id]);
  if(!r)return res.status(404).json({error:"غير موجود"});
  await q("INSERT INTO repair_status_history(repair_id,status,changed_by) VALUES($1,$2,$3)",[r.id,status,req.user.id]);
  await log(req.user.id,"تغيير حالة الإصلاح",r.id,{status});
  res.json(r);
});

app.patch("/api/repairs/:id/received",auth,can("edit_repair"),async(req,res)=>{
  try{
    // Ensure the migration exists even when an older Render database is still running.
    await pool.query("ALTER TABLE repair_orders ADD COLUMN IF NOT EXISTS customer_received BOOLEAN NOT NULL DEFAULT FALSE");
    await pool.query("ALTER TABLE repair_orders ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ");
    const raw=req.body?.received;
    const received = raw===true || raw==="true" || raw===1 || raw==="1";
    const r=await one(
      `UPDATE repair_orders
       SET customer_received=$1,
           received_at=CASE WHEN $1 THEN COALESCE(received_at,NOW()) ELSE NULL END,
           updated_by=$2, updated_at=NOW()
       WHERE id=$3 RETURNING *`,
      [received,req.user.id,req.params.id]
    );
    if(!r)return res.status(404).json({error:"الوصل غير موجود"});
    // Logging must never turn a successful status update into a 500 response.
    try{
      await log(req.user.id,received?"تم استلام الجهاز من طرف الزبون":"إلغاء تأكيد استلام الجهاز",r.id,{customer_received:received});
    }catch(logErr){ console.error("pickup log error:",logErr); }
    res.json(r);
  }catch(e){
    console.error("pickup update error:",e);
    res.status(500).json({error:"تعذر تحديث حالة الاستلام",detail:process.env.NODE_ENV==="production"?undefined:e.message});
  }
});

app.post("/api/repairs/:id/payments",auth,can("edit_repair"),async(req,res)=>{
  const amount=Number(req.body.amount)||0;
  if(amount<=0)return res.status(400).json({error:"قيمة الدفعة غير صحيحة"});
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const r=(await client.query("UPDATE repair_orders SET paid_amount=paid_amount+$1,updated_by=$2,updated_at=NOW() WHERE id=$3 RETURNING *",[amount,req.user.id,req.params.id])).rows[0];
    if(!r){await client.query("ROLLBACK");return res.status(404).json({error:"غير موجود"})}
    await client.query("INSERT INTO payments(repair_id,amount,recorded_by) VALUES($1,$2,$3)",[r.id,amount,req.user.id]);
    await client.query("COMMIT");await log(req.user.id,"تسجيل دفعة",r.id,{amount});res.json(r);
  }catch(e){await client.query("ROLLBACK");res.status(500).json({error:"تعذر تسجيل الدفعة"})}finally{client.release()}
});

app.get("/api/customers",auth,can("customers"),async(req,res)=>{
  res.json(await q(`SELECT c.id,c.name,c.phone,COUNT(r.id)::int repairs_count,COALESCE(SUM(r.paid_amount),0) paid,COALESCE(SUM(r.expected_price-r.paid_amount),0) remaining,MAX(r.created_at) last_visit
  FROM customers c LEFT JOIN repair_orders r ON r.customer_id=c.id GROUP BY c.id ORDER BY last_visit DESC NULLS LAST`));
});

app.post("/api/auth/change-password", auth, async(req,res)=>{
  const {currentPassword,newPassword}=req.body||{};
  if(!currentPassword || !newPassword) return res.status(400).json({error:"يرجى إدخال كلمة المرور الحالية والجديدة"});
  if(String(newPassword).length < 8) return res.status(400).json({error:"كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل"});
  const u=await one("SELECT * FROM users WHERE id=$1",[req.user.id]);
  if(!u || !u.active || !(await bcrypt.compare(String(currentPassword),u.password_hash))) return res.status(400).json({error:"كلمة المرور الحالية غير صحيحة"});
  const hash=await bcrypt.hash(String(newPassword),12);
  await pool.query("UPDATE users SET password_hash=$1 WHERE id=$2",[hash,u.id]);
  await log(req.user.id,"تغيير كلمة المرور",null);
  res.json({ok:true});
});

app.get("/api/users",auth,manager,async(req,res)=>{
  res.json(await q("SELECT id,username,full_name,phone,role,active,permissions,last_login,created_at FROM users ORDER BY id"));
});
app.post("/api/users",auth,manager,async(req,res)=>{
  const b=req.body;if(!b.username||!b.fullName||!b.password)return res.status(400).json({error:"البيانات الأساسية مطلوبة"});
  const hash=await bcrypt.hash(b.password,12);
  const permissions={...DEFAULT_PERMS,...(b.permissions||{})};
  try{
    const u=await one("INSERT INTO users(username,full_name,phone,password_hash,role,permissions) VALUES($1,$2,$3,$4,'collaborator',$5) RETURNING id,username,full_name,phone,role,active,permissions",
      [b.username,b.fullName,b.phone||"",hash,JSON.stringify(permissions)]);
    await log(req.user.id,"إضافة متعاون",null,{username:b.username});res.status(201).json(u);
  }catch(e){res.status(409).json({error:"اسم المستخدم مستخدم بالفعل"})}
});
app.patch("/api/users/:id",auth,manager,async(req,res)=>{
  const b=req.body;let u=await one("SELECT * FROM users WHERE id=$1",[req.params.id]);if(!u)return res.status(404).json({error:"المستخدم غير موجود"});
  const username=b.username==null?u.username:String(b.username).trim();
  if(!username)return res.status(400).json({error:"اسم المستخدم مطلوب"});
  const role=b.role==null?u.role:String(b.role);
  if(!["manager","collaborator"].includes(role))return res.status(400).json({error:"الدور غير صالح"});
  const active=b.active==null?u.active:Boolean(b.active);
  if((u.role!==role || u.active!==active) && (u.role==="manager") && (role!=="manager" || !active)){
    const count=Number((await one("SELECT COUNT(*)::int n FROM users WHERE role='manager' AND active=true"))?.n||0);
    if(count<=1)return res.status(400).json({error:"يجب أن يبقى مدير واحد فعّال على الأقل"});
  }
  const perms=role==="manager"?JSON.stringify(Object.fromEntries(Object.keys(DEFAULT_PERMS).map(k=>[k,true]))):JSON.stringify(b.permissions?{...DEFAULT_PERMS,...b.permissions}:u.permissions||{});
  const passwordHash=b.password?await bcrypt.hash(b.password,12):u.password_hash;
  try{
    u=await one("UPDATE users SET username=$1,full_name=COALESCE($2,full_name),phone=COALESCE($3,phone),role=$4,active=$5,permissions=$6,password_hash=$7 WHERE id=$8 RETURNING id,username,full_name,phone,role,active,permissions,last_login",
      [username,b.fullName,b.phone,role,active,perms,passwordHash,req.params.id]);
    await log(req.user.id,"تعديل حساب مستخدم",null,{user_id:u.id,username:u.username,role:u.role});res.json(u);
  }catch(e){
    if(e && e.code==="23505") return res.status(409).json({error:"اسم المستخدم مستخدم بالفعل"});
    console.error(e);res.status(500).json({error:"تعذر تعديل الحساب"});
  }
});
app.post("/api/users/:id/password",auth,manager,async(req,res)=>{
  const b=req.body||{};
  if(!b.newPassword || String(b.newPassword).length<8)return res.status(400).json({error:"كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل"});
  const u=await one("SELECT id,username,role FROM users WHERE id=$1",[req.params.id]);
  if(!u)return res.status(404).json({error:"المستخدم غير موجود"});
  const hash=await bcrypt.hash(String(b.newPassword),12);
  await pool.query("UPDATE users SET password_hash=$1 WHERE id=$2",[hash,u.id]);
  await log(req.user.id,"تغيير كلمة مرور مستخدم",null,{user_id:u.id,username:u.username});
  res.json({ok:true});
});
app.put("/api/users/:id/password",auth,manager,async(req,res)=>{
  const b=req.body||{};
  if(!b.newPassword || String(b.newPassword).length<8)return res.status(400).json({error:"كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل"});
  const u=await one("SELECT id,username,role FROM users WHERE id=$1",[req.params.id]);
  if(!u)return res.status(404).json({error:"المستخدم غير موجود"});
  try{
    const hash=await bcrypt.hash(String(b.newPassword),12);
    await pool.query("UPDATE users SET password_hash=$1 WHERE id=$2",[hash,u.id]);
    await log(req.user.id,"تغيير كلمة مرور مستخدم",null,{user_id:u.id,username:u.username});
    res.json({ok:true});
  }catch(e){console.error(e);res.status(500).json({error:"تعذر تغيير كلمة المرور"})}
});

app.delete("/api/users/:id",auth,manager,async(req,res)=>{
  if(Number(req.params.id)===req.user.id)return res.status(400).json({error:"لا يمكنك حذف حسابك الحالي"});
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const u=(await client.query("SELECT id,username,full_name,role FROM users WHERE id=$1 FOR UPDATE",[req.params.id])).rows[0];
    if(!u)return res.status(404).json({error:"المستخدم غير موجود"});
    if(u.role==="manager") {
      const managers=Number((await client.query("SELECT COUNT(*)::int n FROM users WHERE role='manager' AND active=true AND id<>$1",[u.id])).rows[0].n||0);
      if(managers<1)return res.status(403).json({error:"لا يمكن حذف المدير الوحيد. يجب أن يوجد مدير آخر فعّال أولًا"});
    }
    const label=`${u.full_name} (${u.username})`;
    await client.query("UPDATE activity_logs SET user_id=NULL, details=jsonb_set(COALESCE(details,'{}'::jsonb), '{deleted_user_name}', to_jsonb($1::text), true) WHERE user_id=$2",[label,u.id]);
    await client.query("UPDATE repair_orders SET created_by=NULL, updated_by=NULL WHERE created_by=$1 OR updated_by=$1",[u.id]);
    await client.query("UPDATE repair_status_history SET changed_by=NULL WHERE changed_by=$1",[u.id]);
    await client.query("UPDATE payments SET recorded_by=NULL WHERE recorded_by=$1",[u.id]);
    await client.query("UPDATE repair_parts SET added_by=NULL WHERE added_by=$1",[u.id]);
    await client.query("UPDATE inventory_transactions SET performed_by=NULL WHERE performed_by=$1",[u.id]);
    await client.query("UPDATE notifications SET created_by=NULL WHERE created_by=$1",[u.id]);
    await client.query("DELETE FROM users WHERE id=$1",[u.id]);
    await client.query("INSERT INTO activity_logs(user_id,action,details) VALUES($1,$2,$3)",[req.user.id,"حذف حساب متعاون",JSON.stringify({deleted_user_id:u.id,deleted_user_name:label})]);
    await client.query("COMMIT");
    res.json({ok:true});
  }catch(e){await client.query("ROLLBACK");console.error(e);res.status(500).json({error:e?.code==="23503"?"لا يمكن حذف هذا الحساب بسبب ارتباط بيانات به":"تعذر حذف الحساب"});}
  finally{client.release()}
});
app.get("/api/activity",auth,manager,async(req,res)=>{
  res.json(await q(`SELECT a.*,u.full_name user_name,r.receipt_no FROM activity_logs a LEFT JOIN users u ON u.id=a.user_id LEFT JOIN repair_orders r ON r.id=a.repair_id ORDER BY a.created_at DESC LIMIT 300`));
});

const SUPPLIER_NAMES=["BN SMART","MONTEL","AABIDIN","HASSAN","RAHT ELBAL"];
const SUPPLIER_ITEMS=["LCD","BAT","NAP CHARGE","GLASS","SERSOU","CONCTOUR"];
app.get("/api/suppliers",auth,can("inventory"),async(req,res)=>{
  try{const rows=await q(`SELECT supplier,COUNT(*)::int purchases_count,COALESCE(SUM(total_amount),0)::numeric total,COALESCE(SUM(paid_amount),0)::numeric paid,COALESCE(SUM(total_amount-paid_amount),0)::numeric remaining,MAX(created_at) last_purchase FROM supplier_purchases GROUP BY supplier`);const by=new Map(rows.map(r=>[r.supplier,r]));res.json(SUPPLIER_NAMES.map(name=>({supplier:name,purchases_count:0,total:0,paid:0,remaining:0,last_purchase:null,...(by.get(name)||{})})));}catch(e){console.error(e);res.status(500).json({error:"تعذر تحميل الموردين"})}
});
app.get("/api/suppliers/:supplier/purchases",auth,can("inventory"),async(req,res)=>{const supplier=String(req.params.supplier||"").trim();if(!SUPPLIER_NAMES.includes(supplier))return res.status(400).json({error:"المورد غير صالح"});res.json(await q(`SELECT sp.*,u.full_name created_by_name FROM supplier_purchases sp LEFT JOIN users u ON u.id=sp.created_by WHERE sp.supplier=$1 ORDER BY sp.created_at DESC`,[supplier]));});
app.post("/api/suppliers/purchases",auth,can("inventory"),async(req,res)=>{const b=req.body||{},supplier=String(b.supplier||"").trim();if(!SUPPLIER_NAMES.includes(supplier))return res.status(400).json({error:"اختر موردًا صالحًا"});const raw=Array.isArray(b.items)?b.items:[];const items=raw.map(x=>({type:String(x.type||"").trim(),variant:String(x.variant||"").trim(),model:String(x.model||"").trim(),qty:Math.max(1,Math.floor(Number(x.qty)||1)),unitPrice:Math.max(0,Number(x.unitPrice)||0)})).filter(x=>SUPPLIER_ITEMS.includes(x.type));if(!items.length)return res.status(400).json({error:"اختر سلعة واحدة على الأقل"});if(items.some(x=>x.type==="LCD"&&!['ORG','OLD','INSEL'].includes(x.variant)))return res.status(400).json({error:"اختر نوع LCD: ORG أو OLD أو INSEL"});const total=items.reduce((n,x)=>n+x.qty*x.unitPrice,0),paid=Math.max(0,Math.min(total,Number(b.paid)||0));try{const r=await one(`INSERT INTO supplier_purchases(supplier,items,total_amount,paid_amount,notes,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[supplier,JSON.stringify(items),total,paid,String(b.notes||""),req.user.id]);await log(req.user.id,"إضافة شراء من مورد",null,{supplier,total,paid,items});res.status(201).json(r);}catch(e){console.error(e);res.status(500).json({error:"تعذر حفظ شراء المورد"})}});
app.delete("/api/suppliers/purchases/:id",auth,manager,async(req,res)=>{try{const r=await one("DELETE FROM supplier_purchases WHERE id=$1 RETURNING *",[req.params.id]);if(!r)return res.status(404).json({error:"عملية الشراء غير موجودة"});await log(req.user.id,"حذف شراء مورد",null,{purchase_id:r.id,supplier:r.supplier});res.json({ok:true});}catch(e){console.error(e);res.status(500).json({error:"تعذر حذف عملية الشراء"})}});

app.get("/api/settings",auth,can("settings"),async(req,res)=>{
  const value=(await one("SELECT value FROM settings WHERE key='shop'"))?.value||{};
  res.json({...value,name:"BN SMART"});
});
app.put("/api/settings",auth,manager,async(req,res)=>{
  const current=(await one("SELECT value FROM settings WHERE key='shop'"))?.value||{};
  const next={...current,...req.body,name:"BN SMART"};
  await pool.query("INSERT INTO settings(key,value) VALUES('shop',$1) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",[JSON.stringify(next)]);
  await log(req.user.id,"تحديث إعدادات المحل");res.json(next);
});

app.get("/api/backup",auth,manager,async(req,res)=>{
  const data={customers:await q("SELECT * FROM customers"),repairs:await q("SELECT * FROM repair_orders"),supplier_purchases:await q("SELECT * FROM supplier_purchases"),history:await q("SELECT * FROM repair_status_history"),payments:await q("SELECT * FROM payments"),users:await q("SELECT id,username,full_name,phone,role,active,permissions,last_login,created_at FROM users"),settings:await q("SELECT * FROM settings"),activity:await q("SELECT * FROM activity_logs")};
  res.json({exported_at:new Date().toISOString(),data});
});

app.get("/api/track/:code",async(req,res)=>{
  const r=await one(`SELECT r.receipt_no,r.tracking_code,r.brand,r.model,r.fault,r.status,r.updated_at,r.expected_price,r.paid_amount,r.accessories,c.name customer_name,c.phone customer_phone
    FROM repair_orders r JOIN customers c ON c.id=r.customer_id WHERE r.tracking_code=$1`,[req.params.code]);
  if(!r)return res.status(404).json({error:"رقم التتبع غير موجود"});
  const history=await q("SELECT status,created_at FROM repair_status_history WHERE repair_id=(SELECT id FROM repair_orders WHERE tracking_code=$1) ORDER BY created_at",[req.params.code]);
  res.json({receipt_no:r.receipt_no,tracking_code:r.tracking_code,device:[r.brand,r.model].filter(Boolean).join(" "),brand:r.brand,model:r.model,customer_name:r.customer_name,customer_phone:r.customer_phone,fault:r.fault,expected_price:r.expected_price,paid_amount:r.paid_amount,remaining:Math.max(0,Number(r.expected_price||0)-Number(r.paid_amount||0)),accessories:r.accessories||[],status:r.status,updated_at:r.updated_at,history});
});
app.get("/api/qr/:code",async(req,res)=>{try{const base=`${req.protocol}://${req.get("host")}`;const png=await QRCode.toBuffer(`${base}/track/${encodeURIComponent(req.params.code)}`,{width:360,margin:2});res.type("png").send(png)}catch(e){res.status(500).end()}});

app.get("/track/:code",(req,res)=>res.sendFile(path.join(__dirname,"public","track.html")));
app.get("/share/:code",(req,res)=>{res.set("Cache-Control","no-store, no-cache, must-revalidate, proxy-revalidate");res.set("Pragma","no-cache");res.set("Expires","0");res.sendFile(path.join(__dirname,"public","share.html"));});
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));

init().then(()=>app.listen(PORT,()=>console.log(`BN SMART running on http://localhost:${PORT}`))).catch(e=>{console.error(e);process.exit(1)});
