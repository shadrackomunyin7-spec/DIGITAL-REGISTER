import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyC5Pt8qlr3RFSuX9mf4fJDyNYT9nh7RCcE",
  authDomain: "class-register-fc41d.firebaseapp.com",
  projectId: "class-register-fc41d",
  storageBucket: "class-register-fc41d.firebasestorage.app",
  messagingSenderId: "960824285359",
  appId: "1:960824285359:web:5151a6530e1b2ef2111c5a"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let students = [];
let currentUser = null;
let session = "am";      // "am" = morning, "pm" = afternoon
let approval = null;     // approval details of the open register
let locked = false;      // true once the register is approved
let setup = null;        // deputy setup: school name, town, PIN hash

const studentList = document.getElementById("studentList");
const studentName = document.getElementById("studentName");
const admNo = document.getElementById("admNo");
const className = document.getElementById("className");
const registerDate = document.getElementById("registerDate");
const authSection = document.getElementById("authSection");
const appSection = document.getElementById("appSection");
const rosterNote = document.getElementById("rosterNote");
const savedList = document.getElementById("savedList");
const classList = document.getElementById("classList");
const approverName = document.getElementById("approverName");

const today = new Date();
document.getElementById("todayDate").textContent = today.toDateString();

// Local date as YYYY-MM-DD (uses the phone/laptop clock, not UTC)
function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}
registerDate.value = localDateStr(today);

// Small helper: make an element with a class and text (safe, no HTML needed)
function make(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

// ---------- DATE AND DAY OF THE WEEK ----------
function dateObj(str) {
  const p = str.split("-").map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}
function dayName(str) {
  return str ? dateObj(str).toLocaleDateString("en-GB", { weekday: "long" }) : "";
}
function dayText(str) {
  if (!str) return "";
  return dayName(str) + ", " + dateObj(str).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric"
  });
}
function updateDayLine() {
  document.getElementById("dayLine").textContent = dayText(registerDate.value);
}
updateDayLine();

// ---------- LOGIN ----------
function friendlyError(e) {
  const code = e.code || "";
  if (code.includes("invalid-email")) return "That email address is not valid.";
  if (code.includes("weak-password")) return "Password must be at least 6 characters.";
  if (code.includes("email-already-in-use")) return "That email already has an account. Try Log In.";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) {
    return "Wrong email or password.";
  }
  if (code.includes("too-many-requests")) return "Too many tries. Please wait a few minutes.";
  return e.message;
}

document.getElementById("signupBtn").addEventListener("click", async function () {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  try {
    await createUserWithEmailAndPassword(auth, email, password);
  } catch (e) {
    alert(friendlyError(e));
  }
});

document.getElementById("loginBtn").addEventListener("click", async function () {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (e) {
    alert(friendlyError(e));
  }
});

document.getElementById("resetBtn").addEventListener("click", async function () {
  const email = document.getElementById("email").value.trim();
  if (email === "") {
    alert("Type your email in the Email box first, then press Forgot password.");
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    alert("Password reset email sent. Check your inbox and spam folder.");
  } catch (e) {
    alert(friendlyError(e));
  }
});

document.getElementById("logoutBtn").addEventListener("click", function () {
  signOut(auth);
});

onAuthStateChanged(auth, function (user) {
  currentUser = user;
  if (user) {
    authSection.style.display = "none";
    appSection.style.display = "block";
    document.getElementById("userEmail").textContent = user.email;
    registerDate.value = localDateStr(new Date());
    updateDayLine();
    setGraphDates();
    loadSetup();
    loadRegister();
    loadSavedList();
    loadClassList();
  } else {
    authSection.style.display = "block";
    appSection.style.display = "none";
    students = [];
    approval = null;
    locked = false;
    setup = null;
    render();
    renderApproval();
  }
});

// ---------- FIREBASE PATHS ----------
function classKey() {
  return className.value.trim() || "default";
}

// Permanent class list: users/{uid}/classes/{className}
function rosterRef() {
  return doc(db, "users", currentUser.uid, "classes", classKey());
}

// One document per class per day: users/{uid}/registers/{className_date}
function registerRef() {
  return doc(db, "users", currentUser.uid, "registers", classKey() + "_" + registerDate.value);
}

// Deputy setup (school name, town, PIN hash): users/{uid}/settings/approval
function setupRef() {
  return doc(db, "users", currentUser.uid, "settings", "approval");
}

// ---------- LOAD (saved day first, then class list) ----------
async function loadRegister() {
  if (!currentUser) return;
  approval = null;
  locked = false;
  try {
    const regSnap = await getDoc(registerRef());

    if (regSnap.exists() && regSnap.data().students && regSnap.data().students.length > 0) {
      // Show exactly what was saved on that day (old registers still open fine)
      const data = regSnap.data();
      students = data.students.map(function (s) {
        return {
          name: s.name,
          adm: s.adm || "",
          am: s.am || s.status || "none",
          pm: s.pm || s.status || "none"
        };
      });
      approval = data.approval || null;
      locked = !!approval;
      rosterNote.textContent = "Saved register for " + dayText(registerDate.value) + ": " +
        students.length + " students." + (locked ? " Approved and locked." : "");
    } else {
      // New day: load the permanent class list with no ticks
      const rosterSnap = await getDoc(rosterRef());
      const roster = rosterSnap.exists() ? rosterSnap.data().students : [];

      students = roster.map(function (s) {
        return { name: s.name, adm: s.adm || "", am: "none", pm: "none" };
      });

      if (roster.length > 0) {
        rosterNote.textContent = roster.length + " students loaded for this class. Just tick P, A or X.";
      } else {
        rosterNote.textContent = "No students saved for this class yet. Add them below, once only.";
      }
    }
  } catch (e) {
    alert("Could not load: " + e.message);
    students = [];
  }
  render();
  renderApproval();
  loadResults();
}

// ---------- MY CLASSES (tap a class to mark TODAY, no retyping) ----------
async function loadClassList() {
  if (!currentUser) return;
  classList.textContent = "";
  try {
    const snap = await getDocs(collection(db, "users", currentUser.uid, "classes"));
    const items = [];
    snap.forEach(function (d) {
      const data = d.data();
      if (data.className) items.push(data);
    });

    if (items.length === 0) {
      const li = make("li");
      li.appendChild(make("span", "saved-date", "No classes yet. Type a class name below, then add your students once."));
      classList.appendChild(li);
      return;
    }

    items.sort(function (a, b) { return a.className.localeCompare(b.className); });

    items.forEach(function (item) {
      const li = make("li");
      li.appendChild(make("span", "saved-title", item.className));
      li.appendChild(make("span", "saved-date", (item.students ? item.students.length : 0) + " students"));
      li.addEventListener("click", async function () {
        className.value = item.className;
        registerDate.value = localDateStr(new Date());
        updateDayLine();
        await loadRegister();
        document.getElementById("amTab").scrollIntoView({ behavior: "smooth", block: "start" });
      });
      classList.appendChild(li);
    });
  } catch (e) {
    classList.textContent = "";
    const li = make("li");
    li.appendChild(make("span", "saved-date", "Could not load classes: " + e.message));
    classList.appendChild(li);
  }
}

// ---------- SAVED REGISTERS LIST ----------
async function loadSavedList() {
  if (!currentUser) return;
  savedList.textContent = "";
  try {
    const snap = await getDocs(collection(db, "users", currentUser.uid, "registers"));
    const items = [];
    snap.forEach(function (d) { items.push(d.data()); });

    if (items.length === 0) {
      const li = make("li");
      li.appendChild(make("span", "saved-date", "No saved registers yet."));
      savedList.appendChild(li);
      return;
    }

    items.sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); });

    items.forEach(function (item) {
      const li = make("li");
      li.appendChild(make("span", "saved-title", (item.className || "") + (item.approval ? " \u2714" : "")));
      li.appendChild(make("span", "saved-date",
        (item.dayName ? item.dayName.slice(0, 3) + " " : "") + (item.date || "") +
        " | P: " + (item.present || 0) +
        " A: " + (item.absent || 0) +
        " X: " + (item.excused || 0)
      ));
      li.addEventListener("click", function () {
        className.value = item.className;
        registerDate.value = item.date;
        updateDayLine();
        loadRegister().then(function () {
          document.getElementById("reportBox").scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
      savedList.appendChild(li);
    });
  } catch (e) {
    savedList.textContent = "";
    const li = make("li");
    li.appendChild(make("span", "saved-date", "Could not load list: " + e.message));
    savedList.appendChild(li);
  }
}

document.getElementById("refreshSavedBtn").addEventListener("click", loadSavedList);

// ---------- MORNING / AFTERNOON TABS ----------
function setSession(s) {
  session = s;
  document.getElementById("amTab").classList.toggle("active", s === "am");
  document.getElementById("pmTab").classList.toggle("active", s === "pm");
  render();
}
document.getElementById("amTab").addEventListener("click", function () { setSession("am"); });
document.getElementById("pmTab").addEventListener("click", function () { setSession("pm"); });

// ---------- DRAW THE TABLE ----------
function statusButton(index, status, label, current) {
  const btn = make("button", "status-btn " + status + (current === status ? " active" : ""), label);
  btn.dataset.i = index;
  btn.dataset.s = status;
  btn.disabled = locked;
  return btn;
}

function render() {
  studentList.textContent = "";

  students.forEach(function (student, index) {
    const tr = document.createElement("tr");

    tr.appendChild(make("td", "", String(index + 1)));
    tr.appendChild(make("td", "", student.name));
    tr.appendChild(make("td", "", student.adm || "-"));

    const tdP = document.createElement("td");
    tdP.appendChild(statusButton(index, "present", "P", student[session]));
    tr.appendChild(tdP);

    const tdA = document.createElement("td");
    tdA.appendChild(statusButton(index, "absent", "A", student[session]));
    tr.appendChild(tdA);

    const tdX = document.createElement("td");
    tdX.appendChild(statusButton(index, "excused", "X", student[session]));
    tr.appendChild(tdX);

    const tdD = document.createElement("td");
    const del = make("button", "remove-btn", "\u00d7");
    del.dataset.i = index;
    del.dataset.remove = "1";
    del.disabled = locked;
    tdD.appendChild(del);
    tr.appendChild(tdD);

    studentList.appendChild(tr);
  });

  updateCounts();
  renderReport();
  fillResStudents();
}

function updateCounts() {
  const present = students.filter(function (s) { return s[session] === "present"; }).length;
  const absent = students.filter(function (s) { return s[session] === "absent"; }).length;

  document.getElementById("totalCount").textContent = students.length;
  document.getElementById("presentCount").textContent = present;
  document.getElementById("absentCount").textContent = absent;
}

// ---------- REPORT: full day, morning only, afternoon only, absent ----------
function category(s) {
  const a = s.am === "present";
  const p = s.pm === "present";
  if (a && p) return "full";
  if (a) return "am";
  if (p) return "pm";
  if (s.am === "absent" || s.pm === "absent") return "abs";
  if (s.am === "excused" || s.pm === "excused") return "exc";
  return "none";
}

function groups() {
  const g = { full: [], am: [], pm: [], abs: [], exc: [], none: [] };
  students.forEach(function (s) { g[category(s)].push(s); });
  return g;
}

const GROUP_TITLES = [
  ["full", "Present full day"],
  ["am", "Present morning only"],
  ["pm", "Present afternoon only"],
  ["abs", "Absent"],
  ["exc", "Excused (sent apology)"]
];

function renderReport() {
  const box = document.getElementById("reportBox");
  box.textContent = "";
  const g = groups();
  const presentAny = g.full.length + g.am.length + g.pm.length;

  box.appendChild(make("p", "rhead",
    (className.value.trim() || "No class name") + " - " + dayText(registerDate.value)));

  const tot = make("div", "rtotals");
  tot.appendChild(make("span", "", "Total: " + students.length));
  tot.appendChild(make("span", "", "Present: " + presentAny));
  tot.appendChild(make("span", "", "Absent: " + g.abs.length));
  if (g.exc.length) tot.appendChild(make("span", "", "Excused: " + g.exc.length));
  if (g.none.length) tot.appendChild(make("span", "", "Not marked: " + g.none.length));
  box.appendChild(tot);

  GROUP_TITLES.forEach(function (t) {
    const list = g[t[0]];
    if (list.length === 0) return;
    const div = make("div", "rgroup " + t[0]);
    div.appendChild(make("h3", "", t[1] + " (" + list.length + ")"));
    const ul = document.createElement("ul");
    list.forEach(function (s, i) {
      ul.appendChild(make("li", "", (i + 1) + ". " + s.name + " - Adm " + (s.adm || "-")));
    });
    div.appendChild(ul);
    box.appendChild(div);
  });
}

document.getElementById("printBtn").addEventListener("click", function () {
  window.print();
});

// ---------- CLICKS ON P, A, X, DELETE ----------
studentList.addEventListener("click", async function (e) {
  const btn = e.target.closest("button");
  if (!btn) return;
  if (locked) {
    alert("This register is approved and locked.");
    return;
  }
  const i = Number(btn.dataset.i);

  if (btn.dataset.remove) {
    if (confirm("Remove " + students[i].name + " from this class permanently?")) {
      students.splice(i, 1);
      await saveRoster();
      render();
    }
  } else {
    students[i][session] = btn.dataset.s;
    render();
  }
});

// ---------- SAVE THE PERMANENT CLASS LIST ----------
async function saveRoster() {
  if (!currentUser || className.value.trim() === "") return;
  const roster = students.map(function (s) {
    return { name: s.name, adm: s.adm || "" };
  });
  try {
    await setDoc(rosterRef(), {
      className: className.value.trim(),
      students: roster
    });
    loadClassList();
  } catch (e) {
    alert("Could not save class list: " + e.message);
  }
}

// ---------- ADD A NEW STUDENT (ONCE ONLY) ----------
document.getElementById("addBtn").addEventListener("click", async function () {
  if (locked) {
    alert("This register is approved and locked.");
    return;
  }
  if (className.value.trim() === "") {
    alert("Please type the class name first.");
    return;
  }
  const name = studentName.value.trim();
  const adm = admNo.value.trim();
  if (name === "") {
    alert("Please type the student's name.");
    return;
  }

  const duplicate = students.some(function (s) {
    return s.name.toLowerCase() === name.toLowerCase() ||
      (adm !== "" && s.adm === adm);
  });
  if (duplicate) {
    alert("This student is already in the class list.");
    return;
  }

  students.push({ name: name, adm: adm, am: "none", pm: "none" });
  studentName.value = "";
  admNo.value = "";
  studentName.focus();

  await saveRoster();
  render();
});

studentName.addEventListener("keypress", function (e) {
  if (e.key === "Enter") {
    admNo.focus();
  }
});

admNo.addEventListener("keypress", function (e) {
  if (e.key === "Enter") {
    document.getElementById("addBtn").click();
  }
});

// ---------- MARK ALL / RESET ----------
document.getElementById("allPresentBtn").addEventListener("click", function () {
  if (locked) return;
  students.forEach(function (s) { s[session] = "present"; });
  render();
});

document.getElementById("clearBtn").addEventListener("click", function () {
  if (locked) return;
  if (confirm("Reset all ticks for this day (morning and afternoon)? Students stay in the class list.")) {
    students.forEach(function (s) { s.am = "none"; s.pm = "none"; });
    render();
  }
});

// ---------- BUILD THE DOCUMENT THAT IS SAVED ----------
function buildRegisterDoc(ap) {
  const g = groups();
  const d = {
    className: className.value.trim(),
    date: registerDate.value,
    dayName: dayName(registerDate.value),
    total: students.length,
    present: g.full.length + g.am.length + g.pm.length,
    fullDay: g.full.length,
    morningOnly: g.am.length,
    afternoonOnly: g.pm.length,
    absent: g.abs.length,
    excused: g.exc.length,
    students: students
  };
  if (ap) d.approval = ap;
  return d;
}

// ---------- SAVE TODAY'S REGISTER ----------
document.getElementById("saveBtn").addEventListener("click", async function () {
  if (!currentUser) {
    alert("Please log in first.");
    return;
  }
  if (locked) {
    alert("This register is approved and locked.");
    return;
  }
  if (className.value.trim() === "") {
    alert("Please type the class name first.");
    return;
  }
  if (students.length === 0) {
    alert("Add students to the class first.");
    return;
  }

  if (registerDate.value !== localDateStr(new Date())) {
    if (!confirm("The date is " + dayText(registerDate.value) + ", not today. Save for that date?")) return;
  }

  try {
    await saveRoster();
    const d = buildRegisterDoc(null);
    await setDoc(registerRef(), d);
    alert("Saved for " + className.value + " on " + dayText(registerDate.value) +
      ". Present: " + d.present + ", Absent: " + d.absent + ", Excused: " + d.excused);
    loadSavedList();
  } catch (e) {
    alert("Could not save: " + e.message);
  }
});

// ---------- DEPUTY SETUP + DIGITAL STAMP ----------
async function sha(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(function (b) {
    return b.toString(16).padStart(2, "0");
  }).join("");
}

// Writes text around a circle (top = outside top arc, otherwise bottom arc)
function arcText(x, text, cx, cy, r, mid, top) {
  const step = Math.min(0.2, 4.2 / text.length);
  const total = step * text.length;
  for (let i = 0; i < text.length; i++) {
    const a = top ? mid - total / 2 + step * (i + 0.5) : mid + total / 2 - step * (i + 0.5);
    x.save();
    x.translate(cx + r * Math.cos(a), cy + r * Math.sin(a));
    x.rotate(top ? a + Math.PI / 2 : a - Math.PI / 2);
    x.fillText(text[i], 0, 0);
    x.restore();
  }
}

// Draws a round official-looking stamp from the school name, town and date
function drawStamp(school, town, d) {
  const c = document.createElement("canvas");
  c.width = 240;
  c.height = 240;
  const x = c.getContext("2d");
  x.strokeStyle = "#1d4ed8";
  x.fillStyle = "#1d4ed8";
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.lineWidth = 4;
  x.beginPath();
  x.arc(120, 120, 112, 0, Math.PI * 2);
  x.stroke();
  x.lineWidth = 1.5;
  x.beginPath();
  x.arc(120, 120, 70, 0, Math.PI * 2);
  x.stroke();
  x.font = "bold 15px Arial";
  arcText(x, school.toUpperCase(), 120, 120, 92, -Math.PI / 2, true);
  arcText(x, town.toUpperCase(), 120, 120, 92, Math.PI / 2, false);
  x.font = "bold 16px Arial";
  x.fillText("APPROVED", 120, 106);
  x.font = "13px Arial";
  x.fillText(d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }).toUpperCase(), 120, 130);
  return c.toDataURL("image/png");
}

function showStampPreview() {
  const img = document.getElementById("stampPreview");
  if (setup) {
    img.src = drawStamp(setup.schoolName, setup.town, new Date());
    img.style.display = "block";
  } else {
    img.style.display = "none";
  }
}

async function loadSetup() {
  try {
    const snap = await getDoc(setupRef());
    setup = snap.exists() ? snap.data() : null;
  } catch (e) {
    setup = null;
  }
  renderApproval();
  showStampPreview();
}

document.getElementById("setupBtn").addEventListener("click", async function () {
  const school = document.getElementById("setupSchool").value.trim();
  const town = document.getElementById("setupTown").value.trim();
  const pin = document.getElementById("setupPin").value.trim();
  if (school === "" || town === "") {
    alert("Type the school name and the town.");
    return;
  }
  if (!/^\d{4}$/.test(pin)) {
    alert("The PIN must be exactly 4 digits.");
    return;
  }
  const salt = Array.from(crypto.getRandomValues(new Uint32Array(2))).join("-");
  const data = { schoolName: school, town: town, salt: salt, pinHash: await sha(salt + pin) };
  try {
    await setDoc(setupRef(), data);
    setup = data;
    document.getElementById("setupPin").value = "";
    renderApproval();
    showStampPreview();
    alert("Deputy setup saved. Remember your PIN. Do not share it.");
  } catch (e) {
    alert("Could not save setup: " + e.message);
  }
});

// ---------- SIGNATURE BOX ----------
const sig = document.getElementById("sigCanvas");
const sctx = sig.getContext("2d");
let drawing = false;
let hasInk = false;
sctx.lineWidth = 2.5;
sctx.lineCap = "round";
sctx.strokeStyle = "#0f2a4a";

function sigPoint(e) {
  const r = sig.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * sig.width / r.width,
    y: (e.clientY - r.top) * sig.height / r.height
  };
}

sig.addEventListener("pointerdown", function (e) {
  drawing = true;
  const p = sigPoint(e);
  sctx.beginPath();
  sctx.moveTo(p.x, p.y);
  sig.setPointerCapture(e.pointerId);
});

sig.addEventListener("pointermove", function (e) {
  if (!drawing) return;
  const p = sigPoint(e);
  sctx.lineTo(p.x, p.y);
  sctx.stroke();
  hasInk = true;
});

function stopDraw() { drawing = false; }
sig.addEventListener("pointerup", stopDraw);
sig.addEventListener("pointercancel", stopDraw);

function clearSig() {
  sctx.clearRect(0, 0, sig.width, sig.height);
  hasInk = false;
}
document.getElementById("sigClearBtn").addEventListener("click", clearSig);

// ---------- APPROVAL ----------
function renderApproval() {
  const form = document.getElementById("signForm");
  const view = document.getElementById("approvalView");
  view.textContent = "";

  if (approval) {
    form.style.display = "none";
    document.getElementById("setupForm").style.display = "none";
    view.style.display = "block";
    view.appendChild(make("p", "rhead", "Approved and locked"));
    view.appendChild(make("p", "note",
      "Signed by " + approval.name + " on " + new Date(approval.time).toLocaleString("en-GB")));
    const wrap = make("div", "apv");
    const s = document.createElement("img");
    s.src = approval.signature;
    s.alt = "Signature";
    wrap.appendChild(s);
    if (approval.stamp) {
      const st = document.createElement("img");
      st.src = approval.stamp;
      st.alt = "School stamp";
      wrap.appendChild(st);
    }
    view.appendChild(wrap);
  } else {
    view.style.display = "none";
    document.getElementById("setupForm").style.display = setup ? "none" : "block";
    form.style.display = setup ? "block" : "none";
  }
}

document.getElementById("approveBtn").addEventListener("click", async function () {
  if (!currentUser) {
    alert("Please log in first.");
    return;
  }
  if (locked) return;
  if (className.value.trim() === "") {
    alert("Please type the class name first.");
    return;
  }
  if (students.length === 0) {
    alert("Add students to the class first.");
    return;
  }
  const nm = approverName.value.trim();
  if (nm === "") {
    alert("Type the name of the deputy principal.");
    return;
  }
  if (!hasInk) {
    alert("Please sign in the signature box.");
    return;
  }
  if (!setup) {
    alert("The deputy principal must complete the setup first.");
    return;
  }
  const pin = document.getElementById("approvePin").value.trim();
  if (pin === "" || (await sha(setup.salt + pin)) !== setup.pinHash) {
    alert("Wrong PIN. Only the deputy principal can approve a register.");
    return;
  }
  if (!confirm("Approve and lock this register? It cannot be changed afterwards.")) return;

  const ap = {
    name: nm,
    signature: sig.toDataURL("image/png"),
    stamp: drawStamp(setup.schoolName, setup.town, new Date()),
    time: new Date().toISOString()
  };

  try {
    await saveRoster();
    await setDoc(registerRef(), buildRegisterDoc(ap));
    approval = ap;
    locked = true;
    clearSig();
    approverName.value = "";
    document.getElementById("approvePin").value = "";
    render();
    renderApproval();
    loadSavedList();
    alert("Register approved and locked.");
  } catch (e) {
    alert("Could not approve: " + e.message);
  }
});

// ---------- ATTENDANCE GRAPH (end of term) ----------
function setGraphDates() {
  const from = new Date();
  from.setDate(from.getDate() - 90);
  document.getElementById("graphFrom").value = localDateStr(from);
  document.getElementById("graphTo").value = localDateStr(new Date());
}

document.getElementById("graphBtn").addEventListener("click", async function () {
  const box = document.getElementById("graphBox");
  box.textContent = "";
  if (!currentUser) return;
  const cls = className.value.trim();
  const from = document.getElementById("graphFrom").value;
  const to = document.getElementById("graphTo").value;
  if (cls === "") {
    alert("Tap your class at the top, or type the class name, first.");
    return;
  }
  if (!from || !to) {
    alert("Choose the From and To dates.");
    return;
  }

  try {
    const snap = await getDocs(collection(db, "users", currentUser.uid, "registers"));
    const people = {};
    let days = 0;

    snap.forEach(function (d) {
      const r = d.data();
      if (r.className !== cls || !r.date || r.date < from || r.date > to) return;
      days++;
      (r.students || []).forEach(function (s) {
        const key = s.adm || s.name.toLowerCase();
        if (!people[key]) people[key] = { name: s.name, adm: s.adm || "", p: 0, a: 0, x: 0 };
        [s.am || s.status, s.pm || s.status].forEach(function (v) {
          if (v === "present") people[key].p++;
          else if (v === "absent") people[key].a++;
          else if (v === "excused") people[key].x++;
        });
      });
    });

    const list = Object.values(people).filter(function (p) {
      return p.p + p.a + p.x > 0;
    }).map(function (p) {
      p.pct = Math.round(p.p * 100 / (p.p + p.a + p.x));
      return p;
    });

    if (days === 0 || list.length === 0) {
      box.appendChild(make("p", "note", "No saved registers for " + cls + " between these dates."));
      return;
    }

    list.sort(function (a, b) { return a.pct - b.pct; });
    const avg = Math.round(list.reduce(function (t, p) { return t + p.pct; }, 0) / list.length);
    const low = list.filter(function (p) { return p.pct < 75; }).length;

    box.appendChild(make("p", "rhead", cls + ": " + from + " to " + to));
    const sum = make("div", "gsum");
    sum.appendChild(make("span", "", "Register days: " + days));
    sum.appendChild(make("span", "", "Class average: " + avg + "%"));
    sum.appendChild(make("span", "", "Below 75%: " + low));
    box.appendChild(sum);
    box.appendChild(make("p", "note", "Lowest attendance first. P, A and X count half-days (morning and afternoon)."));

    list.forEach(function (p, i) {
      const row = make("div", "grow");
      row.appendChild(make("div", "gname", (i + 1) + ". " + p.name + (p.adm ? " (Adm " + p.adm + ")" : "")));
      const track = make("div", "gtrack");
      const fill = make("div", "gfill " + (p.pct >= 90 ? "good" : p.pct >= 75 ? "mid" : "low"));
      fill.style.width = p.pct + "%";
      track.appendChild(fill);
      row.appendChild(track);
      row.appendChild(make("div", "gdetail", p.pct + "%  |  P " + p.p + "  A " + p.a + "  X " + p.x));
      box.appendChild(row);
    });
  } catch (e) {
    alert("Could not build the graph: " + e.message);
  }
});

document.getElementById("graphPrintBtn").addEventListener("click", function () {
  document.body.classList.add("print-graph");
  window.print();
  document.body.classList.remove("print-graph");
});

// ---------- RESULTS, RANKING, PERFORMANCE GRAPH, CLASS REPORT FORM ----------
const DEFAULT_SUBJECTS = ["Mathematics", "English", "Kiswahili", "Science", "Social Studies"];
let resultsData = {};
let subjectList = DEFAULT_SUBJECTS.slice();
const resStudent = document.getElementById("resStudent");
const resSubjects = document.getElementById("resSubjects");
document.getElementById("resYear").value = new Date().getFullYear();
resSubjects.value = subjectList.join(", ");

function studentKey(s) {
  return s.adm || s.name.toLowerCase();
}

let rfKey = "";   // "" = class report form, otherwise one student

function termLabel() {
  return "Term " + document.getElementById("resTerm").value + ", " + document.getElementById("resYear").value;
}

function termKey() {
  return classKey() + "_" + document.getElementById("resYear").value.trim() + "_T" + document.getElementById("resTerm").value;
}

function resRef() {
  return doc(db, "users", currentUser.uid, "results", termKey());
}

function reportRef() {
  return doc(db, "users", currentUser.uid, "reports", termKey() + rfKey);
}

function fillResStudents() {
  const keep = resStudent.value;
  resStudent.textContent = "";
  students.forEach(function (s) {
    const o = document.createElement("option");
    o.value = studentKey(s);
    o.textContent = s.name + (s.adm ? " (" + s.adm + ")" : "");
    resStudent.appendChild(o);
  });
  if (keep) resStudent.value = keep;
  const rf = document.getElementById("rfStudent");
  const keepRf = rf.value;
  rf.textContent = "";
  Array.from(resStudent.options).forEach(function (o) { rf.appendChild(o.cloneNode(true)); });
  if (keepRf) rf.value = keepRf;
}

function parseSubjects() {
  const list = resSubjects.value.split(",").map(function (t) { return t.trim(); }).filter(function (t) { return t !== ""; });
  return list.length ? list : DEFAULT_SUBJECTS.slice();
}

function renderMarkInputs() {
  const box = document.getElementById("resMarks");
  box.textContent = "";
  const marks = (resultsData[resStudent.value] || {}).marks || {};
  subjectList.forEach(function (sub) {
    const row = make("div", "markrow");
    row.appendChild(make("span", "", sub));
    const inp = document.createElement("input");
    inp.type = "number";
    inp.min = "0";
    inp.max = "100";
    inp.placeholder = "Mark";
    inp.dataset.sub = sub;
    if (marks[sub] !== undefined) inp.value = marks[sub];
    row.appendChild(inp);
    box.appendChild(row);
  });
}

function showResRecord() {
  const r = resultsData[resStudent.value] || {};
  document.getElementById("resAssess").value = r.assess || "";
  document.getElementById("resDisc").value = r.disc || "Good";
  document.getElementById("resDiscNote").value = r.discNote || "";
  document.getElementById("resRec").value = r.rec || "";
  document.getElementById("resReflect").value = r.reflect || "";
  renderMarkInputs();
}

async function loadResults() {
  resultsData = {};
  subjectList = parseSubjects();
  if (currentUser) {
    try {
      const snap = await getDoc(resRef());
      if (snap.exists()) {
        resultsData = snap.data().records || {};
        if (snap.data().subjects && snap.data().subjects.length) {
          subjectList = snap.data().subjects;
          resSubjects.value = subjectList.join(", ");
        }
      }
    } catch (e) {
      resultsData = {};
    }
  }
  showResRecord();
}

resStudent.addEventListener("change", showResRecord);
resSubjects.addEventListener("change", function () {
  subjectList = parseSubjects();
  renderMarkInputs();
});
document.getElementById("resTerm").addEventListener("change", loadResults);
document.getElementById("resYear").addEventListener("change", loadResults);

document.getElementById("resSaveBtn").addEventListener("click", async function () {
  if (!currentUser) return;
  if (className.value.trim() === "") {
    alert("Tap your class at the top first.");
    return;
  }
  if (!resStudent.value) {
    alert("Choose a student.");
    return;
  }
  const s = students.find(function (x) { return studentKey(x) === resStudent.value; });
  const marks = {};
  document.querySelectorAll("#resMarks input").forEach(function (i) {
    if (i.value !== "") marks[i.dataset.sub] = Math.max(0, Math.min(100, Number(i.value)));
  });
  resultsData[resStudent.value] = {
    name: s.name,
    adm: s.adm || "",
    marks: marks,
    assess: document.getElementById("resAssess").value.trim(),
    disc: document.getElementById("resDisc").value,
    discNote: document.getElementById("resDiscNote").value.trim(),
    rec: document.getElementById("resRec").value.trim(),
    reflect: document.getElementById("resReflect").value.trim()
  };
  try {
    await setDoc(resRef(), {
      className: className.value.trim(),
      year: document.getElementById("resYear").value.trim(),
      term: document.getElementById("resTerm").value,
      subjects: subjectList,
      records: resultsData
    });
    alert("Saved for " + s.name + ".");
  } catch (e) {
    alert("Could not save: " + e.message);
  }
});

// ----- ranking: by mean mark, equal means share a position -----
function computeRanks() {
  const rows = students.map(function (s) {
    const r = resultsData[studentKey(s)] || {};
    const marks = r.marks || {};
    let total = 0;
    let n = 0;
    subjectList.forEach(function (sub) {
      if (marks[sub] !== undefined) { total += marks[sub]; n++; }
    });
    return { s: s, r: r, marks: marks, total: total, n: n, mean: n ? total / n : null };
  });
  const ranked = rows.filter(function (x) { return x.mean !== null; })
    .sort(function (a, b) { return b.mean - a.mean; });
  ranked.forEach(function (x, i) {
    x.pos = (i > 0 && x.mean === ranked[i - 1].mean) ? ranked[i - 1].pos : i + 1;
  });
  const rest = rows.filter(function (x) { return x.mean === null; });
  rest.forEach(function (x) { x.pos = "-"; });
  return ranked.concat(rest);
}

function perfBand(m) {
  return m >= 70 ? "good" : m >= 50 ? "mid" : "low";
}

function bar(label, pct, detail) {
  const row = make("div", "grow");
  row.appendChild(make("div", "gname", label));
  const track = make("div", "gtrack");
  const fill = make("div", "gfill " + perfBand(pct));
  fill.style.width = Math.max(0, Math.min(100, pct)) + "%";
  track.appendChild(fill);
  row.appendChild(track);
  row.appendChild(make("div", "gdetail", detail));
  return row;
}

function remarkLines(r) {
  return [
    ["Assessment", r.assess],
    ["Discipline", r.disc ? r.disc + (r.discNote ? " - " + r.discNote : "") : ""],
    ["Recommendation", r.rec],
    ["Reflection", r.reflect]
  ];
}

// ----- ranked results list -----
document.getElementById("resListBtn").addEventListener("click", function () {
  const box = document.getElementById("resBox");
  box.textContent = "";
  if (students.length === 0) {
    box.appendChild(make("p", "note", "No students in this class yet."));
    return;
  }
  const ranked = computeRanks();
  const marked = ranked.filter(function (x) { return x.mean !== null; }).length;
  box.appendChild(make("p", "rhead", (className.value.trim() || "Class") + " - " + termLabel()));
  ranked.forEach(function (x) {
    const div = make("div", "rrow");
    div.appendChild(make("div", "gname", x.pos + ". " + x.s.name + " - Adm " + (x.s.adm || "-")));
    if (x.mean === null) {
      div.appendChild(make("div", "gdetail", "No marks yet."));
    } else {
      div.appendChild(make("div", "rline",
        "Total " + x.total + " | Mean " + x.mean.toFixed(1) + "% | Position " + x.pos + " of " + marked));
      div.appendChild(make("div", "rline", subjectList.filter(function (sub) {
        return x.marks[sub] !== undefined;
      }).map(function (sub) { return sub + " " + x.marks[sub]; }).join(" | ")));
    }
    remarkLines(x.r).forEach(function (p) {
      if (p[1]) div.appendChild(make("div", "rline", p[0] + ": " + p[1]));
    });
    box.appendChild(div);
  });
});

document.getElementById("resPrintBtn").addEventListener("click", function () {
  document.body.classList.add("print-results");
  window.print();
  document.body.classList.remove("print-results");
});

// ----- attendance percentage per student for the term dates -----
async function attendanceMap(cls, from, to) {
  const out = {};
  const snap = await getDocs(collection(db, "users", currentUser.uid, "registers"));
  snap.forEach(function (d) {
    const r = d.data();
    if (r.className !== cls || !r.date || r.date < from || r.date > to) return;
    (r.students || []).forEach(function (s) {
      const k = studentKey(s);
      const o = out[k] || (out[k] = { p: 0, t: 0 });
      [s.am || s.status, s.pm || s.status].forEach(function (v) {
        if (v === "present") o.p++;
        if (v === "present" || v === "absent" || v === "excused") o.t++;
      });
    });
  });
  return out;
}

// ----- signature pads for the report form -----
function makePad(c) {
  const x = c.getContext("2d");
  let down = false;
  let ink = false;
  x.lineWidth = 2.5;
  x.lineCap = "round";
  x.strokeStyle = "#0f2a4a";
  function pt(e) {
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * c.width / r.width, y: (e.clientY - r.top) * c.height / r.height };
  }
  c.addEventListener("pointerdown", function (e) {
    down = true;
    const p = pt(e);
    x.beginPath();
    x.moveTo(p.x, p.y);
    c.setPointerCapture(e.pointerId);
  });
  c.addEventListener("pointermove", function (e) {
    if (!down) return;
    const p = pt(e);
    x.lineTo(p.x, p.y);
    x.stroke();
    ink = true;
  });
  c.addEventListener("pointerup", function () { down = false; });
  c.addEventListener("pointercancel", function () { down = false; });
  return {
    hasInk: function () { return ink; },
    clear: function () { x.clearRect(0, 0, c.width, c.height); ink = false; },
    data: function () { return c.toDataURL("image/png"); }
  };
}
const padT = makePad(document.getElementById("rfTeacherCanvas"));
const padD = makePad(document.getElementById("rfDeputyCanvas"));
document.getElementById("rfTeacherClear").addEventListener("click", padT.clear);
document.getElementById("rfDeputyClear").addEventListener("click", padD.clear);

async function loadSignoff() {
  const out = document.getElementById("rfSigned");
  out.textContent = "";
  let so = {};
  try {
    const snap = await getDoc(reportRef());
    if (snap.exists()) so = snap.data();
  } catch (e) {
    so = {};
  }
  [["Class teacher", so.teacher], ["Deputy principal", so.deputy]].forEach(function (p) {
    if (!p[1]) return;
    const d = make("div", "apv");
    d.appendChild(make("div", "note", p[0] + ": " + p[1].name + " - " + new Date(p[1].time).toLocaleString("en-GB")));
    const img = document.createElement("img");
    img.src = p[1].signature;
    img.alt = "Signature";
    d.appendChild(img);
    if (p[1].stamp) {
      const st = document.createElement("img");
      st.src = p[1].stamp;
      st.alt = "School stamp";
      d.appendChild(st);
    }
    out.appendChild(d);
  });
}

// ----- generate the class report form -----
document.getElementById("rfBtn").addEventListener("click", async function () {
  if (!currentUser) return;
  const cls = className.value.trim();
  if (cls === "") {
    alert("Tap your class at the top first.");
    return;
  }
  rfKey = "";
  const box = document.getElementById("rfBox");
  box.textContent = "";
  const ranked = computeRanks();
  const marked = ranked.filter(function (x) { return x.mean !== null; });
  if (marked.length === 0) {
    box.appendChild(make("p", "note", "Enter marks in Results and Assessment first, then generate the form."));
    return;
  }
  let att = {};
  try {
    att = await attendanceMap(cls, document.getElementById("graphFrom").value, document.getElementById("graphTo").value);
  } catch (e) {
    att = {};
  }

  box.appendChild(make("p", "rhead", setup ? setup.schoolName + ", " + setup.town : "School report form"));
  box.appendChild(make("p", "rhead", cls + " - " + termLabel()));
  const classMean = marked.reduce(function (t, x) { return t + x.mean; }, 0) / marked.length;
  const sum = make("div", "gsum");
  sum.appendChild(make("span", "", "Students: " + ranked.length));
  sum.appendChild(make("span", "", "Class mean: " + classMean.toFixed(1) + "%"));
  sum.appendChild(make("span", "", "Top: " + marked[0].s.name + " (" + marked[0].mean.toFixed(1) + "%)"));
  box.appendChild(sum);

  // table: position, student, adm, every subject, total, mean, attendance
  const wrap = make("div", "table-wrap");
  const table = make("table", "rtable");
  const hr = document.createElement("tr");
  ["Pos", "Student", "Adm"].concat(subjectList, ["Total", "Mean", "Att%"]).forEach(function (t) {
    hr.appendChild(make("th", "", t));
  });
  const thead = document.createElement("thead");
  thead.appendChild(hr);
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  ranked.forEach(function (x) {
    const tr = document.createElement("tr");
    const a = att[studentKey(x.s)];
    const cells = [String(x.pos), x.s.name, x.s.adm || "-"]
      .concat(subjectList.map(function (sub) { return x.marks[sub] !== undefined ? String(x.marks[sub]) : "-"; }))
      .concat([x.mean === null ? "-" : String(x.total), x.mean === null ? "-" : x.mean.toFixed(1),
        a && a.t ? Math.round(a.p * 100 / a.t) + "%" : "-"]);
    cells.forEach(function (t) { tr.appendChild(make("td", "", t)); });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  box.appendChild(wrap);

  // performance graphs (bar or line)
  renderClassGraphs(box, marked);

  // remarks
  const rem = ranked.filter(function (x) { return x.r.disc || x.r.rec; });
  if (rem.length) {
    box.appendChild(make("p", "rhead", "Remarks"));
    rem.forEach(function (x) {
      box.appendChild(make("div", "rline", x.s.name + ": Discipline " + (x.r.disc || "-") +
        (x.r.discNote ? " - " + x.r.discNote : "") + (x.r.rec ? ". Recommendation: " + x.r.rec : "")));
    });
  }

  document.getElementById("rfSignForm").style.display = "block";
  loadSignoff();
});

// ----- class teacher signs -----
document.getElementById("rfTeacherBtn").addEventListener("click", async function () {
  if (!currentUser) return;
  const nm = document.getElementById("rfTeacherName").value.trim();
  if (nm === "") {
    alert("Type the class teacher's name.");
    return;
  }
  if (!padT.hasInk()) {
    alert("Please sign in the box.");
    return;
  }
  try {
    await setDoc(reportRef(), {
      teacher: { name: nm, signature: padT.data(), time: new Date().toISOString() }
    }, { merge: true });
    padT.clear();
    document.getElementById("rfTeacherName").value = "";
    loadSignoff();
  } catch (e) {
    alert("Could not save: " + e.message);
  }
});

// ----- deputy principal signs and the stamp is added (needs the PIN) -----
document.getElementById("rfDeputyBtn").addEventListener("click", async function () {
  if (!currentUser) return;
  if (!setup) {
    alert("The deputy principal must first complete the setup in the Approval card.");
    return;
  }
  const nm = document.getElementById("rfDeputyName").value.trim();
  const pin = document.getElementById("rfDeputyPin").value.trim();
  if (nm === "") {
    alert("Type the deputy principal's name.");
    return;
  }
  if (!padD.hasInk()) {
    alert("Please sign in the box.");
    return;
  }
  if (pin === "" || (await sha(setup.salt + pin)) !== setup.pinHash) {
    alert("Wrong PIN. Only the deputy principal can sign and stamp.");
    return;
  }
  try {
    await setDoc(reportRef(), {
      deputy: {
        name: nm,
        signature: padD.data(),
        stamp: drawStamp(setup.schoolName, setup.town, new Date()),
        time: new Date().toISOString()
      }
    }, { merge: true });
    padD.clear();
    document.getElementById("rfDeputyName").value = "";
    document.getElementById("rfDeputyPin").value = "";
    loadSignoff();
  } catch (e) {
    alert("Could not save: " + e.message);
  }
});

document.getElementById("rfPrintBtn").addEventListener("click", function () {
  document.body.classList.add("print-report");
  window.print();
  document.body.classList.remove("print-report");
});

// ----- reset the deputy setup (wrong school name or PIN) -----
document.getElementById("resetSetupBtn").addEventListener("click", async function () {
  if (!currentUser || !setup) return;
  const pin = document.getElementById("approvePin").value.trim();
  if (pin === "" || (await sha(setup.salt + pin)) !== setup.pinHash) {
    alert("Type the current deputy PIN in the Deputy PIN box first, then tap reset.");
    return;
  }
  if (!confirm("Reset the deputy setup? You will enter the school name, town and a new PIN again.")) return;
  try {
    await deleteDoc(setupRef());
    setup = null;
    document.getElementById("approvePin").value = "";
    renderApproval();
    showStampPreview();
    alert("Setup cleared. Enter the correct details.");
  } catch (e) {
    alert("Could not reset: " + e.message);
  }
});

// ---------- GRAPHS (bar or line), LEVELS, INDIVIDUAL REPORT FORM ----------
function graphType() {
  return document.getElementById("graphType").value;
}

function lineChart(labels, series) {
  const ns = "http://www.w3.org/2000/svg";
  const W = 400, H = 220, L = 30, R = 10, T = 12, B = 34;
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 " + W + " " + H);
  svg.setAttribute("class", "linechart");
  function el(tag, attrs, text) {
    const e = document.createElementNS(ns, tag);
    Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (text !== undefined) e.textContent = text;
    svg.appendChild(e);
  }
  function px(i) { return labels.length === 1 ? (L + W - R) / 2 : L + i * (W - L - R) / (labels.length - 1); }
  function py(v) { return T + (100 - v) * (H - T - B) / 100; }
  [0, 50, 100].forEach(function (v) {
    el("line", { x1: L, y1: py(v), x2: W - R, y2: py(v), stroke: "#cbd5e1", "stroke-width": 1 });
    el("text", { x: L - 4, y: py(v) + 3, "text-anchor": "end", "font-size": 9, fill: "#64748b" }, String(v));
  });
  const step = Math.ceil(labels.length / 10);
  labels.forEach(function (t, i) {
    if (i % step === 0) el("text", { x: px(i), y: H - B + 14, "text-anchor": "middle", "font-size": 9, fill: "#64748b" }, t);
  });
  series.forEach(function (s) {
    el("polyline", {
      points: s.values.map(function (v, i) { return px(i) + "," + py(v); }).join(" "),
      fill: "none", stroke: s.color, "stroke-width": 2
    });
    s.values.forEach(function (v, i) { el("circle", { cx: px(i), cy: py(v), r: 3, fill: s.color }); });
  });
  return svg;
}

function addChart(box, title, items, caption) {
  box.appendChild(make("p", "rhead", title));
  if (items.length === 0) return;
  if (graphType() === "line") {
    box.appendChild(lineChart(items.map(function (i) { return i.short || i.label; }),
      [{ values: items.map(function (i) { return i.value; }), color: "#2563eb" }]));
    if (caption) box.appendChild(make("p", "note", caption));
  } else {
    items.forEach(function (i) { box.appendChild(bar(i.label, i.value, i.detail)); });
  }
}

function addCompare(box, title, items) {
  box.appendChild(make("p", "rhead", title));
  if (items.length === 0) return;
  if (graphType() === "line") {
    box.appendChild(lineChart(items.map(function (i) { return i.short; }), [
      { values: items.map(function (i) { return i.value; }), color: "#2563eb" },
      { values: items.map(function (i) { return i.avg; }), color: "#ea580c" }
    ]));
    box.appendChild(make("p", "note", "Blue line: this student. Orange line: class average."));
  } else {
    items.forEach(function (i) {
      box.appendChild(bar(i.label, i.value, i.value + " (class average " + i.avg.toFixed(1) + ")"));
    });
  }
}

function subjectAverages(marked) {
  const out = {};
  subjectList.forEach(function (sub) {
    const vals = marked.filter(function (x) { return x.marks[sub] !== undefined; })
      .map(function (x) { return x.marks[sub]; });
    if (vals.length) out[sub] = { avg: vals.reduce(function (t, v) { return t + v; }, 0) / vals.length, n: vals.length };
  });
  return out;
}

function renderClassGraphs(box, marked) {
  addChart(box, "Overall performance (mean %)", marked.map(function (x) {
    return { label: x.pos + ". " + x.s.name, short: String(x.pos), value: x.mean,
      detail: x.mean.toFixed(1) + "% | Total " + x.total };
  }), "Each point is a student, position 1 on the left.");
  const sa = subjectAverages(marked);
  addChart(box, "Class average per subject", Object.keys(sa).map(function (sub) {
    return { label: sub, short: sub.slice(0, 5), value: sa[sub].avg,
      detail: sa[sub].avg.toFixed(1) + "% (" + sa[sub].n + " students)" };
  }), "");
}

document.getElementById("resGraphBtn").addEventListener("click", function () {
  const box = document.getElementById("resGraph");
  box.textContent = "";
  const marked = computeRanks().filter(function (x) { return x.mean !== null; });
  if (marked.length === 0) {
    box.appendChild(make("p", "note", "Save marks for some students first."));
    return;
  }
  renderClassGraphs(box, marked);
});

// ----- subjects by level (starting lists, you can edit them) -----
const LEVELS = {
  lower: "English, Kiswahili, Mathematics, Environmental Activities, Religious Education, Creative Activities",
  upper: "English, Kiswahili, Mathematics, Science and Technology, Social Studies, Agriculture and Nutrition, Religious Education, Creative Arts",
  junior: "English, Kiswahili, Mathematics, Integrated Science, Health Education, Pre-Technical Studies, Social Studies, Religious Education, Business Studies, Agriculture, Life Skills, Sports and Physical Education",
  senior: "English, Kiswahili, Community Service Learning, Physical Education, Mathematics, Biology, Chemistry, Physics, Geography, History, Business Studies, Computer Studies",
  forms: "English, Kiswahili, Mathematics, Biology, Chemistry, Physics, History, Geography, CRE, Business Studies, Agriculture, Computer Studies"
};

document.getElementById("resLevel").addEventListener("change", function () {
  if (!this.value) return;
  resSubjects.value = LEVELS[this.value];
  subjectList = parseSubjects();
  renderMarkInputs();
  this.value = "";
});

// ----- individual student report form -----
document.getElementById("rfStudentBtn").addEventListener("click", async function () {
  if (!currentUser) return;
  const cls = className.value.trim();
  if (cls === "") {
    alert("Tap your class at the top first.");
    return;
  }
  const key = document.getElementById("rfStudent").value;
  const ranked = computeRanks();
  const x = ranked.find(function (r) { return studentKey(r.s) === key; });
  if (!x) {
    alert("Choose a student.");
    return;
  }
  if (x.mean === null) {
    alert("Enter and save this student's marks first.");
    return;
  }
  const marked = ranked.filter(function (r) { return r.mean !== null; });
  let att = {};
  try {
    att = await attendanceMap(cls, document.getElementById("graphFrom").value, document.getElementById("graphTo").value);
  } catch (e) {
    att = {};
  }
  rfKey = "" + key.replace(/[^A-Za-z0-9-]/g, "_");

  const box = document.getElementById("rfBox");
  box.textContent = "";
  box.appendChild(make("p", "rhead", setup ? setup.schoolName + ", " + setup.town : "Student report form"));
  box.appendChild(make("p", "rhead", cls + " - " + termLabel()));
  box.appendChild(make("p", "rhead", x.s.name + " - Adm " + (x.s.adm || "-")));

  const a = att[key];
  const sum = make("div", "gsum");
  sum.appendChild(make("span", "", "Position: " + x.pos + " of " + marked.length));
  sum.appendChild(make("span", "", "Total: " + x.total));
  sum.appendChild(make("span", "", "Mean: " + x.mean.toFixed(1) + "%"));
  sum.appendChild(make("span", "", "Attendance: " + (a && a.t ? Math.round(a.p * 100 / a.t) + "%" : "-")));
  box.appendChild(sum);

  const sa = subjectAverages(marked);
  const subs = subjectList.filter(function (sub) { return x.marks[sub] !== undefined && sa[sub]; });
  const table = make("table", "rtable");
  const hr = document.createElement("tr");
  ["Subject", "Mark", "Class average"].forEach(function (t) { hr.appendChild(make("th", "", t)); });
  const thead = document.createElement("thead");
  thead.appendChild(hr);
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  subs.forEach(function (sub) {
    const tr = document.createElement("tr");
    [sub, String(x.marks[sub]), sa[sub].avg.toFixed(1)].forEach(function (t) { tr.appendChild(make("td", "", t)); });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  const wrap = make("div", "table-wrap");
  wrap.appendChild(table);
  box.appendChild(wrap);

  addCompare(box, "Performance per subject", subs.map(function (sub) {
    return { label: sub, short: sub.slice(0, 5), value: x.marks[sub], avg: sa[sub].avg };
  }));

  remarkLines(x.r).forEach(function (p) {
    if (p[1]) box.appendChild(make("div", "rline", p[0] + ": " + p[1]));
  });

  document.getElementById("rfSignForm").style.display = "block";
  loadSignoff();
});

// ---------- RELOAD WHEN CLASS OR DATE CHANGES ----------
registerDate.addEventListener("change", function () {
  updateDayLine();
  loadRegister();
});
className.addEventListener("change", loadRegister);