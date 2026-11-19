import { Field } from "./field.js";
import { validateContribution, validateCreateGroup } from "./validation.js";

const authPanel = document.querySelector("#authPanel");
const appPanel = document.querySelector("#appPanel");
const statusMessage = document.querySelector("#status");
const loginForm = document.querySelector("#loginForm");
const registerForm = document.querySelector("#registerForm");
const groupList = document.querySelector("#groupList");
const groupPanel = document.querySelector("#groupPanel");
const createGroupForm = document.querySelector("#createGroupForm");
let selectedGroupId;
let currentUser;

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(path, { ...options, headers });
  if (response.status === 204) {
    return undefined;
  }
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(
      payload.error || `Request failed (${response.status})`,
    );
    error.status = response.status;
    throw error;
  }
  return payload;
}

function showStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("error", isError);
}

function showAuth() {
  authPanel.hidden = false;
  appPanel.hidden = true;
}

function showApp(user) {
  currentUser = user;
  authPanel.hidden = true;
  appPanel.hidden = false;
  document.querySelector("#welcomeText").textContent =
    `Signed in as ${user.name}`;
}

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

function todayDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

function defaultGroupValues() {
  return {
    name: "",
    contributionAmount: "",
    frequency: "weekly",
    startDate: todayDateOnly(),
  };
}

function mountFields(container, definitions, getValues, setValues) {
  const fields = {};
  for (const definition of definitions) {
    const field = Field({
      ...definition,
      value: getValues()[definition.name],
    });
    const updateValue = () => {
      setValues({
        ...getValues(),
        [definition.name]: field.control.value,
      });
      field.setError("");
    };
    field.control.addEventListener("input", updateValue);
    field.control.addEventListener("change", updateValue);
    container.append(field.element);
    fields[definition.name] = field;
  }
  return fields;
}

function setFieldErrors(fields, errors) {
  for (const [name, field] of Object.entries(fields)) {
    field.setError(errors[name] || "");
  }
}

function resetForm(form, fields, values) {
  form.reset();
  for (const [name, field] of Object.entries(fields)) {
    field.setValue(values[name]);
    field.setError("");
  }
}

let createGroupValues = defaultGroupValues();
const createGroupFieldRefs = mountFields(
  document.querySelector("#createGroupFields"),
  [
    { id: "group-name", label: "Group name", name: "name", required: true },
    {
      id: "group-amount",
      label: "Contribution amount per member",
      name: "contributionAmount",
      type: "number",
      min: 1,
      max: 1_000_000,
      step: 1,
      required: true,
    },
    {
      id: "group-frequency",
      label: "Frequency",
      name: "frequency",
      type: "select",
      required: true,
      options: [
        { value: "weekly", label: "Weekly" },
        { value: "monthly", label: "Monthly" },
      ],
    },
    {
      id: "group-start-date",
      label: "Start date",
      name: "startDate",
      type: "date",
      required: true,
    },
  ],
  () => createGroupValues,
  (values) => {
    createGroupValues = values;
  },
);
createGroupForm.noValidate = true;

function groupIdFromPath() {
  const match = window.location.pathname.match(/^\/groups\/(\d+)\/?$/);
  return match ? Number(match[1]) : undefined;
}

async function loadGroups(preferredGroupId, { navigate = true } = {}) {
  const result = await api("/api/groups");
  groupList.replaceChildren();
  if (result.groups.length === 0) {
    groupList.append(node("li", "muted", "No circles yet."));
    selectedGroupId = undefined;
    groupPanel.replaceChildren();
    if (window.location.pathname !== "/") {
      window.history.replaceState({}, "", "/");
    }
    const empty = node("div", "empty-state");
    empty.append(
      node("span", "empty-mark", "+"),
      node("h2", "", "Start with a circle"),
      node(
        "p",
        "",
        "Create a circle or join one with an invite code to see its schedule.",
      ),
    );
    groupPanel.append(empty);
    return;
  }

  for (const group of result.groups) {
    const item = node("li", "group-list-item");
    const button = node("button", "group-link", group.name);
    button.type = "button";
    button.setAttribute(
      "aria-current",
      String(group.id === (preferredGroupId ?? selectedGroupId)),
    );
    button.addEventListener("click", () => {
      loadGroup(group.id).catch((error) => showStatus(error.message, true));
    });
    item.append(
      button,
      node(
        "span",
        "group-meta",
        `${group.memberCount} members · round ${group.currentRound}`,
      ),
    );
    groupList.append(item);
  }

  const requestedId = preferredGroupId ?? selectedGroupId;
  const nextId = result.groups.some((group) => group.id === requestedId)
    ? requestedId
    : result.groups[0].id;
  selectedGroupId = nextId;
  await loadGroup(nextId, { navigate });
}

function renderGroup(group) {
  groupPanel.replaceChildren();
  const header = node("div", "group-heading");
  const headingText = node("div", "");
  headingText.append(
    node(
      "p",
      "eyebrow",
      group.role === "owner" ? "CIRCLE OWNER" : "CIRCLE MEMBER",
    ),
    node("h2", "", group.name),
    node(
      "p",
      "muted",
      `Round ${group.currentRound} · ${group.contributionAmount} per member · ${group.frequency}, starting ${group.startDate}`,
    ),
  );
  const invite = node("div", "invite-code");
  invite.append(
    node("span", "muted", "Invite code"),
    node("strong", "", group.inviteCode),
  );
  header.append(headingText, invite);

  const summary = node("div", "summary-grid");
  summary.append(
    summaryCard("Members", String(group.memberCount)),
    summaryCard("Total recorded", String(group.totalContributed)),
    summaryCard(
      "Next turn",
      group.members.find((member) => member.payoutStatus === "next")?.name ||
        "Pending",
    ),
  );

  const actions = node("div", "round-actions");
  const currentRoundContributions = group.contributions.filter(
    (contribution) => contribution.round === group.currentRound,
  );
  const contributedMemberIds = new Set(
    currentRoundContributions.map((contribution) => contribution.memberId),
  );
  const eligibleMembers = group.members.filter(
    (member) =>
      !contributedMemberIds.has(member.id) &&
      (group.role === "owner" || member.id === currentUser.id),
  );
  const contributionForm = createContributionForm(group, eligibleMembers);

  if (group.role === "owner") {
    const payoutButton = node("button", "button-secondary", "Record payout");
    payoutButton.type = "button";
    payoutButton.disabled =
      group.memberCount < 2 ||
      currentRoundContributions.length !== group.memberCount;
    payoutButton.addEventListener("click", async () => {
      try {
        await api(`/api/groups/${group.id}/payouts`, {
          method: "POST",
          body: "{}",
        });
        showStatus("Payout recorded. The next round is ready.");
        await loadGroup(group.id);
        await loadGroups(group.id);
      } catch (error) {
        showStatus(error.message, true);
      }
    });
    actions.append(payoutButton);
  }
  actions.append(
    node(
      "span",
      "muted",
      `${currentRoundContributions.length} of ${group.memberCount} contributions recorded this round`,
    ),
  );

  const columns = node("div", "detail-grid");
  const membersSection = node("section", "detail-card");
  membersSection.append(node("h3", "", "Payout order"));
  const members = node("ol", "member-list");
  for (const member of group.members) {
    const item = node("li", "member-row");
    item.append(
      node("span", "", `${member.payoutOrder}. ${member.name}`),
      node("span", `badge badge-${member.payoutStatus}`, member.payoutStatus),
    );
    members.append(item);
  }
  membersSection.append(members);

  const activitySection = node("section", "detail-card");
  activitySection.append(node("h3", "", "Recent activity"));
  const activity = node("ul", "activity-list");
  for (const contribution of group.contributions.slice(0, 8)) {
    const member = group.members.find(
      (entry) => entry.id === contribution.memberId,
    );
    activity.append(
      node(
        "li",
        "",
        `Round ${contribution.round}: ${member?.name || "Member"} recorded ${contribution.amount} on ${contribution.contributionDate}`,
      ),
    );
  }
  for (const payout of group.payouts.slice(0, 4)) {
    activity.append(
      node(
        "li",
        "payout-event",
        `Round ${payout.round}: ${payout.memberName} received a recorded payout of ${payout.amount}`,
      ),
    );
  }
  if (activity.childElementCount === 0) {
    activity.append(node("li", "muted", "No activity recorded yet."));
  }
  activitySection.append(activity);
  columns.append(membersSection, activitySection);

  groupPanel.append(header, summary, contributionForm, actions, columns);
}

function summaryCard(label, value) {
  const card = node("div", "summary-card");
  card.append(node("span", "muted", label), node("strong", "", value));
  return card;
}

function createContributionForm(group, eligibleMembers) {
  const section = node("section", "detail-card contribution-entry");
  section.append(node("h3", "", "Record contribution"));
  if (eligibleMembers.length === 0) {
    section.append(
      node(
        "p",
        "muted",
        group.role === "owner"
          ? "Every group member has contributed this round."
          : "Your contribution is already recorded for this round.",
      ),
    );
    return section;
  }

  const form = node("form", "contribution-form");
  form.noValidate = true;
  let values = {
    memberId: String(eligibleMembers[0].id),
    amount: String(group.contributionAmount),
    date: todayDateOnly(),
  };
  const fields = mountFields(
    form,
    [
      {
        id: `contribution-member-${group.id}`,
        label: "Member",
        name: "memberId",
        type: "select",
        required: true,
        options: eligibleMembers.map((member) => ({
          value: String(member.id),
          label: member.name,
        })),
      },
      {
        id: `contribution-amount-${group.id}`,
        label: "Amount",
        name: "amount",
        type: "number",
        min: 1,
        max: 1_000_000,
        step: 1,
        required: true,
      },
      {
        id: `contribution-date-${group.id}`,
        label: "Contribution date",
        name: "date",
        type: "date",
        required: true,
      },
    ],
    () => values,
    (nextValues) => {
      values = nextValues;
    },
  );
  const submit = node("button", "", "Record contribution");
  submit.type = "submit";
  form.append(submit);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const errors = validateContribution(values, group.contributionAmount);
    setFieldErrors(fields, errors);
    if (Object.keys(errors).length > 0) return;

    submit.disabled = true;
    try {
      await api(`/api/groups/${group.id}/contributions`, {
        method: "POST",
        body: JSON.stringify({
          memberId: Number(values.memberId),
          amount: Number(values.amount),
          date: values.date,
        }),
      });
      values = {
        memberId: String(eligibleMembers[0].id),
        amount: String(group.contributionAmount),
        date: todayDateOnly(),
      };
      resetForm(form, fields, values);
      showStatus("Contribution recorded for this round.");
      await loadGroups(group.id);
    } catch (error) {
      showStatus(error.message, true);
    } finally {
      submit.disabled = false;
    }
  });
  section.append(form);
  return section;
}

async function loadGroup(groupId, { navigate = true } = {}) {
  const result = await api(`/api/groups/${groupId}`);
  selectedGroupId = groupId;
  renderGroup(result.group);
  const path = `/groups/${groupId}`;
  if (navigate && window.location.pathname !== path) {
    window.history.pushState({ groupId }, "", path);
  }
}

async function authenticate(path, form) {
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  const result = await api(path, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  showApp(result.user);
  await loadGroups(groupIdFromPath());
  form.reset();
  showStatus("You are signed in.");
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await authenticate("/api/auth/login", loginForm);
  } catch (error) {
    showStatus(error.message, true);
  }
});

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await authenticate("/api/auth/register", registerForm);
  } catch (error) {
    showStatus(error.message, true);
  }
});

document.querySelector("#authToggle").addEventListener("click", () => {
  const registering = registerForm.hidden;
  registerForm.hidden = !registering;
  loginForm.hidden = registering;
  document.querySelector("#authTitle").textContent = registering
    ? "Create your account"
    : "Welcome back";
  document.querySelector("#authDescription").textContent = registering
    ? "Join your community and save together."
    : "Sign in to see your circles and contributions.";
  document.querySelector("#authToggle").textContent = registering
    ? "Already have an account? Sign in"
    : "Need an account? Sign up";
  showStatus("");
});

createGroupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const errors = validateCreateGroup(createGroupValues);
  setFieldErrors(createGroupFieldRefs, errors);
  if (Object.keys(errors).length > 0) return;

  const submit = createGroupForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const result = await api("/api/groups", {
      method: "POST",
      body: JSON.stringify(createGroupValues),
    });
    createGroupForm.reset();
    createGroupValues = defaultGroupValues();
    resetForm(createGroupForm, createGroupFieldRefs, createGroupValues);
    showStatus(`Group created. Invite code: ${result.group.inviteCode}`);
    await loadGroups(result.group.id);
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    submit.disabled = false;
  }
});

document
  .querySelector("#joinGroupForm")
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    try {
      await api("/api/groups/join", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(formData.entries())),
      });
      form.reset();
      showStatus("You joined the circle.");
      await loadGroups();
    } catch (error) {
      showStatus(error.message, true);
    }
  });

document.querySelector("#logoutButton").addEventListener("click", async () => {
  try {
    await api("/api/auth/logout", { method: "POST" });
    showAuth();
    window.history.replaceState({}, "", "/");
    showStatus("You have signed out.");
  } catch (error) {
    showStatus(error.message, true);
  }
});

async function initialize() {
  try {
    const result = await api("/api/me");
    showApp(result.user);
    const groupId = groupIdFromPath();
    await loadGroups(groupId, { navigate: Boolean(groupId) });
  } catch (error) {
    if (error.status === 401) {
      showAuth();
      return;
    }
    showStatus(error.message, true);
  }
}

window.addEventListener("popstate", () => {
  loadGroups(groupIdFromPath(), { navigate: false }).catch((error) => {
    showStatus(error.message, true);
  });
});

initialize();
