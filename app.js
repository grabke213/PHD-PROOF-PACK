/* PHD Precision Certificate v1
   Offline-first: Jobs stored in IndexedDB (images and data).
   Export: Generates a printable HTML proof pack window, user "Print to PDF".
*/

const $ = (id) => document.getElementById(id);

const state = {
  job: null,
  import: { parsed: {}, attachedImage: null },
};

const APP = {
  name: "PHD Precision Certificate",
  company: "PHD — Precision Home Delivery",
  pdfTitle: "Precision Delivery & Installation Certificate of Completion",
  version: "v1",
};

// ---------------- IndexedDB ----------------
const DB_NAME = "phd_precision_cert_db";
const DB_VER = 1;
let db = null;

function idbOpen(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains("jobs")){
        const store = d.createObjectStore("jobs", { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}
function idbTx(storeName, mode="readonly"){
  const tx = db.transaction(storeName, mode);
  return tx.objectStore(storeName);
}
function idbPut(storeName, value){
  return new Promise((resolve, reject) => {
    const store = idbTx(storeName, "readwrite");
    const req = store.put(value);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}
function idbGet(storeName, key){
  return new Promise((resolve, reject) => {
    const store = idbTx(storeName, "readonly");
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}
function idbGetAll(storeName){
  return new Promise((resolve, reject) => {
    const store = idbTx(storeName, "readonly");
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}
function idbClear(storeName){
  return new Promise((resolve, reject) => {
    const store = idbTx(storeName, "readwrite");
    const req = store.clear();
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}
function uid(){
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  const dt = new Date();
  const stamp = dt.toISOString().slice(0,10).replaceAll("-","");
  return `PC-${stamp}-${rand}`;
}

// ---------------- Helpers ----------------
function nowISO(){ return new Date().toISOString(); }
function fmtDT(iso){
  if(!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { weekday:"short", year:"numeric", month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" });
}
function escapeHtml(s){
  return (s||"").replace(/[&<>"']/g, (c)=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
async function toDataURL(file){
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
function setVisibility(){
  const jt = $("jobType").value;
  $("builderWrap").style.display = (jt==="Builder Project" || jt==="Subcontracted Through Supplier") ? "block" : "none";
  $("contractedWrap").style.display = (jt==="Subcontracted Through Supplier") ? "block" : "none";
}
function showToast(msg){
  // minimal toast
  const t = document.createElement("div");
  t.textContent = msg;
  t.style.position="fixed";
  t.style.bottom="18px";
  t.style.left="50%";
  t.style.transform="translateX(-50%)";
  t.style.background="rgba(15,26,48,.95)";
  t.style.border="1px solid rgba(255,255,255,.14)";
  t.style.padding="10px 12px";
  t.style.borderRadius="14px";
  t.style.boxShadow="0 10px 30px rgba(0,0,0,.35)";
  t.style.zIndex=9999;
  document.body.appendChild(t);
  setTimeout(()=>t.remove(), 2200);
}

// ---------------- Signature pad ----------------
function initSignature(){
  const canvas = $("sigCanvas");
  const ctx = canvas.getContext("2d");
  let drawing = false;
  let last = null;

  function getPos(e){
    const rect = canvas.getBoundingClientRect();
    const pt = (e.touches && e.touches[0]) ? e.touches[0] : e;
    return { x: (pt.clientX - rect.left) * (canvas.width / rect.width),
             y: (pt.clientY - rect.top) * (canvas.height / rect.height) };
  }

  function start(e){
    drawing = true;
    last = getPos(e);
    e.preventDefault?.();
  }
  function move(e){
    if(!drawing) return;
    const p = getPos(e);
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
    e.preventDefault?.();
  }
  function end(){ drawing = false; last = null; }

  canvas.addEventListener("mousedown", start);
  canvas.addEventListener("mousemove", move);
  window.addEventListener("mouseup", end);

  canvas.addEventListener("touchstart", start, {passive:false});
  canvas.addEventListener("touchmove", move, {passive:false});
  canvas.addEventListener("touchend", end);

  $("btnSigClear").addEventListener("click", () => {
    ctx.clearRect(0,0,canvas.width, canvas.height);
  });
}
function getSignatureDataURL(){
  const canvas = $("sigCanvas");
  // check if blank
  const ctx = canvas.getContext("2d");
  const img = ctx.getImageData(0,0,canvas.width,canvas.height).data;
  let nonZero = false;
  for(let i=0;i<img.length;i+=4){
    if(img[i+3] !== 0){ nonZero=true; break; }
  }
  return nonZero ? canvas.toDataURL("image/png") : null;
}

// ---------------- Templates ----------------
const ApplianceTypes = ["Fridge","Stove","Washer","Dryer","Dishwasher","Wall Oven"];

function deliveryChecklist(type){
  const base = [
    "Path protection used where required",
    "Unit placed in requested location",
    "Placement photo captured",
  ];
  const byType = {
    "Fridge": ["Doors protected during move", "Power cord secured"],
    "Stove": ["Measured doorway/clearance verified"],
    "Washer": ["Hoses/parts delivered with unit (if provided)"],
    "Dryer": ["Vent location confirmed (if applicable)"],
    "Dishwasher": ["Unit delivered to install location"],
    "Wall Oven": ["Unit delivered to install location"],
  };
  return base.concat(byType[type] || []);
}

function installChecklist(type){
  const base = [
    "Unit positioned and leveled",
    "Install area inspected for fit/clearance",
    "Final placement photo captured",
  ];
  const byType = {
    "Fridge": ["Powered on (if power available)", "Water line connected (if included in scope)"],
    "Stove": ["Powered on (if power available)", "Anti-tip bracket (if applicable)"],
    "Washer": ["Hoses connected (if included in scope)", "Drain seated/verified"],
    "Dryer": ["Powered on (if power available)", "Vent connected (if included in scope)"],
    "Dishwasher": ["Water line connected", "Drain connected", "Level / secure"],
    "Wall Oven": ["Powered on (if power available)", "Fit verified"],
  };
  return base.concat(byType[type] || []);
}

function makeAppliance(serviceType){
  const a = {
    id: crypto.randomUUID(),
    type: "Fridge",
    brand: "",
    model: "",
    serial: "",
    location: "",
    inspection: "Unwrapped and visually inspected",
    // Condition
    condition: "No noticeable damage observed at time of delivery",
    damageNote: "",
    damagePhotos: [],
    placementPhoto: null,
    // Testing
    functional: "Not Tested – Not Included in Scope",
    utilNoPower: false,
    utilNoWater: false,
    utilNoPlumbing: false,
    utilNoGas: false,
    utilOther: "",
    // Stove gas exclusion
    gasExclusionConfirmed: true,
    gasDoneByLicensed: false,
    gasTechName: "",
    // Checklist
    checklist: [],
    notes: "",
  };

  a.checklist = buildChecklistFor(a.type, serviceType);
  return a;
}

function buildChecklistFor(type, serviceType){
  if(serviceType === "Delivery") return deliveryChecklist(type);
  if(serviceType === "Installation") return installChecklist(type);
  return deliveryChecklist(type).concat(installChecklist(type));
}

function onServiceTypeChanged(){
  const st = $("serviceType").value;
  const list = state.job?.appliances || [];
  for(const a of list){
    a.checklist = buildChecklistFor(a.type, st);
    // adjust default functional for delivery-only
    if(st==="Delivery"){
      a.functional = "Not Tested – Not Included in Scope";
    } else {
      // installation involved
      if(a.type==="Washer"){
        a.functional = "Not Tested – Time/Program Cycle Not Practical";
      } else if(a.type==="Dishwasher"){
        a.functional = "Not Tested – Utilities Not Available";
      } else if(a.type==="Fridge"){
        a.functional = "Tested – PASS";
      } else {
        a.functional = "Not Tested – Utilities Not Available";
      }
    }
  }
  renderAppliances();
}

// ---------------- Job state ----------------
function newJob(){
  state.job = {
    id: uid(),
    createdAt: nowISO(),
    updatedAt: nowISO(),
    jobType: "Retail Customer",
    serviceType: "Delivery",
    address: "",
    contactName: "",
    contactPhone: "",
    scheduledDT: "",
    builderName: "",
    contractedThrough: "",
    companyEmail: "",
    startedAt: null,
    finishedAt: null,
    gps: null, // {lat, lon, acc}
    attachedIntakeImages: [], // screenshots/photos of work orders
    appliances: [ makeAppliance("Delivery") ],
    repRole: "Site Manager",
    repName: "",
    installerName: "Greg (PHD)",
    signature: null,
  };
  syncFormFromJob();
  renderAppliances();
}

function syncFormFromJob(){
  const j = state.job;
  $("jobType").value = j.jobType;
  $("serviceType").value = j.serviceType;
  $("address").value = j.address;
  $("contactName").value = j.contactName;
  $("contactPhone").value = j.contactPhone;
  $("scheduledDT").value = j.scheduledDT;
  $("builderName").value = j.builderName;
  $("contractedThrough").value = j.contractedThrough;
  $("companyEmail").value = j.companyEmail;
  $("repRole").value = j.repRole;
  $("repName").value = j.repName;
  $("installerName").value = j.installerName;
  setVisibility();
  updateStampPreview();
}
function syncJobFromForm(){
  const j = state.job;
  j.jobType = $("jobType").value;
  j.serviceType = $("serviceType").value;
  j.address = $("address").value.trim();
  j.contactName = $("contactName").value.trim();
  j.contactPhone = $("contactPhone").value.trim();
  j.scheduledDT = $("scheduledDT").value.trim();
  j.builderName = $("builderName").value.trim();
  j.contractedThrough = $("contractedThrough").value.trim();
  j.companyEmail = $("companyEmail").value.trim();
  j.repRole = $("repRole").value;
  j.repName = $("repName").value.trim();
  j.installerName = $("installerName").value.trim();
  j.signature = getSignatureDataURL();
  j.updatedAt = nowISO();
}

// ---------------- Render appliances ----------------
function renderAppliances(){
  const container = $("applianceList");
  container.innerHTML = "";
  const st = $("serviceType").value;

  state.job.appliances.forEach((a, idx) => {
    const gasSection = (a.type==="Stove") ? `
      <hr class="sep" />
      <div class="badge">Gas Work (Stove)</div>
      <div class="muted">Default: no gas hookup/testing. Licensed gas fitter required.</div>
      <div class="field">
        <label>Gas Work Declaration (required)</label>
        <div class="row">
          <label class="badge"><input type="checkbox" data-aid="${a.id}" data-k="gasExclusionConfirmed" ${a.gasExclusionConfirmed?"checked":""}/> Gas work NOT performed (not licensed/insured)</label>
          <label class="badge"><input type="checkbox" data-aid="${a.id}" data-k="gasDoneByLicensed" ${a.gasDoneByLicensed?"checked":""}/> Gas performed by licensed gas fitter (optional)</label>
        </div>
        <div class="help">If licensed gas fitter did the hookup/testing, note name below.</div>
      </div>
      <div class="field">
        <label>Gas fitter name (optional)</label>
        <input data-aid="${a.id}" data-k="gasTechName" value="${escapeHtml(a.gasTechName)}" placeholder="Name / company" />
      </div>
    ` : "";

    const utilArea = (st !== "Delivery") ? `
      <hr class="sep" />
      <div class="badge">Testing & Utilities</div>
      <div class="appl__grid">
        <div class="field">
          <label>Functional Check</label>
          <select data-aid="${a.id}" data-k="functional">
            <option ${a.functional==="Tested – PASS"?"selected":""}>Tested – PASS</option>
            <option ${a.functional==="Not Tested – Utilities Not Available"?"selected":""}>Not Tested – Utilities Not Available</option>
            <option ${a.functional==="Not Tested – Not Included in Scope"?"selected":""}>Not Tested – Not Included in Scope</option>
            <option ${a.functional==="Not Tested – Time/Program Cycle Not Practical"?"selected":""}>Not Tested – Time/Program Cycle Not Practical</option>
          </select>
          <div class="help">Mark what was actually tested after install.</div>
        </div>
        <div class="field">
          <label>Utilities unavailable (check all that apply)</label>
          <div class="row" style="flex-wrap:wrap">
            <label class="badge"><input type="checkbox" data-aid="${a.id}" data-k="utilNoPower" ${a.utilNoPower?"checked":""}/> No power</label>
            <label class="badge"><input type="checkbox" data-aid="${a.id}" data-k="utilNoWater" ${a.utilNoWater?"checked":""}/> No water</label>
            <label class="badge"><input type="checkbox" data-aid="${a.id}" data-k="utilNoPlumbing" ${a.utilNoPlumbing?"checked":""}/> No plumbing/drain</label>
            <label class="badge"><input type="checkbox" data-aid="${a.id}" data-k="utilNoGas" ${a.utilNoGas?"checked":""}/> No gas</label>
          </div>
          <input data-aid="${a.id}" data-k="utilOther" value="${escapeHtml(a.utilOther)}" placeholder="Other (optional)" />
        </div>
      </div>
    ` : "";

    const html = document.createElement("div");
    html.className = "appl";
    html.innerHTML = `
      <div class="appl__head">
        <div class="appl__title">#${idx+1} Appliance</div>
        <div class="appl__meta">
          <span class="badge">ID: ${a.id.slice(0,8)}</span>
          <button class="btn btn--ghost" data-del="${a.id}">Remove</button>
        </div>
      </div>

      <div class="appl__grid">
        <div class="field">
          <label>Type</label>
          <select data-aid="${a.id}" data-k="type">
            ${ApplianceTypes.map(t=>`<option ${a.type===t?"selected":""}>${t}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>Location (where placed)</label>
          <input data-aid="${a.id}" data-k="location" value="${escapeHtml(a.location)}" placeholder="Kitchen / Laundry / Basement / etc."/>
        </div>
        <div class="field">
          <label>Model</label>
          <input data-aid="${a.id}" data-k="model" value="${escapeHtml(a.model)}" placeholder="Model #" />
        </div>
        <div class="field">
          <label>Serial</label>
          <input data-aid="${a.id}" data-k="serial" value="${escapeHtml(a.serial)}" placeholder="Serial #" />
        </div>
      </div>

      <hr class="sep" />

      <div class="appl__grid">
        <div class="field">
          <label>Inspection Status</label>
          <select data-aid="${a.id}" data-k="inspection">
            <option ${a.inspection==="Unwrapped and visually inspected"?"selected":""}>Unwrapped and visually inspected</option>
            <option ${a.inspection==="Left in original packaging at customer request"?"selected":""}>Left in original packaging at customer request</option>
            <option ${a.inspection==="Left packaged – builder / site manager instruction"?"selected":""}>Left packaged – builder / site manager instruction</option>
            <option ${a.inspection==="Inspection not possible"?"selected":""}>Inspection not possible</option>
          </select>
          <div class="help">If left packaged, condition will be “not verified due to packaging”.</div>
        </div>

        <div class="field">
          <label>Placement Photo (required)</label>
          <input type="file" accept="image/*" capture="environment" data-photo="${a.id}" data-pt="placement" />
          <div class="help">${a.placementPhoto ? "✅ Attached" : "— Not attached yet"}</div>
        </div>
      </div>

      <div class="appl__grid">
        <div class="field">
          <label>Condition at time of service</label>
          <select data-aid="${a.id}" data-k="condition" ${a.inspection!=="Unwrapped and visually inspected" ? "disabled":""}>
            <option ${a.condition==="No noticeable damage observed at time of delivery"?"selected":""}>No noticeable damage observed at time of delivery</option>
            <option ${a.condition==="Damage noted (see photos)"?"selected":""}>Damage noted (see photos)</option>
          </select>
          <div class="help">${a.inspection!=="Unwrapped and visually inspected" ? "Condition not verified due to packaging remaining intact." : "Select damage noted if needed."}</div>
        </div>
        <div class="field">
          <label>Damage Photos (only if damage noted)</label>
          <input type="file" accept="image/*" capture="environment" multiple data-photo="${a.id}" data-pt="damage" />
          <div class="help">${a.damagePhotos?.length ? `✅ ${a.damagePhotos.length} attached` : "— none"}</div>
        </div>
      </div>

      <div class="field">
        <label>Damage/Exception Notes (optional)</label>
        <input data-aid="${a.id}" data-k="damageNote" value="${escapeHtml(a.damageNote)}" placeholder="Minor cosmetic scratch, hidden when installed, etc." ${a.condition!=="Damage noted (see photos)" ? "disabled":""}/>
      </div>

      ${utilArea}
      ${gasSection}

      <hr class="sep" />

      <div class="field">
        <label>Checklist</label>
        <div class="muted">Auto-loaded based on service type and appliance type.</div>
        <div class="stack" style="margin-top:8px">
          ${a.checklist.map((it, i)=>`
            <label class="badge" style="width:100%">
              <input type="checkbox" data-aid="${a.id}" data-k="chk:${i}" ${a[`chk_${i}`] ? "checked":""} />
              ${escapeHtml(it)}
            </label>
          `).join("")}
        </div>
      </div>

      <div class="field">
        <label>Notes (optional)</label>
        <input data-aid="${a.id}" data-k="notes" value="${escapeHtml(a.notes)}" placeholder="Tight doorway 31&quot;, winter hazard, etc." />
      </div>
    `;

    container.appendChild(html);
  });

  // wire inputs
  container.querySelectorAll("[data-aid][data-k]").forEach(el => {
    el.addEventListener("change", (e) => {
      const aid = el.getAttribute("data-aid");
      const k = el.getAttribute("data-k");
      const a = state.job.appliances.find(x=>x.id===aid);
      if(!a) return;

      if(k.startsWith("chk:")){
        const idx = Number(k.split(":")[1]);
        a[`chk_${idx}`] = el.checked;
      } else if(el.type === "checkbox"){
        a[k] = el.checked;
      } else {
        a[k] = el.value;
      }

      // If type changes, refresh checklist and stove logic
      if(k === "type"){
        a.checklist = buildChecklistFor(a.type, $("serviceType").value);
        if(a.type !== "Stove"){
          a.gasExclusionConfirmed = true;
          a.gasDoneByLicensed = false;
          a.gasTechName = "";
          a.utilNoGas = false;
        }
      }
      // inspection affects condition
      if(k === "inspection"){
        if(a.inspection !== "Unwrapped and visually inspected"){
          // disable condition; keep as is, but export will show not verified
        }
      }
      // condition affects damage note enabled state
      renderAppliances();
    });
  });

  // photos
  container.querySelectorAll("input[type=file][data-photo]").forEach(el => {
    el.addEventListener("change", async () => {
      const aid = el.getAttribute("data-photo");
      const pt = el.getAttribute("data-pt");
      const a = state.job.appliances.find(x=>x.id===aid);
      if(!a) return;
      const files = [...(el.files || [])];
      if(!files.length) return;

      if(pt === "placement"){
        a.placementPhoto = await toDataURL(files[0]);
      } else {
        // damage
        const urls = [];
        for(const f of files){
          urls.push(await toDataURL(f));
        }
        a.damagePhotos = (a.damagePhotos || []).concat(urls);
      }
      state.job.updatedAt = nowISO();
      renderAppliances();
      showToast("Photo attached");
    });
  });

  // remove
  container.querySelectorAll("[data-del]").forEach(btn => {
    btn.addEventListener("click", () => {
      const aid = btn.getAttribute("data-del");
      state.job.appliances = state.job.appliances.filter(x=>x.id!==aid);
      if(state.job.appliances.length === 0){
        state.job.appliances.push(makeAppliance($("serviceType").value));
      }
      renderAppliances();
    });
  });
}

// ---------------- GPS & stamps ----------------
async function getGPS(){
  return new Promise((resolve) => {
    if(!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos)=> resolve({lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy}),
      ()=> resolve(null),
      { enableHighAccuracy: true, timeout: 7000, maximumAge: 30000 }
    );
  });
}
function updateStampPreview(){
  const j = state.job;
  const parts = [];
  if(j.startedAt) parts.push(`Started: ${fmtDT(j.startedAt)}`);
  if(j.finishedAt) parts.push(`Finished: ${fmtDT(j.finishedAt)}`);
  if(j.gps) parts.push(`GPS: ${j.gps.lat.toFixed(6)}, ${j.gps.lon.toFixed(6)} (±${Math.round(j.gps.acc)}m)`);
  $("stampPreview").textContent = parts.length ? parts.join(" • ") : "Not started";
}

// ---------------- Import parsing (email/text) ----------------
function parseEmailText(text){
  const out = {};
  const t = text.replace(/\r/g,"");

  // phone numbers
  const phoneMatch = t.match(/(\+?1?[\s\-\.]?)?(\(?\d{3}\)?)[\s\-\.]?\d{3}[\s\-\.]?\d{4}(\s*(ext\.?|x)\s*\d+)?/i);
  if(phoneMatch) out.contactPhone = phoneMatch[0].trim();

  // time
  const timeMatch = t.match(/\b(\d{1,2})(:\d{2})?\s*(am|pm)\b/i);
  if(timeMatch) out.scheduledDT = (out.scheduledDT || "").trim() + (out.scheduledDT ? " " : "") + timeMatch[0].toUpperCase();

  // day words
  const dayMatch = t.match(/\b(mon(day)?|tue(s(day)?)?|wed(nesday)?|thu(rs(day)?)?|fri(day)?|sat(urday)?|sun(day)?)\b/i);
  if(dayMatch){
    out.scheduledDT = (dayMatch[0].slice(0,3).toUpperCase()) + (out.scheduledDT ? " " + out.scheduledDT : "");
  }

  // address heuristic: number + street word + suffix
  const addrMatch = t.match(/\b\d{1,6}\s+[A-Za-z0-9.\- ]{2,40}\s+(St|Street|Ave|Avenue|Dr|Drive|Rd|Road|Blvd|Boulevard|Cres|Crescent|Ln|Lane|Ct|Court|Way|Terr|Terrace|Pl|Place)\b\.?/i);
  if(addrMatch) out.address = addrMatch[0].replace(/\s+/g," ").trim();

  // contact name heuristic "call me at" "I booked"
  const nameMatch = t.match(/^\s*([A-Z][a-z]+)\s+([A-Z][a-z]+)\b/m);
  if(nameMatch) out.contactName = `${nameMatch[1]} ${nameMatch[2]}`;

  // model numbers: long-ish alphanum tokens
  const models = [...t.matchAll(/\b[A-Z0-9]{6,}\b/g)].map(m=>m[0]).filter(x=>/[A-Z]/.test(x) && /\d/.test(x));
  if(models.length) out.models = Array.from(new Set(models)).slice(0,10);

  // appliance keywords
  const kw = [];
  const lower = t.toLowerCase();
  if(lower.includes("fridge") || lower.includes("refrigerator")) kw.push("Fridge");
  if(lower.includes("dishwasher")) kw.push("Dishwasher");
  if(lower.includes("washer")) kw.push("Washer");
  if(lower.includes("dryer")) kw.push("Dryer");
  if(lower.includes("wall oven") || (lower.includes("oven") && !lower.includes("microwave"))) kw.push("Wall Oven");
  if(lower.includes("stove") || lower.includes("range")) kw.push("Stove");
  out.applianceHints = Array.from(new Set(kw));

  // email address
  const emailMatch = t.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if(emailMatch) out.companyEmail = emailMatch[0];

  // city words: simple list for Manitoba common? leave as note
  return out;
}

function applyImportToJob(parsed){
  if(parsed.address) $("address").value = parsed.address;
  if(parsed.contactPhone) $("contactPhone").value = parsed.contactPhone;
  if(parsed.companyEmail) $("companyEmail").value = parsed.companyEmail;
  if(parsed.contactName) $("contactName").value = parsed.contactName;
  if(parsed.scheduledDT){
    const cur = $("scheduledDT").value.trim();
    $("scheduledDT").value = cur ? cur : parsed.scheduledDT.trim();
  }

  // Add appliances based on hints
  if(parsed.applianceHints?.length){
    // if job has one default empty appliance, reuse it
    const current = state.job.appliances;
    const hasOnlyOneEmpty = current.length===1 && !current[0].model && !current[0].serial && !current[0].placementPhoto;
    const types = parsed.applianceHints;
    if(hasOnlyOneEmpty){
      current[0].type = types[0];
      current[0].checklist = buildChecklistFor(current[0].type, $("serviceType").value);
    } else {
      for(const t of types){
        const a = makeAppliance($("serviceType").value);
        a.type = t;
        a.checklist = buildChecklistFor(a.type, $("serviceType").value);
        current.push(a);
      }
    }
    // map first model to first appliance
    if(parsed.models?.length){
      current[0].model = parsed.models[0];
    }
    renderAppliances();
  }

  showToast("Import applied");
}

// ---------------- Export (Print to PDF) ----------------
function validateForExport(){
  const j = state.job;
  syncJobFromForm();
  const errs = [];
  if(!j.address) errs.push("Project Address is required.");
  j.appliances.forEach((a, idx) => {
    if(!a.placementPhoto) errs.push(`Appliance #${idx+1} needs a Placement Photo.`);
    if(a.type==="Stove" && !a.gasExclusionConfirmed && !a.gasDoneByLicensed){
      errs.push(`Stove (#${idx+1}) requires Gas Work Declaration checkbox.`);
    }
    if(a.condition==="Damage noted (see photos)" && (!a.damagePhotos || a.damagePhotos.length===0)){
      errs.push(`Appliance #${idx+1} has damage noted but no damage photos attached.`);
    }
  });
  return errs;
}

function buildExportHTML(){
  const j = state.job;
  const dtNow = new Date().toLocaleString();

  const utilitiesLine = (a) => {
    const arr = [];
    if(a.utilNoPower) arr.push("No power");
    if(a.utilNoWater) arr.push("No water");
    if(a.utilNoPlumbing) arr.push("No plumbing/drain");
    if(a.utilNoGas) arr.push("No gas");
    if(a.utilOther?.trim()) arr.push(a.utilOther.trim());
    return arr.length ? arr.join(", ") : "—";
  };

  const stoveExclusionText = (a) => {
    if(a.type!=="Stove") return "";
    if(a.gasDoneByLicensed && a.gasTechName?.trim()){
      return `<div class="note"><strong>Gas:</strong> Gas hookup/testing performed by licensed gas fitter: ${escapeHtml(a.gasTechName.trim())}</div>`;
    }
    // default
    return `<div class="note"><strong>Licensed Trade Exclusions:</strong> Gas connection and leak testing were not performed. Gas hookup/testing must be completed by a qualified licensed gas fitter unless otherwise noted.</div>`;
  };

  const conditionBlock = (a) => {
    if(a.inspection !== "Unwrapped and visually inspected"){
      return `<div class="kv"><div class="k">Inspection</div><div class="v">${escapeHtml(a.inspection)} — Exterior surfaces not visually inspected at time of service.</div></div>`;
    }
    const c = a.condition;
    if(c !== "Damage noted (see photos)"){
      return `<div class="kv"><div class="k">Condition</div><div class="v">No noticeable damage observed at time of service.</div></div>`;
    }
    const note = a.damageNote?.trim() ? `<div class="kv"><div class="k">Damage Notes</div><div class="v">${escapeHtml(a.damageNote.trim())}</div></div>` : "";
    const imgs = (a.damagePhotos||[]).slice(0,12).map(u=>`<img class="img" src="${u}" />`).join("");
    return `
      <div class="kv"><div class="k">Condition</div><div class="v"><strong>Damage noted.</strong> Photos included.</div></div>
      ${note}
      <div class="grid3">${imgs}</div>
    `;
  };

  const testBlock = (a) => {
    if(j.serviceType === "Delivery") return "";
    const util = utilitiesLine(a);
    return `
      <div class="kv"><div class="k">Functional Check</div><div class="v">${escapeHtml(a.functional)}</div></div>
      <div class="kv"><div class="k">Utilities Unavailable</div><div class="v">${escapeHtml(util)}</div></div>
    `;
  };

  const checklistRows = (a) => {
    const items = a.checklist || [];
    return items.map((it, i) => {
      const ok = !!a[`chk_${i}`];
      return `<li class="${ok?'ok':'no'}">${ok?'✓':'—'} ${escapeHtml(it)}</li>`;
    }).join("");
  };

  const header = `
    <div class="hdr">
      <div class="hdr__left">
        <img class="logo" src="assets/logo.png" />
        <div>
          <div class="h1">${escapeHtml(APP.company)}</div>
          <div class="h2">${escapeHtml(APP.pdfTitle)}</div>
        </div>
      </div>
      <div class="hdr__right">
        <div class="pill">Certificate ID: <strong>${escapeHtml(j.id)}</strong></div>
        <div class="pill">Generated: ${escapeHtml(dtNow)}</div>
      </div>
    </div>
  `;

  const jobMeta = `
    <div class="box">
      <div class="grid2">
        <div class="kv"><div class="k">Job Type</div><div class="v">${escapeHtml(j.jobType)}</div></div>
        <div class="kv"><div class="k">Service Type</div><div class="v">${escapeHtml(j.serviceType)}</div></div>
        <div class="kv"><div class="k">Project Address</div><div class="v">${escapeHtml(j.address)}</div></div>
        <div class="kv"><div class="k">Scheduled</div><div class="v">${escapeHtml(j.scheduledDT || "—")}</div></div>
        <div class="kv"><div class="k">Contact</div><div class="v">${escapeHtml([j.contactName, j.contactPhone].filter(Boolean).join(" • ") || "—")}</div></div>
        <div class="kv"><div class="k">Builder</div><div class="v">${escapeHtml(j.builderName || "—")}</div></div>
        <div class="kv"><div class="k">Contracted Through</div><div class="v">${escapeHtml(j.contractedThrough || "—")}</div></div>
        <div class="kv"><div class="k">Company Email</div><div class="v">${escapeHtml(j.companyEmail || "—")}</div></div>
        <div class="kv"><div class="k">Start / Finish</div><div class="v">${escapeHtml([j.startedAt?fmtDT(j.startedAt):null, j.finishedAt?fmtDT(j.finishedAt):null].filter(Boolean).join(" • ") || "—")}</div></div>
        <div class="kv"><div class="k">GPS</div><div class="v">${j.gps ? escapeHtml(`${j.gps.lat.toFixed(6)}, ${j.gps.lon.toFixed(6)} (±${Math.round(j.gps.acc)}m)`) : "—"}</div></div>
      </div>
    </div>
  `;

  const rep = (j.repRole==="No Representative Present") ?
    `<div class="note">No site representative present at time of completion. Documentation recorded and timestamped.</div>` : "";

  const sig = j.signature ? `<img class="sigimg" src="${j.signature}" />` : `<div class="sigbox">No signature captured</div>`;

  const signoff = `
    <div class="box">
      <div class="h3">Sign-off</div>
      <div class="grid2">
        <div class="kv"><div class="k">Representative</div><div class="v">${escapeHtml(j.repRole)}${j.repName?` — ${escapeHtml(j.repName)}`:""}</div></div>
        <div class="kv"><div class="k">Installer</div><div class="v">${escapeHtml(j.installerName || "—")}</div></div>
      </div>
      <div class="sigarea">
        <div class="siglabel">Signature – Service Confirmation</div>
        ${sig}
        <div class="sigsmall">Signature confirming delivery and/or installation.</div>
      </div>
      ${rep}
    </div>
  `;

  const appliances = j.appliances.map((a, idx)=>`
    <div class="apbox">
      <div class="aphead">
        <div class="apname">Appliance #${idx+1}: ${escapeHtml(a.type)}</div>
        <div class="apid">Model: ${escapeHtml(a.model || "—")} • Serial: ${escapeHtml(a.serial || "—")}</div>
      </div>

      <div class="grid2">
        <div class="kv"><div class="k">Location</div><div class="v">${escapeHtml(a.location || "—")}</div></div>
        <div class="kv"><div class="k">Inspection Status</div><div class="v">${escapeHtml(a.inspection)}</div></div>
      </div>

      <div class="kv"><div class="k">Placement Photo</div><div class="v"></div></div>
      <img class="img big" src="${a.placementPhoto}" />

      ${conditionBlock(a)}
      ${testBlock(a)}
      ${stoveExclusionText(a)}

      <div class="h4">Checklist</div>
      <ul class="chk">${checklistRows(a)}</ul>

      ${a.notes?.trim() ? `<div class="note"><strong>Notes:</strong> ${escapeHtml(a.notes.trim())}</div>` : ""}
    </div>
  `).join("");

  // intake attachments
  const intake = (j.attachedIntakeImages?.length) ? `
    <div class="box">
      <div class="h3">Intake Attachments</div>
      <div class="note">Attached work order images / screenshots.</div>
      <div class="grid3">
        ${j.attachedIntakeImages.map(u=>`<img class="img" src="${u}" />`).join("")}
      </div>
    </div>
  ` : "";

  const css = `
    <style>
      :root{
        --ink:#0b1220;
        --mut:#4b5563;
        --line: rgba(15,23,42,.18);
        --blue:#1e40af;
      }
      html,body{margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; color: var(--ink); background:#fff;}
      .page{padding:22px; max-width: 980px; margin: 0 auto;}
      .hdr{display:flex; justify-content:space-between; gap:12px; align-items:flex-start; border-bottom:2px solid var(--line); padding-bottom:12px; margin-bottom:14px;}
      .hdr__left{display:flex; gap:12px; align-items:center}
      .logo{width:52px; height:52px; border-radius:14px; object-fit:cover; border:1px solid var(--line)}
      .h1{font-weight:900; font-size:18px}
      .h2{font-size:12px; color: var(--mut); margin-top:4px}
      .hdr__right{display:flex; flex-direction:column; gap:8px; align-items:flex-end}
      .pill{font-size:12px; padding:6px 10px; border:1px solid var(--line); border-radius:999px; background:#f8fafc}
      .box{border:1px solid var(--line); border-radius:16px; padding:14px; margin:12px 0}
      .apbox{border:1px solid var(--line); border-radius:16px; padding:14px; margin:14px 0; page-break-inside: avoid;}
      .aphead{display:flex; justify-content:space-between; gap:10px; align-items:flex-start; margin-bottom:10px}
      .apname{font-weight:900}
      .apid{color: var(--mut); font-size:12px}
      .grid2{display:grid; grid-template-columns: 1fr 1fr; gap:10px}
      .grid3{display:grid; grid-template-columns: repeat(3, 1fr); gap:10px}
      .kv{display:grid; grid-template-columns: 180px 1fr; gap:10px; margin:6px 0}
      .k{color: var(--mut); font-size:12px; font-weight:800}
      .v{font-size:13px}
      .note{font-size:12px; color: var(--ink); background:#f8fafc; border:1px solid var(--line); padding:10px; border-radius:14px; margin-top:10px}
      .h3{font-weight:900; margin-bottom:8px}
      .h4{font-weight:900; margin-top:14px}
      .img{width:100%; height:180px; object-fit:cover; border-radius:14px; border:1px solid var(--line); background:#fff}
      .img.big{height:280px}
      .chk{margin:10px 0 0 0; padding-left:16px; font-size:12px}
      .chk li{margin:4px 0}
      .chk li.ok{color:#065f46}
      .chk li.no{color:#374151}
      .sigarea{margin-top:10px; border-top:1px solid var(--line); padding-top:10px}
      .siglabel{font-weight:900; margin-bottom:8px}
      .sigimg{width:100%; max-height:140px; object-fit:contain; border:1px solid var(--line); border-radius:14px; background:#fff}
      .sigbox{height:140px; border:1px dashed var(--line); border-radius:14px; display:flex; align-items:center; justify-content:center; color: var(--mut)}
      .sigsmall{color: var(--mut); font-size:12px; margin-top:6px}
      @media print{
        .page{padding:0}
        .apbox, .box{break-inside: avoid;}
      }
    </style>
  `;

  const html = `
    <!doctype html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(j.id)} - Precision Certificate</title>
      ${css}
    </head>
    <body>
      <div class="page">
        ${header}
        ${jobMeta}
        ${intake}
        ${signoff}
        ${appliances}
        <div class="note">Generated by ${escapeHtml(APP.name)} (${escapeHtml(APP.version)}). Print to PDF for your Proof Pack.</div>
      </div>
      <script>
        // Auto-open print dialog after a short delay
        setTimeout(() => { window.print(); }, 700);
      </script>
    </body>
    </html>
  `;
  return html;
}

function exportPrint(){
  const errs = validateForExport();
  if(errs.length){
    alert("Fix these before exporting:\\n\\n- " + errs.join("\\n- "));
    return;
  }
  const w = window.open("", "_blank");
  if(!w){ alert("Pop-up blocked. Allow pop-ups for this site to export."); return; }
  w.document.open();
  w.document.write(buildExportHTML());
  w.document.close();
}

// ---------------- Jobs list ----------------
async function openJobs(){
  const dlg = $("jobsDlg");
  const list = $("jobsList");
  const jobs = await idbGetAll("jobs");
  jobs.sort((a,b) => (b.updatedAt||"").localeCompare(a.updatedAt||""));

  list.innerHTML = jobs.length ? "" : `<div class="muted">No saved jobs yet.</div>`;
  for(const j of jobs){
    const el = document.createElement("div");
    el.className = "jobitem";
    el.innerHTML = `
      <div class="jobitem__meta">
        <div class="jobitem__title">${escapeHtml(j.address || "(No address)")}</div>
        <div class="jobitem__small">${escapeHtml(j.id)} • ${escapeHtml(j.serviceType)} • ${escapeHtml(fmtDT(j.updatedAt))}</div>
      </div>
      <div class="row" style="flex-wrap:wrap; justify-content:flex-end">
        <button type="button" class="btn btn--secondary" data-load="${escapeHtml(j.id)}">Load</button>
        <button type="button" class="btn btn--ghost" data-deljob="${escapeHtml(j.id)}">Delete</button>
      </div>
    `;
    list.appendChild(el);
  }

  list.querySelectorAll("[data-load]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const id = btn.getAttribute("data-load");
      const j = await idbGet("jobs", id);
      if(j){
        state.job = j;
        syncFormFromJob();
        // restore signature
        const sig = j.signature;
        if(sig){
          const canvas = $("sigCanvas");
          const ctx = canvas.getContext("2d");
          const img = new Image();
          img.onload = () => {
            ctx.clearRect(0,0,canvas.width,canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          };
          img.src = sig;
        } else {
          $("btnSigClear").click();
        }
        renderAppliances();
        dlg.close();
        showToast("Job loaded");
      }
    });
  });
  list.querySelectorAll("[data-deljob]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const id = btn.getAttribute("data-deljob");
      const jobs = await idbGetAll("jobs");
      const keep = jobs.filter(x=>x.id!==id);
      await idbClear("jobs");
      for(const k of keep) await idbPut("jobs", k);
      openJobs();
    });
  });

  dlg.showModal();
}

// ---------------- Import modal ----------------
function initImportModal(){
  const dlg = $("importDlg");
  const tabs = dlg.querySelectorAll(".tab");
  const panes = dlg.querySelectorAll(".tabpane");

  tabs.forEach(t => t.addEventListener("click", ()=>{
    tabs.forEach(x=>x.classList.remove("tab--active"));
    panes.forEach(p=>p.classList.remove("tabpane--active"));
    t.classList.add("tab--active");
    dlg.querySelector(`[data-pane="${t.getAttribute("data-tab")}"]`).classList.add("tabpane--active");
  }));

  $("btnParseText").addEventListener("click", ()=>{
    const text = $("importText").value || "";
    state.import.parsed = parseEmailText(text);
    $("importPreview").textContent = JSON.stringify(state.import.parsed, null, 2);
  });

  $("btnApplyImport").addEventListener("click", ()=>{
    if(!state.import.parsed || Object.keys(state.import.parsed).length===0){
      state.import.parsed = parseEmailText($("importText").value || "");
      $("importPreview").textContent = JSON.stringify(state.import.parsed, null, 2);
    }
    applyImportToJob(state.import.parsed);
  });

  $("importImage").addEventListener("change", async ()=>{
    const file = $("importImage").files?.[0];
    if(!file) return;
    const url = await toDataURL(file);
    state.import.attachedImage = url;
    $("importImagePreview").innerHTML = `<img src="${url}" alt="Attached intake" />`;
  });

  $("btnAttachImage").addEventListener("click", ()=>{
    if(state.import.attachedImage){
      state.job.attachedIntakeImages = state.job.attachedIntakeImages || [];
      state.job.attachedIntakeImages.push(state.import.attachedImage);
      state.job.updatedAt = nowISO();
      showToast("Intake image attached");
    } else {
      showToast("No image selected");
    }
  });

  $("btnImport").addEventListener("click", ()=> dlg.showModal());
}

// ---------------- Main init ----------------
async function main(){
  await idbOpen();
  if("serviceWorker" in navigator){
    try{
      await navigator.serviceWorker.register("sw.js");
    }catch(e){}
  }

  initSignature();
  initImportModal();

  $("jobType").addEventListener("change", setVisibility);
  $("serviceType").addEventListener("change", ()=>{
    onServiceTypeChanged();
  });

  $("btnNew").addEventListener("click", ()=>{
    if(confirm("Start a new job? (Current unsaved changes will be lost if not saved.)")){
      $("btnSigClear").click();
      newJob();
    }
  });

  $("btnAddAppliance").addEventListener("click", ()=>{
    const a = makeAppliance($("serviceType").value);
    state.job.appliances.push(a);
    renderAppliances();
  });

  $("btnStart").addEventListener("click", async ()=>{
    syncJobFromForm();
    state.job.startedAt = nowISO();
    state.job.gps = await getGPS();
    updateStampPreview();
    showToast("Job started");
  });

  $("btnFinish").addEventListener("click", ()=>{
    syncJobFromForm();
    state.job.finishedAt = nowISO();
    updateStampPreview();
    showToast("Job finished");
  });

  $("btnSave").addEventListener("click", async ()=>{
    syncJobFromForm();
    if(!state.job.address){
      alert("Please enter the Project Address before saving.");
      return;
    }
    await idbPut("jobs", state.job);
    showToast("Saved offline");
  });

  $("btnJobs").addEventListener("click", openJobs);

  $("btnDeleteAll").addEventListener("click", async ()=>{
    if(confirm("Delete all saved jobs from this device?")){
      await idbClear("jobs");
      showToast("Deleted");
      $("jobsDlg").close();
    }
  });

  $("btnExport").addEventListener("click", exportPrint);

  $("btnInstallHint").addEventListener("click", ()=>{
    alert("Tip: In Chrome on Android, tap ⋮ → Add to Home screen to install this app.");
  });

  // Default job
  newJob();
  setVisibility();
}

main();
