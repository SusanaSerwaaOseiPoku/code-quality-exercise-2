function isDateOnly(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function todayDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

export function validateCreateGroup(values) {
  const errors = {};
  const name = values.name.trim();
  const amount = Number(values.contributionAmount);

  if (!name) {
    errors.name = "Enter a group name.";
  } else if (name.length < 3 || name.length > 60) {
    errors.name = "Group name must be 3 to 60 characters.";
  }
  if (!values.contributionAmount) {
    errors.contributionAmount = "Enter a contribution amount.";
  } else if (
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    amount > 1_000_000
  ) {
    errors.contributionAmount = "Enter a whole amount from 1 to 1000000.";
  }
  if (!["weekly", "monthly"].includes(values.frequency)) {
    errors.frequency = "Choose weekly or monthly.";
  }
  if (!values.startDate) {
    errors.startDate = "Choose a start date.";
  } else if (!isDateOnly(values.startDate)) {
    errors.startDate = "Enter a valid start date.";
  }

  return errors;
}

export function validateContribution(values, expectedAmount) {
  const errors = {};
  const amount = Number(values.amount);

  if (!values.memberId) {
    errors.memberId = "Choose a group member.";
  }
  if (!values.amount) {
    errors.amount = "Enter a contribution amount.";
  } else if (!Number.isSafeInteger(amount) || amount <= 0) {
    errors.amount = "Enter a whole amount greater than zero.";
  } else if (amount !== expectedAmount) {
    errors.amount = `Enter the agreed amount of ${expectedAmount}.`;
  }
  if (!values.date) {
    errors.date = "Choose a contribution date.";
  } else if (!isDateOnly(values.date)) {
    errors.date = "Enter a valid contribution date.";
  } else if (values.date > todayDateOnly()) {
    errors.date = "Contribution date cannot be in the future.";
  }

  return errors;
}
