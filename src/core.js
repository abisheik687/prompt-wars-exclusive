const CATEGORIES = [
  "Venue",
  "Catering",
  "Decoration",
  "Photography",
  "Entertainment",
  "Attire",
  "Other",
  "Contingency",
];
const profiles = {
  "Budget-conscious": [0.22, 0.27, 0.09, 0.08, 0.08, 0.06, 0.08, 0.12],
  Balanced: [0.28, 0.25, 0.1, 0.1, 0.09, 0.06, 0.04, 0.08],
  Premium: [0.32, 0.25, 0.12, 0.12, 0.1, 0.04, 0.03, 0.06],
};
export function allocateBudget(
  total,
  style = "Balanced",
  priorities = [],
  guestCount = 1,
) {
  const ratios = profiles[style] || profiles.Balanced;
  let rows = CATEGORIES.map((name, i) => ({
    name,
    percent: ratios[i],
    amount: Math.round(Number(total) * ratios[i]),
    perGuest: 0,
  }));
  const delta = Number(total) - rows.reduce((s, x) => s + x.amount, 0);
  rows[rows.length - 1].amount += delta;
  for (const item of rows)
    item.perGuest =
      Number(guestCount) > 0 ? item.amount / Number(guestCount) : 0;
  return rows;
}
export function rebalanceAllocations(total, allocations) {
  const cents = Math.round(Number(total) * 100);
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error("Budget must be a non-negative finite amount.");
  const rows = (allocations || []).filter((x) => x && typeof x.name === "string");
  if (!rows.length) return allocateBudget(cents / 100).map(({ name, amount }) => ({ name, amount }));
  const weights = rows.map((x) => Math.max(0, Math.round(Number(x.amount) * 100) || 0));
  const weightTotal = weights.reduce((sum, x) => sum + x, 0);
  const normalized = weightTotal ? weights : rows.map(() => 1);
  const denominator = normalized.reduce((sum, x) => sum + x, 0);
  let assigned = 0;
  return rows.map((row, index) => {
    const amount = index === rows.length - 1
      ? cents - assigned
      : Math.floor(cents * normalized[index] / denominator);
    assigned += amount;
    return { ...row, amount: amount / 100 };
  });
}
export function validAllocations(allocations) {
  return Array.isArray(allocations) && allocations.length > 0 && allocations.length <= 30 &&
    allocations.every((x) => x && typeof x.name === "string" && x.name.trim().length > 0 &&
      x.name.length <= 60 && Number.isFinite(x.amount) && x.amount >= 0 &&
      Number.isSafeInteger(Math.round(x.amount * 100))) &&
    new Set(allocations.map((x) => x.name.trim().toLowerCase())).size === allocations.length;
}
export function taskGraphError(tasks) {
  if (!Array.isArray(tasks)) return "Tasks must be a list.";
  if (tasks.some((task) => !task || typeof task.id !== "string" || !Array.isArray(task.dependencies))) return "Invalid task.";
  const ids = new Set(tasks.map((x) => x.id));
  if (ids.size !== tasks.length) return "Task identifiers must be unique.";
  const visiting = new Set(), visited = new Set();
  for (const task of tasks) {
    if (task.dependencies.some((id) => id === task.id || !ids.has(id))) return "Tasks may depend only on other existing tasks.";
    if (new Set(task.dependencies).size !== task.dependencies.length) return "Duplicate task dependencies are not allowed.";
  }
  const byId = new Map(tasks.map((x) => [x.id, x]));
  function visit(id) {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dependency of byId.get(id).dependencies) if (visit(dependency)) return true;
    visiting.delete(id); visited.add(id); return false;
  }
  for (const id of ids) if (visit(id)) return "Task dependencies cannot contain a cycle.";
  return null;
}
export function taskBlocked(task, tasks) {
  const byId = new Map(tasks.map((x) => [x.id, x]));
  return (task.dependencies || []).some((id) => byId.get(id)?.status !== "done");
}
export function dependentTaskIds(tasks, prerequisiteId) {
  const dependents = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const task of tasks || []) {
      if (!dependents.has(task.id) && (task.dependencies || []).some((id) => id === prerequisiteId || dependents.has(id))) {
        dependents.add(task.id);
        changed = true;
      }
    }
  }
  return dependents;
}
export function csvCell(value) {
  let text = String(value ?? "");
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function guestsCsv(guests) {
  const rows = [["Name", "RSVP", "Dietary note", "Accessibility note"], ...guests.map((g) => [g.name, g.rsvp, g.dietary, g.accessibility])];
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
export function budgetSummary(event, allocations) {
  const expenses = event.expenses || [];
  const estimated = round(
    expenses
      .filter((x) => x.status !== "Committed" && x.status !== "Actual")
      .reduce((s, x) => s + Number(x.amount || 0), 0),
  );
  const committed = round(
    expenses
      .filter((x) => x.status === "Committed")
      .reduce((s, x) => s + Number(x.amount || 0), 0),
  );
  const actual = round(
    expenses
      .filter((x) => x.status === "Actual")
      .reduce((s, x) => s + Number(x.amount || 0), 0),
  );
  const reserve =
    allocations.find((x) => x.name === "Contingency")?.amount || 0;
  const planned = round(allocations.reduce((s, x) => s + x.amount, 0));
  const budget = Number(event.budget || 0);
  const overAllocated = round(Math.max(0, planned - budget));
  const remaining = round(
    Number(event.budget || 0) - committed - actual - estimated,
  );
  return {
    estimated,
    committed,
    actual,
    remaining,
    reserve,
    planned,
    overAllocated,
    overspending: round(Math.max(0, committed + actual + estimated - budget)),
    utilization:
      budget > 0
        ? Math.round(((planned - reserve) / budget) * 100)
        : 0,
  };
}
export function money(value, currency = "INR") {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(Number(value) || 0);
  } catch {
    return `${currency} ${Math.round(Number(value) || 0)}`;
  }
}
export function makeTimeline(date) {
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  const target = date
    ? new Date(`${date}T12:00:00`)
    : new Date(now.getTime() + 90 * 86400000);
  const days = Math.floor((target - now) / 86400000);
  const base = [
    [
      "Set your total budget",
      "Confirm spending limit and contingency.",
      -120,
      "High",
    ],
    [
      "Research and book a venue",
      "Check capacity, accessibility, date, setup, and cancellation terms.",
      -100,
      "High",
    ],
    [
      "Confirm key vendors",
      "Request itemized quotes and verify availability directly.",
      -75,
      "High",
    ],
    [
      "Send invitations",
      "Share location, RSVP date, and access information.",
      -45,
      "Medium",
    ],
    [
      "Confirm catering and dietary needs",
      "Match the final meal count to stated requirements.",
      -21,
      "High",
    ],
    [
      "Build the event-day schedule",
      "Confirm timings, roles, access, and setup.",
      -14,
      "Medium",
    ],
    [
      "Reconfirm vendors and contingency",
      "Check weather fallback and final arrival times.",
      -3,
      "High",
    ],
    [
      "Enjoy the gathering",
      "Use the confirmed agenda; keep key contacts available.",
      0,
      "Medium",
    ],
  ];
  if (days < 0)
    return [
      {
        id: crypto.randomUUID(),
        title: "Review what went well",
        description: "Record useful notes and follow-ups after the event.",
        dueDate: target.toISOString().slice(0, 10),
        priority: "Low",
        status: "todo",
        dependencies: [],
      },
    ];
  const scale = Math.min(1, days / 120);
  const ids = base.map(() => crypto.randomUUID());
  return base.map(([title, description, offset, priority], i) => {
    let d = Math.min(days, Math.max(0, Math.round(days + offset * scale)));
    let due = new Date(now);
    due.setDate(now.getDate() + d);
    return {
      title,
      description,
      dueDate: due.toISOString().slice(0, 10),
      priority: days <= 7 && i < 3 ? "High" : priority,
      status: "todo",
      dependencies: i === 2 ? [ids[1]] : [],
      systemGenerated: true,
      id: ids[i],
    };
  });
}
export function recalculateGeneratedTasks(tasks, oldDate, newDate) {
  const generated = makeTimeline(newDate);
  const replacement = new Map(generated.map((task) => [task.title, task]));
  return (tasks || []).map((task) => {
    if (!task.systemGenerated || task.status === "done") return task;
    const next = replacement.get(task.title);
    return next ? { ...next, id: task.id, priority: task.priority, description: task.description } : task;
  });
}
export function urgency(task, eventDate, today = new Date()) {
  if (task.status === "done") return "done";
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const remaining = Math.floor(
    (Date.parse(`${task.dueDate}T12:00:00Z`) -
      Date.parse(`${todayKey}T12:00:00Z`)) /
      86400000,
  );
  const untilEvent = eventDate
    ? Math.floor(
        (Date.parse(`${eventDate}T12:00:00Z`) -
          Date.parse(`${todayKey}T12:00:00Z`)) /
          86400000,
      )
    : 90;
  return task.blocked || remaining < 0 || (untilEvent <= 7 && task.priority === "High")
    ? "urgent"
    : remaining <= 7
      ? "soon"
      : "normal";
}

export function findScheduleConflict(schedule, candidate) {
  if (candidate.end <= candidate.start) return { invalidRange: true };
  return (
    schedule.find((activity) => {
      const overlaps =
        candidate.start < activity.end && candidate.end > activity.start;
      const samePerson =
        candidate.person &&
        activity.person &&
        candidate.person.toLowerCase() === activity.person.toLowerCase();
      const sameLocation =
        candidate.location &&
        activity.location &&
        candidate.location.toLowerCase() === activity.location.toLowerCase();
      return overlaps && (samePerson || sameLocation);
    }) || null
  );
}
function round(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
