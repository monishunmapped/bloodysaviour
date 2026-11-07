(() => {
  const config = window.BS_CONFIG || {};
  const configured = /^https:\/\/.+\.supabase\.co$/.test(config.supabaseUrl || "") && (config.supabaseAnonKey || "").length > 30;
  window.bsBackendReady = configured;
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = n => new Intl.NumberFormat("en-IN").format(n || 0);
  const normalizePhone = value => {
    const phone = String(value || "").replace(/[\s()-]/g, "");
    if (/^\d{10}$/.test(phone)) return `+91${phone}`;
    if (/^\+\d{8,15}$/.test(phone)) return phone;
    return null;
  };
  if (!configured || !window.supabase) {
    ["liveDonors", "liveRequesters", "liveRequests", "liveBanks"].forEach(id => { const node = document.getElementById(id); if (node) node.textContent = "0"; });
    return;
  }
  const client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  window.bsSupabase = client;
  let signInPhone = "";
  document.addEventListener("click", async (event) => {
    const invite = event.target.closest?.("[data-invite]");
    if (invite) return window.bsInviteDonor(invite.dataset.invite);
    if (event.target?.id === "signinSend") {
      signInPhone = normalizePhone(document.getElementById("signinPhone").value);
      if (!signInPhone) return showToast("Enter your mobile number with country code.");
      const { error } = await client.auth.signInWithOtp({ phone: signInPhone, options: { shouldCreateUser: false } });
      if (error) return showToast("OTP could not be sent. Check the number and SMS setup.");
      document.getElementById("signinOtpWrap").style.display = "flex";
      document.getElementById("signinVerify").style.display = "inline-flex";
      showToast("OTP sent to your verified mobile.");
    }
    if (event.target?.id === "signinVerify") {
      const token = document.getElementById("signinCode").value.trim();
      const { error } = await client.auth.verifyOtp({ phone: signInPhone, token, type: "sms" });
      if (error) return showToast("That OTP could not be verified.");
      closeModal(); showToast("Signed in securely."); await loadMyRequests(); refreshCounts();
    }
  });
  const liveMode = document.getElementById("liveMode");
  if (liveMode) liveMode.textContent = "Connected · counts refresh automatically";
  const countNodes = { active_donors: "liveDonors", active_requesters: "liveRequesters", open_requests: "liveRequests", approved_partners: "liveBanks" };
  async function refreshCounts() {
    const { data, error } = await client.rpc("get_public_counts");
    if (error || !data) return;
    const counts = Array.isArray(data) ? data[0] : data;
    Object.entries(countNodes).forEach(([field, id]) => {
      const node = document.getElementById(id);
      if (node) node.textContent = fmt(counts[field]);
    });
  }
  async function loadMyRequests() {
    const { data: userData } = await client.auth.getUser();
    if (!userData.user) {
      const empty = document.getElementById("requestList");
      if (empty) { empty.className = "empty"; empty.textContent = "Sign in to see your requests."; }
      return;
    }
    const { data, error } = await client.from("blood_requests")
      .select("public_code,patient_blood_group,component,units_needed,urgency,hospital_name,district,state,status,created_at")
      .eq("requester_id", userData.user.id).order("created_at", { ascending: false });
    if (error) return;
    const box = document.getElementById("requestList");
    if (!box) return;
    if (!data?.length) { box.className = "empty"; box.textContent = "No requests yet."; return; }
    box.className = "";
    box.innerHTML = data.map(r => `<div class="dashboard-card" style="padding:15px;margin:12px 0 0"><div class="card-title"><div><b>${esc(r.public_code)} · ${esc(r.patient_blood_group)} ${esc(r.component)}</b><p>${esc(r.units_needed)} unit(s) · ${esc(r.hospital_name)} · ${esc(r.district)}, ${esc(r.state)}</p><small style="color:var(--muted)">${new Date(r.created_at).toLocaleDateString()} · ${esc(r.urgency)}</small></div><span class="status">${esc(String(r.status).replaceAll("_", " "))}</span></div></div>`).join("");
  }
  client.auth.onAuthStateChange(() => { setTimeout(() => { loadMyRequests(); refreshCounts(); }, 0); });
  refreshCounts();
  client.channel("public-metrics-live").on("postgres_changes", {
    event: "UPDATE", schema: "public", table: "public_metrics", filter: "id=eq.global"
  }, refreshCounts).subscribe();

  let pending = null;
  async function beginOtp(type, data) {
    const phone = normalizePhone(type === "request" ? data.requesterPhone : data.phone);
    if (!phone) return showToast("Enter a valid mobile number with country code, or a 10-digit Indian number.");
    if (type === "organization") data.phone = phone;
    const { error } = await client.auth.signInWithOtp({ phone });
    if (error) return showToast("OTP could not be sent. Check the phone number and Supabase SMS setup.");
    pending = { type, data, phone };
    document.getElementById("modalContent").innerHTML = `<div class="kicker">Verify mobile</div><h2>Enter your OTP</h2><p>We sent a one-time code to the number you provided. SMS delivery requires a configured provider.</p><div class="field"><label for="otpCode">One-time password</label><input id="otpCode" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="Enter code"></div><button class="btn primary" style="margin-top:15px" id="verifyOtp">Verify & continue</button>`;
    document.getElementById("modal").classList.add("show");
    document.getElementById("verifyOtp").onclick = verifyOtp;
  }
  async function verifyOtp() {
    const code = document.getElementById("otpCode").value.trim();
    if (!pending || !code) return showToast("Enter the OTP sent to your mobile.");
    const { error } = await client.auth.verifyOtp({ phone: pending.phone, token: code, type: "sms" });
    if (error) return showToast("That OTP could not be verified. Try again.");
    const task = pending; pending = null; closeModal();
    if (task.type === "donor") await saveDonor(task.data);
    if (task.type === "request") await saveRequest(task.data);
    if (task.type === "organization") await saveOrganization(task.data);
  }
  async function saveConsent(purpose, granted) {
    const { error } = await client.from("consent_records").insert({ purpose, granted, notice_version: "2026-10-v1" });
    if (error) console.error("Consent log failed", error.message);
  }
  async function saveDonor(d) {
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) return showToast("Please sign in again.");
    const row = { user_id: auth.user.id, full_name: d.name, date_of_birth: document.getElementById("dob").value,
      blood_group: d.blood, state: d.state, district: d.district, postal_code: d.pin,
      alerts_consent: d.availability, recognition_consent: document.getElementById("drecognition").checked,
      available: d.availability };
    const { error } = await client.from("donor_profiles").upsert(row);
    if (error) return showToast("Profile save failed: check the donor schema and consent.");
    await saveConsent("donor_profile_and_blood_bank_coordination", true);
    await saveConsent("donor_alerts", d.availability);
    await saveConsent("public_recognition", row.recognition_consent);
    const el = document.getElementById("donorSuccess");
    el.textContent = "Your donor profile is saved to your account. Phone verification is complete.";
    showToast("Verified donor profile saved."); refreshCounts();
  }
  async function saveRequest(d) {
    const { data: created, error } = await client.from("blood_requests").insert({
      requester_id: (await client.auth.getUser()).data.user.id, patient_blood_group: d.group,
      component: d.component, units_needed: Number(d.units), urgency: d.urgencyValue,
      hospital_name: d.hospital, state: d.bloodState, district: d.district, postal_code: d.pin,
      treating_doctor_name: d.doctor, treating_doctor_phone: d.doctorPhone,
      status: "submitted", verification_status: "pending", consented_at: new Date().toISOString()
    }).select("public_code").single();
    if (error) return showToast("Request save failed: check the request schema and consent.");
    await saveConsent("blood_request_verification_and_routing", true);
    await saveConsent("request_status_sms", d.notificationChannel === "sms");
    await saveConsent("request_status_whatsapp", d.notificationChannel === "whatsapp");
    if (d.notificationChannel) {
      const { error: messageError } = await client.functions.invoke("notify", { body: {
        recipientId: (await client.auth.getUser()).data.user.id, channel: d.notificationChannel,
        templateKey: "request_submitted", publicCode: created.public_code
      } });
      if (messageError) showToast("Request saved; message delivery is not available yet.");
    }
    const el = document.getElementById("requestSuccess");
    el.innerHTML = "<b>Your request is submitted for verification.</b><br>A verified blood bank must review it before donor invitations.";
    document.getElementById("requestForm")?.reset();
    showToast("Request saved. Verification is pending."); refreshCounts(); loadMyRequests();
  }
  async function saveOrganization(d) {
    const { error } = await client.from("organizations").insert({
      submitted_by: (await client.auth.getUser()).data.user.id, name: d.name, kind: d.kind,
      licence_number: d.licence || null, contact_phone: d.phone, state: d.state, district: d.district,
      status: "pending"
    });
    if (error) return showToast("Application save failed: check organization details.");
    await saveConsent("organization_onboarding_verification", true);
    document.getElementById("orgSuccess").textContent = "Application submitted. Admin approval is required before access.";
  }
  async function approvedBankId() {
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) return null;
    const { data } = await client.from("organization_members").select("organization_id,organizations!inner(kind,status)")
      .eq("user_id", auth.user.id).eq("organizations.kind", "blood_bank").eq("organizations.status", "approved").limit(1).maybeSingle();
    return data?.organization_id ?? null;
  }
  window.bsFindDonors = async function () {
    const result = document.getElementById("donorResults");
    result.innerHTML = "<div class='empty'>Searching the approved, consenting donor directory…</div>";
    const bankId = await approvedBankId();
    if (!bankId) { result.innerHTML = "<div class='empty'>Sign in with an approved blood-bank staff account to search. No donor records are shown to the public.</div>"; return; }
    let query = client.from("donor_profiles").select("user_id,full_name,blood_group,state,district,next_eligible_at")
      .eq("alerts_consent", true).eq("available", true).limit(30);
    const group = document.getElementById("donorGroup").value;
    const area = document.getElementById("donorArea").value.trim();
    if (group) query = query.eq("blood_group", group);
    if (area) {
      if (!/^[\p{L}\p{N} -]{1,50}$/u.test(area)) { result.innerHTML = "<div class='empty'>Use a district name or six-digit PIN.</div>"; return; }
      if (/^\d{6}$/.test(area)) query = query.eq("postal_code", area);
      else query = query.ilike("district", `%${area}%`);
    }
    const { data, error } = await query;
    if (error) { result.innerHTML = "<div class='empty'>Directory access is limited to approved blood-bank staff. Check your organization membership.</div>"; return; }
    if (!data?.length) { result.innerHTML = "<div class='empty'>No opted-in donors match those filters.</div>"; return; }
    result.innerHTML = `<div class="notice">Names and coordination details only. Phone numbers remain private; final eligibility is decided by the blood bank.</div>` + data.map(d => `<div class="dashboard-card" style="padding:13px;margin:8px 0"><div class="card-title"><div><b>${esc(d.full_name)}</b><p>${esc(d.blood_group)} · ${esc(d.district)}, ${esc(d.state)}</p><small style="color:var(--muted)">Next eligible date set by bank: ${esc(d.next_eligible_at || "not set")}</small></div><button class="btn soft small" data-invite="${esc(d.user_id)}">Invite</button></div></div>`).join("");
  };
  window.bsInviteDonor = async function (recipientId) {
    const bankId = await approvedBankId();
    if (!bankId) return showToast("Approved blood-bank membership required.");
    const { error } = await client.functions.invoke("notify", { body: {
      recipientId, organizationId: bankId, channel: document.getElementById("inviteChannel").value,
      templateKey: "donor_invite", publicCode: "donation invitation"
    } });
    if (error) return showToast("Invitation not sent. Check donor consent, weekly limits and provider setup.");
    showToast("Invitation sent using the approved message channel.");
  };
  window.addEventListener("bs:donor", e => {
    const data = { ...e.detail, phone: document.getElementById("dmobile").value, consent: true };
    beginOtp("donor", data);
  });
  window.addEventListener("bs:request", e => beginOtp("request", e.detail));
  const orgForm = document.getElementById("orgForm");
  if (orgForm) orgForm.addEventListener("submit", e => {
    e.preventDefault();
    const data = { name: document.getElementById("orgName").value, kind: document.getElementById("orgType").value,
      licence: document.getElementById("orgLicence").value, phone: document.getElementById("orgContact").value,
      state: document.getElementById("orgState").value, district: document.getElementById("orgDistrict").value };
    beginOtp("organization", data);
  });
})();
