/* PHD – Precision Home Delivery
   app.js – crash-resistant “clean” version
   - Keeps dropdowns editable
   - Auto checklist by Service Type + Appliance Type
   - Adds “Delivery deferred” reason dropdown + manual comment
*/

(function () {
  "use strict";

  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);
  const safeOn = (el, evt, fn) => el && el.addEventListener(evt, fn);
  const val = (id) => ($(id) ? $(id).value : "");
  const setVal = (id, v) => { if ($(id)) $(id).value = (v ?? ""); };
  const isChecked = (id) => ($(id) ? !!$(id).checked : false);

  const LS_KEY = "phd_jobs_v1";
  const LS_ACTIVE = "phd_active_job_id_v1";

  // ---------- templates ----------
  const ApplianceTypes = ["Fridge", "Stove", "Washer", "Dryer", "Dishwasher", "Wall Oven", "Microwave", "Other"];

  const DEFER_REASONS = [
    "Doorway / clearance issue (requires door removal)",
    "Stairs / railing / landing clearance issue",
    "Unit too heavy / needs more manpower or equipment",
    "Water/power/gas not available to test",
    "Customer requested reschedule / not ready",
    "Site access blocked (snow/ice/locked gate/elevator)",
    "Parts missing / damaged / wrong item",
    "Builder/GC approval required",
    "Other (use manual comment)"
  ];

  function deliveryChecklist(applianceType) {
    const base = [
      "Path protection used where required",
      "Unit placed in requested location",
      "Placement photo captured",
      "Delivery deferred (see reason below)"
    ];

    const byType = {
      "Fridge": [
        "Doorways/turns verified before final move",
        "Doors protected during move",
        "Power cord secured"
      ],
      "Stove": [
        "Doorway/clearance verified",
        "Anti-tip bracket present/verified (if applicable)",
        "Power cord secured"
      ],
      "Washer": [
        "Hoses/parts delivered with unit (if included)",
        "Drain path confirmed",
        "Power cord secured"
      ],
      "Dryer": [
        "Vent location confirmed (if applicable)",
        "Power cord/plug verified",
        "Unit staged safely"
      ],
      "Dishwasher": [
        "Unit delivered to install area",
        "Kickplate/hardware delivered (if included)"
      ],
      "Wall Oven": [
        "Unit delivered to install area",
        "Cutout/clearance visually checked"
      ],
      "Microwave": [
        "Unit delivered to install area",
        "Hardware/bracket delivered (if included)"
      ],
      "Other": [
        "Clearance/fit visually checked",
        "Unit staged safely"
      ]
    };

    return base.concat(byType[applianceType] || []);
  }

  function installChecklist(applianceType) {
    const base = [
      "Install area inspected for fit/clearance",
      "Unit positioned and leveled (if applicable)",
      "Final placement photo captured",
      "Install deferred (see reason below)"
    ];

    const byType = {
      "Fridge": [
        "Powered on (if power available)",
        "Water line connected (if included/available)",
        "Basic function check completed (if possible)"
      ],
      "Stove": [
        "Powered on (if power available)",
        "Basic function check completed (if possible)"
      ],
      "Washer": [
        "Hoses connected (if included/available)",
        "Basic function check completed (if possible)"
      ],
      "Dryer": [
        "Vent connected (if applicable/available)",
        "Basic function check completed (if possible)"
      ],
      "Dishwasher": [
        "Secured in place (if install completed)",
        "Basic function check completed (if possible)"
      ],
      "Wall Oven": [
        "Secured in place (if install completed)",
        "Basic function check completed (if possible)"
      ],
      "Microwave": [
        "Secured in place (if install completed)",
        "Basic function check completed (if possible)"
      ],
      "Other": [
        "Installed per scope (if possible)",
        "Basic function check completed (if possible)"
      ]
    };

    return base.concat(byType[applianceType] || []);
  }

  // ---------- UI rendering ----------
  function ensureDeferUI(container) {
    if (!container) return;

    let wrap = $("deferWrap");
    if (wrap) return; // already exists

    wrap = document.createElement("div");
    wrap.id = "deferWrap";
    wrap.style.marginTop = "14px";
    wrap.style.display = "none";

    const label1 = document.createElement("div");
    label1.style.fontWeight = "700";
    label1.style.marginBottom = "8px";
    label1.textContent = "Deferred reason";

    const sel = document.createElement("select");
    sel.id = "deferReason";
    sel.style.width = "100%";
    sel.style.padding = "12px 14px";
    sel.style.borderRadius = "14px";
    sel.style.border = "1px solid rgba(255,255,255,.14)";
    sel.style.background = "rgba(10,16,28,.55)";
    sel.style.color = "inherit";
    sel.style.marginBottom = "10px";

    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "Select a reason…";
    sel.appendChild(opt0);

    DEFER_REASONS.forEach(r => {
      const o = document.createElement("option");
      o.value = r;
      o.textContent = r;
      sel.appendChild(o);
    });

    const label2 = document.createElement("div");
    label2.style.fontWeight = "700";
    label2.style.marginBottom = "8px";
    label2.textContent = "Manual comment (optional)";

    const ta = document.createElement("textarea");
    ta.id = "deferComment";
    ta.rows = 3;
    ta.placeholder = 'Example: "Doorway 29\" clear, fridge 29 3/4\". Builder to remove door + pins. Unit left sealed in garage. Return scheduled."';
    ta.style.width = "100%";
    ta.style.padding = "12px 14px";
    ta.style.borderRadius = "14px";
    ta.style.border = "1px solid rgba(255,255,255,.14)";
    ta.style.background = "rgba(10,16,28,.55)";
    ta.style.color = "inherit";

    wrap.appendChild(label1);
    wrap.appendChild(sel);
    wrap.appendChild(label2);
    wrap.appendChild(ta);

    container.appendChild(wrap);
  }

  function renderChecklist() {
    const box = $("checklistBox") || $("checklist") || $("checklistContainer");
    if (!box) return;

    // Decide which template
    const service = (val("serviceType") || "").toLowerCase();
    const appliance = val("applianceType") || val("appliance") || "Other";

    const items = (service.includes("install"))
      ? installChecklist(appliance)
      : deliveryChecklist(appliance);

    // Clear
    box.innerHTML = "";

    // Add items
    items.forEach((text, idx) => {
      const id = "ck_" + idx;

      const row = document.createElement("label");
      row.className = "ckRow";
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "12px";
      row.style.padding = "14px 14px";
      row.style.border = "1px solid rgba(255,255,255,.10)";
      row.style.borderRadius = "18px";
      row.style.background = "rgba(255,255,255,.04)";
      row.style.marginBottom = "10px";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.id = id;
      cb.style.transform = "scale(1.15)";

      const t = document.createElement("div");
      t.textContent = text;
      t.style.fontWeight = "700";

      row.appendChild(cb);
      row.appendChild(t);
      box.appendChild(row);
    });

    // Defer UI appears under checklist
    ensureDeferUI(box);

    // Hook defer toggling
    hookDeferToggle();
  }

  function hookDeferToggle() {
    const box = $("checklistBox") || $("checklist") || $("checklistContainer");
    const wrap = $("deferWrap");
    if (!box || !wrap) return;

    // Find the checkbox that contains "deferred" text by scanning labels
    const rows = Array.from(box.querySelectorAll("label"));
    let deferCheckbox = null;

    for (const r of rows) {
      if ((r.textContent || "").toLowerCase().includes("deferred")) {
        deferCheckbox = r.querySelector("input[type=checkbox]");
        break;
      }
    }

    if (!deferCheckbox) return;

    const update = () => {
      wrap.style.display = deferCheckbox.checked ? "block" : "none";
      if (!deferCheckbox.checked) {
        if ($("deferReason")) $("deferReason").value = "";
        if ($("deferComment")) $("deferComment").value = "";
      }
    };

    safeOn(deferCheckbox, "change", update);
    update();
  }

  // ---------- jobs / storage ----------
  function loadJobs() {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function saveJobs(list) {
    localStorage.setItem(LS_KEY, JSON.stringify(list || []));
  }

  function newJobSkeleton() {
    return {
      id: String(Date.now()),
      createdAt: new Date().toISOString(),
      jobType: val("jobType"),
      serviceType: val("serviceType"),
      applianceType: val("applianceType") || val("appliance") || "Other",
      projectAddress: val("projectAddress"),
      contactName: val("contactName"),
      contactPhone: val("contactPhone"),
      scheduledDateTime: val("scheduledDateTime"),
      damageNotes: val("damageNotes") || val("damage") || "",
      notes: val("notes") || "",
      checklist: [],
      deferReason: val("deferReason"),
      deferComment: val("deferComment")
    };
  }

  function captureChecklist() {
    const box = $("checklistBox") || $("checklist") || $("checklistContainer");
    if (!box) return [];

    const rows = Array.from(box.querySelectorAll("label"));
    return rows.map(r => {
      const cb = r.querySelector("input[type=checkbox]");
      const text = (r.textContent || "").trim();
      return { text, done: cb ? !!cb.checked : false };
    });
  }

  function applyJob(job) {
    if (!job) return;

    setVal("jobType", job.jobType);
    setVal("serviceType", job.serviceType);
    setVal("applianceType", job.applianceType);
    setVal("appliance", job.applianceType);

    setVal("projectAddress", job.projectAddress);
    setVal("contactName", job.contactName);
    setVal("contactPhone", job.contactPhone);
    setVal("scheduledDateTime", job.scheduledDateTime);
    setVal("damageNotes", job.damageNotes);
    setVal("damage", job.damageNotes);
    setVal("notes", job.notes);

    // Always keep dropdown editable
    if ($("serviceType")) $("serviceType").disabled = false;
    if ($("jobType")) $("jobType").disabled = false;
    if ($("applianceType")) $("applianceType").disabled = false;
    if ($("appliance")) $("appliance").disabled = false;

    renderChecklist();

    // Re-apply checklist state if saved
    const box = $("checklistBox") || $("checklist") || $("checklistContainer");
    if (box && Array.isArray(job.checklist) && job.checklist.length) {
      const cbs = Array.from(box.querySelectorAll("input[type=checkbox]"));
      for (let i = 0; i < Math.min(cbs.length, job.checklist.length); i++) {
        cbs[i].checked = !!job.checklist[i].done;
      }
    }

    // Defer fields
    if ($("deferReason")) $("deferReason").value = job.deferReason || "";
    if ($("deferComment")) $("deferComment").value = job.deferComment || "";
    hookDeferToggle();
  }

  function saveActiveJob() {
    const jobs = loadJobs();
    const activeId = localStorage.getItem(LS_ACTIVE);

    const snapshot = newJobSkeleton();
    snapshot.checklist = captureChecklist();
    snapshot.deferReason = val("deferReason");
    snapshot.deferComment = val("deferComment");

    // update existing or add new
    const idx = jobs.findIndex(j => j.id === activeId);
    if (idx >= 0) {
      snapshot.id = jobs[idx].id;
      snapshot.createdAt = jobs[idx].createdAt || snapshot.createdAt;
      jobs[idx] = snapshot;
    } else {
      localStorage.setItem(LS_ACTIVE, snapshot.id);
      jobs.unshift(snapshot);
    }

    saveJobs(jobs);
  }

  function startNewJob() {
    // Clear basic fields (only if present)
    ["projectAddress","contactName","contactPhone","scheduledDateTime","damageNotes","damage","notes"].forEach(k => setVal(k, ""));
    // Keep dropdowns editable
    if ($("serviceType")) $("serviceType").disabled = false;
    if ($("jobType")) $("jobType").disabled = false;
    if ($("applianceType")) $("applianceType").disabled = false;
    if ($("appliance")) $("appliance").disabled = false;

    // new active id
    localStorage.setItem(LS_ACTIVE, String(Date.now()));
    renderChecklist();
  }

  // ---------- wiring ----------
  function wire() {
    // Keep dropdowns editable ALWAYS
    ["serviceType", "jobType", "applianceType", "appliance"].forEach(id => {
      if ($(id)) $(id).disabled = false;
    });

    // Re-render checklist when these change
    ["serviceType", "applianceType", "appliance"].forEach(id => {
      safeOn($(id), "change", () => {
        renderChecklist();
        // do not auto-lock anything
        if ($("serviceType")) $("serviceType").disabled = false;
      });
    });

    // Autosave on changes (lightweight)
    const autos = ["jobType","serviceType","applianceType","appliance","projectAddress","contactName","contactPhone","scheduledDateTime","damageNotes","damage","notes"];
    autos.forEach(id => safeOn($(id), "input", () => saveActiveJob()));
    autos.forEach(id => safeOn($(id), "change", () => saveActiveJob()));

    // Buttons (only if they exist)
    safeOn($("btnNewJob"), "click", () => { startNewJob(); });
    safeOn($("btnPrint"), "click", () => { saveActiveJob(); window.print(); });

    // If your HTML uses different IDs, these won’t crash — they just won’t bind.
    safeOn($("btnJobs"), "click", () => {
      // simple: save then alert count (no fancy UI)
      saveActiveJob();
      const jobs = loadJobs();
      alert(`Saved. Jobs stored on this device: ${jobs.length}`);
    });

    // Initial checklist render
    renderChecklist();

    // Load last active job if any
    const jobs = loadJobs();
    const activeId = localStorage.getItem(LS_ACTIVE);
    const activeJob = jobs.find(j => j.id === activeId) || jobs[0];
    if (activeJob) applyJob(activeJob);

    // Safety: never let serviceType be disabled by anything
    setInterval(() => {
      if ($("serviceType") && $("serviceType").disabled) $("serviceType").disabled = false;
    }, 800);
  }

  // Go
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }

})();
