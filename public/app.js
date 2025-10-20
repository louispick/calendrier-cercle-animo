// Variables globales
let currentUser = localStorage.getItem("volunteerName") || "";
let isAdminMode = false;
let volunteers = [];
let activityTypes = [];
let schedule = [];
const today = new Date().toISOString().split("T")[0];

// Initialisation
document.addEventListener("DOMContentLoaded", () => {
    const volunteerNameInput = document.getElementById("volunteerName");
    if (volunteerNameInput) {
        volunteerNameInput.value = currentUser;
        volunteerNameInput.addEventListener("change", (e) => {
            currentUser = e.target.value;
            localStorage.setItem("volunteerName", currentUser);
            renderCalendar();
        });
    }

    document.getElementById("toggleAdminBtn").addEventListener("click", toggleAdminMode);
    document.getElementById("saveScheduleBtn").addEventListener("click", saveSchedule);
    
    const addActivityDateInput = document.getElementById("addActivityDate");
    if (addActivityDateInput) {
        addActivityDateInput.valueAsDate = new Date();
    }

    loadInitialData();
});

// API Calls
async function fetchVolunteers() {
    try {
        const response = await fetch('/api/volunteers');
        return await response.json();
    } catch (error) {
        console.error('Error fetching volunteers:', error);
        return [];
    }
}

async function fetchActivityTypes() {
    try {
        const response = await fetch('/api/activity-types');
        return await response.json();
    } catch (error) {
        console.error('Error fetching activity types:', error);
        return [];
    }
}

async function fetchSchedule() {
    try {
        const response = await fetch('/api/schedule');
        return await response.json();
    } catch (error) {
        console.error('Error fetching schedule:', error);
        return [];
    }
}

async function saveScheduleToAPI(fullSchedule) {
    try {
        const response = await fetch('/api/schedule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fullSchedule)
        });
        const result = await response.json();
        showMessage("Planning sauvegardé avec succès", "success");
        return result;
    } catch (error) {
        console.error('Error saving schedule:', error);
        showMessage("Erreur lors de la sauvegarde", "error");
        return null;
    }
}

// Data Management
async function loadInitialData() {
    volunteers = await fetchVolunteers();
    activityTypes = await fetchActivityTypes();
    schedule = await fetchSchedule();
    populateVolunteerSelects();
    populateActivityTypeSelect();
    renderCalendar();
}

function getMonday(d) {
    d = new Date(d);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}

function groupByWeeks(scheduleData) {
    const weeks = [];
    const startOfWeek = getMonday(new Date());

    for (let i = 0; i < 6; i++) {
        const weekStart = new Date(startOfWeek);
        weekStart.setDate(startOfWeek.getDate() + (i * 7));
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);

        const weekSchedule = scheduleData.filter(slot => {
            const slotDate = new Date(slot.date);
            return slotDate >= weekStart && slotDate <= weekEnd;
        });
        weeks.push(weekSchedule);
    }
    return weeks;
}

function populateVolunteerSelects() {
    const selects = document.querySelectorAll('#addActivityVolunteer');
    selects.forEach(select => {
        select.innerHTML = '<option value="">-- Aucun --</option>';
        volunteers.forEach(v => {
            const option = document.createElement('option');
            option.value = v.name;
            option.textContent = v.name;
            select.appendChild(option);
        });
    });
}

function populateActivityTypeSelect() {
    const select = document.getElementById('addActivityTypeSelect');
    if (select) {
        select.innerHTML = '';
        activityTypes.forEach(at => {
            const option = document.createElement('option');
            option.value = at.name;
            option.textContent = at.name;
            select.appendChild(option);
        });
    }
}

function populateAddActivityTypeSelect() {
    populateActivityTypeSelect();
}

function populateAddActivityVolunteerSelect() {
    populateVolunteerSelects();
}

// Rendering
function renderSlot(slot) {
    const slotDiv = document.createElement("div");
    slotDiv.className = `slot-card ${getSlotColorClass(slot.activity_type, slot.status)}`;
    slotDiv.setAttribute("data-slot-id", slot.id);
    slotDiv.setAttribute("data-activity-type", slot.activity_type);
    slotDiv.setAttribute("data-volunteer-name", slot.volunteer_name || "");
    slotDiv.setAttribute("data-status", slot.status);

    let content = `
        <div class="font-bold">${slot.activity_type}</div>
        <div>${slot.volunteer_name || "Libre"}</div>
    `;

    if (slot.status === "urgent") {
        content += `<div class="urgent-badge">!</div>`;
    }

    slotDiv.innerHTML = content;

    if (currentUser && slot.activity_type === "Nourrissage") {
        if (slot.status === "available") {
            const assignBtn = document.createElement("button");
            assignBtn.className = "mt-1 px-2 py-1 bg-blue-500 text-white rounded-md text-xs hover:bg-blue-600";
            assignBtn.textContent = "S'inscrire";
            assignBtn.addEventListener("click", () => assignVolunteer(slot.id, currentUser));
            slotDiv.appendChild(assignBtn);
        } else if (slot.status === "assigned" && slot.volunteer_name === currentUser) {
            const unassignBtn = document.createElement("button");
            unassignBtn.className = "mt-1 px-2 py-1 bg-yellow-500 text-white rounded-md text-xs hover:bg-yellow-600";
            unassignBtn.textContent = "Se désinscrire";
            unassignBtn.addEventListener("click", () => unassignVolunteer(slot.id));
            slotDiv.appendChild(unassignBtn);
        }
    }

    return slotDiv;
}

function getSlotColorClass(activityType, status) {
    if (activityType === "Nourrissage") {
        if (status === "urgent") return "status-urgent";
        if (status === "assigned") return "status-assigned";
        if (status === "available") return "status-available";
    } else if (activityType === "Légumes") {
        return "activity-legumes";
    } else if (activityType === "Réunion") {
        return "activity-reunion";
    }
    return "activity-general";
}

function renderCalendar() {
    const calendar = document.getElementById("calendar");
    if (!calendar) return;

    calendar.innerHTML = "";
    const weeks = groupByWeeks(schedule);

    weeks.forEach((week, weekIndex) => {
        const weekDiv = document.createElement("div");
        weekDiv.className = "bg-white rounded-lg shadow-lg overflow-hidden";

        const tableContainer = document.createElement("div");
        tableContainer.className = "overflow-x-auto";

        const table = document.createElement("table");
        table.className = "week-table w-full";

        const thead = document.createElement("thead");
        const headerRow = document.createElement("tr");

        const dayNames = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
        const currentWeekStart = getMonday(new Date(week[0] ? week[0].date : new Date().setDate(new Date().getDate() + (weekIndex * 7))));

        dayNames.forEach((dayName, dayIndex) => {
            const th = document.createElement("th");
            th.className = "p-3 lg:p-4 text-center font-semibold text-white";

            const dayDate = new Date(currentWeekStart);
            dayDate.setDate(currentWeekStart.getDate() + dayIndex);
            const isToday = dayDate.toISOString().split("T")[0] === today;

            th.innerHTML = 
                `<div class="text-sm font-medium">${dayName}</div>` +
                `<div class="text-lg lg:text-xl font-bold ${isToday ? "text-yellow-300" : ""}">${dayDate.getDate()}</div>` +
                `<div class="text-xs opacity-75">${dayDate.toLocaleDateString("fr-FR", { month: "short" })}</div>`;
            headerRow.appendChild(th);
        });

        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement("tbody");
        const activityTypesInWeek = [...new Set(week.map(slot => slot.activity_type))];

        activityTypesInWeek.forEach((activityType) => {
            const row = document.createElement("tr");

            for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
                const cell = document.createElement("td");

                const dayDate = new Date(currentWeekStart);
                dayDate.setDate(currentWeekStart.getDate() + dayIndex);
                const isToday = dayDate.toISOString().split("T")[0] === today;

                if (isToday) {
                    cell.classList.add("today-highlight");
                }

                const dayActivities = week.filter(slot => 
                    slot.day_of_week === (dayIndex + 1) && 
                    slot.activity_type === activityType
                );

                dayActivities.forEach(slot => {
                    const slotDiv = renderSlot(slot);
                    cell.appendChild(slotDiv);
                });

                row.appendChild(cell);
            }

            tbody.appendChild(row);
        });

        table.appendChild(tbody);
        tableContainer.appendChild(table);
        weekDiv.appendChild(tableContainer);
        calendar.appendChild(weekDiv);
    });
}

// Admin Functions
function toggleAdminMode() {
    if (!currentUser) {
        showMessage("Veuillez d'abord saisir ton prénom", "error");
        return;
    }

    isAdminMode = !isAdminMode;
    const adminPanel = document.getElementById("adminPanel");
    const toggleBtn = document.getElementById("toggleAdminBtn");

    if (isAdminMode) {
        adminPanel.classList.remove("hidden");
        toggleBtn.textContent = "Quitter Mode Admin";
        toggleBtn.className = "px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors";
        populateAddActivityVolunteerSelect();
        populateAddActivityTypeSelect();
    } else {
        adminPanel.classList.add("hidden");
        toggleBtn.textContent = "Mode Admin";
        toggleBtn.className = "px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors";
    }
    renderCalendar();
}

async function addVolunteer() {
    const input = document.getElementById("newVolunteerName");
    const name = input.value.trim();
    if (name) {
        volunteers.push({ id: Date.now(), name: name, is_admin: false });
        input.value = "";
        populateVolunteerSelects();
        populateAddActivityVolunteerSelect();
        showMessage(`Bénévole ${name} ajouté`, "success");
    } else {
        showMessage("Le nom du bénévole ne peut pas être vide", "error");
    }
}

async function addActivityType() {
    const nameInput = document.getElementById("newActivityName");
    const colorInput = document.getElementById("newActivityColor");
    const name = nameInput.value.trim();
    const color = colorInput.value;

    if (name) {
        activityTypes.push({ id: Date.now(), name: name, description: "", color: color });
        nameInput.value = "";
        populateActivityTypeSelect();
        populateAddActivityTypeSelect();
        showMessage(`Type d'activité ${name} ajouté`, "success");
    } else {
        showMessage("Le nom du type d'activité ne peut pas être vide", "error");
    }
}

async function addActivityToSchedule() {
    const typeSelect = document.getElementById("addActivityTypeSelect");
    const dateInput = document.getElementById("addActivityDate");
    const volunteerSelect = document.getElementById("addActivityVolunteer");
    const maxVolunteersInput = document.getElementById("addActivityMaxVolunteers");
    const notesInput = document.getElementById("addActivityNotes");

    const activityType = typeSelect.value;
    const date = dateInput.value;
    const volunteerName = volunteerSelect.value === "" ? null : volunteerSelect.value;
    const maxVolunteers = parseInt(maxVolunteersInput.value, 10);
    const notes = notesInput.value.trim();

    if (!activityType || !date) {
        showMessage("Veuillez sélectionner un type d'activité et une date", "error");
        return;
    }

    const newActivity = {
        id: Date.now(),
        date: date,
        day_of_week: new Date(date).getDay() === 0 ? 7 : new Date(date).getDay(),
        activity_type: activityType,
        volunteer_name: volunteerName,
        status: volunteerName ? "assigned" : "available",
        color: activityTypes.find(at => at.name === activityType)?.color || "#60a5fa",
        max_volunteers: maxVolunteers,
        notes: notes,
        is_urgent_when_free: false
    };

    schedule.push(newActivity);
    showMessage("Activité ajoutée au planning !", "success");
    renderCalendar();
}

async function assignVolunteer(slotId, volunteerName) {
    const slot = schedule.find(s => s.id === slotId);
    if (slot) {
        slot.volunteer_name = volunteerName;
        slot.status = "assigned";
        showMessage(`${volunteerName} inscrit pour ${slot.activity_type}`, "success");
        renderCalendar();
    }
}

async function unassignVolunteer(slotId) {
    const slot = schedule.find(s => s.id === slotId);
    if (slot) {
        slot.volunteer_name = null;
        slot.status = "available";
        showMessage("Désinscription réussie", "success");
        renderCalendar();
    }
}

async function saveSchedule() {
    await saveScheduleToAPI(schedule);
}

// Utility Functions
function showMessage(message, type = "info") {
    const container = document.getElementById("messageContainer");
    const messageBox = document.createElement("div");
    messageBox.className = `message-box ${type}`;
    messageBox.textContent = message;
    container.appendChild(messageBox);

    setTimeout(() => {
        messageBox.remove();
    }, 3000);
}

console.log("App.js loaded successfully");

