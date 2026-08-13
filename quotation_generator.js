/* MSTPL District Checkgate Quotation Generator - Vanilla JavaScript */

const STORAGE_KEY = "mstpl_district_checkgate_quotation_v2";
const UPDESCO_PERCENT = 10;
const GST_PERCENT = 18;

const heads = [
  "एएमसी",
  "अनिवार्य हार्डवेयर",
  "मैनपावर",
  "सर्वर स्पेस"
];

const defaultItems = [
  ["एएमसी", "वार्षिक रखरखाव अनुबंध", 1, 0, ""],
  ["अनिवार्य हार्डवेयर", "फ्लड लाइट", 1, 0, ""],
  ["अनिवार्य हार्डवेयर", "राउटर", 1, 0, ""],
  ["अनिवार्य हार्डवेयर", "पीओई स्विच", 1, 0, ""],
  ["अनिवार्य हार्डवेयर", "थर्ड आई कैमरा", 1, 0, ""],
  ["अनिवार्य हार्डवेयर", "2 केवीए स्मार्ट ऑनलाइन यूपीएस", 1, 0, ""],
  ["अनिवार्य हार्डवेयर", "एसएमएफ बैटरी बैंक - 160 एएच (12 वोल्ट x 4 नग बैटरी बैंक)", 1, 0, ""],
  ["अनिवार्य हार्डवेयर", "रीपेंटिंग एवं डेको पेंटिंग", 1, 0, ""],
  ["मैनपावर", "टीएसई लागत", 1, 0, ""],
  ["सर्वर स्पेस", "सर्वर स्पेस लागत", 1, 0, ""]
];

const itemNames = defaultItems.map((item) => item[1]);

const fieldIds = [
  "referenceNumber",
  "quotationNumber",
  "quotationDate",
  "tenderReferenceNumber",
  "tenderName",
  "districtName",
  "checkgateCount",
  "miningOffice",
  "division",
  "stateName",
  "quotationPeriod",
  "fromDate",
  "toDate",
  "warrantyFromDate",
  "warrantyToDate"
];

const headTotalMap = {
  "एएमसी": "amcTotal",
  "अनिवार्य हार्डवेयर": "hardwareTotal",
  "मैनपावर": "manpowerTotal",
  "सर्वर स्पेस": "serverTotal"
};

const summaryLabels = [
  ["amcTotal", "एएमसी कुल"],
  ["hardwareTotal", "अनिवार्य हार्डवेयर कुल"],
  ["manpowerTotal", "मैनपावर कुल"],
  ["serverTotal", "सर्वर स्पेस कुल"],
  ["baseTotal", "बेस राशि"],
  ["updescoTotal", "यूपीडेस्को 10%"],
  ["gstTotal", "जीएसटी 18%"],
  ["finalTotal", "अंतिम कार्यादेश राशि"]
];

let toastInstance;

document.addEventListener("DOMContentLoaded", () => {
  initializeDefaults();
  populateDatalist();
  renderRows(defaultItems.map(createItemFromTuple));
  bindEvents();
  renderAll();
});

/* Initialization */
function initializeDefaults() {
  const today = new Date();
  const nextYear = new Date(today);
  nextYear.setFullYear(today.getFullYear() + 1);
  nextYear.setDate(nextYear.getDate() - 1);

  document.getElementById("quotationDate").value = toInputDate(today);
  document.getElementById("fromDate").value = toInputDate(today);
  document.getElementById("toDate").value = toInputDate(nextYear);
  document.getElementById("warrantyFromDate").value = toInputDate(today);
  document.getElementById("warrantyToDate").value = toInputDate(nextYear);
  document.getElementById("quotationPeriod").value = "वार्षिक";
  document.getElementById("checkgateCount").value = "1";
  document.getElementById("stateName").value = "उत्तर प्रदेश";

  const toastEl = document.getElementById("appToast");
  if (window.bootstrap && toastEl) {
    toastInstance = new bootstrap.Toast(toastEl, { delay: 2400 });
  }
}

function populateDatalist() {
  const datalist = document.getElementById("itemNameOptions");
  datalist.innerHTML = itemNames.map((name) => `<option value="${escapeHtml(name)}"></option>`).join("");
}

function bindEvents() {
  document.getElementById("quotationForm").addEventListener("input", renderAll);
  document.getElementById("itemsBody").addEventListener("input", handleItemInput);
  document.getElementById("itemsBody").addEventListener("change", handleItemInput);

  document.getElementById("addItemBtn").addEventListener("click", addItem);
  document.getElementById("deleteItemBtn").addEventListener("click", deleteSelectedItems);
  document.getElementById("duplicateItemBtn").addEventListener("click", duplicateSelectedItem);
  document.getElementById("saveDraftBtn").addEventListener("click", saveDraft);
  document.getElementById("loadDraftBtn").addEventListener("click", loadDraft);
  document.getElementById("generateBtn").addEventListener("click", generateQuotation);
  document.getElementById("printBtn").addEventListener("click", printQuotation);
  document.getElementById("pdfBtn").addEventListener("click", exportPdf);
  document.getElementById("resetBtn").addEventListener("click", resetApp);
}

/* Row management */
function createItemFromTuple(tuple) {
  return {
    head: tuple[0],
    itemName: tuple[1],
    qtyPerCheckgate: Number(tuple[2]) || 0,
    rate: Number(tuple[3]) || 0,
    remarks: tuple[4] || ""
  };
}

function createBlankItem() {
  return {
    head: "अनिवार्य हार्डवेयर",
    itemName: "",
    qtyPerCheckgate: 1,
    rate: 0,
    remarks: ""
  };
}

function renderRows(items) {
  const body = document.getElementById("itemsBody");
  body.innerHTML = "";
  items.forEach((item) => body.appendChild(createRow(item)));
  updateSerialNumbers();
}

function createRow(item) {
  const row = document.createElement("tr");
  row.dataset.head = item.head || "अनिवार्य हार्डवेयर";
  row.innerHTML = `
    <td class="serial-cell">
      <input class="form-check-input row-check" type="checkbox" aria-label="Select item row">
      <span class="serial-number"></span>
    </td>
    <td><input class="form-control form-control-sm item-name-input item-name" type="text" list="itemNameOptions"></td>
    <td><input class="form-control form-control-sm item-qty-per-checkgate" type="number" min="0" step="0.01"></td>
    <td><input class="form-control form-control-sm item-rate" type="number" min="0" step="0.01"></td>
    <td><input class="form-control form-control-sm readonly-money item-total-qty" type="text" readonly></td>
    <td><input class="form-control form-control-sm readonly-money item-base" type="text" readonly></td>
    <td><input class="form-control form-control-sm readonly-money item-updesco" type="text" readonly></td>
    <td><input class="form-control form-control-sm readonly-money item-gst" type="text" readonly></td>
    <td><input class="form-control form-control-sm readonly-money item-final" type="text" readonly></td>
    <td><input class="form-control form-control-sm remarks-input item-remarks" type="text"></td>
  `;

  row.querySelector(".item-name").value = item.itemName || "";
  row.querySelector(".item-qty-per-checkgate").value = normalizeNumberInput(item.qtyPerCheckgate);
  row.querySelector(".item-rate").value = normalizeNumberInput(item.rate);
  row.querySelector(".item-remarks").value = item.remarks || "";
  updateRowCalculation(row);
  return row;
}

function addItem() {
  document.getElementById("itemsBody").appendChild(createRow(createBlankItem()));
  updateSerialNumbers();
  renderAll();
  showToast("नई मद जोड़ दी गई।");
}

function deleteSelectedItems() {
  const rows = getRows();
  const selectedRows = rows.filter((row) => row.querySelector(".row-check").checked);
  const rowsToDelete = selectedRows.length ? selectedRows : rows.slice(-1);

  if (rows.length <= rowsToDelete.length) {
    showToast("कम से कम एक मद आवश्यक है।");
    return;
  }

  rowsToDelete.forEach((row) => row.remove());
  updateSerialNumbers();
  renderAll();
  showToast("चयनित मद हटा दी गई।");
}

function duplicateSelectedItem() {
  const rows = getRows();
  const selectedRow = rows.find((row) => row.querySelector(".row-check").checked) || rows[rows.length - 1];
  if (!selectedRow) return;

  document.getElementById("itemsBody").appendChild(createRow(readRow(selectedRow)));
  updateSerialNumbers();
  renderAll();
  showToast("मद कॉपी हो गई।");
}

function updateSerialNumbers() {
  getRows().forEach((row, index) => {
    row.querySelector(".serial-number").textContent = index + 1;
  });
}

function handleItemInput(event) {
  const row = event.target.closest("tr");
  if (!row) return;
  updateRowCalculation(row);
  renderAll();
}

function updateRowCalculation(row) {
  const item = readRow(row);
  const calc = calculateItem(item, getCheckgateCount());

  row.querySelector(".item-total-qty").value = formatPlainNumber(calc.totalQty);
  row.querySelector(".item-base").value = formatCurrency(calc.baseAmount);
  row.querySelector(".item-updesco").value = formatCurrency(calc.updescoAmount);
  row.querySelector(".item-gst").value = formatCurrency(calc.gstAmount);
  row.querySelector(".item-final").value = formatCurrency(calc.finalAmount);
}

/* Data collection */
function getRows() {
  return Array.from(document.querySelectorAll("#itemsBody tr"));
}

function getCheckgateCount() {
  return Math.max(0, toNumber(document.getElementById("checkgateCount").value));
}

function readRow(row) {
  return {
    head: row.dataset.head || "अनिवार्य हार्डवेयर",
    itemName: row.querySelector(".item-name").value.trim(),
    qtyPerCheckgate: toNumber(row.querySelector(".item-qty-per-checkgate").value),
    rate: toNumber(row.querySelector(".item-rate").value),
    remarks: row.querySelector(".item-remarks").value.trim()
  };
}

function collectItems() {
  return getRows().map(readRow);
}

function collectFormData() {
  return fieldIds.reduce((data, id) => {
    data[id] = document.getElementById(id).value.trim();
    return data;
  }, {});
}

function collectQuotationData() {
  return {
    form: collectFormData(),
    items: collectItems()
  };
}

/* Calculations */
function calculateItem(item, checkgateCount) {
  const totalQty = item.qtyPerCheckgate * checkgateCount;
  const baseAmount = totalQty * item.rate;
  const updescoAmount = baseAmount * (UPDESCO_PERCENT / 100);
  const taxableAmount = baseAmount + updescoAmount;
  const gstAmount = taxableAmount * (GST_PERCENT / 100);
  const finalAmount = taxableAmount + gstAmount;

  return {
    checkgateCount,
    totalQty,
    baseAmount,
    updescoAmount,
    taxableAmount,
    gstAmount,
    finalAmount
  };
}

function calculateTotals(items, checkgateCount) {
  const totals = {
    amcTotal: 0,
    hardwareTotal: 0,
    manpowerTotal: 0,
    serverTotal: 0,
    baseTotal: 0,
    updescoTotal: 0,
    gstTotal: 0,
    finalTotal: 0
  };

  items.forEach((item) => {
    const calc = calculateItem(item, checkgateCount);
    const bucket = headTotalMap[item.head];

    if (bucket) totals[bucket] += calc.finalAmount;
    totals.baseTotal += calc.baseAmount;
    totals.updescoTotal += calc.updescoAmount;
    totals.gstTotal += calc.gstAmount;
    totals.finalTotal += calc.finalAmount;
  });

  return totals;
}

/* Rendering */
function renderAll() {
  getRows().forEach(updateRowCalculation);
  const data = collectQuotationData();
  const totals = calculateTotals(data.items, getCheckgateCount());
  renderLiveSummary(totals);
  renderPreview(data, totals);
}

function renderLiveSummary(totals) {
  const summary = document.getElementById("liveSummary");
  summary.innerHTML = summaryLabels
    .map(([key, label]) => {
      const primaryClass = key === "finalTotal" ? " primary" : "";
      return `
        <div class="col-6 col-md-4 col-xxl-3">
          <div class="summary-tile${primaryClass}">
            <span>${label}</span>
            <strong>${formatCurrency(totals[key])}</strong>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderPreview(data, totals) {
  const form = data.form;
  const previewValues = {
    ...form,
    quotationDateFormatted: formatDate(form.quotationDate),
    fromDateFormatted: formatDate(form.fromDate),
    toDateFormatted: formatDate(form.toDate),
    warrantyFromDateFormatted: formatDate(form.warrantyFromDate),
    warrantyToDateFormatted: formatDate(form.warrantyToDate),
    footerReferenceNumber: form.referenceNumber || "-"
  };

  document.querySelectorAll("[data-preview]").forEach((node) => {
    const key = node.dataset.preview;
    node.textContent = previewValues[key] || "-";
  });

  renderQuotationItems(data.items, getCheckgateCount());
  document.getElementById("printAmcTotal").textContent = formatCurrency(totals.amcTotal);
  document.getElementById("printHardwareTotal").textContent = formatCurrency(totals.hardwareTotal);
  document.getElementById("printManpowerTotal").textContent = formatCurrency(totals.manpowerTotal);
  document.getElementById("printServerTotal").textContent = formatCurrency(totals.serverTotal);
  document.getElementById("printGrandTotal").textContent = formatCurrency(totals.baseTotal);
  document.getElementById("printUpdescoTotal").textContent = formatCurrency(totals.updescoTotal);
  document.getElementById("printGstTotal").textContent = formatCurrency(totals.gstTotal);
  document.getElementById("printGrandWithGst").textContent = formatCurrency(totals.finalTotal);
  document.getElementById("amountWords").textContent = numberToIndianWords(Math.round(totals.finalTotal));
}

function renderQuotationItems(items, checkgateCount) {
  const body = document.getElementById("quotationItemsBody");
  const orderedHeads = ["एएमसी", "अनिवार्य हार्डवेयर", "मैनपावर", "सर्वर स्पेस"];
  let serial = 0;

  body.innerHTML = orderedHeads
    .map((head) => {
      const headItems = items.filter((item) => item.head === head);
      if (!headItems.length) return "";

      const rows = headItems.map((item) => {
        serial += 1;
      const calc = calculateItem(item, checkgateCount);
      return `
        <tr>
          <td class="text-center">${serial}</td>
          <td>${escapeHtml(item.itemName || "-")}</td>
          <td class="text-end">${formatPlainNumber(item.qtyPerCheckgate)}</td>
          <td class="text-end">${formatPlainNumber(calc.totalQty)}</td>
          <td class="text-money">${formatCurrency(item.rate)}</td>
          <td class="text-money">${formatCurrency(calc.baseAmount)}</td>
          <td class="text-money">${formatCurrency(calc.updescoAmount)}</td>
          <td class="text-money">${formatCurrency(calc.gstAmount)}</td>
          <td class="text-money"><strong>${formatCurrency(calc.finalAmount)}</strong></td>
        </tr>
      `;
      }).join("");

      return `
        <tr class="head-group-row">
          <td colspan="9">${escapeHtml(head)}</td>
        </tr>
        ${rows}
      `;
    })
    .join("");
}

/* Actions */
function generateQuotation() {
  renderAll();
  document.getElementById("generatedDateTime").textContent = formatDateTime(new Date());
  document.getElementById("quotationPrintArea").scrollIntoView({ behavior: "smooth", block: "start" });
  showToast("जिला मूल्य प्रस्ताव तैयार हो गया।");
}

function printQuotation() {
  generateQuotation();
  setTimeout(() => window.print(), 150);
}

function exportPdf() {
  generateQuotation();
  setTimeout(() => window.print(), 150);
}

function saveDraft() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(collectQuotationData()));
  showToast("ड्राफ्ट इस ब्राउज़र में सेव हो गया।");
}

function loadDraft() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    showToast("कोई सेव ड्राफ्ट नहीं मिला।");
    return;
  }

  try {
    const data = JSON.parse(raw);
    fieldIds.forEach((id) => {
      if (Object.prototype.hasOwnProperty.call(data.form || {}, id)) {
        document.getElementById(id).value = data.form[id];
      }
    });
    const items = (data.items || [createBlankItem()]).map((item) => ({ ...createBlankItem(), ...item }));
    renderRows(items);
    renderAll();
    showToast("ड्राफ्ट लोड हो गया।");
  } catch (error) {
    showToast("सेव ड्राफ्ट लोड नहीं हो सका।");
  }
}

function resetApp() {
  if (!window.confirm("क्या आप फॉर्म और सभी मदें रीसेट करना चाहते हैं?")) return;

  fieldIds.forEach((id) => {
    document.getElementById(id).value = "";
  });
  initializeDefaults();
  renderRows(defaultItems.map(createItemFromTuple));
  document.getElementById("generatedDateTime").textContent = "-";
  renderAll();
  showToast("मूल्य प्रस्ताव रीसेट हो गया।");
}

/* Formatting helpers */
function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeNumberInput(value) {
  const number = toNumber(value);
  return Number.isInteger(number) ? String(number) : String(number.toFixed(2));
}

function toInputDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("hi-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function formatDateTime(date) {
  return date.toLocaleString("hi-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function formatCurrency(value) {
  return `रु. ${toNumber(value).toLocaleString("hi-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function formatPlainNumber(value) {
  return toNumber(value).toLocaleString("hi-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  const messageEl = document.getElementById("toastMessage");
  if (messageEl) messageEl.textContent = message;
  if (toastInstance) {
    toastInstance.show();
  }
}

/* भारतीय मुद्रा राशि शब्दों में */
function numberToIndianWords(amount) {
  if (!amount) return "रुपये शून्य मात्र";

  const hindiNumbers = [
    "",
    "एक",
    "दो",
    "तीन",
    "चार",
    "पांच",
    "छह",
    "सात",
    "आठ",
    "नौ",
    "दस",
    "ग्यारह",
    "बारह",
    "तेरह",
    "चौदह",
    "पंद्रह",
    "सोलह",
    "सत्रह",
    "अठारह",
    "उन्नीस",
    "बीस",
    "इक्कीस",
    "बाईस",
    "तेईस",
    "चौबीस",
    "पच्चीस",
    "छब्बीस",
    "सत्ताईस",
    "अट्ठाईस",
    "उनतीस",
    "तीस",
    "इकतीस",
    "बत्तीस",
    "तैंतीस",
    "चौंतीस",
    "पैंतीस",
    "छत्तीस",
    "सैंतीस",
    "अड़तीस",
    "उनतालीस",
    "चालीस",
    "इकतालीस",
    "बयालीस",
    "तैंतालीस",
    "चवालीस",
    "पैंतालीस",
    "छियालीस",
    "सैंतालीस",
    "अड़तालीस",
    "उनचास",
    "पचास",
    "इक्यावन",
    "बावन",
    "तिरेपन",
    "चौवन",
    "पचपन",
    "छप्पन",
    "सत्तावन",
    "अट्ठावन",
    "उनसठ",
    "साठ",
    "इकसठ",
    "बासठ",
    "तिरसठ",
    "चौंसठ",
    "पैंसठ",
    "छियासठ",
    "सड़सठ",
    "अड़सठ",
    "उनहत्तर",
    "सत्तर",
    "इकहत्तर",
    "बहत्तर",
    "तिहत्तर",
    "चौहत्तर",
    "पचहत्तर",
    "छिहत्तर",
    "सतहत्तर",
    "अठहत्तर",
    "उनासी",
    "अस्सी",
    "इक्यासी",
    "बयासी",
    "तिरासी",
    "चौरासी",
    "पचासी",
    "छियासी",
    "सत्तासी",
    "अट्ठासी",
    "नवासी",
    "नब्बे",
    "इक्यानवे",
    "बानवे",
    "तिरानवे",
    "चौरानवे",
    "पचानवे",
    "छियानवे",
    "सत्तानवे",
    "अट्ठानवे",
    "निन्यानवे"
  ];

  function convertHundreds(number) {
    let words = "";
    if (number > 99) {
      words += `${hindiNumbers[Math.floor(number / 100)]} सौ `;
      number %= 100;
    }
    if (number > 0) {
      words += `${hindiNumbers[number]} `;
    }
    return words.trim();
  }

  const parts = [];
  const crore = Math.floor(amount / 10000000);
  amount %= 10000000;
  const lakh = Math.floor(amount / 100000);
  amount %= 100000;
  const thousand = Math.floor(amount / 1000);
  amount %= 1000;

  if (crore) parts.push(`${convertHundreds(crore)} करोड़`);
  if (lakh) parts.push(`${convertHundreds(lakh)} लाख`);
  if (thousand) parts.push(`${convertHundreds(thousand)} हजार`);
  if (amount) parts.push(convertHundreds(amount));

  return `रुपये ${parts.join(" ")} मात्र`;
}
