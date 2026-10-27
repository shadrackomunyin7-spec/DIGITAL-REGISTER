import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

let students = [];

const studentList = document.getElementById("studentList");
const studentName = document.getElementById("studentName");
const className = document.getElementById("className");
const registerDate = document.getElementById("registerDate");

const today = new Date();
document.getElementById("todayDate").textContent = today.toDateString();
registerDate.value = today.toISOString().split("T")[0];

// One record per class per date, e.g. "Form 2 East_2026-10-28"
function recordId() {
  const cls = className.value.trim() || "default";
  return cls + "_" + registerDate.value;
}

async function loadRegister() {
  try {
    const snap = await getDoc(doc(db, "registers", recordId()));
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

// Handle P, A and remove buttons
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

// Save to Firebase so every teacher sees it
document.getElementById("saveBtn").addEventListener("click", async function () {
  if (className.value.trim() === "") {
    alert("Please type the class name first.");
    return;
  }
  try {
    await setDoc(doc(db, "registers", recordId()), {
      className: className.value.trim(),
      date: registerDate.value,
      students: students
    });
    alert("Saved online for " + className.value + " on " + registerDate.value);
  } catch (e) {
    alert("Could not save: " + e.message);
  }
});

// Reload when class or date changes
registerDate.addEventListener("change", loadRegister);
className.addEventListener("change", loadRegister);

render();