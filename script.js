import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc
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
const className = document.getElementById("className");
const registerDate = document.getElementById("registerDate");
const authSection = document.getElementById("authSection");
const appSection = document.getElementById("appSection");

const today = new Date();
document.getElementById("todayDate").textContent = today.toDateString();
registerDate.value = today.toISOString().split("T")[0];

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
  } else {
    authSection.style.display = "block";
    appSection.style.display = "none";
    students = [];
    render();
  }
});

// ---------- REGISTER ----------
function recordId() {
  const cls = className.value.trim() || "default";
  return cls + "_" + registerDate.value;
}

function registerRef() {
  return doc(db, "users", currentUser.uid, "registers", recordId());
}

async function loadRegister() {
  if (!currentUser) return;
  try {
    const snap = await getDoc(registerRef());
    students = snap.exists() ? snap.data().students : [];
  } catch (e) {
    alert("Could not load: " + e.message);
    students = [];
  }
  render();
}

function render() {
  studentList.innerHTML = "";

  students.forEach(function (student, index) {
    const li = document.createElement("li");
    li.className = "student";

    li.innerHTML =
      '<span class="name">' + (index + 1) + ". " + student.name + "</span>" +
      '<div class="actions">' +
      '<button class="status-btn present ' + (student.status === "present" ? "active" : "") + '" data-i="' + index + '" data-s="present">P</button>' +
      '<button class="status-btn absent ' + (student.status === "absent" ? "active" : "") + '" data-i="' + index + '" data-s="absent">A</button>' +
      '<button class="remove-btn" data-i="' + index + '" data-remove="1">×</button>' +
      "</div>";

    studentList.appendChild(li);
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

studentList.addEventListener("click", function (e) {
  const btn = e.target.closest("button");
  if (!btn) return;
  const i = Number(btn.dataset.i);

  if (btn.dataset.remove) {
    students.splice(i, 1);
  } else {
    students[i].status = btn.dataset.s;
  }
  render();
});

document.getElementById("addBtn").addEventListener("click", function () {
  const name = studentName.value.trim();
  if (name === "") {
    alert("Please type the student's name.");
    return;
  }
  students.push({ name: name, status: "none" });
  studentName.value = "";
  studentName.focus();
  render();
});

studentName.addEventListener("keypress", function (e) {
  if (e.key === "Enter") {
    document.getElementById("addBtn").click();
  }
});

document.getElementById("allPresentBtn").addEventListener("click", function () {
  students.forEach(function (s) { s.status = "present"; });
  render();
});

document.getElementById("clearBtn").addEventListener("click", function () {
  if (confirm("Clear all students from this register?")) {
    students = [];
    render();
  }
});

document.getElementById("saveBtn").addEventListener("click", async function () {
  if (!currentUser) {
    alert("Please log in first.");
    return;
  }
  if (className.value.trim() === "") {
    alert("Please type the class name first.");
    return;
  }
  try {
    await setDoc(registerRef(), {
      className: className.value.trim(),
      date: registerDate.value,
      students: students
    });
    alert("Saved to your account for " + className.value + " on " + registerDate.value);
  } catch (e) {
    alert("Could not save: " + e.message);
  }
});

registerDate.addEventListener("change", loadRegister);
className.addEventListener("change", loadRegister);

render();