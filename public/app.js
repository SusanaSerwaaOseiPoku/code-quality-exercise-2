const authPanel = document.querySelector("#authPanel");
const appPanel = document.querySelector("#appPanel");
const statusMessage = document.querySelector("#status");
const loginForm = document.querySelector("#loginForm");
const registerForm = document.querySelector("#registerForm");
const groupList = document.querySelector("#groupList");
const groupPanel = document.querySelector("#groupPanel");
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

async function loadGroups(preferredGroupId) {
  const result = await api("/api/groups");
  groupList.replaceChildren();
  if (result.groups.length === 0) {
    groupList.append(node("li", "muted", "No circles yet."));
    selectedGroupId = undefined;
    groupPanel.replaceChildren();
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
    button.addEventListener("click", () => loadGroup(group.id));
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

  const nextId = preferredGroupId ?? selectedGroupId ?? result.groups[0].id;
  selectedGroupId = nextId;
  await loadGroup(nextId);
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
      `Round ${group.currentRound} · ${group.contributionAmount} per member`,
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
  const ownContribution = currentRoundContributions.some(
    (contribution) => contribution.memberId === currentUser.id,
  );
  const contributionButton = node(
    "button",
    ownContribution ? "button-secondary" : "",
    ownContribution
      ? "Contribution recorded"
      : `Record my contribution (${group.contributionAmount})`,
  );
  contributionButton.type = "button";
  contributionButton.disabled = ownContribution;
  contributionButton.addEventListener("click", async () => {
    try {
      await api(`/api/groups/${group.id}/contributions`, {
        method: "POST",
        body: JSON.stringify({ amount: group.contributionAmount }),
      });
      showStatus("Contribution recorded for this round.");
      await loadGroup(group.id);
      await loadGroups(group.id);
    } catch (error) {
      showStatus(error.message, true);
    }
  });
  actions.append(contributionButton);

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
        `Round ${contribution.round}: ${member?.name || "Member"} recorded ${contribution.amount}`,
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

  groupPanel.append(header, summary, actions, columns);
}

function summaryCard(label, value) {
  const card = node("div", "summary-card");
  card.append(node("span", "muted", label), node("strong", "", value));
  return card;
}

async function loadGroup(groupId) {
  const result = await api(`/api/groups/${groupId}`);
  selectedGroupId = groupId;
  renderGroup(result.group);
}

async function authenticate(path, form) {
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  const result = await api(path, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  showApp(result.user);
  await loadGroups();
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

document
  .querySelector("#createGroupForm")
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    try {
      const result = await api("/api/groups", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(formData.entries())),
      });
      form.reset();
      showStatus(`Circle created. Invite code: ${result.group.inviteCode}`);
      await loadGroups(result.group.id);
    } catch (error) {
      showStatus(error.message, true);
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
    showStatus("You have signed out.");
  } catch (error) {
    showStatus(error.message, true);
  }
});

async function initialize() {
  try {
    const result = await api("/api/me");
    showApp(result.user);
    await loadGroups();
  } catch (error) {
    if (error.status === 401) {
      showAuth();
      return;
    }
    showStatus(error.message, true);
  }
}

initialize();
