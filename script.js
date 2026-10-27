let students = [];

const studentList = document.getElementById("studentList");
const studentName = document.getElementById("studentName");
const className = document.getElementById("className");
const registerDate = document.getElementById("registerDate");

// Show today's date
const today = new Date();
document.getElementById("todayDate").textContent = today.toDateString();
registerDate.value = today.toISOString().split("T")[0];

// Load saved register for the chosen date
function storageKey() {
  return "register_" + registerDate.value;
}

function loadRegister() {
  const saved = localStorage.getItem(storageKey());
  if (saved) {
    const data = JSON.parse(saved);
    students = data.students;
    className.value = data.className || "";
  } else {
    students = [];
  }
  render();
}

// Draw the list on the screen
function render() {
  studentList.innerHTML = "";

  students.forEach(function (student, index) {
    const li = document.createElement("li");
    li.className = "student";

    li.innerHTML =
      '<span class="name">' + (index + 1) + ". " + student.name + "</span>" +
      '<div class="actions">' +
      '<button class="status-btn present ' + (student.status === "present" ? "active" : "") + '" onclick="setStatus(' + index + ", 'present')\">P</button>" +
      '<button class="status-btn absent ' + (student.status === "absent" ? "active" : "") + '" onclick="setStatus(' + index + ", 'absent')\">A</button>" +
      '<button class="remove-btn" onclick="removeStudent(' + index + ')">×</button>' +
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

function setStatus(index, status) {
  students[index].status = status;
  render();
}

function removeStudent(index) {
  students.splice(index, 1);
  render();
}

// Add a student
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

// Press Enter to add
studentName.addEventListener("keypress", function (e) {
  if (e.key === "Enter") {
    document.getElementById("addBtn").click();
  }
});

// Mark everyone present
document.getElementById("allPresentBtn").addEventListener("click", function () {
  students.forEach(function (s) { s.status = "present"; });
  render();
});

// Clear the register
document.getElementById("clearBtn").addEventListener("click", function () {
  if (confirm("Clear all students from this register?")) {
    students = [];
    render();
  }
});

// Save the register
document.getElementById("saveBtn").addEventListener("click", function () {
  const data = {
    className: className.value,
    students: students
  };
  localStorage.setItem(storageKey(), JSON.stringify(data));
  alert("Register saved for " + registerDate.value);
});

// Load when the date changes
registerDate.addEventListener("change", loadRegister);

loadRegister();