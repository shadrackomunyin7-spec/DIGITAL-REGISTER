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

const studentList = document.getElementById("studentList");
const studentName = document.getElementById("studentName");
const admNo = document.getElementById("admNo");
const className = document.getElementById("className");
const registerDate = document.getElementById("registerDate");
const authSection = document.getElementById("authSection");
const appSection = document.getElementById("appSection");
const rosterNote = document.getElementById("rosterNote");
const savedList = document.getElementById("savedList");

const today = new Date();
document.getElementById("todayDate").textContent = today.toDateString();
registerDate.value = today.toISOString().split("T")[0];

// Small helper: make an element with a class and text (safe, no HTML needed)
function make(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

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
    loadRegister();
    loadSavedList();
  } else {
    authSection.style.display = "block";
    appSection.style.display = "none";
    students = [];
    render();
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

// ---------- LOAD (saved day first, then class list) ----------
async function loadRegister() {
  if (!currentUser) return;
  try {
    const regSnap = await getDoc(registerRef());

    if (regSnap.exists() && regSnap.data().students && regSnap.data().students.length > 0) {
      // Show exactly what was saved on that day
      students = regSnap.data().students.map(function (s) {
        return {
          name: s.name,
          adm: s.adm || "",
          status: s.status || "none"
        };
      });
      rosterNote.textContent = "Saved register for " + registerDate.value + ": " + students.length + " students.";
    } else {
      // New day: load the permanent class list with no ticks
      const rosterSnap = await getDoc(rosterRef());
      const roster = rosterSnap.exists() ? rosterSnap.data().students : [];

      students = roster.map(function (s) {
        return { name: s.name, adm: s.adm || "", status: "none" };
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
      li.appendChild(make("span", "saved-title", item.className || ""));
      li.appendChild(make("span", "saved-date",
        (item.date || "") +
        " | P: " + (item.present || 0) +
        " A: " + (item.absent || 0) +
        " X: " + (item.excused || 0)
      ));
      li.addEventListener("click", function () {
        className.value = item.className;
        registerDate.value = item.date;
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

// ---------- DRAW THE TABLE ----------
function statusButton(index, status, label, current) {
  const btn = make("button", "status-btn " + status + (current === status ? " active" : ""), label);
  btn.dataset.i = index;
  btn.dataset.s = status;
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
    tdP.appendChild(statusButton(index, "present", "P", student.status));
    tr.appendChild(tdP);

    const tdA = document.createElement("td");
    tdA.appendChild(statusButton(index, "absent", "A", student.status));
    tr.appendChild(tdA);

    const tdX = document.createElement("td");
    tdX.appendChild(statusButton(index, "excused", "X", student.status));
    tr.appendChild(tdX);

    const tdD = document.createElement("td");
    const del = make("button", "remove-btn", "\u00d7");
    del.dataset.i = index;
    del.dataset.remove = "1";
    tdD.appendChild(del);
    tr.appendChild(tdD);

    studentList.appendChild(tr);
  });

  updateCounts();
}

function updateCounts() {
  const present = students.filter(function (s) { return s.status === "present"; }).length;
  const absent = students.filter(function (s) { return s.status === "absent"; }).length;

  document.getElementById("totalCount").textContent = students.length;
  document.getElementById("presentCount").textContent = present;
  document.getElementById("absentCount").textContent = absent;
}

// ---------- CLICKS ON P, A, X, DELETE ----------
studentList.addEventListener("click", async function (e) {
  const btn = e.target.closest("button");
  if (!btn) return;
  const i = Number(btn.dataset.i);

  if (btn.dataset.remove) {
    if (confirm("Remove " + students[i].name + " from this class permanently?")) {
      students.splice(i, 1);
      await saveRoster();
      render();
    }
  } else {
    students[i].status = btn.dataset.s;
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

  students.push({ name: name, adm: adm, status: "none" });
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
  students.forEach(function (s) { s.status = "present"; });
  render();
});

document.getElementById("clearBtn").addEventListener("click", function () {
  if (confirm("Reset all ticks for this day? Students stay in the class list.")) {
    students.forEach(function (s) { s.status = "none"; });
    render();
  }
});

// ---------- SAVE TODAY'S REGISTER ----------
document.getElementById("saveBtn").addEventListener("click", async function () {
  if (!currentUser) {
    alert("Please log in first.");
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

  const present = students.filter(function (s) { return s.status === "present"; }).length;
  const absent = students.filter(function (s) { return s.status === "absent"; }).length;
  const excused = students.filter(function (s) { return s.status === "excused"; }).length;

  try {
    await saveRoster();
    await setDoc(registerRef(), {
      className: className.value.trim(),
      date: registerDate.value,
      total: students.length,
      present: present,
      absent: absent,
      excused: excused,
      students: students
    });
    alert("Saved for " + className.value + " on " + registerDate.value +
      ". Present: " + present + ", Absent: " + absent + ", Excused: " + excused);
    loadSavedList();
  } catch (e) {
    alert("Could not save: " + e.message);
  }
});

// ---------- RELOAD WHEN CLASS OR DATE CHANGES ----------
registerDate.addEventListener("change", loadRegister);
className.addEventListener("change", loadRegister);