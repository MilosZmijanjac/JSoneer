const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  formattedText: "",
  comparisonText: "",
  toastTimer: null
};

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove("visible"), 2200);
}

function byteSize(text) {
  const bytes = new Blob([text]).size;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function jsonType(value) {
  if (Array.isArray(value)) return `Array · ${value.length} items`;
  if (value === null) return "null";
  if (typeof value === "object") return `Object · ${Object.keys(value).length} keys`;
  return typeof value;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function syntaxHighlight(json) {
  const escaped = escapeHtml(json);
  return escaped.replace(
    /("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"\s*:|"(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let className = "json-number";
      if (match.startsWith('"')) {
        className = /:\s*$/.test(match) ? "json-key" : "json-string";
      } else if (match === "true" || match === "false") {
        className = "json-boolean";
      } else if (match === "null") {
        className = "json-null";
      }
      return `<span class="${className}">${match}</span>`;
    }
  );
}

function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort((a, b) => a.localeCompare(b))
      .reduce((result, key) => {
        result[key] = sortDeep(value[key]);
        return result;
      }, {});
  }
  return value;
}

function parseJsonInput(input) {
  if (!input.trim()) throw new Error("Paste JSON first.");
  return JSON.parse(input);
}

function setFormatStatus(message, status = "idle", value = null, output = "") {
  $("#format-status").dataset.state = status;
  $("#format-status-text").textContent = message;
  $("#format-document-type").textContent = value === null ? "No document" : jsonType(value);
  $("#format-size").textContent = byteSize(output);
}

function renderFormatOutput(text, value, message) {
  state.formattedText = text;
  $("#format-output").innerHTML = syntaxHighlight(text);
  $("#format-output-meta").textContent = `${text.split("\n").length} lines`;
  setFormatStatus(message, "success", value, text);
}

function formatterAction(action) {
  const input = $("#format-input").value;

  if (action === "clear") {
    $("#format-input").value = "";
    $("#format-output").innerHTML = '<span class="placeholder">Formatted JSON will appear here.</span>';
    $("#format-input-meta").textContent = "0 characters";
    $("#format-output-meta").textContent = "Waiting for JSON";
    state.formattedText = "";
    setFormatStatus("Ready");
    return;
  }

  if (action === "sample") {
    $("#format-input").value = JSON.stringify({
      application: "JSON Tools",
      version: 1,
      active: true,
      features: ["format", "escape", "compare"],
      config: { theme: "dark", privacy: "local" }
    });
    updateFormatterMeta();
    formatterAction("format");
    return;
  }

  if (action === "paste") {
    navigator.clipboard.readText()
      .then((text) => {
        $("#format-input").value = text;
        updateFormatterMeta();
        showToast("Pasted from clipboard");
      })
      .catch(() => showToast("Clipboard access was blocked"));
    return;
  }

  if (action === "copy") {
    if (!state.formattedText) return showToast("Nothing to copy");
    navigator.clipboard.writeText(state.formattedText)
      .then(() => showToast("Copied output"))
      .catch(() => showToast("Copy failed"));
    return;
  }

  if (action === "download") {
    if (!state.formattedText) return showToast("Nothing to download");
    const blob = new Blob([state.formattedText], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "formatted.json";
    link.click();
    URL.revokeObjectURL(link.href);
    showToast("Downloaded formatted.json");
    return;
  }

  try {
    const value = parseJsonInput(input);

    if (action === "validate") {
      renderFormatOutput(JSON.stringify(value, null, 2), value, "Valid JSON");
      return;
    }

    if (action === "minify") {
      renderFormatOutput(JSON.stringify(value), value, "JSON minified");
      return;
    }

    if (action === "sort") {
      const sorted = sortDeep(value);
      renderFormatOutput(JSON.stringify(sorted, null, 2), sorted, "Keys sorted");
      return;
    }

    renderFormatOutput(JSON.stringify(value, null, 2), value, "JSON formatted");
  } catch (error) {
    $("#format-output").innerHTML = `<span class="json-null">${escapeHtml(error.message)}</span>`;
    $("#format-output-meta").textContent = "Invalid JSON";
    state.formattedText = "";
    setFormatStatus(error.message, "error");
  }
}

function updateFormatterMeta() {
  const value = $("#format-input").value;
  $("#format-input-meta").textContent = `${value.length.toLocaleString()} characters`;
}

function escapeText(text) {
  // JSON.stringify implements all standard JSON string escapes.
  return JSON.stringify(text).slice(1, -1);
}

function unescapeText(text) {
  let result = "";

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (character !== "\\") {
      result += character;
      continue;
    }

    if (index === text.length - 1) {
      result += "\\";
      continue;
    }

    const escaped = text[index + 1];

    switch (escaped) {
      case "b":
        result += "\b";
        index += 1;
        break;
      case "f":
        result += "\f";
        index += 1;
        break;
      case "n":
        result += "\n";
        index += 1;
        break;
      case "r":
        result += "\r";
        index += 1;
        break;
      case "t":
        result += "\t";
        index += 1;
        break;
      case '"':
        result += '"';
        index += 1;
        break;
      case "\\":
        result += "\\";
        index += 1;
        break;
      case "/":
        result += "/";
        index += 1;
        break;
      case "u": {
        const hex = text.slice(index + 2, index + 6);

        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          result += String.fromCharCode(Number.parseInt(hex, 16));
          index += 5;
        } else {
          result += "\\u";
          index += 1;
        }
        break;
      }
      default:
        // Unknown sequences such as \x are preserved unchanged.
        result += `\\${escaped}`;
        index += 1;
        break;
    }
  }

  return result;
}

function parseQuickFormatJson(text) {
  const rawValue = text.trim();

  if (!rawValue) {
    throw new Error("There is no JSON to format.");
  }

  const attempts = [];

  // First try normal JSON.
  attempts.push(rawValue);

  // Then try tolerant unescaping, useful for copied log/API values.
  const withoutOuterQuotes =
    rawValue.length >= 2 && rawValue.startsWith('"') && rawValue.endsWith('"')
      ? rawValue.slice(1, -1)
      : rawValue;

  const unescapedValue = unescapeText(withoutOuterQuotes);
  if (unescapedValue !== rawValue) {
    attempts.push(unescapedValue);
  }

  let lastError = null;

  for (const candidate of [...new Set(attempts)]) {
    try {
      let parsed = JSON.parse(candidate);

      // Handle a JSON string whose content is another JSON document.
      if (typeof parsed === "string") {
        try {
          parsed = JSON.parse(parsed);
        } catch {
          // It is a valid plain string, but not a document that can be formatted.
        }
      }

      if (typeof parsed === "string") {
        throw new Error("The value is a string, not a JSON object or array.");
      }

      return parsed;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("Invalid JSON.");
}

function escapeAction(action) {
  const input = $("#escape-input");
  const output = $("#escape-output");

  if (action === "clear") {
    input.value = "";
    output.value = "";
  } else if (action === "sample") {
    input.value = "First line\nSecond line\tTabbed\nQuote: \"Hello\"\nPath: C:\\Tools\\json";
    output.value = "";
  } else if (action === "swap") {
    [input.value, output.value] = [output.value, input.value];
  } else if (action === "paste") {
    navigator.clipboard.readText()
      .then((text) => {
        input.value = text;
        updateEscapeMeta();
        showToast("Pasted from clipboard");
      })
      .catch(() => showToast("Clipboard access was blocked"));
    return;
  } else if (action === "copy") {
    if (!output.value) return showToast("Nothing to copy");
    navigator.clipboard.writeText(output.value)
      .then(() => showToast("Copied output"))
      .catch(() => showToast("Copy failed"));
    return;
  } else if (action === "quick-format") {
    const sourceValue = output.value.trim() ? output.value : input.value;

    try {
      const parsed = parseQuickFormatJson(sourceValue);
      output.value = JSON.stringify(parsed, null, 2);
      showToast("JSON formatted in output");
    } catch (error) {
      showToast(`Cannot format: ${error.message}`);
    }
  } else if (action === "escape") {
    output.value = escapeText(input.value);
  } else if (action === "stringify") {
    output.value = JSON.stringify(input.value);
  } else if (action === "unescape") {
    const rawValue = input.value;
    const trimmedValue = rawValue.trim();

    // Unescape is intentionally tolerant. A fully quoted value has only its
    // outer quotes removed; supported escape sequences are decoded and
    // unknown sequences such as \p or \T are preserved instead of throwing.
    if (trimmedValue.length >= 2 && trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) {
      output.value = unescapeText(trimmedValue.slice(1, -1));
    } else {
      output.value = unescapeText(rawValue);
    }
  }

  updateEscapeMeta();
}

function updateEscapeMeta() {
  $("#escape-input-meta").textContent = `${$("#escape-input").value.length.toLocaleString()} characters`;
  const outputLength = $("#escape-output").value.length;
  $("#escape-output-meta").textContent = outputLength ? `${outputLength.toLocaleString()} characters` : "Waiting for input";
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function printable(value) {
  if (value === undefined) return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function stablePrimitiveArray(value) {
  return [...value].map((item) => JSON.stringify(item)).sort();
}

function compareJson(left, right, options, path = "$", differences = []) {
  const mode = options.mode;
  const matchKey = options.matchKey;

  if (Array.isArray(left) && Array.isArray(right)) {
    const canMatchByKey =
      matchKey &&
      left.every((item) => isObject(item) && Object.hasOwn(item, matchKey)) &&
      right.every((item) => isObject(item) && Object.hasOwn(item, matchKey));

    if (canMatchByKey) {
      const leftMap = new Map(left.map((item) => [String(item[matchKey]), item]));
      const rightMap = new Map(right.map((item) => [String(item[matchKey]), item]));
      const ids = new Set([...leftMap.keys(), ...rightMap.keys()]);

      [...ids].sort().forEach((id) => {
        const childPath = `${path}[${matchKey}=${JSON.stringify(id)}]`;
        if (!rightMap.has(id)) {
          differences.push({ kind: "left-only", path: childPath, left: leftMap.get(id), right: undefined });
        } else if (!leftMap.has(id)) {
          differences.push({ kind: "right-only", path: childPath, left: undefined, right: rightMap.get(id) });
        } else {
          compareJson(leftMap.get(id), rightMap.get(id), options, childPath, differences);
        }
      });
      return differences;
    }

    if (
      options.ignoreArrayOrder &&
      left.every((item) => !isObject(item) && !Array.isArray(item)) &&
      right.every((item) => !isObject(item) && !Array.isArray(item))
    ) {
      const leftSorted = stablePrimitiveArray(left);
      const rightSorted = stablePrimitiveArray(right);
      if (JSON.stringify(leftSorted) !== JSON.stringify(rightSorted) && mode === "values") {
        differences.push({ kind: "changed", path, left, right });
      }
      return differences;
    }

    const max = Math.max(left.length, right.length);
    for (let index = 0; index < max; index += 1) {
      const childPath = `${path}[${index}]`;
      if (index >= right.length) {
        differences.push({ kind: "left-only", path: childPath, left: left[index], right: undefined });
      } else if (index >= left.length) {
        differences.push({ kind: "right-only", path: childPath, left: undefined, right: right[index] });
      } else {
        compareJson(left[index], right[index], options, childPath, differences);
      }
    }
    return differences;
  }

  if (isObject(left) && isObject(right)) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    [...keys].sort().forEach((key) => {
      const childPath = /^[A-Za-z_$][\w$]*$/.test(key)
        ? `${path}.${key}`
        : `${path}[${JSON.stringify(key)}]`;

      if (!Object.hasOwn(right, key)) {
        differences.push({ kind: "left-only", path: childPath, left: left[key], right: undefined });
      } else if (!Object.hasOwn(left, key)) {
        differences.push({ kind: "right-only", path: childPath, left: undefined, right: right[key] });
      } else {
        compareJson(left[key], right[key], options, childPath, differences);
      }
    });
    return differences;
  }

  if (mode === "keys") {
    const leftIsStructured = Array.isArray(left) || isObject(left);
    const rightIsStructured = Array.isArray(right) || isObject(right);
    if (leftIsStructured !== rightIsStructured || Array.isArray(left) !== Array.isArray(right)) {
      differences.push({ kind: "changed", path, left, right });
    }
    return differences;
  }

  const equal = Object.is(left, right);
  if (!equal) differences.push({ kind: "changed", path, left, right });
  return differences;
}

function renderDifferences(differences) {
  const counts = {
    changed: differences.filter((item) => item.kind === "changed").length,
    leftOnly: differences.filter((item) => item.kind === "left-only").length,
    rightOnly: differences.filter((item) => item.kind === "right-only").length
  };

  $("#changed-count").textContent = counts.changed;
  $("#left-only-count").textContent = counts.leftOnly;
  $("#right-only-count").textContent = counts.rightOnly;

  const list = $("#diff-list");

  if (!differences.length) {
    list.innerHTML = '<div class="empty-state">The JSON documents match for the selected comparison mode.</div>';
    $("#comparison-summary").textContent = "No differences found.";
    state.comparisonText = "No differences found.";
    return;
  }

  $("#comparison-summary").textContent = `${differences.length} difference${differences.length === 1 ? "" : "s"} found.`;

  list.innerHTML = differences.map((item) => `
    <article class="diff-item ${item.kind}">
      <span class="diff-kind">${item.kind.replace("-", " ")}</span>
      <code class="diff-path">${escapeHtml(item.path)}</code>
      <code class="diff-value left">${escapeHtml(printable(item.left))}</code>
      <code class="diff-value right">${escapeHtml(printable(item.right))}</code>
    </article>
  `).join("");

  state.comparisonText = differences.map((item) =>
    `${item.kind.toUpperCase()} ${item.path}\nLEFT: ${printable(item.left)}\nRIGHT: ${printable(item.right)}`
  ).join("\n\n");
}

function runComparison() {
  try {
    const left = parseJsonInput($("#left-json").value);
    const right = parseJsonInput($("#right-json").value);
    const differences = compareJson(left, right, {
      mode: $("#compare-mode").value,
      matchKey: $("#match-key").value.trim(),
      ignoreArrayOrder: $("#ignore-array-order").checked
    });
    renderDifferences(differences);
  } catch (error) {
    $("#comparison-summary").textContent = error.message;
    $("#diff-list").innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    showToast("Comparison failed: invalid JSON");
  }
}

function loadCompareSample(side) {
  const leftSample = {
    users: [
      { id: 1, name: "Ana", roles: ["admin", "user"] },
      { id: 2, name: "Marko", roles: ["user"] }
    ],
    active: true
  };

  const rightSample = {
    active: true,
    users: [
      { id: 2, name: "Marko", roles: ["user", "editor"] },
      { id: 1, name: "Ana Maria", roles: ["user", "admin"] },
      { id: 3, name: "Ivan", roles: ["user"] }
    ]
  };

  if (side === "left") $("#left-json").value = JSON.stringify(leftSample, null, 2);
  if (side === "right") $("#right-json").value = JSON.stringify(rightSample, null, 2);
  $("#match-key").value = "id";
  updateCompareMeta();
}

$$(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    $$(".tab").forEach((item) => item.classList.remove("active"));
    $$(".tool-panel").forEach((panel) => panel.classList.remove("active"));
    tab.classList.add("active");
    $(`#${tab.dataset.tab}-panel`).classList.add("active");
  });
});

$$("[data-format-action]").forEach((button) => {
  button.addEventListener("click", () => formatterAction(button.dataset.formatAction));
});

$$("[data-escape-action]").forEach((button) => {
  button.addEventListener("click", () => escapeAction(button.dataset.escapeAction));
});

$$("[data-compare-action]").forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.compareAction;
    if (action === "left-sample") loadCompareSample("left");
    if (action === "right-sample") loadCompareSample("right");
    if (action === "copy-result") {
      if (!state.comparisonText) return showToast("No comparison result to copy");
      navigator.clipboard.writeText(state.comparisonText)
        .then(() => showToast("Copied comparison result"))
        .catch(() => showToast("Copy failed"));
    }
  });
});

$("#compare-button").addEventListener("click", runComparison);
$("#format-input").addEventListener("input", updateFormatterMeta);
$("#escape-input").addEventListener("input", updateEscapeMeta);
$("#left-json").addEventListener("input", updateCompareMeta);
$("#right-json").addEventListener("input", updateCompareMeta);

function updateCompareMeta() {
  $("#left-meta").textContent = `${$("#left-json").value.length.toLocaleString()} characters`;
  $("#right-meta").textContent = `${$("#right-json").value.length.toLocaleString()} characters`;
}

document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    const activeTab = $(".tab.active").dataset.tab;
    if (activeTab === "formatter") formatterAction("format");
    if (activeTab === "compare") runComparison();
    if (activeTab === "escape") escapeAction("escape");
  }
});
