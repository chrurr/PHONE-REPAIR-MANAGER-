
let token=localStorage.getItem("elz_token"), me=null, current=null;
const P=["add_repair","view_repairs","edit_repair","change_status","customers","edit_customers","inventory","accounts","profits","reports","delete_repairs","delete_customers","users","settings","activity_logs","backups"];
const PN={add_repair:"إضافة وصل",view_repairs:"رؤية الإصلاحات",edit_repair:"تعديل الإصلاح",change_status:"تغيير الحالة",customers:"العملاء",edit_customers:"تعديل العملاء",inventory:"المخزون",accounts:"الحسابات",profits:"رؤية الأرباح",reports:"التقارير",delete_repairs:"حذف الإصلاحات",delete_customers:"حذف العملاء",users:"إدارة المستخدمين",settings:"الإعدادات",activity_logs:"سجل النشاط",backups:"النسخ الاحتياطي"};
async function api(url,opt={}){opt.headers={...(opt.headers||{}),Authorization:"Bearer "+token,"Content-Type":"application/json"};let r=await fetch(url,opt);let d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"حدث خطأ");return d}
function toast(s){let t=document.getElementById("toast");t.textContent=s;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2300)}
function updateTopDate(){const el=document.getElementById("topDate");if(el)el.textContent=new Date().toLocaleDateString("ar-DZ",{weekday:"long",day:"2-digit",month:"long"});}
async function login(){try{let d=await api("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:lu.value,password:lp.value})});token=d.token;localStorage.setItem("elz_token",token);me=d.user;start()}catch(e){le.textContent=e.message}}
function logout(){localStorage.removeItem("elz_token");location.reload()}
async function start(){document.getElementById("login").classList.add("hide");document.getElementById("app").classList.add("show");who.textContent=me.full_name;role.textContent=me.role==="manager"?"— المدير":"— متعاون";["accountsNav","reportsNav","usersNav","activityNav","settingsNav"].forEach(id=>document.getElementById(id).style.display=(me.role==="manager"||me.permissions[id.replace("Nav","").replace("users","users").replace("activity","activity_logs").replace("settings","settings")])?"block":"none");await loadDash()}
async function page(id,btn){document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));document.getElementById(id).classList.add("active");document.querySelectorAll(".nav button").forEach(x=>x.classList.remove("active"));if(btn)btn.classList.add("active");if(id==="dashboard")loadDash();if(id==="repairs")loadRepairs();if(id==="customers")loadCustomers();if(id==="users")loadUsers();if(id==="activity")loadActivity();if(id==="settings")loadSettings();if(id==="accounts")loadAccounts();if(id==="reports")loadReports()}
function backFromDetail(){page("repairs", document.querySelector(".nav button[onclick*=\'repairs\']"));}
window.handleAndroidBack=function(){const active=document.querySelector(".page.active");if(document.getElementById("modal")?.classList.contains("show")){closeModal();return true;}if(active?.id==="detail"){backFromDetail();return true;}if(active && active.id!=="dashboard"){page("dashboard", document.querySelector(".nav button[onclick*=\'dashboard\']"));return true;}return false;}
const PHONE_BRANDS=['Apple', 'Samsung', 'Xiaomi', 'Redmi', 'POCO', 'Huawei', 'Honor', 'Oppo', 'OnePlus', 'Realme', 'Vivo', 'iQOO', 'Motorola', 'Lenovo', 'Nokia', 'Sony', 'Google Pixel', 'Tecno', 'Infinix', 'Itel', 'ZTE', 'TCL', 'Alcatel', 'Asus', 'ROG Phone', 'Nothing', 'Meizu', 'LG', 'HTC', 'BlackBerry', 'Microsoft Lumia', 'Sharp', 'Wiko', 'Fairphone', 'CAT', 'Doogee', 'Ulefone', 'Oukitel', 'UMIDIGI', 'Cubot', 'Nubia', 'ZTE Axon', 'Razer', 'Aspera', 'Doro', 'Crosscall', 'Energizer', 'Gigaset', 'Kyocera', 'Panasonic', 'Philips', 'Maxwest', 'Blu', 'Lava', 'Micromax', 'Karbonn', 'Jio', 'YU', 'Coolpad', 'LeEco', 'Pantech', 'Vertu', 'Yota', 'Essential', 'Palm', 'Vaio', 'BQ', 'Archos', 'Prestigio', 'Walton', 'Symphony', 'O General', 'Blackview', 'Oscal', 'HMD', 'Nothing Phone', 'الأخرى'];
const BRAND_OPTIONS=PHONE_BRANDS.map(b=>`<option value="${esc(b)}">${esc(b)}</option>`).join("");
document.getElementById("br").insertAdjacentHTML("beforeend",BRAND_OPTIONS);
function badge(s){let c=s==="جاهز للتسليم"?"green":s==="قيد الإصلاح"?"blue":s==="تم الإصلاح"?"orange":s==="تم التسليم"?"gray":"redbadge";return `<span class="badge ${c}">${s}</span>`}
async function loadDash(){let d=await api("/api/dashboard");let s=d.stats;stats.innerHTML=[["📱","قيد الإصلاح",s.in_repair],["✅","جاهز",s.ready],["📥","المستلمة اليوم",s.received_today],["📤","المسلّمة اليوم",s.delivered_today],["💰","المداخيل",Number(s.revenue).toLocaleString()+" دج"],["💵","الأرباح",Number(s.profit).toLocaleString()+" دج"],["💳","المتبقي",Number(s.remaining).toLocaleString()+" دج"]].map(x=>`<div class="card"><div class="muted">${x[0]} ${x[1]}</div><div class="stat"><b>${x[2]}</b></div></div>`).join("");recent.innerHTML=`<tr><th>الوصل</th><th>العميل</th><th>الجهاز</th><th>الحالة</th><th></th></tr>`+d.recent.map(r=>`<tr><td>#${r.receipt_no}<br>${r.tracking_code}</td><td>${r.customer_name}</td><td>${r.brand||""} ${r.model||""}</td><td>${badge(r.status)}</td><td><button class="btn light" onclick="detail(${r.id})">عرض</button></td></tr>`).join("");status.innerHTML=d.statuses.map(x=>`<p style="display:flex;justify-content:space-between">${x.status}<b>${x.count}</b></p>`).join("")}
async function loadRepairs(){let d=await api("/api/repairs?search="+encodeURIComponent(rs.value||"")+"&status="+encodeURIComponent(rf.value||""));rows.innerHTML=d.map(r=>`<tr><td>#${r.receipt_no}<br><small>${r.tracking_code}</small></td><td>${r.customer_name}<br>${r.customer_phone}</td><td>${r.brand||""} ${r.model||""}</td><td>${badge(r.status)}</td><td>${Number(r.paid_amount).toLocaleString()}</td><td>${Number(r.expected_price-r.paid_amount).toLocaleString()}</td><td>${r.created_by_name||"—"}</td><td><button class="btn light" onclick="detail(${r.id})">👁️</button> <button class="btn light" onclick="statusModal(${r.id})">🔄</button></td></tr>`).join("")}
async function addRepair(){let accessories=[...document.querySelectorAll("#new .checks input:checked")].map(x=>x.value);try{let r=await api("/api/repairs",{method:"POST",body:JSON.stringify({customerName:cn.value,phone:cp.value,brand:br.value,model:mo.value,color:co.value,power:pw.value,price:+pr.value||0,paid:+pa.value||0,partCost:+pc.value||0,fault:fa.value,diagnosis:di.value,accessories,accessoryNotes:an.value,notes:no.value})});toast("تم إنشاء الوصل بنجاح ✓");detail(r.id)}catch(e){toast(e.message)}}
async function detail(id){current=await api("/api/repairs/"+id);page("detail");dt.textContent=`وصل #${current.receipt_no} — ${current.customer_name}`;dc.innerHTML=`<div class="card"><h3>بيانات العميل</h3><p>${current.customer_name}<br>${current.customer_phone}</p><h3>الجهاز</h3><p>${current.brand||""} ${current.model||""}<br>${current.power_state||""}</p><h3>العطل</h3><p>${current.fault||"—"}</p><h3>التشخيص</h3><p>${current.diagnosis||"—"}</p><h3>الملحقات</h3><p>${(current.accessories||[]).join("، ")||"—"}</p></div><div class="card"><h3>الحالة</h3>${badge(current.status)}<h3>Timeline</h3><div class="timeline">${current.history.map(h=>`<div class="step"><b>${h.status}</b><small style="display:block;color:#777">${new Date(h.created_at).toLocaleString("ar-DZ")} — ${h.changed_by_name||""}</small></div>`).join("")}</div><h3>الحساب</h3><p>السعر: ${Number(current.expected_price).toLocaleString()} دج<br>المدفوع: ${Number(current.paid_amount).toLocaleString()} دج<br>المتبقي: ${Number(current.expected_price-current.paid_amount).toLocaleString()} دج</p><img src="/api/qr/${current.tracking_code}" style="width:160px;display:block;margin:auto"><p style="text-align:center"><b>${current.tracking_code}</b></p><div class="actions"><button class="btn red" onclick="editRepairModal(${current.id})">✏️ تعديل الوصل</button><button class="btn" style="background:#b00020" onclick="deleteRepair(${current.id})">🗑️ حذف الوصل</button><button class="btn light" onclick="statusModal(${current.id})">🔄 تغيير الحالة</button><button class="btn light" onclick="paymentModal(${current.id})">💳 تسجيل دفعة</button></div></div>`;wa.onclick=()=>sendWhatsAppReceipt(current);}
function statusModal(id){mb.innerHTML=`<h2>تغيير الحالة</h2><select id="ns" style="width:100%;padding:11px">${["تم الاستلام","قيد الفحص","قيد الإصلاح","تم الإصلاح","جاهز للتسليم","تم التسليم"].map(x=>`<option>${x}</option>`).join("")}</select><div class="actions"><button class="btn red" onclick="setStatus(${id})">حفظ</button><button class="btn light" onclick="closeModal()">إلغاء</button></div>`;modal.classList.add("show")}
function editRepairModal(id){
  const a=new Set(current.accessories||[]);
  mb.innerHTML=`<h2>تعديل الوصل #${current.receipt_no}</h2><p class="muted">يمكن تعديل جميع بيانات الوصل حتى بعد إنشائه. رقم الوصل وكود التتبع ثابتان.</p>
  <div class="form">
  <div class="field"><label>اسم العميل</label><input id="en" value="${esc(current.customer_name||"")}"></div>
  <div class="field"><label>رقم الهاتف</label><input id="ep" value="${esc(current.customer_phone||"")}"></div>
  <div class="field"><label>الشركة</label><select id="eb"><option value="">اختر الشركة</option>${PHONE_BRANDS.map(x=>`<option value="${esc(x)}" ${current.brand===x?"selected":""}>${esc(x)}</option>`).join("")}</select></div>
  <div class="field"><label>الموديل</label><input id="em" value="${esc(current.model||"")}"></div>
  <div class="field"><label>اللون</label><input id="ec" value="${esc(current.color||"")}"></div>
  <div class="field"><label>حالة الجهاز</label><select id="ePower"><option ${current.power_state==='🟢 يعمل'?'selected':''}>🟢 يعمل</option><option ${current.power_state==='🔴 منطفئ'?'selected':''}>🔴 منطفئ</option></select></div>
  <div class="field"><label>سعر الإصلاح الإجمالي</label><input id="eprice" type="number" min="0" value="${Number(current.expected_price||0)}"></div>
  <div class="field"><label>إجمالي المدفوع</label><input id="epaid" type="number" min="0" value="${Number(current.paid_amount||0)}"></div>
  <div class="field"><label>تكلفة قطعة الغيار</label><input id="epart" type="number" min="0" value="${Number(current.part_cost||0)}"></div>
  <div class="field full"><label>العطل</label><textarea id="efault">${esc(current.fault||"")}</textarea></div>
  <div class="field full"><label>التشخيص</label><textarea id="ediag">${esc(current.diagnosis||"")}</textarea></div>
  <div class="field full"><label>الملحقات المستلمة</label><div class="checks">${['شاحن','كابل','بطارية','SIM','بطاقة ذاكرة','غطاء','أخرى'].map(x=>`<label><input type="checkbox" value="${x}" class="editacc" ${a.has(x)?'checked':''}> ${x}</label>`).join('')}</div></div>
  <div class="field full"><label>ملاحظات الملحقات</label><input id="eaccnotes" value="${esc(current.accessory_notes||"")}"></div>
  <div class="field full"><label>ملاحظات داخلية</label><textarea id="enotes">${esc(current.notes||"")}</textarea></div>
  </div><div class="actions"><button class="btn red" onclick="saveRepairEdit(${id})">حفظ التعديلات</button><button class="btn" style="background:#b00020" onclick="deleteRepair(${id})">🗑️ حذف الوصل</button><button class="btn light" onclick="closeModal()">إلغاء</button></div>`;
  modal.classList.add('show');
}
function esc(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
async function saveRepairEdit(id){
  const accessories=[...document.querySelectorAll('.editacc:checked')].map(x=>x.value);
  const body={customerName:en.value,phone:ep.value,brand:eb.value,model:em.value,color:ec.value,power:ePower.value,price:Number(eprice.value)||0,paid:Number(epaid.value)||0,partCost:Number(epart.value)||0,fault:efault.value,diagnosis:ediag.value,accessories,accessoryNotes:eaccnotes.value,notes:enotes.value};
  try{await api('/api/repairs/'+id,{method:'PATCH',body:JSON.stringify(body)});closeModal();toast('تم تعديل الوصل بنجاح ✓');await detail(id)}catch(e){toast(e.message)}
}
async function deleteRepair(id){
  if(!confirm("هل أنت متأكد من حذف هذا الوصل نهائيًا؟ سيتم حذف سجل حالاته ودفعاته المرتبطة به، ولن يمكن التراجع عن العملية."))return;
  try{await api("/api/repairs/"+id,{method:"DELETE"});closeModal();toast("تم حذف الوصل ✓");page("repairs")}catch(e){toast(e.message)}
}
async function setStatus(id){try{await api("/api/repairs/"+id+"/status",{method:"PATCH",body:JSON.stringify({status:ns.value})});closeModal();toast("تم تحديث الحالة ✓");detail(id)}catch(e){toast(e.message)}}
function paymentModal(id){mb.innerHTML=`<h2>تسجيل دفعة</h2><div class="field"><label>المبلغ</label><input id="amt" type="number"></div><div class="actions"><button class="btn red" onclick="pay(${id})">تسجيل</button><button class="btn light" onclick="closeModal()">إلغاء</button></div>`;modal.classList.add("show")}
async function pay(id){try{await api("/api/repairs/"+id+"/payments",{method:"POST",body:JSON.stringify({amount:+amt.value})});closeModal();toast("تم تسجيل الدفعة ✓");detail(id)}catch(e){toast(e.message)}}
async function loadCustomers(){let d=await api("/api/customers");custRows.innerHTML=d.map(c=>`<tr><td>${c.name}</td><td>${c.phone}</td><td>${c.repairs_count}</td><td>${Number(c.paid).toLocaleString()}</td><td>${Number(c.remaining).toLocaleString()}</td><td>${c.last_visit?new Date(c.last_visit).toLocaleDateString("ar-DZ"):"—"}</td></tr>`).join("")}
async function loadUsers(){
  const d=await api("/api/users");
  const managers=d.filter(x=>x.role==="manager").length;
  userRows.innerHTML=d.map(u=>{
    const isMe = Number(u.id)===Number(me.id);
    const actions = [];
    actions.push(`<button type="button" class="btn light js-user-edit" data-id="${u.id}">✏️ تعديل</button>`);
    actions.push(`<button type="button" class="btn light js-user-password" data-id="${u.id}" data-name="${escAttr(u.full_name)}">🔐 تغيير كلمة المرور</button>`);
    if(!isMe){
      actions.push(`<button type="button" class="btn light js-user-toggle" data-id="${u.id}" data-active="${u.active?"0":"1"}">${u.active?"تعطيل":"تفعيل"}</button>`);
      actions.push(`<button type="button" class="btn" style="background:#b00020" data-action="delete-user" data-id="${u.id}" data-name="${escAttr(u.full_name)}" data-role="${u.role}">🗑️ حذف</button>`);
    } else {
      actions.push(`<button type="button" class="btn light" disabled title="لا يمكن حذف الحساب الذي تستخدمه الآن">🗑️ حذف</button>`);
    }
    return `<tr><td>${esc(u.full_name)}</td><td>${esc(u.username)}</td><td>${u.role==="manager"?"مدير رئيسي":"متعاون"}</td><td>${u.active?badge("فعال"):badge("متوقف")}</td><td>${u.last_login?new Date(u.last_login).toLocaleString("ar-DZ"):"لم يدخل بعد"}</td><td class="actions">${actions.join(" ")}</td></tr>`;
  }).join("") + (managers===1?`<tr><td colspan="6"><small class="muted">يوجد مدير فعّال واحد على الأقل. لا يمكن حذف آخر مدير فعّال.</small></td></tr>`:"");
}
function escAttr(v){return String(v??"").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}
userRows.addEventListener("click", async (ev)=>{
  const btn=ev.target.closest("button");
  if(!btn)return;
  if(btn.classList.contains("js-user-edit")){
    const u=(await api("/api/users")).find(x=>Number(x.id)===Number(btn.dataset.id));
    if(u)userModal(u);
    return;
  }
  if(btn.classList.contains("js-user-password")){
    passwordModal(Number(btn.dataset.id),btn.dataset.name||"");
    return;
  }
  if(btn.classList.contains("js-user-toggle")){
    toggleUser(Number(btn.dataset.id),btn.dataset.active==="1");
    return;
  }
  if(btn.dataset.action==="delete-user"){
    deleteUser(Number(btn.dataset.id),btn.dataset.name||"",btn.dataset.role||"");
  }
});
function userModal(u=null){
  u=u||{};
  const isManager=u.role==="manager";
  const managerDisabled = isManager ? "disabled" : "";
  mb.innerHTML=`<h2>${u.id?"تعديل حساب":"إضافة متعاون"}</h2><p class="muted">يمكن للمدير تعديل اسم المستخدم والاسم والصلاحيات وكلمة المرور.</p><div class="form"><div class="field"><label>اسم المستخدم</label><input id="un" value="${escAttr(u.username||"")}" autocomplete="off"></div><div class="field"><label>الاسم الكامل</label><input id="uf" value="${escAttr(u.full_name||"")}"></div><div class="field"><label>رقم الهاتف</label><input id="up" value="${escAttr(u.phone||"")}"></div><div class="field"><label>الدور</label><select id="urole"><option value="collaborator" ${!isManager?'selected':''}>متعاون</option><option value="manager" ${isManager?'selected':''}>مدير</option></select></div><div class="field"><label>كلمة المرور ${u.id?"(اختياري)":""}</label><input id="ux" type="password" autocomplete="new-password"></div></div><h3>الصلاحيات <span class="muted" style="font-size:12px">(تُطبق على المتعاون فقط)</span></h3><div class="permgrid">${P.map(p=>`<label><input type="checkbox" id="p_${p}" ${managerDisabled} ${(u.permissions||{})[p]?"checked":""}> ${PN[p]}</label>`).join("")}</div><div class="actions"><button type="button" class="btn red" id="saveUserBtn">حفظ</button><button type="button" class="btn light" id="closeUserBtn">إلغاء</button></div>`;
  document.getElementById("saveUserBtn").onclick=()=>saveUser(u.id?Number(u.id):null);
  document.getElementById("closeUserBtn").onclick=closeModal;
  modal.classList.add("show");
}
async function saveUser(id){
  const permissions={};
  P.forEach(p=>permissions[p]=!!document.getElementById("p_"+p)?.checked);
  const body={username:document.getElementById("un").value.trim(),fullName:document.getElementById("uf").value.trim(),phone:document.getElementById("up").value.trim(),role:document.getElementById("urole").value,password:document.getElementById("ux").value||undefined,permissions};
  if(!body.username||!body.fullName)return toast("اسم المستخدم والاسم الكامل مطلوبان");
  try{await api(id?"/api/users/"+id:"/api/users",{method:id?"PATCH":"POST",body:JSON.stringify(body)});closeModal();toast("تم حفظ الحساب ✓");await loadUsers()}catch(e){toast(e.message)}}
function passwordModal(id,name){
  mb.innerHTML=`<h2>تغيير كلمة المرور</h2><p class="muted">الحساب: ${esc(name)}</p><div class="field"><label>كلمة المرور الجديدة</label><input id="rnp1" type="password" autocomplete="new-password"></div><div class="field"><label>تأكيد كلمة المرور</label><input id="rnp2" type="password" autocomplete="new-password"></div><p id="rnpmsg" class="muted" style="margin-top:8px"></p><div class="actions"><button type="button" class="btn red" id="resetPwBtn">حفظ كلمة المرور</button><button type="button" class="btn light" id="cancelPwBtn">إلغاء</button></div>`;
  document.getElementById("resetPwBtn").onclick=()=>resetUserPassword(id);
  document.getElementById("cancelPwBtn").onclick=closeModal;
  modal.classList.add("show");
  setTimeout(()=>document.getElementById("rnp1")?.focus(),50);
}
async function resetUserPassword(id){
  const p1=document.getElementById("rnp1")?.value||"";
  const p2=document.getElementById("rnp2")?.value||"";
  const msg=document.getElementById("rnpmsg");
  if(!p1||p1.length<8||p1!==p2){if(msg)msg.textContent="تأكد من كلمة المرور الجديدة (8 أحرف على الأقل) وأن التأكيد مطابق";return}
  try{await api("/api/users/"+id+"/password",{method:"POST",body:JSON.stringify({newPassword:p1})});closeModal();toast("تم تغيير كلمة المرور ✓")}catch(e){if(msg)msg.textContent=e.message;else toast(e.message)}}
async function toggleUser(id,active){try{await api("/api/users/"+id,{method:"PATCH",body:JSON.stringify({active})});toast("تم تحديث حالة الحساب ✓");await loadUsers()}catch(e){toast(e.message)}}
async function deleteUser(id,name,role){
  if(Number(id)===Number(me.id)){toast("لا يمكنك حذف حسابك الحالي");return}
  const ok=await askConfirm(role==="manager"?`حذف حساب المدير «${name}» نهائيًا؟ سيبقى سجل الإصلاحات محفوظًا.`:`حذف حساب المتعاون «${name}» نهائيًا؟ سيبقى سجل الإصلاحات محفوظًا.`);
  if(!ok)return;
  try{await api("/api/users/"+id,{method:"DELETE"});toast("تم حذف الحساب ✓");await loadUsers()}catch(e){toast(e.message)}
}
function askConfirm(message){
  return new Promise(resolve=>{
    mb.innerHTML=`<h2>تأكيد العملية</h2><p>${esc(message)}</p><div class="actions"><button type="button" class="btn red" id="confirmYes">تأكيد الحذف</button><button type="button" class="btn light" id="confirmNo">إلغاء</button></div>`;
    document.getElementById("confirmYes").onclick=()=>{closeModal();resolve(true)};
    document.getElementById("confirmNo").onclick=()=>{closeModal();resolve(false)};
    modal.classList.add("show");
  });
}
async function loadActivity(){let d=await api("/api/activity");actRows.innerHTML=d.map(a=>`<tr><td>${a.user_name||"—"}</td><td>${a.action}</td><td>${a.receipt_no?"#"+a.receipt_no:"—"}</td><td>${new Date(a.created_at).toLocaleString("ar-DZ")}</td></tr>`).join("")}
async function changePassword(){const a=document.getElementById("curpw").value,b=document.getElementById("newpw").value,c=document.getElementById("confpw").value,msg=document.getElementById("pwmsg");msg.textContent="";if(!a||!b||!c){msg.textContent="يرجى تعبئة جميع الحقول";return}if(b.length<8){msg.textContent="كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل";return}if(b!==c){msg.textContent="تأكيد كلمة المرور غير مطابق";return}try{await api("/api/auth/change-password",{method:"POST",body:JSON.stringify({currentPassword:a,newPassword:b})});msg.textContent="تم تغيير كلمة المرور بنجاح ✓";document.getElementById("curpw").value="";document.getElementById("newpw").value="";document.getElementById("confpw").value="";toast("تم تغيير كلمة المرور ✓")}catch(e){msg.textContent=e.message}}

async function loadSettings(){let s=await api("/api/settings");shop.value=s.name||"";phone.value=s.phone||"";address.value=s.address||""}
async function saveSettings(){await api("/api/settings",{method:"PUT",body:JSON.stringify({name:shop.value,phone:phone.value,whatsapp:phone.value,address:address.value})});toast("تم حفظ الإعدادات ✓")}
async function backup(){let d=await api("/api/backup");let a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(d,null,2)],{type:"application/json"}));a.download="bnsmart-backup.json";a.click()}
async function loadAccounts(){let d=await api("/api/dashboard");accountCards.innerHTML=[["إجمالي المداخيل",d.stats.revenue],["الأرباح",d.stats.profit],["المبالغ المتبقية",d.stats.remaining]].map(x=>`<div class="card"><div class="muted">${x[0]}</div><b>${Number(x[1]).toLocaleString()} دج</b></div>`).join("")}
async function loadReports(){try{let period=document.getElementById("reportPeriod")?.value||"30";let d=await api("/api/reports/daily?period="+encodeURIComponent(period));reportCards.innerHTML=[["إجمالي الإصلاحات",d.total_repairs],["المداخيل المدفوعة",d.total_paid],["الأرباح",d.total_profit],["متوسط العمل اليومي",d.average_daily_repairs]].map(x=>`<div class="card"><div class="muted">${x[0]}</div><b>${Number(x[1]).toLocaleString('ar-DZ')}${x[0]!=="إجمالي الإصلاحات"&&x[0]!=="متوسط العمل اليومي"?" دج":""}</b></div>`).join("");let rows=(d.days||[]);busyDaysRows.innerHTML=rows.length?rows.map((r,i)=>{let pct=Number(r.percent||0);let medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1);return `<tr><td><b>${medal}</b></td><td>${new Date(r.day+"T00:00:00").toLocaleDateString('ar-DZ',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'})}</td><td><b>${Number(r.repairs_count).toLocaleString('ar-DZ')}</b></td><td><div style="display:flex;align-items:center;gap:8px;min-width:150px"><div style="flex:1;height:8px;background:#eee;border-radius:99px;overflow:hidden"><div style="height:100%;width:${Math.min(100,pct)}%;background:#e3262e;border-radius:99px"></div></div><b>${pct.toFixed(1)}%</b></div></td><td>${Number(r.paid).toLocaleString('ar-DZ')} دج</td><td>${Number(r.profit).toLocaleString('ar-DZ')} دج</td></tr>`}).join(""):`<tr><td colspan="6" class="muted" style="text-align:center;padding:25px">لا توجد بيانات في هذه الفترة</td></tr>`}catch(e){toast(e.message)}}
function closeModal(){modal.classList.remove("show")}
function globalSearch(v){if(v.trim()){page("repairs");rs.value=v;loadRepairs()}}
function printReceipt(){
  if(!current)return;
  const w=window.open("","_blank");
  if(!w){toast("يرجى السماح بفتح نافذة الطباعة");return}
  const acc=(current.accessories||[]).join("، ")||"لا يوجد";
  const qr=`${location.origin}/api/qr/${encodeURIComponent(current.tracking_code)}`;
  const notesHtml=current.accessory_notes?'<div style="margin-top:4px;color:#666">'+esc(current.accessory_notes)+'</div>':'';
  const html=`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>وصل #${current.receipt_no}</title><style>@page{size:80mm auto;margin:0}*{box-sizing:border-box}body{font-family:Arial,Tahoma,sans-serif;width:80mm;margin:0 auto;padding:6mm 4mm;color:#111;font-size:11px}.header{text-align:center;border-bottom:2px solid #e3262e;padding-bottom:10px}.header img{width:185px;height:auto;max-height:58px;object-fit:contain;border:0;margin:auto;display:block}.header h2{margin:5px 0 0;font-size:18px}.title{font-weight:bold;margin-top:8px}.row{display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px dashed #bbb}.row span{color:#666}.row b{text-align:left}.box{border:1px solid #ddd;border-radius:8px;padding:7px;margin-top:8px}.box h3{margin:0 0 5px;font-size:12px}.qr{text-align:center;padding:9px 0}.qr img{width:125px;height:125px}.qr small{display:block;font-weight:bold;margin-top:4px}.footer{text-align:center;border-top:1px solid #ddd;margin-top:9px;padding-top:8px;font-size:9px;line-height:1.7;color:#555}.thanks{font-size:11px;font-weight:bold;color:#111;margin-bottom:4px}@media print{body{width:80mm}}</style></head><body><div class="header"><img src="${location.origin}/logo.png?v=15" alt="BN SMART"><h2>BN SMART</h2><div class="title">وصل استلام جهاز للصيانة</div></div><div class="row"><span>رقم الوصل</span><b>#${current.receipt_no}</b></div><div class="row"><span>العميل</span><b>${esc(current.customer_name)}</b></div><div class="row"><span>الهاتف</span><b>${esc(current.customer_phone||'—')}</b></div><div class="row"><span>الجهاز</span><b>${esc([current.brand,current.model].filter(Boolean).join(' '))}</b></div><div class="row"><span>اللون</span><b>${esc(current.color||'—')}</b></div><div class="box"><h3>العطل</h3><div>${esc(current.fault||'—')}</div></div><div class="box"><h3>الملحقات المستلمة</h3><div>${esc(acc)}</div>${notesHtml}</div><div class="row"><span>الحالة</span><b>${esc(current.status)}</b></div><div class="row"><span>السعر</span><b>${Number(current.expected_price||0).toLocaleString('ar-DZ')} دج</b></div><div class="row"><span>المدفوع</span><b>${Number(current.paid_amount||0).toLocaleString('ar-DZ')} دج</b></div><div class="row"><span>المتبقي</span><b>${Number((current.expected_price||0)-(current.paid_amount||0)).toLocaleString('ar-DZ')} دج</b></div><div class="qr"><img src="${qr}" alt="QR"><small>${esc(current.tracking_code)}</small><div>امسح الرمز لمتابعة حالة جهازك</div></div><div class="footer"><div class="thanks">ثقتكم مسؤوليتنا، ورضاكم غايتنا ❤️</div>شكرًا لاختياركم BN SMART — نعتز بثقتكم ونسعد بخدمتكم.<br>المحل غير مسؤول عن الجهاز بعد مدة أقصاها شهر من تاريخ جاهزية الجهاز للتسليم.<br>المحل غير مسؤول عن أي خلل غير متعلق بالعطل المطلوب صيانته.<br>الضمان لمدة 24 ساعة على الشاشة الأصلية فقط. الشاشات العادية والمقلدة لا يوجد عليها ضمان.</div><script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`;
  w.document.open();w.document.write(html);w.document.close();
}
function normalizeDZPhone(phone){let d=String(phone||"").trim().replace(/[^0-9+]/g,"");if(d.startsWith("+213"))return d.slice(1);if(d.startsWith("213")&&d.length===12)return d;if(d.startsWith("0")&&d.length===10)return "213"+d.slice(1);if(/^[567]\d{8}$/.test(d))return "213"+d;return d.replace(/^\+/,'');}
function receiptShareUrl(r){return `${location.origin}/share/${encodeURIComponent(r.tracking_code)}`;}
async function copyReceiptLink(){if(!current)return;const u=receiptShareUrl(current);try{await navigator.clipboard.writeText(u);toast("تم نسخ رابط الوصل ✓");}catch(e){prompt("انسخ رابط الوصل:",u)}}
async function sendWhatsAppReceipt(r){const phone=normalizeDZPhone(r.customer_phone);if(!phone||phone.length<11){toast("رقم هاتف الزبون غير صالح لإرسال WhatsApp");return}const url=receiptShareUrl(r);const message=`مرحبًا، هذا هو وصل الصيانة الخاص بكم من BN SMART.\nرقم الوصل: #${r.receipt_no}\nالجهاز: ${[r.brand,r.model].filter(Boolean).join(" ")||"—"}\nالحالة: ${r.status}\nرابط الوصل والتفاصيل: ${url}\n\nثقتكم مسؤوليتنا، ورضاكم غايتنا ❤️`;if(navigator.share && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)){try{await navigator.share({title:`وصل #${r.receipt_no} — BN SMART`,text:message,url});return}catch(e){if(e?.name==="AbortError")return}}const waUrl=`https://wa.me/${phone}?text=${encodeURIComponent(message)}`;window.open(waUrl,"_blank","noopener,noreferrer");}

updateTopDate(); setInterval(updateTopDate, 60000);
if(token){api("/api/auth/me").then(x=>{me=x.user;start()}).catch(()=>{localStorage.removeItem("elz_token")})}
