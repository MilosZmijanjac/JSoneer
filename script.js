const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const HISTORY_STORAGE_KEY = "jsoneer.history.v1";
const HISTORY_LIMIT = 20;

const state = {
  formattedText: "",
  comparisonText: "",
  toastTimer: null,
  suppressHistory: false
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
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function syntaxHighlight(json) {
  const escaped = escapeHtml(json);

  return escaped.replace(
    /(&quot;(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\])*?&quot;\s*:|&quot;(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\])*?&quot;|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let className = "json-number";

      if (match.startsWith("&quot;")) {
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

function activateTab(tabName) {
  $$(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === tabName));
  $$(".tool-panel").forEach((panel) => panel.classList.toggle("active", panel.id === `${tabName}-panel`));
}

function setFormatStatus(message, status = "idle", value = null, output = "") {
  $("#format-status").dataset.state = status;
  $("#format-status-text").textContent = message;
  $("#format-document-type").textContent = value === null ? "No document" : jsonType(value);
  $("#format-size").textContent = byteSize(output);
}

function renderFormatOutput(text, value, message, historyAction) {
  state.formattedText = text;
  $("#format-output").innerHTML = syntaxHighlight(text);
  $("#format-output-meta").textContent = `${text.split("\n").length} lines`;
  setFormatStatus(message, "success", value, text);

  addHistory({
    tool: "formatter",
    action: historyAction,
    input: $("#format-input").value,
    output: text
  });
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
      features: ["format", "escape", "compare", "history"],
      config: { theme: "dark", privacy: "local", historyLimit: 20 }
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
      renderFormatOutput(JSON.stringify(value, null, 2), value, "Valid JSON", "Validate");
      return;
    }

    if (action === "minify") {
      renderFormatOutput(JSON.stringify(value), value, "JSON minified", "Minify");
      return;
    }

    if (action === "sort") {
      const sorted = sortDeep(value);
      renderFormatOutput(JSON.stringify(sorted, null, 2), sorted, "Keys sorted", "Sort keys");
      return;
    }

    renderFormatOutput(JSON.stringify(value, null, 2), value, "JSON formatted", "Format");
  } catch (error) {
    $("#format-output").innerHTML = `<span class="error-text">${escapeHtml(error.message)}</span>`;
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
      case "b": result += "\b"; index += 1; break;
      case "f": result += "\f"; index += 1; break;
      case "n": result += "\n"; index += 1; break;
      case "r": result += "\r"; index += 1; break;
      case "t": result += "\t"; index += 1; break;
      case '"': result += '"'; index += 1; break;
      case "\\": result += "\\"; index += 1; break;
      case "/": result += "/"; index += 1; break;
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
        result += `\\${escaped}`;
        index += 1;
        break;
    }
  }

  return result;
}

function decodeEscapedJsonLayer(text) {
  let value = text.trim();

  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1);
  }

  let result = "";

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if (character !== "\\" || index === value.length - 1) {
      result += character;
      continue;
    }

    const next = value[index + 1];

    if (next === '"') {
      result += '"';
      index += 1;
    } else if (next === "\\") {
      result += "\\";
      index += 1;
    } else if (next === "/") {
      result += "/";
      index += 1;
    } else {
      result += `\\${next}`;
      index += 1;
    }
  }

  return result;
}

function repairJsonText(text, aggressive = false) {
  let result = "";
  let insideString = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (!insideString) {
      result += character;
      if (character === '"') insideString = true;
      continue;
    }

    if (character === '"') {
      result += character;
      insideString = false;
      continue;
    }

    const code = character.charCodeAt(0);

    if (code <= 0x1f) {
      const replacements = {
        8: "\\b",
        9: "\\t",
        10: "\\n",
        12: "\\f",
        13: "\\r"
      };
      result += replacements[code] ?? `\\u${code.toString(16).padStart(4, "0")}`;
      continue;
    }

    if (character !== "\\") {
      result += character;
      continue;
    }

    const next = text[index + 1];

    if (next === undefined) {
      result += "\\\\";
      continue;
    }

    if (next === '"' || next === "\\" || next === "/") {
      result += `\\${next}`;
      index += 1;
      continue;
    }

    if (next === "u") {
      const hex = text.slice(index + 2, index + 6);
      if (/^[0-9a-fA-F]{4}$/.test(hex)) {
        result += `\\u${hex}`;
        index += 5;
      } else {
        result += "\\\\u";
        index += 1;
      }
      continue;
    }

    const standardEscape = ["b", "f", "n", "r", "t"].includes(next);

    if (standardEscape && !aggressive) {
      result += `\\${next}`;
      index += 1;
      continue;
    }

    result += `\\\\${next}`;
    index += 1;
  }

  return result;
}

function parseJsonWithRepairs(text) {
  const variants = [text, repairJsonText(text, false), repairJsonText(text, true)];
  let lastError = null;

  for (const variant of [...new Set(variants)]) {
    try {
      return JSON.parse(variant);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("Invalid JSON.");
}

function tryParseJsonDocument(candidate) {
  let parsed = parseJsonWithRepairs(candidate);

  for (let depth = 0; depth < 4 && typeof parsed === "string"; depth += 1) {
    const nested = parsed.trim();
    if (!(nested.startsWith("{") || nested.startsWith("["))) break;
    parsed = parseJsonWithRepairs(nested);
  }

  if (typeof parsed === "string") {
    throw new Error("The value is text, not a JSON object or array.");
  }

  return parsed;
}

function parseQuickFormatJson(text) {
  const rawValue = text.trim();
  if (!rawValue) throw new Error("There is no JSON to format.");

  const candidates = new Set([rawValue]);
  let decoded = rawValue;

  for (let depth = 0; depth < 4; depth += 1) {
    decoded = decodeEscapedJsonLayer(decoded);
    candidates.add(decoded);
  }

  let lastError = null;

  for (const candidate of candidates) {
    if (!candidate.trim()) continue;

    try {
      return tryParseJsonDocument(candidate);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("Invalid JSON.");
}

function escapeAction(action) {
  const input = $("#escape-input");
  const output = $("#escape-output");
  let shouldSave = false;
  let historyLabel = "";

  if (action === "clear") {
    input.value = "";
    output.value = "";
  } else if (action === "sample") {
    input.value = 'First line\nSecond line\tTabbed\nQuote: "Hello"\nPath: C:\\Tools\\json';
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
      shouldSave = true;
      historyLabel = "Quick format";
      showToast("JSON formatted in output");
    } catch (error) {
      output.value = `Format error: ${error.message}`;
      showToast("Could not format this value");
    }
  } else if (action === "escape") {
    output.value = escapeText(input.value);
    shouldSave = true;
    historyLabel = "Escape";
  } else if (action === "stringify") {
    output.value = JSON.stringify(input.value);
    shouldSave = true;
    historyLabel = "JSON string literal";
  } else if (action === "unescape") {
    const rawValue = input.value;
    const trimmedValue = rawValue.trim();

    output.value = trimmedValue.length >= 2 && trimmedValue.startsWith('"') && trimmedValue.endsWith('"')
      ? unescapeText(trimmedValue.slice(1, -1))
      : unescapeText(rawValue);

    shouldSave = true;
    historyLabel = "Unescape";
  }

  updateEscapeMeta();

  if (shouldSave && output.value && !output.value.startsWith("Format error:")) {
    addHistory({
      tool: "escape",
      action: historyLabel,
      input: input.value,
      output: output.value
    });
  }
}

function updateEscapeMeta() {
  $("#escape-input-meta").textContent = `${$("#escape-input").value.length.toLocaleString()} characters`;
  const outputLength = $("#escape-output").value.length;
  $("#escape-output-meta").textContent = outputLength
    ? `${outputLength.toLocaleString()} characters`
    : "Waiting for input";
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
  const { mode, matchKey, ignoreArrayOrder } = options;

  if (Array.isArray(left) && Array.isArray(right)) {
    const canMatchByKey = matchKey
      && left.every((item) => isObject(item) && Object.hasOwn(item, matchKey))
      && right.every((item) => isObject(item) && Object.hasOwn(item, matchKey));

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
      ignoreArrayOrder
      && left.every((item) => !isObject(item) && !Array.isArray(item))
      && right.every((item) => !isObject(item) && !Array.isArray(item))
    ) {
      const leftSorted = stablePrimitiveArray(left);
      const rightSorted = stablePrimitiveArray(right);

      if (JSON.stringify(leftSorted) !== JSON.stringify(rightSorted) && mode === "values") {
        differences.push({ kind: "changed", path, left, right });
      }

      return differences;
    }

    const maximumLength = Math.max(left.length, right.length);

    for (let index = 0; index < maximumLength; index += 1) {
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
    const leftStructured = Array.isArray(left) || isObject(left);
    const rightStructured = Array.isArray(right) || isObject(right);

    if (leftStructured !== rightStructured || Array.isArray(left) !== Array.isArray(right)) {
      differences.push({ kind: "changed", path, left, right });
    }

    return differences;
  }

  if (!Object.is(left, right)) {
    differences.push({ kind: "changed", path, left, right });
  }

  return differences;
}

function renderDifferences(differences) {
  const changed = differences.filter((item) => item.kind === "changed").length;
  const leftOnly = differences.filter((item) => item.kind === "left-only").length;
  const rightOnly = differences.filter((item) => item.kind === "right-only").length;

  $("#changed-count").textContent = changed;
  $("#left-only-count").textContent = leftOnly;
  $("#right-only-count").textContent = rightOnly;

  const list = $("#diff-list");

  if (!differences.length) {
    list.innerHTML = '<div class="empty-state success-state">The JSON documents match for the selected comparison mode.</div>';
    $("#comparison-summary").textContent = "No differences found.";
    state.comparisonText = "No differences found.";
    return;
  }

  $("#comparison-summary").textContent = `${differences.length} difference${differences.length === 1 ? "" : "s"} found.`;

  list.innerHTML = differences.map((item) => `
    <article class="diff-item" data-kind="${escapeHtml(item.kind)}">
      <div class="diff-item-heading">
        <span class="diff-kind">${escapeHtml(item.kind.replace("-", " "))}</span>
        <code class="diff-path" title="${escapeHtml(item.path)}">${escapeHtml(item.path)}</code>
      </div>
      <div class="diff-values">
        <div class="diff-value">
          <span>Left</span>
          <pre>${escapeHtml(printable(item.left))}</pre>
        </div>
        <div class="diff-value">
          <span>Right</span>
          <pre>${escapeHtml(printable(item.right))}</pre>
        </div>
      </div>
    </article>
  `).join("");

  state.comparisonText = differences.map((item) => (
    `${item.kind.toUpperCase()} ${item.path}\nLEFT: ${printable(item.left)}\nRIGHT: ${printable(item.right)}`
  )).join("\n\n");
}

function runComparison(saveHistory = true) {
  try {
    const leftText = $("#left-json").value;
    const rightText = $("#right-json").value;
    const left = parseJsonInput(leftText);
    const right = parseJsonInput(rightText);
    const options = {
      mode: $("#compare-mode").value,
      matchKey: $("#match-key").value.trim(),
      ignoreArrayOrder: $("#ignore-array-order").checked
    };

    const differences = compareJson(left, right, options);
    renderDifferences(differences);

    if (saveHistory) {
      addHistory({
        tool: "compare",
        action: options.mode === "keys" ? "Keys only" : "Keys and values",
        input: leftText,
        secondaryInput: rightText,
        output: state.comparisonText,
        options
      });
    }
  } catch (error) {
    $("#comparison-summary").textContent = error.message;
    $("#diff-list").innerHTML = `<div class="empty-state error-text">${escapeHtml(error.message)}</div>`;
    state.comparisonText = "";
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

function updateCompareMeta() {
  $("#left-meta").textContent = `${$("#left-json").value.length.toLocaleString()} characters`;
  $("#right-meta").textContent = `${$("#right-json").value.length.toLocaleString()} characters`;
}

function readHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.slice(0, HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
}

function saveHistoryItems(items) {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(items.slice(0, HISTORY_LIMIT)));
    return true;
  } catch {
    return false;
  }
}

function createHistoryId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function addHistory(entry) {
  if (state.suppressHistory || !entry.output) return;

  const existingItems = readHistory();
  const newItem = {
    id: createHistoryId(),
    createdAt: new Date().toISOString(),
    ...entry
  };

  const candidate = [newItem, ...existingItems].slice(0, HISTORY_LIMIT);
  let saved = false;

  while (candidate.length) {
    if (saveHistoryItems(candidate)) {
      saved = candidate[0]?.id === newItem.id;
      break;
    }
    candidate.pop();
  }

  if (!saved) {
    saveHistoryItems(existingItems);
    showToast("This result is too large to save in browser history");
  }

  renderHistory();
}

function historyToolLabel(tool) {
  if (tool === "formatter") return "Formatter";
  if (tool === "escape") return "Escape / Unescape";
  if (tool === "compare") return "Compare";
  return tool;
}

function formatHistoryDate(isoDate) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function historyPreview(text, maximumLength = 300) {
  const compact = String(text).replace(/\s+/g, " ").trim();
  return compact.length > maximumLength ? `${compact.slice(0, maximumLength)}…` : compact;
}

function renderHistory() {
  const list = $("#history-list");
  const count = $("#history-count");
  const tabCount = $("#history-tab-count");
  const items = readHistory();

  count.textContent = `${items.length} of ${HISTORY_LIMIT} saved locally`;
  tabCount.textContent = items.length;

  if (!items.length) {
    list.innerHTML = '<div class="empty-state">No history yet. Successful results will appear here.</div>';
    return;
  }

  list.innerHTML = items.map((item) => `
    <article class="history-item">
      <div class="history-item-heading">
        <div>
          <span class="history-tool">${escapeHtml(historyToolLabel(item.tool))}</span>
          <strong>${escapeHtml(item.action)}</strong>
        </div>
        <time datetime="${escapeHtml(item.createdAt)}">${escapeHtml(formatHistoryDate(item.createdAt))}</time>
      </div>
      <pre class="history-preview">${escapeHtml(historyPreview(item.output))}</pre>
      <div class="history-actions">
        <button class="mini-action" type="button" data-history-action="restore" data-history-id="${escapeHtml(item.id)}">Restore</button>
        <button class="mini-action" type="button" data-history-action="copy" data-history-id="${escapeHtml(item.id)}">Copy output</button>
        <button class="mini-action danger" type="button" data-history-action="delete" data-history-id="${escapeHtml(item.id)}">Delete</button>
      </div>
    </article>
  `).join("");
}

function restoreFormatterHistory(item) {
  $("#format-input").value = item.input ?? "";
  state.formattedText = item.output ?? "";
  $("#format-output").innerHTML = syntaxHighlight(state.formattedText);
  $("#format-output-meta").textContent = `${state.formattedText.split("\n").length} lines`;
  updateFormatterMeta();

  let parsedValue = null;
  try {
    parsedValue = JSON.parse(state.formattedText);
  } catch {
    // The saved output can still be restored even if it is no longer valid JSON.
  }

  setFormatStatus(`Restored: ${item.action}`, "success", parsedValue, state.formattedText);
}

function restoreEscapeHistory(item) {
  $("#escape-input").value = item.input ?? "";
  $("#escape-output").value = item.output ?? "";
  updateEscapeMeta();
}

function restoreCompareHistory(item) {
  $("#left-json").value = item.input ?? "";
  $("#right-json").value = item.secondaryInput ?? "";
  $("#compare-mode").value = item.options?.mode ?? "values";
  $("#match-key").value = item.options?.matchKey ?? "";
  $("#ignore-array-order").checked = Boolean(item.options?.ignoreArrayOrder);
  updateCompareMeta();
  runComparison(false);
}

function restoreHistoryItem(item) {
  state.suppressHistory = true;

  try {
    if (item.tool === "formatter") restoreFormatterHistory(item);
    if (item.tool === "escape") restoreEscapeHistory(item);
    if (item.tool === "compare") restoreCompareHistory(item);
    activateTab(item.tool);
    showToast("History result restored");
  } catch (error) {
    showToast(`Could not restore result: ${error.message}`);
  } finally {
    state.suppressHistory = false;
  }
}

$$(".tab").forEach((tab) => {
  tab.addEventListener("click", () => activateTab(tab.dataset.tab));
});

$$('[data-format-action]').forEach((button) => {
  button.addEventListener("click", () => formatterAction(button.dataset.formatAction));
});

$$('[data-escape-action]').forEach((button) => {
  button.addEventListener("click", () => escapeAction(button.dataset.escapeAction));
});

$$('[data-compare-action]').forEach((button) => {
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

$("#compare-button").addEventListener("click", () => runComparison(true));
$("#format-input").addEventListener("input", updateFormatterMeta);
$("#escape-input").addEventListener("input", updateEscapeMeta);
$("#left-json").addEventListener("input", updateCompareMeta);
$("#right-json").addEventListener("input", updateCompareMeta);

$("#history-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-history-action]");
  if (!button) return;

  const items = readHistory();
  const item = items.find((historyItem) => historyItem.id === button.dataset.historyId);
  if (!item) return;

  const action = button.dataset.historyAction;

  if (action === "restore") {
    restoreHistoryItem(item);
    return;
  }

  if (action === "copy") {
    navigator.clipboard.writeText(item.output)
      .then(() => showToast("Copied history output"))
      .catch(() => showToast("Copy failed"));
    return;
  }

  if (action === "delete") {
    saveHistoryItems(items.filter((historyItem) => historyItem.id !== item.id));
    renderHistory();
    showToast("History item deleted");
  }
});

$("#clear-history").addEventListener("click", () => {
  try {
    localStorage.removeItem(HISTORY_STORAGE_KEY);
  } catch {
    // Browser storage may be disabled.
  }

  renderHistory();
  showToast("History cleared");
});

document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    const activeTab = $(".tab.active")?.dataset.tab;

    if (activeTab === "formatter") formatterAction("format");
    if (activeTab === "compare") runComparison(true);
    if (activeTab === "escape") escapeAction("escape");
  }
});

renderHistory();
