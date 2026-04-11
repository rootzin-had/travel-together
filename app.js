const API = "http://localhost:3000";

function getToken(req) {
  const authHeader = req.headers['authorization'];

  if (!authHeader) return null;

  return authHeader.split(' ')[1];
}

async function api(url, method = "GET", body = null) {
  const token = sessionStorage.getItem("token");

  //console.log("TOKEN SENT:", token); // debug

  const res = await fetch("http://localhost:3000" + url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token   // 🔥 MUST EXIST
    },
    body: body ? JSON.stringify(body) : null
  });

  if (!res.ok) {
    console.log("API ERROR:", res.status);
    throw new Error("API error");
  }

  return res.json();
}

let currentRole = null;
let currentUser = null;
let currentSection = null;
let selectedPackageId = null;

function selectRole(role) {
  currentRole = role;


  document.getElementById('landing').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';

  const titles = {
    coordinator: "Coordinator Login",
    user: "Traveler Login"
  };

  document.getElementById('login-role-title').textContent = titles[role];
}




// ================= AUTH =================

async function doLogin() {
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-pass').value;

  if (!email || !password) {
    return notify("Email & Password required", "⚠️");
  }

  try {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    let data;
    try {
      data = await res.json();
    } catch {
      return notify("Invalid server response", "❌");
    }

    if (!res.ok) {
      return notify(data.msg || "Login failed", "❌");
    }

    if (!data.token) {
      return notify("Login failed (no token)", "❌");
    }

    // ✅ store session
    sessionStorage.setItem("token", data.token);
    sessionStorage.setItem("user", JSON.stringify(data.user));

    currentUser = data.user;
    currentRole = data.user.role;

    // clear inputs
    document.getElementById('login-email').value = '';
    document.getElementById('login-pass').value = '';

    document.getElementById('login-screen').style.display = 'none';

    launchApp();

    // 🔥 ADD THIS BLOCK (MAIN FIX)
    if (currentRole === 'admin') {
      renderSection('admin-dashboard');
    } else if (currentRole === 'coordinator') {
      renderSection('coord-packages');
    } else {
      renderSection('packages');
    }

  } catch (err) {
    console.error(err);
    notify("Server error", "❌");
  }
}




async function registerBox(){
  document.getElementById('register-box-wrap').style.display = 'block';
  document.getElementById('login-box-wrap').style.display = 'none';
}
async function loginBox() {
  document.getElementById('register-box-wrap').style.display = 'none';
  document.getElementById('login-box-wrap').style.display = 'block';
}

async function doRegister() {
  const name = document.getElementById('reg-name').value;
  const email = document.getElementById('reg-email').value;
  const password = document.getElementById('reg-pass').value;

  if (!name || !email || !password) {
  notify("All fields required", "⚠️");
  return;
}

  try {
    await api('/auth/register', 'POST', { 
      name, 
      email, 
      password,
      role: currentRole   // ✅ added
    });

    notify("Registered!", "✅");
    loginBox(); 


  } catch (err) {
    notify(err.message, "❌");
  }
}

function logout() {
 sessionStorage.clear();
  location.reload();
}

// ================= APP =================

function launchApp() {
  const app = document.getElementById('app');
  app.style.display = 'flex';

  document.getElementById('hdr-name').textContent = currentUser.name.toUpperCase();

  buildNav();
  renderSection(getDefaultSection());
}

function getDefaultSection() {
  if (currentRole === 'user') return 'user-packages';
  return 'coord-packages';
}

// ================= NAV =================

const navConfig = {
  admin: [
    { id: 'admin-dashboard', label: 'Dashboard' },
    { id: 'admin-coordinators', label: 'Coordinators' },
    { id: 'admin-packages', label: 'Packages' },
  ],
  coordinator: [
    { id: 'coord-packages', label: 'My Packages' },
    { id: 'coord-pending', label: 'Pending Packages' },
    { id: 'coord-confirmed', label: 'Confirmed Packages' }
  ],
  user: [
    { id: 'user-packages', label: 'Browse Packages' },
    { id: 'user-bookings', label: 'My Bookings' }
  ],
};

function buildNav() {
  const nav = document.getElementById('sidebar');
  nav.innerHTML = navConfig[currentRole].map(i => `
    <div style="cursor: pointer;" onclick="renderSection('${i.id}')">${i.label}</div>
  `).join('');
}

// ================= SECTION RENDER =================

async function renderSection(id) {
  currentSection = id;
  const main = document.getElementById('main-content');

  try {
    let html = "";

    if (id === 'user-packages') html = await renderUserPackages();
    if (id === 'user-bookings') html = await renderUserBookings();
    if (id === 'coord-packages') html = await renderCoordPackages();
    if (id === 'coord-pending') html = await renderCoordPendings();
    if (id === 'coord-confirmed') html = await renderCoordConfirm();
    if (id === 'admin-packages') html = await renderAdminPackages();
    if (id === 'admin-coordinators') html = await renderAdminCoordinators();
    if (id === 'admin-dashboard') html = await renderAdminDashboard();

    main.innerHTML = html;

  } catch (err) {
    notify(err.message, "❌");
  }
}

// ================= USER =================

async function renderUserPackages() {
  const packages = await api('/packages');

  return `
    <h2>Packages</h2>
    ${packages.map(p => `
      <div class="card">
        <h3>${p.title}</h3>
        <p>${p.description}</p>
        <div>₹${p.price}</div>
        <button class=add-btn onclick="bookingBox(${p.id})">Book</button>
      </div>
    `).join('')}
  `;
}

async function bookingBox(id) {
  selectedPackageId = id;
  const today = new Date().toISOString().split("T")[0];
  document.getElementById("bookingDate").min = today;
  document.getElementById("bookingModal").style.display= "flex";

}

async function closeBooking() {
  document.getElementById("bookingModal").style.display= "none";
}

async function confirmBooking() {
  const persons = parseInt(document.getElementById("bookingPersons").value);
  const date = document.getElementById("bookingDate").value;

  // Validation
  if (isNaN(persons) || persons <= 0 || persons > 20) {
    notify("Enter valid number", "❌");
    return;
  }

  if (!date) {
    notify("Please select a date", "❌");
    return;
  }

  try {
    await api('/bookings', 'POST', {
      package_id: selectedPackageId,
      persons: persons,
      date: date
    });

    notify("Booked", "✅");
    closeBooking();
  } catch {
    notify("Booking failed", "❌");
  }
}
async function renderUserBookings() {
  const bookings = await api('/bookings');

  return `
    <h2>My Bookings</h2>
    ${bookings.map(b => `
      <div class="card">
        <div>Package ID: ${b.package_id}</div>
        <div>Persons: ${b.persons}</div>
        <div>Status: ${b.status}</div>
      </div>
    `).join('')}
  `;
}

// ================= COORDINATOR =================

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, function (s) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[s];
  });
}


async function renderCoordPackages() {
  let packages = [];

  try {
    packages = await api('/packages');
  } catch (err) {
    return `<p style="color:red;">Failed to load packages</p>`;
  }

  return `
    <div class="header-row">
      <h2>My Packages</h2>
      <button class="add-btn" onclick="showAddPkg()">+ Add Package</button>
    </div>

    ${packages.length === 0 ? "<p>No packages yet</p>" : ""}

    ${packages.map(p => `
      <div class="card">
        <h3>${escapeHTML(p.title || "No title")}</h3>
        <div>₹${p.price || 0}</div>
        <button class="add-btn" onclick="deletePkg(${p.id})">Delete</button>
      </div>
    `).join('')}
  `;
}


async function renderCoordPendings() {
  const bookings = await api('/coordinator/bookings');

  const pendingBookings = bookings.filter(b => b.status === 'Pending');

  return `
    <h2>Pending Packages</h2>

    ${pendingBookings.length === 0 ? "<p>No pending bookings</p>" : ""}

    ${pendingBookings.map(b => `
      <div class="card">
        <div>${b.title || "No title"}</div>
        <div>Persons: ${b.persons || 0}</div>
        <div>Status: ${b.status}</div>

        <button class="add-btn" onclick="confirmPending(${b.id})">Confirm</button>
        <button class="add-btn" onclick="rejectPending(${b.id})">Reject</button>
      </div>
    `).join('')}
  `;
}



async function confirmPending(id) {
  try {
    console.log("Confirming booking:", id); // debug

    await api(`/bookings/${id}/status`, 'PUT', {
      status: 'Confirmed'
    });

    notify("Booking confirmed", "✅");

    // reload pending list
    renderCoordPendings();


  } catch (err) {
    notify(err.message || "Failed", "❌");
  }
}



async function rejectPending(id) {
  await api(`/bookings/${id}/status`, 'PUT', { status: 'Rejected' });
  notify("Rejected", "❌");
  renderSection('coord-pending');
}



async function renderCoordConfirm(){
   const bookings = await api('/coordinator/bookings');
    console.log("BOOKINGS");
  const confirmedBookings = bookings.filter(b => b.status === 'Confirmed');
  console.log("confirm");
  return `
    <h2>Confirmed Bookings</h2>
    ${confirmedBookings.length === 0 ? "<p>No confirmed bookings</p>" : ""}
    ${confirmedBookings.map(b => `
      <div class="card">
        <div><b>${b.title}</b></div>
        <div>Persons: ${b.persons}</div>
        <div>Status: ${b.status}</div>
      </div>
    `).join('')}
  `;
}








window.showAddPkg = function () {
  document.getElementById("main-content").innerHTML = `
    <h2>Add Package</h2>

    <div class="form-row">
      <label>Title</label>
      <input id="pkg-title" type="text">
    </div>

    <div class="form-row">
      <label>Description</label>
      <textarea id="pkg-desc"></textarea>
    </div>

    <div class="form-row">
      <label>Price</label>
      <input id="pkg-price" type="number">
    </div>

    <button onclick="submitPkg()" class="btn btn-primary">Save</button>
    <button onclick="renderSection('coord-packages')" class="btn">Cancel</button>
  `;
};


async function submitPkg() {
  
  const title = document.getElementById('pkg-title')?.value;
  const description = document.getElementById('pkg-desc')?.value;
  const price = document.getElementById('pkg-price')?.value;

  if (!title || !price) {
    notify("Title & Price required", "⚠️");
    return;
  }
  try {
    await api('/packages', 'POST', { title, description, price });
    
    //notify("Added", "✅");
    renderSection('coord-packages');

  } catch (err) {
    notify(err.message, "❌");
  }
}

async function deletePkg(id) {
  await api(`/packages/${id}`, 'DELETE',{});
  //notify("Deleted", "🗑️");
  renderSection('coord-packages');
}


// ================= ADMIN =================

async function renderAdminPackages() {
  const packages = await api('/packages');
  return `
    <h2>All Packages</h2>
    ${packages.map(p => `
      <div class="card">
        <div><strong>${p.title}</strong></div>
        <div>Price: ₹${p.price}</div>
        <div>Coordinator: ${p.coordinator_name}</div>
      </div>
    `).join('')}
  `;
}

async function renderAdminCoordinators() {
  const coords = await api('/admin/coordinators');

  return `
    <h2>Coordinators</h2>
    ${coords.map(c => `
      <div class="card">  
        ${c.name} (${c.email})
        <button class=add-btn onclick="deleteCoord(${c.id})">Delete</button>
      </div>
    `).join('')}
  `;
}

async function deleteCoord(id) {
  try {
    await api(`/admin/delete-coordinator/${id}`, 'DELETE');
    notify("Deleted", "🗑️");
    renderSection('admin-coordinators');
  } catch {
    notify("Delete failed", "❌");
  }
}

async function renderAdminDashboard() {
  const bookings = await api('/bookings');
  const packages = await api('/packages');

  const revenue = bookings.reduce((sum, b) => {
    const pkg = packages.find(p => p.id === b.package_id);
    return sum + (pkg ? pkg.price : 0);
  }, 0);

  return `
    <h2>Dashboard</h2>
    <div>Total Bookings: ${bookings.length}</div>
    <div>Total Revenue: ₹${revenue}</div>
  `;
}

// ================= COMMON =================

async function bookPkg(id) {
  try {
    await api('/bookings', 'POST', { package_id: id, persons: 1 });
    notify("Booked", "✅");
  } catch {
    notify("Booking failed", "❌");
  }
}

function notify(msg, icon = '') {
  alert(icon + " " + msg);
}

// ================= AUTO LOGIN =================


window.onload = () => {
  const token = sessionStorage.getItem("token");
  const user = sessionStorage.getItem("user");

  if (token && user) {
    currentUser = JSON.parse(user);
    currentRole = currentUser.role;

    document.getElementById('landing').style.display = 'none';
    launchApp();

    // 🔥 ADD THIS PART
    if (currentRole === 'admin') {
      renderSection('admin-dashboard');
    } else if (currentRole === 'coordinator') {
      renderSection('coord-packages');
    } else {
      renderSection('packages');
    }
  }
};