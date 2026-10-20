import test from "node:test";
import assert from "node:assert/strict";
import {
  allocateBudget,
  budgetSummary,
  dependentTaskIds,
  csvCell,
  guestsCsv,
  findScheduleConflict,
  makeTimeline,
  rebalanceAllocations,
  recalculateGeneratedTasks,
  taskBlocked,
  taskGraphError,
  validAllocations,
  urgency,
} from "../src/core.js";
import { aiContext, validateEvent, makeFallbackPlan, validAnswer, validPlan } from "../server/core.js";

test("budget allocation reconciles exactly including rounding", () => {
  const a = allocateBudget(500001, "Balanced");
  assert.equal(
    a.reduce((n, x) => n + x.amount, 0),
    500001,
  );
  assert.ok(a.every((x) => x.amount >= 0));
});
test("expense totals are deterministic and distinguish commitments", () => {
  const e = {
    budget: 1000,
    expenses: [
      { amount: 250, status: "Estimated" },
      { amount: 300, status: "Committed" },
      { amount: 100, status: "Actual" },
    ],
  };
  const s = budgetSummary(e, allocateBudget(1000));
  assert.equal(s.estimated, 250);
  assert.equal(s.committed, 300);
  assert.equal(s.actual, 100);
  assert.equal(s.remaining, 350);
});
test("allocations remain currency-neutral and summary detects overspend", () => {
  const a = allocateBudget(100, "Budget-conscious");
  const s = budgetSummary(
    { budget: 100, expenses: [{ amount: 140, status: "Actual" }] },
    a,
  );
  assert.equal(s.remaining, -40);
});
test("manual allocations reconcile to a changed budget without changing expense commitments", () => {
  const allocations = [{ name: "Venue", amount: 70 }, { name: "Food", amount: 30 }];
  const updated = rebalanceAllocations(60.01, allocations);
  assert.equal(Math.round(updated.reduce((sum, row) => sum + row.amount, 0) * 100) / 100, 60.01);
  assert.deepEqual(allocations, [{ name: "Venue", amount: 70 }, { name: "Food", amount: 30 }]);
  assert.equal(budgetSummary({ budget: 60.01, expenses: [{ amount: 80, status: "Committed" }] }, updated).committed, 80);
  assert.equal(budgetSummary({ budget: 60.01, expenses: [{ amount: 80, status: "Committed" }] }, updated).overspending, 19.99);
  assert.throws(() => rebalanceAllocations(-1, allocations));
  assert.throws(() => rebalanceAllocations(Infinity, allocations));
  assert.ok(validAllocations(updated));
  assert.ok(rebalanceAllocations(0, allocations).every((row) => row.amount === 0));
  assert.equal(budgetSummary({ budget: 0, expenses: [] }, rebalanceAllocations(0, allocations)).utilization, 0);
  assert.equal(validAllocations([{ name: "Venue", amount: -1 }]), false);
  assert.equal(validAllocations([{ name: "Venue", amount: Number.NaN }]), false);
});
test("task dependency validation rejects missing references and cycles and reports blocked tasks", () => {
  const tasks = [
    { id: "a", dependencies: [], status: "todo" },
    { id: "b", dependencies: ["a"], status: "todo" },
  ];
  assert.equal(taskGraphError(tasks), null);
  assert.equal(taskBlocked(tasks[1], tasks), true);
  tasks[0].status = "done";
  assert.equal(taskBlocked(tasks[1], tasks), false);
  assert.deepEqual([...dependentTaskIds([{ id: "b", dependencies: ["a"] }, { id: "c", dependencies: ["b"] }], "a")].sort(), ["b", "c"]);
  assert.match(taskGraphError([{ id: "a", dependencies: ["missing"] }]), /existing tasks/);
  assert.match(taskGraphError([{ id: "a", dependencies: [] }, { id: "a", dependencies: [] }]), /unique/);
  assert.match(taskGraphError([{ id: "a", dependencies: ["b"] }, { id: "b", dependencies: ["a"] }]), /cycle/);
});
test("generated deadlines update while completed and customized task dates are preserved", () => {
  const tasks = makeTimeline("2027-06-01");
  tasks[0].status = "done";
  tasks[1].systemGenerated = false;
  tasks[1].dueDate = "2027-01-01";
  const next = recalculateGeneratedTasks(tasks, "2027-06-01", "2027-08-01");
  assert.equal(next[0].dueDate, tasks[0].dueDate);
  assert.equal(next[1].dueDate, "2027-01-01");
  assert.notEqual(next[2].dueDate, tasks[2].dueDate);
});
test("guest CSV quotes special characters and neutralizes spreadsheet formulas", () => {
  assert.equal(csvCell('Smith, "Jo"\nline'), '"Smith, ""Jo""\nline"');
  assert.equal(csvCell("=1+1"), "\"'=1+1\"");
  assert.match(guestsCsv([{ name: "=IMPORTXML(x)", rsvp: "Pending", dietary: "", accessibility: "" }]), /'=IMPORTXML/);
});
test("timeline adapts to short dates and passed dates", () => {
  const soon = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  const tasks = makeTimeline(soon);
  assert.ok(tasks.length >= 5);
  assert.ok(tasks.slice(0, 3).every((t) => t.priority === "High"));
  const past = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  assert.equal(makeTimeline(past).length, 1);
});
test("urgency flags due and high-priority imminent tasks", () => {
  const today = new Date("2026-10-20T12:00:00");
  assert.equal(
    urgency(
      { status: "todo", dueDate: "2026-10-19", priority: "Low" },
      "2026-11-10",
      today,
    ),
    "urgent",
  );
  assert.equal(
    urgency(
      { status: "todo", dueDate: "2026-10-22", priority: "High" },
      "2026-10-25",
      today,
    ),
    "urgent",
  );
});
test("schedule rejects overlapping use of the same person or location", () => {
  const schedule = [
    {
      start: "10:00",
      end: "11:00",
      person: "Alex",
      location: "Hall A",
      title: "Setup",
    },
  ];
  assert.equal(
    findScheduleConflict(schedule, {
      start: "10:30",
      end: "11:30",
      person: "Alex",
      location: "Hall B",
    }).title,
    "Setup",
  );
  assert.equal(
    findScheduleConflict(schedule, {
      start: "10:30",
      end: "11:30",
      person: "Sam",
      location: "Hall A",
    }).title,
    "Setup",
  );
  assert.equal(
    findScheduleConflict(schedule, {
      start: "11:00",
      end: "12:00",
      person: "Sam",
      location: "Hall A",
    }),
    null,
  );
  assert.equal(
    findScheduleConflict(schedule, { start: "13:00", end: "12:00" })
      .invalidRange,
    true,
  );
});
test("event validation rejects non-finite and invalid values", () => {
  const base = {
    id: "12345678-1234-1234-1234-123456789abc",
    name: "Party",
    budget: 1000,
    guests: 20,
    currency: "INR",
    date: "2027-01-01",
    expenses: [],
  };
  assert.equal(validateEvent(base), null);
  assert.ok(validateEvent({ ...base, budget: Infinity }));
  assert.ok(validateEvent({ ...base, guests: 1.4 }));
  assert.ok(validateEvent({ ...base, expenses: [{ amount: -1 }] }));
  assert.ok(validateEvent({ ...base, tasks: [null] }));
  assert.match(validateEvent({ ...base, schedule: [{ id: "s1", title: "Invalid clock", start: "99:99", end: "25:00" }] }), /time range/);
  const dependent = { ...base, tasks: [
    { id: "a", title: "Prerequisite", priority: "High", status: "todo", dependencies: [] },
    { id: "b", title: "Dependent", priority: "Medium", status: "done", dependencies: ["a"] },
  ] };
  assert.match(validateEvent(dependent), /prerequisites/);
  dependent.tasks[0].status = "done";
  assert.equal(validateEvent(dependent), null);
  assert.match(validateEvent({ ...base, vendors: [{ id: "v1", name: "Caterer", quote: -1 }] }), /Vendor costs/);
  assert.equal(validateEvent({ ...base, guestsList: [{ id: "g1", name: "Rita", rsvp: "Pending" }] }), null);
  assert.match(validateEvent({ ...base, guestsList: [{ id: "g1", name: "Rita", rsvp: "Maybe" }] }), /RSVP/);
});
test("fallback plan is specific and bounded to user inputs", () => {
  const p = makeFallbackPlan({
    type: "Birthday",
    style: "Budget-conscious",
    guests: 40,
    budget: 12000,
    currency: "INR",
    city: "Jaipur",
    expenses: [],
  });
  assert.match(p.overview, /Birthday/i);
  assert.match(p.overview, /40 guests/);
  assert.equal(p.nextSteps.length, 4);
});
test("AI context is useful while omitting guest/vendor contact details and individual notes", () => {
  const context = aiContext({ type: "Wedding", guests: 3, budget: 10, expenses: [{ description: "Private name", amount: 2, category: "Food", status: "Estimated" }], guestsList: [{ name: "Private guest", rsvp: "Attending", dietary: "Private health note" }], vendors: [{ name: "Private vendor", email: "private@example.test", category: "Venue", status: "Quoted" }], schedule: [{ person: "Private person" }] });
  const serialized = JSON.stringify(context);
  assert.match(serialized, /guestCounts/);
  assert.doesNotMatch(serialized, /Private name|Private guest|Private health note|Private vendor|private@example|Private person/);
});
test("model output validation rejects empty or oversized structured responses", () => {
  const good = { overview: "Plan", recommendations: [{ area: "Food", suggestion: "Compare menus", fit: "For your guests" }], nextSteps: ["Request written quotes"] };
  assert.equal(validPlan(good), true);
  assert.equal(validPlan({ ...good, recommendations: [] }), false);
  assert.equal(validPlan({ ...good, overview: " " }), false);
  assert.equal(validPlan({ ...good, nextSteps: [" "] }), false);
  assert.equal(validAnswer("Answer"), true);
  assert.equal(validAnswer(" "), false);
  assert.equal(validAnswer("x".repeat(5000)), false);
});
