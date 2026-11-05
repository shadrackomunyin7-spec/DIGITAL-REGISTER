import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, collection, getDocs
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
let stampData = "";      // school stamp image

const studentList = document.getElementById("studentList");
const studentName = document.getElementById("studentName");
const admNo = document.getElementById("admNo");
const className = document.getElementById("className");
const registerDate = document.getElementById("registerDate");
const authSection = document.getElementById("authSection");
const appSection = document.getElementById("appSection");
const rosterNote = document.getElementById("rosterNote");
const savedList = document.getElementById("savedList");
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
    loadStamp();
    loadRegister();
    loadSavedList();
  } else {
    authSection.style.display = "block";
    appSection.style.display = "none";
    students = [];
    approval = null;
    locked = false;
    stampData = "";
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

// School stamp: users/{uid}/settings/stamp
function stampRef() {
  return doc(db, "users", currentUser.uid, "settings", "stamp");
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
        loadRegister();
        window.scrollTo({ top: 0, behavior: "smooth" });
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
  ["exc", "Excused"]
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

// ---------- SCHOOL STAMP ----------
function showStampPreview() {
  const img = document.getElementById("stampPreview");
  if (stampData) {
    img.src = stampData;
    img.style.display = "block";
  } else {
    img.style.display = "none";
  }
}

async function loadStamp() {
  try {
    const snap = await getDoc(stampRef());
    stampData = snap.exists() ? (snap.data().image || "") : "";
  } catch (e) {
    stampData = "";
  }
  showStampPreview();
}

document.getElementById("stampBtn").addEventListener("click", function () {
  document.getElementById("stampFile").click();
});

document.getElementById("stampFile").addEventListener("change", function (e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function () {
    const img = new Image();
    img.onload = async function () {
      const scale = Math.min(1, 240 / img.width);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      stampData = c.toDataURL("image/png");
      showStampPreview();
      try {
        await setDoc(stampRef(), { image: stampData });
      } catch (err) {
        alert("Could not save stamp: " + err.message);
      }
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
  e.target.value = "";
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
    form.style.display = "block";
    view.style.display = "none";
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
  if (!confirm("Approve and lock this register? It cannot be changed afterwards.")) return;

  const ap = {
    name: nm,
    signature: sig.toDataURL("image/png"),
    stamp: stampData,
    time: new Date().toISOString()
  };

  try {
    await saveRoster();
    await setDoc(registerRef(), buildRegisterDoc(ap));
    approval = ap;
    locked = true;
    clearSig();
    approverName.value = "";
    render();
    renderApproval();
    loadSavedList();
    alert("Register approved and locked.");
  } catch (e) {
    alert("Could not approve: " + e.message);
  }
});

// ---------- RELOAD WHEN CLASS OR DATE CHANGES ----------
registerDate.addEventListener("change", function () {
  updateDayLine();
  loadRegister();
});
className.addEventListener("change", loadRegister);