import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { authConfigured, authHeaders, initializeAuth, signIn, signOutUser, watchAuth } from "./auth.js";
import {
  allocateBudget,
  budgetSummary,
  findScheduleConflict,
  makeTimeline,
  money,
  rebalanceAllocations,
  validAllocations,
  taskBlocked,
  dependentTaskIds,
  taskGraphError,
  guestsCsv,
  recalculateGeneratedTasks,
  urgency,
} from "./core.js";
import "./style.css";

const h = React.createElement;
const KEY = "festivo-demo-v1";
const blank = () => ({
  id: crypto.randomUUID(),
  name: "",
  type: "Wedding",
  date: "",
  city: "",
  budget: 500000,
  currency: "INR",
  guests: 100,
  venue: "Mixed",
  theme: "",
  style: "Balanced",
  accessibility: "",
  dietary: "",
  priorities: [],
  expenses: [],
  tasks: [],
  vendors: [],
  guestsList: [],
  schedule: [],
  plan: null,
});
function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || [];
  } catch {
    return [];
  }
}
function App() {
  const [events, setEvents] = useState(load),
    [selected, setSelected] = useState(load()[0]?.id || ""),
    [tab, setTab] = useState("overview"),
    [notice, setNotice] = useState(""),
    [chat, setChat] = useState([]),
    [question, setQuestion] = useState(""),
    [busy, setBusy] = useState(false),
    [wizard, setWizard] = useState(false),
    [draft, setDraft] = useState(blank),
    [expense, setExpense] = useState({
      description: "",
      amount: "",
      category: "Venue",
      status: "Estimated",
    }),
    [editingExpenseId, setEditingExpenseId] = useState(""),
    [vendor, setVendor] = useState({ name: "", category: "Venue", contactName: "", phone: "", email: "", quote: "", estimatedCost: "", deposit: "", paymentStatus: "Unpaid", status: "Researching", followUpDate: "", notes: "", comparison: "" }),
    [editingVendorId, setEditingVendorId] = useState(""),
    [guest, setGuest] = useState({
      name: "",
      rsvp: "Pending",
      dietary: "",
      accessibility: "",
    }),
    [editingGuestId, setEditingGuestId] = useState(""),
    [item, setItem] = useState(""),
    [taskDraft, setTaskDraft] = useState({ title: "", dueDate: "", priority: "Medium", dependencies: [] }),
    [editingTaskId, setEditingTaskId] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [authState, setAuthState] = useState({ ready: false, required: false, configured: authConfigured, aiConfigured: false, user: null });
  useEffect(() => {
    let active = true;
    let stop = () => {};
    const healthRequest = import.meta.env.VITE_STATIC_DEMO === "true"
      ? Promise.resolve({ authRequired: false, aiConfigured: false })
      : fetch("/api/health").then((r) => r.json()).catch(() => ({}));
    Promise.all([healthRequest, initializeAuth()]).then(([health, configured]) => {
      if (!active) return;
      setAuthState((x) => ({ ...x, required: Boolean(health.authRequired), configured, aiConfigured: Boolean(health.aiConfigured), ready: true }));
      stop = watchAuth((user) => { if (active) setAuthState((x) => ({ ...x, user })); });
    });
    return () => { active = false; stop(); };
  }, []);
  useEffect(() => {
    if (authState.required && !authState.user) { setEvents([]); setSelected(""); return; }
    if (authState.required && authState.user) {
      let cancelled = false;
      authHeaders().then((headers) => fetch("/api/events", { headers })).then((r) => r.ok ? r.json() : []).then((remote) => {
        if (!cancelled) { setEvents(remote); setSelected(remote[0]?.id || ""); }
      }).catch(() => { if (!cancelled) setNotice("Could not load your cloud events."); });
      return () => { cancelled = true; };
    }
    setEvents(load());
    setSelected(load()[0]?.id || "");
  }, [authState.required, authState.user?.uid]);
  useEffect(() => { if (!authState.required) localStorage.setItem(KEY, JSON.stringify(events)); }, [events, authState.required]);
  useEffect(() => {
    if (!selected || !authState.required) return;
    let cancelled = false;
    authHeaders().then((headers) => fetch(`/api/events/${encodeURIComponent(selected)}`, { headers }))
      .then((r) => (r.ok ? r.json() : null))
      .then((remote) => {
        if (!remote || cancelled) return;
        setEvents((xs) => xs.map((x) => (x.id === remote.id ? remote : x)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selected, authState.required]);
  const event = events.find((e) => e.id === selected);
  const update = (fn) =>
    setEvents((xs) => xs.map((e) => (e.id === selected ? fn(e) : e)));
  const allocated = useMemo(
    () =>
      event
        ? event.allocations || allocateBudget(
            event.budget,
            event.style,
            event.priorities,
            event.guests,
          )
        : [],
    [event?.budget, event?.style, event?.priorities, event?.guests, event?.allocations],
  );
  const summary = event ? budgetSummary(event, allocated) : null;
  const start = () => {
    setDraft(blank());
    setWizard(true);
  };
  const create = async (e) => {
    e.preventDefault();
    const err = validate(draft);
    if (err) {
      setNotice(err);
      return;
    }
    const prior = events.find((x) => x.id === draft.id);
    const ev = prior
      ? {
          ...prior,
          ...draft,
          tasks:
            prior.date === draft.date ? prior.tasks : recalculateGeneratedTasks(prior.tasks, prior.date, draft.date),
        }
      : {
          ...draft,
          tasks: makeTimeline(draft.date),
          vendors: [],
          expenses: [],
          guestsList: [],
          schedule: [],
          allocations: allocateBudget(draft.budget, draft.style, draft.priorities, draft.guests).map(({ name, amount }) => ({ name, amount })),
        };
    setEvents((xs) =>
      prior ? xs.map((x) => (x.id === prior.id ? ev : x)) : [ev, ...xs],
    );
    setSelected(ev.id);
    setWizard(false);
    setTab("overview");
    setNotice(
      prior
        ? "Event details updated. Timeline dates were refreshed if the event date changed."
        : "Event created. Your editable planning workspace is ready.",
    );
    try {
      await apiSave(ev);
    } catch {
      setNotice(authState.required ? "Cloud save failed. Your change is only in this page and is not safely persisted." : "Event saved in this browser. Cloud sync is not configured.");
    }
  };
  const save = async (ev) => {
    try {
      await apiSave(ev);
    } catch {
      setNotice(authState.required ? "Cloud save failed. Your change is only in this page and is not safely persisted." : "Saved in this browser. Cloud persistence is not configured.");
    }
  };
  const addExpense = (e) => {
    e.preventDefault();
    const n = Number(expense.amount);
    if (!expense.description.trim() || !Number.isFinite(n) || n <= 0) {
      setNotice("Enter an expense description and a positive amount.");
      return;
    }
    const next = {
      ...event,
      expenses: editingExpenseId
        ? event.expenses.map((x) => x.id === editingExpenseId ? { ...x, ...expense, amount: n } : x)
        : [...event.expenses, { id: crypto.randomUUID(), ...expense, amount: n, createdAt: new Date().toISOString() }],
    };
    update(() => next);
    setExpense({ ...expense, description: "", amount: "" });
    setEditingExpenseId("");
    save(next);
  };
  const addTask = (ev) => {
    ev.preventDefault();
    if (!taskDraft.title.trim() || taskDraft.title.length > 160) { setNotice("Enter a task title up to 160 characters."); return; }
    const record = { ...taskDraft, title: taskDraft.title.trim(), status: "todo", description: "Added by you", systemGenerated: false };
    const tasks = editingTaskId ? event.tasks.map((t) => t.id === editingTaskId ? { ...t, ...record, status: t.status } : t) : [...event.tasks, { id: crypto.randomUUID(), ...record }];
    const graphError = taskGraphError(tasks);
    if (graphError) { setNotice(graphError); return; }
    const next = {
      ...event,
      tasks,
    };
    update(() => next);
    setTaskDraft({ title: "", dueDate: "", priority: "Medium", dependencies: [] });
    setEditingTaskId("");
    save(next);
  };
  const addVendor = (e) => {
    e.preventDefault();
    const costs = [vendor.quote, vendor.estimatedCost, vendor.deposit].map((x) => Number(x || 0));
    if (!vendor.name.trim() || vendor.name.length > 120 || costs.some((x) => !Number.isFinite(x) || x < 0 || x > 1e12)) { setNotice("Enter a vendor name and valid non-negative quote, estimated cost, and deposit amounts."); return; }
    const record = { ...vendor, quote: Number(vendor.quote || 0), estimatedCost: Number(vendor.estimatedCost || 0), deposit: Number(vendor.deposit || 0) };
    const next = {
      ...event,
      vendors: editingVendorId ? event.vendors.map((x) => x.id === editingVendorId ? { ...x, ...record } : x) : [...event.vendors, { id: crypto.randomUUID(), ...record }],
    };
    update(() => next);
    setVendor({ name: "", category: "Venue", contactName: "", phone: "", email: "", quote: "", estimatedCost: "", deposit: "", paymentStatus: "Unpaid", status: "Researching", followUpDate: "", notes: "", comparison: "" });
    setEditingVendorId("");
    save(next);
  };
  const addGuest = (e) => {
    e.preventDefault();
    if (!guest.name.trim() || guest.name.length > 120) { setNotice("Enter a guest name up to 120 characters."); return; }
    const next = {
      ...event,
      guestsList: editingGuestId ? event.guestsList.map((x) => x.id === editingGuestId ? { ...x, ...guest } : x) : [...event.guestsList, { id: crypto.randomUUID(), ...guest }],
    };
    update(() => next);
    setGuest({ name: "", rsvp: "Pending", dietary: "", accessibility: "" });
    setEditingGuestId("");
    save(next);
  };
  const toggleTask = (id) => {
    const task = event.tasks.find((x) => x.id === id);
    if (task && task.status !== "done" && taskBlocked(task, event.tasks)) { setNotice("Complete this task’s prerequisites before marking it done."); return; }
    const reopen = task?.status === "done" ? dependentTaskIds(event.tasks, id) : new Set();
    const reopenedCount = [...reopen].filter((dependentId) => event.tasks.some((x) => x.id === dependentId && x.status === "done")).length;
    const next = {
      ...event,
      tasks: event.tasks.map((t) =>
        t.id === id || (reopen.has(t.id) && t.status === "done")
          ? { ...t, status: t.status === "done" ? "todo" : "done" }
          : t,
      ),
    };
    update(() => next);
    save(next);
    if (reopenedCount) setNotice(`Reopened this task and ${reopenedCount} completed dependent task${reopenedCount === 1 ? "" : "s"} because a prerequisite is no longer complete.`);
  };
  const generate = async () => {
    setBusy(true);
    try {
      if (!authState.aiConfigured) {
        const next = { ...event, plan: fallbackPlan(event), aiMode: "demo" };
        update(() => next);
        save(next);
        setNotice("AI unavailable; a clearly labeled local planning guide is ready.");
        return;
      }
      const r = await fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json", ...await authHeaders() },
        body: JSON.stringify(authState.required ? { eventId: event.id } : event),
      });
      if (!r.ok) throw Error();
      const p = await r.json();
      const next = { ...event, plan: p.plan, aiMode: p.mode };
      update(() => next);
      save(next);
      setNotice(
        p.mode === "vertex"
          ? "Plan generated with Gemini on Vertex AI."
          : "AI unavailable; a clearly labeled local planning guide is ready.",
      );
    } catch {
      const next = { ...event, plan: fallbackPlan(event), aiMode: "demo" };
      update(() => next);
      save(next);
      setNotice(
        "AI unavailable; a clearly labeled local planning guide is ready.",
      );
    } finally {
      setBusy(false);
    }
  };
  const ask = async (e) => {
    e.preventDefault();
    if (!question.trim()) return;
    const q = question.trim();
    setChat((c) => [...c, { role: "user", text: q }]);
    setQuestion("");
    setBusy(true);
    try {
      if (!authState.aiConfigured) {
        setChat((c) => [...c, { role: "assistant", text: localAnswer(event, q), mode: "demo" }]);
        return;
      }
      const r = await fetch("/api/copilot", {
        method: "POST",
        headers: { "content-type": "application/json", ...await authHeaders() },
        body: JSON.stringify(authState.required ? { eventId: event.id, question: q } : { event, question: q }),
      });
      if (!r.ok) throw Error();
      const d = await r.json();
      setChat((c) => [
        ...c,
        { role: "assistant", text: d.answer, mode: d.mode },
      ]);
    } catch {
      setChat((c) => [
        ...c,
        { role: "assistant", text: localAnswer(event, q), mode: "demo" },
      ]);
    } finally {
      setBusy(false);
    }
  };
  if (authState.required && !authState.user)
    return h("main", { className: "auth-gate" }, brand(), h("h1", null, "Sign in to your event workspace"),
      h("p", { className: "muted" }, "Cloud events are private to the signed-in account. Demo data remains browser-local when cloud authentication is not enabled."),
      !authState.configured ? h("p", { role: "alert" }, "Firebase Authentication is required but the public Firebase app configuration is missing. Set FIREBASE_WEB_API_KEY, FIREBASE_AUTH_DOMAIN, and FIREBASE_APP_ID, then enable Google sign-in in Firebase Console.") : null,
      h("button", { className: "primary", disabled: !authState.configured, onClick: () => signIn().catch(() => setNotice("Sign-in did not complete. Try again.")) }, "Continue with Google"),
      notice ? h("p", { role: "status" }, notice) : null);
  if (!authState.ready) return h("main", { className: "auth-gate", role: "status" }, "Loading your workspace…");
  if (wizard)
    return h(
      "div",
      { className: "modal-backdrop" },
      h(
        "form",
        { className: "wizard", onSubmit: create },
        h(
          "button",
          {
            className: "close",
            type: "button",
            onClick: () => setWizard(false),
          },
          "×",
        ),
        h("p", { className: "eyebrow" }, "LET’S GET THE DETAILS"),
        h("h2", null, "Start with the gathering."),
        h(
          "p",
          { className: "muted" },
          "Share only what helps with planning. Culture and accessibility preferences are optional.",
        ),
        h(
          "div",
          { className: "form-grid" },
          field("Event name", "name", "e.g., Asha’s 30th birthday"),
          h(
            "label",
            null,
            "Event type",
            h(
              "select",
              {
                value: draft.type,
                onChange: (e) => setDraft({ ...draft, type: e.target.value }),
              },
              ["Wedding", "Birthday", "Community Event", "Custom Event"].map(
                (x) => h("option", { key: x }, x),
              ),
            ),
          ),
          field("Event date", "date", "", "date"),
          field("City or area", "city", "e.g., Pune"),
          field("Total budget", "budget", "500000", "number", true),
          h(
            "label",
            null,
            "Currency",
            h(
              "select",
              {
                value: draft.currency,
                onChange: (e) =>
                  setDraft({ ...draft, currency: e.target.value }),
              },
              ["INR", "USD", "EUR", "GBP"].map((x) =>
                h("option", { key: x }, x),
              ),
            ),
          ),
          field("Expected guests", "guests", "100", "number", true),
          h(
            "label",
            null,
            "Venue preference",
            h(
              "select",
              {
                value: draft.venue,
                onChange: (e) => setDraft({ ...draft, venue: e.target.value }),
              },
              ["Indoor", "Outdoor", "Mixed", "Flexible"].map((x) =>
                h("option", { key: x }, x),
              ),
            ),
          ),
          field("Theme or atmosphere", "theme", "e.g., garden dinner"),
          field(
            "Accessibility needs (optional)",
            "accessibility",
            "e.g., step-free access",
          ),
          field(
            "Dietary needs (optional)",
            "dietary",
            "e.g., vegetarian options",
          ),
          h(
            "label",
            null,
            "Planning style",
            h(
              "select",
              {
                value: draft.style,
                onChange: (e) => setDraft({ ...draft, style: e.target.value }),
              },
              ["Budget-conscious", "Balanced", "Premium"].map((x) =>
                h("option", { key: x }, x),
              ),
            ),
          ),
        ),
        h(
          "div",
          { className: "wizard-actions" },
          h("button", { className: "primary" }, "Create planning space"),
        ),
      ),
    );
  if (!event)
    return h(
      "div",
      { className: "shell" },
      h(
        "header",
        { className: "topbar" },
        brand(),
        h("span", { className: "cloud-badge" }, "●  Demo mode"),
      ),
      h(
        "main",
        { className: "landing" },
        h(
          "section",
          { className: "hero" },
          h(
            "div",
            { className: "hero-copy" },
            h(
              "p",
              { className: "eyebrow" },
              "THOUGHTFUL PLANS. MEANINGFUL MOMENTS.",
            ),
            h("h1", null, "Make room for the moment."),
            h(
              "p",
              { className: "lede" },
              "A calmer way to bring your people together. Shape the details, keep an eye on your budget, and know what needs doing next.",
            ),
            h(
              "button",
              { className: "primary", onClick: start },
              "Create my event  →",
            ),
            h(
              "p",
              { className: "privacy" },
              "Your demo stays in this browser. AI ideas are suggestions, not verified vendor offers.",
            ),
          ),
          h(
            "div",
            { className: "hero-art", "aria-hidden": true },
            h("span", { className: "sun" }),
            h("span", { className: "flower f1" }, "✿"),
            h("span", { className: "flower f2" }, "✿"),
            h(
              "span",
              { className: "art-note" },
              "gather · celebrate · remember",
            ),
          ),
        ),
        h(
          "div",
          { className: "feature-row" },
          [
            "Personalized ideas",
            "A budget that adds up",
            "A timeline that adapts",
            "Vendor & guest lists",
          ].map((x, i) =>
            h(
              "div",
              { className: "feature", key: x },
              h("span", null, ["✳", "◷", "✓", "♡"][i]),
              h("strong", null, x),
            ),
          ),
        ),
        h(
          "button",
          {
            className: "sample-link",
            onClick: () => {
              const x = {
                ...blank(),
                name: "Asha & Kiran’s celebration",
                type: "Wedding",
                date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 120)
                  .toISOString()
                  .slice(0, 10),
                city: "Pune",
                budget: 500000,
                guests: 150,
                theme: "Garden dinner",
                tasks: makeTimeline(
                  new Date(Date.now() + 1000 * 60 * 60 * 24 * 120)
                    .toISOString()
                    .slice(0, 10),
                ),
              };
              setEvents([x]);
              setSelected(x.id);
            },
          },
          "Explore a sample event →",
        ),
      ),
    );
  return h(
    "div",
    { className: "shell" },
    h(
      "header",
      { className: "topbar" },
      brand(),
      h(
        "div",
        { className: "top-actions" },
        h(
          "span",
          { className: "cloud-badge" },
          event.aiMode === "vertex" ? "● Gemini connected" : "● Demo mode",
        ),
        h(
          "button",
          {
            className: "text-btn",
            onClick: () => {
              localStorage.removeItem(KEY);
              setEvents([]);
              setSelected("");
            },
          },
          "All events",
        ),
        authState.user && h("button", { className: "text-btn", onClick: () => signOutUser() }, "Sign out"),
      ),
    ),
    h(
      "div",
      { className: "workspace" },
      h(
        "aside",
        { className: "sidebar" },
        h("p", { className: "eyebrow" }, "YOUR EVENT"),
        h("h2", null, event.name),
        h(
          "p",
          { className: "muted" },
          `${event.type} · ${event.city || "Location TBD"}`,
        ),
        h(
          "nav",
          { className: "nav" },
          [
            "overview",
            "budget",
            "timeline",
            "vendors",
            "guests",
            "schedule",
            "copilot",
          ].map((t) =>
            h(
              "button",
              {
                key: t,
                className: tab === t ? "nav-item active" : "nav-item",
                onClick: () => setTab(t),
              },
              h(
                "span",
                null,
                {
                  overview: "◫",
                  budget: "◉",
                  timeline: "◷",
                  vendors: "◇",
                  guests: "♡",
                  schedule: "☷",
                  copilot: "✳",
                }[t],
              ),
              t[0].toUpperCase() + t.slice(1),
            ),
          ),
        ),
        h(
          "div",
          { className: "sidebar-note" },
          h("strong", null, "A little clarity"),
          h(
            "p",
            null,
            authState.required ? `Signed in as ${authState.user?.email || "your account"}. Cloud event data is protected by server-verified ownership.` : "Your changes are saved in this browser. This demo does not use account-level protections.",
          ),
        ),
      ),
      h(
        "main",
        { className: "content" },
        h(
          "div",
          { className: "content-head" },
          h(
            "div",
            null,
            h(
              "p",
              { className: "eyebrow" },
              `YOUR ${tab.toUpperCase()} WORKSPACE`,
            ),
            h(
              "h1",
              null,
              tab === "overview"
                ? "Planning, made lighter"
                : tab === "copilot"
                  ? "Your planning copilot"
                  : tab[0].toUpperCase() + tab.slice(1),
            ),
          ),
          h(
            "button",
            {
              className: "outline",
              onClick: () => {
                setDraft({ ...event });
                setWizard(true);
              },
            },
            "Edit event details",
          ),
        ),
        notice && h("p", { className: "notice", role: "status" }, notice),
        tab === "overview"
          ? overview(event, summary, allocated, setTab, generate, busy)
          : tab === "budget"
            ? budgetView(
                event,
                summary,
                allocated,
                expense,
                setExpense,
                editingExpenseId,
                setEditingExpenseId,
                addExpense,
                update,
                save,
              )
            : tab === "timeline"
              ? timelineView(event, toggleTask, taskDraft, setTaskDraft, addTask, editingTaskId, setEditingTaskId, update, save, setNotice)
              : tab === "vendors"
                ? vendorView(event, vendor, setVendor, addVendor, update, save, editingVendorId, setEditingVendorId)
                : tab === "guests"
                  ? guestsView(event, guest, setGuest, addGuest, update, save, editingGuestId, setEditingGuestId)
                  : tab === "schedule"
                    ? scheduleView(event, update, save, setNotice)
                    : copilot(
                        event,
                        chat,
                        setChat,
                        question,
                        setQuestion,
                        ask,
                        busy,
                      ),
      ),
    ),
  );
  function brand() {
    return h(
      "a",
      { className: "brand", href: "#" },
      h("span", { className: "brand-mark" }, "f"),
      h("span", null, "festivo", h("small", null, " AI")),
    );
  }
  function overview(e, s, a, setT, gen, b) {
    const tasks = e.tasks || [];
    return h(
      React.Fragment,
      null,
      h(
        "section",
        { className: "metrics" },
        metric("Total budget", money(e.budget, e.currency), "Set by you"),
        metric(
          "Remaining",
          money(s.remaining, e.currency),
          `${money(s.estimated + s.committed + s.actual, e.currency)} logged`,
        ),
        metric("Guests", e.guests, `${e.guestsList.length} tracked`),
        metric(
          "Tasks done",
          `${tasks.filter((t) => t.status === "done").length}/${tasks.length}`,
          `${tasks.filter((t) => urgency(t, e.date) === "urgent" && t.status !== "done").length} need attention`,
        ),
      ),
      h(
        "div",
        { className: "two-col" },
        h(
          "section",
          { className: "card" },
          sectionTitle("Budget snapshot", "Plan against your priorities"),
          h(
            "div",
            { className: "budget-bar" },
            h("span", { style: { width: `${Math.min(100, s.utilization)}%` } }),
          ),
          h(
            "div",
            { className: "budget-caption" },
            h("span", null, `${s.utilization}% allocated`),
            h(
              "span",
              null,
              `${money(s.reserve, e.currency)} contingency reserve`,
            ),
          ),
          h(
            "div",
            { className: "alloc-list" },
            a
              .slice(0, 4)
              .map((x) =>
                h(
                  "div",
                  { className: "alloc", key: x.name },
                  h("span", null, x.name),
                  h("strong", null, money(x.amount, e.currency)),
                ),
              ),
          ),
          h(
            "button",
            { className: "quiet", onClick: () => setT("budget") },
            "Open budget →",
          ),
        ),
        h(
          "section",
          { className: "card" },
          sectionTitle("Next up", "The most time-sensitive steps"),
          taskList(tasks.slice(0, 4), toggleTask),
          h(
            "button",
            { className: "quiet", onClick: () => setT("timeline") },
            "See full timeline →",
          ),
        ),
      ),
      h(
        "section",
        { className: "card plan-card" },
        sectionTitle(
          "A plan that fits your event",
          "Personalized recommendations with clear assumptions",
        ),
        e.plan
          ? h(
              "div",
              { className: "plan-text" },
              e.aiMode === "demo" &&
                h(
                  "p",
                  { className: "demo-label" },
                  "Local planning guide · no Gemini call was made",
                ),
              h("p", null, e.plan.overview),
              h(
                "div",
                { className: "plan-recommendations" },
                (e.plan.recommendations || []).map((item) =>
                  h(
                    "article",
                    { key: item.area },
                    h("strong", null, item.area),
                    h("p", null, item.suggestion),
                    h("small", null, item.fit),
                  ),
                ),
              ),
              h("h3", null, "Next actions"),
              h(
                "ul",
                null,
                (e.plan.nextSteps || []).map((x, i) => h("li", { key: i }, x)),
              ),
            )
          : h(
              "p",
              { className: "muted" },
              "Generate an event plan using your date, guest count, budget, and preferences.",
            ),
        h(
          "button",
          { className: "primary small", onClick: gen, disabled: b },
          b ? "Thinking…" : e.plan ? "Refresh my plan" : "Generate my plan",
        ),
      ),
    );
  }
  function metric(title, val, sub) {
    return h(
      "div",
      { className: "metric" },
      h("span", { className: "muted" }, title),
      h("strong", null, val),
      h("small", null, sub),
    );
  }
  function sectionTitle(a, b) {
    return h(
      "div",
      { className: "section-title" },
      h("div", null, h("h2", null, a), h("p", { className: "muted" }, b)),
    );
  }
  function taskList(ts, toggle) {
    return h(
      "div",
      { className: "task-list" },
      ts.length
        ? ts.map((t) =>
            h(
              "label",
              { className: "task", key: t.id },
              h("input", {
                type: "checkbox",
                checked: t.status === "done",
                onChange: () => toggle(t.id),
              }),
              h(
                "span",
                { className: t.status === "done" ? "done" : "" },
                h("strong", null, t.title),
                h(
                  "small",
                  null,
                  `${t.dueDate || "Flexible date"} · ${t.priority} priority`,
                ),
              ),
              h(
                "i",
                { className: `tag ${urgency(t, event.date)}` },
                urgency(t, event.date) === "urgent" ? "Soon" : t.priority,
              ),
            ),
          )
        : h(
            "p",
            { className: "muted" },
            "Your timeline is ready to personalize.",
          ),
    );
  }
  function budgetView(e, s, a, x, setX, editingExpenseId, setEditingExpenseId, add, update, save) {
    return h(
      React.Fragment,
      null,
      h(
        "section",
        { className: "metrics" },
        metric(
          "Event budget",
          money(e.budget, e.currency),
          "Your overall limit",
        ),
        metric(
          "Estimated",
          money(s.estimated, e.currency),
          "Current planned expenses",
        ),
        metric("Committed", money(s.committed, e.currency), "Confirmed by you"),
        metric("Actual", money(s.actual, e.currency), "Entered after spending"),
        metric(
          "Remaining",
          money(s.remaining, e.currency),
          s.remaining < 0 ? "Over budget" : "Available",
        ),
      ),
      h(
        "section",
        { className: "card" },
        sectionTitle(
          "Adjust your budget",
          "Allocations are guidance. Expense arithmetic is deterministic.",
        ),
        h(
          "div",
          { className: "budget-controls" },
          h(
            "label",
            null,
            "Total budget",
            h("input", {
              type: "number",
              min: 1,
              value: e.budget,
              onChange: (ev) => {
                const n = Number(ev.target.value);
                if (n > 0 && Number.isFinite(n)) {
              const next = { ...e, budget: n, allocations: rebalanceAllocations(n, a) };
                  update(() => next);
                  save(next);
                }
              },
            }),
          ),
          h(
            "label",
            null,
            "Currency",
            h(
              "select",
              {
                value: e.currency,
                onChange: (ev) => {
                  const next = { ...e, currency: ev.target.value };
                  update(() => next);
                  save(next);
                },
              },
              ["INR", "USD", "EUR", "GBP"].map((c) =>
                h("option", { key: c }, c),
              ),
            ),
          ),
        ),
        h(
          "div",
          { className: "allocation-grid" },
          a.map((c) =>
            h(
              "div",
              { className: "allocation-card", key: c.name },
            h("label", null, "Category", h("input", { value: c.name, maxLength: 60, "aria-label": `Category name ${c.name}`, onChange: (ev) => {
              const value = ev.target.value;
              const rows = a.map((row) => row === c ? { ...row, name: value } : row);
              if (validAllocations(rows)) { const next = { ...e, allocations: rows }; update(() => next); save(next); }
            } })),
              h("label", null, "Allocation", h("input", { type: "number", min: 0, step: "0.01", value: c.amount, "aria-label": `Allocation for ${c.name}`, onChange: (ev) => {
                const n = Number(ev.target.value); if (!Number.isFinite(n) || n < 0) return;
                const rows = a.map((row) => row === c ? { ...row, amount: Math.round(n * 100) / 100 } : row);
                const next = { ...e, allocations: rows }; update(() => next); save(next);
              } })),
              h(
                "small",
                null,
                `${e.budget > 0 ? Math.round(c.amount / e.budget * 100) : 0}% · ${money(c.amount / Math.max(1, e.guests), e.currency)} per guest`,
              ),
              h("button", { className: "remove", type: "button", disabled: a.length <= 1 || e.expenses.some((x) => x.category === c.name), onClick: () => { const next = { ...e, allocations: a.filter((row) => row !== c) }; update(() => next); save(next); } }, "Remove category"),
            ),
          ),
        ),
        h("form", { className: "inline-form", onSubmit: (ev) => { ev.preventDefault(); const name = categoryName.trim(); const rows = [...a, { name, amount: 0 }]; if (!name || !validAllocations(rows)) return; const next = { ...e, allocations: rows }; update(() => next); save(next); setCategoryName(""); } }, h("label", null, "New category", h("input", { value: categoryName, maxLength: 60, onChange: (ev) => setCategoryName(ev.target.value), required: true })), h("button", { className: "primary small" }, "Add category")),
        s.overAllocated > 0 && h("div", { className: "warning" }, `Allocations exceed the total budget by ${money(s.overAllocated, e.currency)}.`),
        s.overspending > 0 && h("div", { className: "warning" }, `Recorded spending exceeds the budget by ${money(s.overspending, e.currency)}.`),
        s.remaining < 0 &&
          h(
            "div",
            { className: "warning" },
            `Over budget by ${money(-s.remaining, e.currency)}. Review flexible categories; committed expenses are not changed.`,
          ),
      ),
      h(
        "section",
        { className: "card" },
        sectionTitle(
          "Expenses",
          "Estimated and committed expenses stay distinct",
        ),
        h(
          "form",
          { className: "inline-form", onSubmit: add },
          h("input", {
            required: true,
          maxLength: 160,
          placeholder: "Expense description",
            value: x.description,
            onChange: (ev) => setX({ ...x, description: ev.target.value }),
          }),
          h("input", {
            required: true,
            type: "number",
            min: "0.01",
            step: "0.01",
            placeholder: "Amount",
            value: x.amount,
            onChange: (ev) => setX({ ...x, amount: ev.target.value }),
          }),
          h(
            "select",
            {
              value: x.category,
              onChange: (ev) => setX({ ...x, category: ev.target.value }),
            },
            a.map((c) => h("option", { key: c.name }, c.name)),
          ),
          h(
            "select",
            {
              value: x.status,
              "aria-label": "Expense status",
              onChange: (ev) => setX({ ...x, status: ev.target.value }),
            },
            ["Estimated", "Committed", "Actual"].map((status) =>
              h("option", { key: status }, status),
            ),
          ),
          h("button", { className: "primary small" }, editingExpenseId ? "Save expense" : "Add expense"),
          editingExpenseId && h("button", { type: "button", className: "outline", onClick: () => { setEditingExpenseId(""); setX({ description: "", amount: "", category: a[0]?.name || "Other", status: "Estimated" }); } }, "Cancel edit"),
        ),
        h(
          "div",
          { className: "table-list" },
          e.expenses.length
            ? e.expenses.map((x) =>
                h(
                  "div",
                  { className: "list-row", key: x.id },
                  h(
                    "span",
                    null,
                    h("strong", null, x.description),
                    h("small", null, `${x.category} · ${x.status}`),
                  ),
                  h("b", null, money(x.amount, e.currency)),
                  h(
                    "select",
                    {
                      value: x.status,
                      "aria-label": `Status for ${x.description}`,
                      onChange: (ev) => {
                        const next = {
                          ...e,
                          expenses: e.expenses.map((expense) =>
                            expense.id === x.id
                              ? { ...expense, status: ev.target.value }
                              : expense,
                          ),
                        };
                        update(() => next);
                        save(next);
                      },
                    },
                    ["Estimated", "Committed", "Actual"].map((status) =>
                      h("option", { key: status }, status),
                    ),
                  ),
                  h(
                    "button",
                    { type: "button", className: "outline", onClick: () => { setEditingExpenseId(x.id); setX({ description: x.description, amount: String(x.amount), category: x.category, status: x.status }); } },
                    "Edit",
                  ),
                  h(
                    "button",
                    {
                      className: "remove",
                      "aria-label": `Remove expense ${x.description}`,
                      onClick: () => {
                        const next = {
                          ...e,
                          expenses: e.expenses.filter((y) => y.id !== x.id),
                        };
                        update(() => next);
                        save(next);
                      },
                    },
                    "Remove",
                  ),
                ),
              )
            : h(
                "p",
                { className: "muted" },
                "No expenses yet. Add a planning estimate to get started.",
              ),
        ),
      ),
    );
  }
  function timelineView(e, toggle, draftTask, setTask, add, editingId, setEditingId, update, save, setNotice) {
    return h(
      "section",
      { className: "card" },
      sectionTitle(
        "Your event timeline",
        `${dateDistance(e.date)} · tasks adapt to the date you chose`,
      ),
      h("div", { className: "table-list" }, e.tasks.length ? e.tasks.map((t) => {
        const blocked = taskBlocked(t, e.tasks);
        const overdue = t.status !== "done" && t.dueDate && t.dueDate < new Date().toISOString().slice(0, 10);
        return h("article", { className: "list-row task-record", key: t.id },
          h("label", null, h("input", { type: "checkbox", checked: t.status === "done", onChange: () => toggle(t.id), "aria-label": `${t.status === "done" ? "Reopen" : "Complete"} ${t.title}` }),
            h("strong", { className: t.status === "done" ? "done" : "" }, t.title),
            h("small", null, `${t.dueDate || "Flexible date"} · ${t.priority} priority${blocked ? " · blocked by prerequisites" : overdue ? " · overdue" : ""}`)),
          h("button", { type: "button", className: "outline", onClick: () => { setEditingId(t.id); setTask({ title: t.title, dueDate: t.dueDate || "", priority: t.priority || "Medium", dependencies: t.dependencies || [] }); } }, "Edit"),
          h("button", { type: "button", className: "remove", "aria-label": `Remove task ${t.title}`, disabled: e.tasks.some((other) => (other.dependencies || []).includes(t.id)), onClick: () => { const next = { ...e, tasks: e.tasks.filter((other) => other.id !== t.id) }; update(() => next); save(next); if (editingId === t.id) setEditingId(""); } }, "Remove"));
      }) : h("p", { className: "muted" }, "Your timeline is ready to personalize.")),
      h(
        "form",
        {
          className: "inline-form record-form",
          onSubmit: add,
        },
        h("label", null, "Task title", h("input", { required: true, maxLength: 160, value: draftTask.title, onChange: (ev) => setTask({ ...draftTask, title: ev.target.value }) })),
        h("label", null, "Due date", h("input", { type: "date", value: draftTask.dueDate, onChange: (ev) => setTask({ ...draftTask, dueDate: ev.target.value }) })),
        h("label", null, "Priority", h("select", { value: draftTask.priority, onChange: (ev) => setTask({ ...draftTask, priority: ev.target.value }) }, ["Low", "Medium", "High"].map((x) => h("option", { key: x }, x)))),
        h("label", null, "Prerequisite tasks (optional; Ctrl/Command-click to select more than one)", h("select", {
          multiple: true,
          value: draftTask.dependencies,
          onChange: (ev) => setTask({ ...draftTask, dependencies: Array.from(ev.target.selectedOptions, (x) => x.value) }),
        }, e.tasks.filter((t) => t.id !== editingId).map((t) => h("option", { key: t.id, value: t.id }, t.title)))),
        h("button", { className: "primary small" }, editingId ? "Save task" : "Add task"),
        editingId && h("button", { type: "button", className: "outline", onClick: () => { setEditingId(""); setTask({ title: "", dueDate: "", priority: "Medium", dependencies: [] }); } }, "Cancel edit"),
      ),
    );
  }
  function vendorView(e, v, setV, add, update, save, editingId, setEditingId) {
    return h(
      "section",
      { className: "card" },
      sectionTitle(
        "Vendor checklist",
        "Planning records only. No vendor names, offers, or availability are verified.",
      ),
      h(
        "form",
        { className: "inline-form record-form", onSubmit: add },
        h("input", {
          required: true,
          "aria-label": "Vendor or business name",
          placeholder: "Vendor or business name",
          value: v.name,
          onChange: (ev) => setV({ ...v, name: ev.target.value }),
        }),
        h(
          "select",
          {
            "aria-label": "Vendor category",
            value: v.category,
            onChange: (ev) => setV({ ...v, category: ev.target.value }),
          },
          [
            "Venue",
            "Catering",
            "Photography",
            "Decoration",
            "Entertainment",
            "Equipment",
            "Transport",
            "Other",
          ].map((x) => h("option", { key: x }, x)),
        ),
        ...[["contactName", "Contact name", "text"], ["phone", "Phone", "tel"], ["email", "Email", "email"], ["quote", "Quote amount", "number"], ["estimatedCost", "Estimated total cost", "number"], ["deposit", "Deposit", "number"], ["followUpDate", "Follow-up date", "date"]].map(([key, label, type]) => h("label", { key }, label, h("input", { type, min: type === "number" ? 0 : undefined, step: type === "number" ? "0.01" : undefined, value: v[key] || "", onChange: (ev) => setV({ ...v, [key]: ev.target.value }) }))),
        h("label", null, "Payment status", h("select", { value: v.paymentStatus || "Unpaid", onChange: (ev) => setV({ ...v, paymentStatus: ev.target.value }) }, ["Unpaid", "Deposit paid", "Partially paid", "Paid", "Refunded"].map((x) => h("option", { key: x }, x)))),
        h("label", null, "Booking status", h("select", { value: v.status || "Researching", onChange: (ev) => setV({ ...v, status: ev.target.value }) }, ["Researching", "Contacted", "Quoted", "Booked", "Declined"].map((x) => h("option", { key: x }, x)))),
        h("label", null, "Contract or confirmation notes", h("textarea", { maxLength: 1500, value: v.notes || "", onChange: (ev) => setV({ ...v, notes: ev.target.value }) })),
        h("label", null, "Comparison notes", h("textarea", { maxLength: 1000, value: v.comparison || "", onChange: (ev) => setV({ ...v, comparison: ev.target.value }) })),
        h("button", { className: "primary small" }, editingId ? "Save vendor" : "Add vendor"),
        editingId && h("button", { className: "outline", type: "button", onClick: () => { setEditingId(""); setV({ name: "", category: "Venue", contactName: "", phone: "", email: "", quote: "", estimatedCost: "", deposit: "", paymentStatus: "Unpaid", status: "Researching", followUpDate: "", notes: "", comparison: "" }); } }, "Cancel edit"),
      ),
      h(
        "div",
        { className: "table-list" },
        e.vendors.length
          ? e.vendors.map((v) =>
              h(
                "div",
                { className: "list-row", key: v.id },
                h(
                  "span",
                  null,
                  h("strong", null, v.name),
                  h("small", null, `${v.category} · ${v.contactName || "No contact"} · ${v.email || v.phone || "No contact details"} · quote ${money(v.quote || 0, e.currency)} · deposit ${money(v.deposit || 0, e.currency)} · ${v.paymentStatus || "Unpaid"}${v.followUpDate ? ` · follow up ${v.followUpDate}` : ""}`),
                ),
                h(
                  "select",
                  {
                    value: v.status,
                    onChange: (ev) => {
                      const next = {
                        ...e,
                        vendors: e.vendors.map((x) =>
                          x.id === v.id ? { ...x, status: ev.target.value } : x,
                        ),
                      };
                      update(() => next);
                      save(next);
                    },
                  },
                  [
                    "Researching",
                    "Contacted",
                    "Quoted",
                    "Booked",
                    "Declined",
                  ].map((x) => h("option", { key: x }, x)),
                ),
                h(
                  "button",
                  { className: "outline", type: "button", onClick: () => { setEditingId(v.id); setV({ ...v, quote: String(v.quote || ""), estimatedCost: String(v.estimatedCost || ""), deposit: String(v.deposit || "") }); } },
                  "Edit",
                ),
                h(
                  "button",
                  {
                    className: "remove",
                    "aria-label": `Remove vendor ${v.name}`,
                    onClick: () => {
                      const next = {
                        ...e,
                        vendors: e.vendors.filter((x) => x.id !== v.id),
                      };
                      update(() => next);
                      save(next);
                    },
                  },
                  "Remove",
                ),
              ),
            )
          : h(
              "p",
              { className: "muted" },
              "Add a vendor to track quotes and follow-ups. Ask about availability, itemized pricing, deposits, cancellation terms, and accessibility needs.",
            ),
      ),
    );
  }
  function guestsView(e, g, setG, add, update, save, editingId, setEditingId) {
    const attending = e.guestsList.filter((x) => x.rsvp === "Attending").length;
    const pending = e.guestsList.filter((x) => x.rsvp === "Pending").length;
    return h(
      "section",
      { className: "card" },
      sectionTitle(
        "Guest list",
        `${e.guestsList.length} tracked · ${attending} attending · ${pending} pending · meal planning count ${attending}`,
      ),
      h(
        "form",
        { className: "inline-form record-form", onSubmit: add },
        h("input", {
          "aria-label": "Guest name",
          required: true,
          maxLength: 120,
          placeholder: "Guest name",
          value: g.name,
          onChange: (ev) => setG({ ...g, name: ev.target.value }),
        }),
        h(
          "select",
          {
            "aria-label": "Guest RSVP",
            value: g.rsvp,
            onChange: (ev) => setG({ ...g, rsvp: ev.target.value }),
          },
          ["Pending", "Attending", "Declined"].map((x) =>
            h("option", { key: x }, x),
          ),
        ),
        h("input", {
          "aria-label": "Dietary note, optional",
          maxLength: 500,
          placeholder: "Dietary note (optional)",
          value: g.dietary,
          onChange: (ev) => setG({ ...g, dietary: ev.target.value }),
        }),
        h("input", {
          "aria-label": "Accessibility note, optional",
          maxLength: 500,
          placeholder: "Access note (optional)",
          value: g.accessibility,
          onChange: (ev) => setG({ ...g, accessibility: ev.target.value }),
        }),
        h("button", { className: "primary small" }, editingId ? "Save guest" : "Add guest"),
        editingId && h("button", { className: "outline", type: "button", onClick: () => { setEditingId(""); setG({ name: "", rsvp: "Pending", dietary: "", accessibility: "" }); } }, "Cancel edit"),
        h("button", { className: "outline", type: "button", onClick: () => {
          const blob = new Blob([guestsCsv(e.guestsList)], { type: "text/csv;charset=utf-8" });
          const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `${(e.name || "festivo-guests").replace(/[^\w-]+/g, "_")}-guests.csv`; link.click(); URL.revokeObjectURL(url);
        } }, "Export CSV"),
      ),
      h(
        "div",
        { className: "table-list" },
        e.guestsList.map((g) =>
          h(
            "div",
            { className: "list-row", key: g.id },
            h(
              "span",
              null,
              h("strong", null, g.name),
              (g.dietary || g.accessibility) &&
                h(
                  "small",
                  null,
                  [g.dietary, g.accessibility].filter(Boolean).join(" · "),
                ),
            ),
            h(
              "select",
              {
                value: g.rsvp,
                "aria-label": `RSVP for ${g.name}`,
                onChange: (ev) => {
                  const next = {
                    ...e,
                    guestsList: e.guestsList.map((guest) =>
                      guest.id === g.id
                        ? { ...guest, rsvp: ev.target.value }
                        : guest,
                    ),
                  };
                  update(() => next);
                  save(next);
                },
              },
              ["Pending", "Attending", "Declined"].map((status) =>
                h("option", { key: status }, status),
              ),
            ),
            h(
              "button",
              { className: "outline", type: "button", onClick: () => { setEditingId(g.id); setG({ name: g.name, rsvp: g.rsvp, dietary: g.dietary || "", accessibility: g.accessibility || "" }); } },
              "Edit",
            ),
            h(
              "button",
              {
                className: "remove",
                "aria-label": `Remove guest ${g.name}`,
                onClick: () => {
                  const next = {
                    ...e,
                    guestsList: e.guestsList.filter(
                      (guest) => guest.id !== g.id,
                    ),
                  };
                  update(() => next);
                  save(next);
                },
              },
              "Remove",
            ),
          ),
        ),
      ),
    );
  }
  function scheduleView(e, update, save, setNotice) {
    return h(
      "section",
      { className: "card" },
      sectionTitle(
        "Event-day schedule",
        "Build a simple agenda; times are local to the event location.",
      ),
      h(
        "form",
        {
          className: "inline-form",
          onSubmit: (ev) => {
            ev.preventDefault();
            const f = new FormData(ev.currentTarget);
            const start = f.get("start");
            const end = f.get("end");
            const person = String(f.get("person") || "").trim();
            const location = String(f.get("location") || "").trim();
            const activity = { start, end, person, location };
            const conflict = findScheduleConflict(e.schedule, activity);
            if (conflict?.invalidRange) {
              setNotice(
                "An activity must end after it starts on the event day.",
              );
              return;
            }
            if (conflict) {
              setNotice(
                `Schedule conflict with “${conflict.title}” for the same person or location.`,
              );
              return;
            }
            const next = {
              ...e,
              schedule: [
                ...e.schedule,
                {
                  id: crypto.randomUUID(),
                  start,
                  end,
                  title: f.get("title"),
                  person,
                  location,
                },
              ],
            };
            update(() => next);
            save(next);
            ev.currentTarget.reset();
          },
        },
        h("input", { name: "start", type: "time", required: true, "aria-label": "Activity start time" }),
        h("input", { name: "end", type: "time", required: true, "aria-label": "Activity end time" }),
        h("input", { name: "title", placeholder: "Activity", required: true, "aria-label": "Activity title" }),
        h("input", { name: "location", placeholder: "Area or resource", "aria-label": "Activity location" }),
        h("input", { name: "person", placeholder: "Responsible person", "aria-label": "Activity responsible person" }),
        h("button", { className: "primary small" }, "Add activity"),
      ),
      h(
        "div",
        { className: "table-list" },
        [...e.schedule]
          .sort((a, b) => a.start.localeCompare(b.start))
          .map((s) =>
            h(
              "div",
              { className: "list-row", key: s.id },
              h("span", null, `${s.start}–${s.end}`),
              h("strong", null, s.title),
              h(
                "small",
                null,
                [s.location, s.person].filter(Boolean).join(" · "),
              ),
              h(
                "button",
                {
                  className: "remove",
                  "aria-label": `Remove schedule activity ${s.title}`,
                  onClick: () => {
                    const next = {
                      ...e,
                      schedule: e.schedule.filter((x) => x.id !== s.id),
                    };
                    update(() => next);
                    save(next);
                  },
                },
                "Remove",
              ),
            ),
          ),
      ),
    );
  }
  function copilot(e, chat, setChat, q, setQ, ask, busy) {
    return h(
      "section",
      { className: "card chat-card" },
      sectionTitle(
        "A thoughtful second opinion",
        "Suggestions use your stated event details. Verify real world prices and availability.",
      ),
      h(
        "div",
        { className: "chat-log" },
        chat.length
          ? chat.map((m, i) =>
              h(
                "div",
                { className: `bubble ${m.role}`, key: i },
                m.role === "assistant" &&
                  m.mode === "demo" &&
                  h(
                    "small",
                    { className: "demo-label" },
                    "Local suggestion · Gemini unavailable",
                  ),
                m.text,
              ),
            )
          : h(
              "div",
              { className: "chat-intro" },
              h("p", null, "Try asking:"),
              ...[
                "How should I use the remaining budget?",
                "What should I prioritize this week?",
                "What questions should I ask a caterer?",
              ].map((x) =>
                h(
                  "button",
                  { key: x, className: "prompt-chip", onClick: () => setQ(x) },
                  x,
                ),
              ),
            ),
      ),
      h(
        "form",
        { className: "chat-form", onSubmit: ask },
        h("input", {
          value: q,
          "aria-label": "Ask about this event",
          onChange: (e) => setQ(e.target.value),
          placeholder: "Ask about this event…",
        }),
        h(
          "button",
          { className: "primary", disabled: busy },
          busy ? "…" : "Ask",
        ),
      ),
    );
  }

  function field(label, key, placeholder, type = "text", required = false) {
    return h(
      "label",
      null,
      label,
      h("input", {
        type,
        required: required || key === "name",
        min: type === "number" ? "1" : undefined,
        placeholder,
        value: draft[key],
        onChange: (e) =>
          setDraft({
            ...draft,
            [key]: type === "number" ? Number(e.target.value) : e.target.value,
          }),
      }),
    );
  }
}
function validate(e) {
  if (!e.name.trim()) return "Please add an event name.";
  if (!Number.isFinite(Number(e.budget)) || e.budget <= 0)
    return "Budget must be a positive number.";
  if (!Number.isInteger(Number(e.guests)) || e.guests < 1)
    return "Guest count must be a whole number above zero.";
  if (e.date) {
    const d = new Date(`${e.date}T12:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== e.date)
      return "Choose a valid event date.";
  }
  return "";
}
function dateDistance(d) {
  if (!d) return "Date flexible";
  const n = Math.ceil(
    (new Date(`${d}T12:00:00`).getTime() - Date.now()) / 86400000,
  );
  return n < 0
    ? "Event date has passed"
    : n === 0
      ? "Today"
      : `${n} days to go`;
}
function fallbackPlan(e) {
  return {
    overview: `A ${e.style.toLowerCase()} ${e.type.toLowerCase()} for ${e.guests} guests in ${e.city || "your area"}, planned around a ${money(e.budget, e.currency)} budget${e.theme ? ` and your “${e.theme}” direction` : ""}. Protect the priorities you stated and use estimates as a starting point, not local quotes.`,
    recommendations: [
      {
        area: "Theme",
        suggestion: e.theme || "Choose a theme that feels personal.",
        fit: "Use one palette across invitations and table details to keep decoration decisions focused.",
      },
      {
        area: "Venue",
        suggestion: `${e.venue} space sized for ${e.guests} guests in ${e.city || "your area"}.`,
        fit: `Check capacity, ${e.accessibility || "accessibility needs"}, setup time, and weather backup before a deposit.`,
      },
      {
        area: "Food and guests",
        suggestion: `Request itemized menu options for ${e.guests} people.`,
        fit: `Confirm ${e.dietary || "dietary options"} with the caterer directly and compare inclusions.`,
      },
      {
        area: "Decor and memories",
        suggestion:
          "Focus decor on the welcome and gathering areas; prepare a short list of must-have photos.",
        fit: "A short list makes quotes easier to compare and limits last-minute additions.",
      },
      {
        area: "Weather and access",
        suggestion:
          "Confirm a practical backup for outdoor plans and the event-day route.",
        fit: `Your date is ${e.date || "flexible"}; check local conditions and preserve stated access needs.`,
      },
      {
        area: "Sustainability",
        suggestion: "Use digital RSVPs and reusable details when convenient.",
        fit: "Confirm the final guest count before placing food and supply orders.",
      },
    ],
    nextSteps: [
      `Confirm the venue capacity and accessibility fit for ${e.guests} guests.`,
      `Keep a contingency reserve and compare itemized quotes before committing.`,
      `Prioritize ${e.dietary || "guest comfort"} and check vendor availability directly.`,
      `Set a decision date for the highest-cost items based on your event date.`,
    ],
  };
}
function localAnswer(e, q) {
  const s = budgetSummary(e, e.allocations || allocateBudget(e.budget, e.style, e.priorities));
  if (/budget|cost|spend|save/i.test(q))
    return `Your budget is ${money(e.budget, e.currency)} with ${money(s.remaining, e.currency)} remaining after ${money(s.estimated, e.currency)} in recorded estimates. Review flexible categories against your stated priorities; keep accessibility and confirmed commitments intact. I can only suggest trade-offs, not verify local prices.`;
  if (/week|urgent|prioriti|checklist|task/i.test(q)) {
    const urgent = (e.tasks || []).filter(
      (t) => urgency(t, e.date) === "urgent" && t.status !== "done",
    );
    return urgent.length
      ? `These tasks look most time-sensitive: ${urgent.map((x) => x.title).join(", ")}. Confirm any venue and catering decisions first, then contact vendors directly about availability.`
      : "Start with venue requirements, then confirm vendors, dietary and accessibility arrangements, and guest invitations.";
  }
  return `For ${e.type.toLowerCase()} planning, ask vendors for availability, itemized pricing, deposits, cancellation terms, setup/cleanup timing, and how they can meet your stated ${e.accessibility || e.dietary || "guest"} requirements. Their answers need to be confirmed directly.`;
}
async function apiSave(e) {
  if (import.meta.env.VITE_STATIC_DEMO === "true") return;
  const authorization = await authHeaders();
  const r = await fetch(`/api/events/${encodeURIComponent(e.id)}`, {
    method: "PUT",
    headers: { "content-type": "application/json", ...authorization },
    body: JSON.stringify(e),
  });
  if (!r.ok) throw new Error("Cloud save unavailable");
  const data = await r.json();
  if (data.saved === false) throw new Error("Cloud persistence is not enabled");
}
createRoot(document.getElementById("root")).render(h(App));
