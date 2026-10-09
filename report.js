"use strict";

const missingValue = "Da verificare";
const labels = { verified: "Verificato", pending: "Da verificare", partial: "Dati parziali", unavailable: "Non disponibile" };
const number = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2, useGrouping: "always" });

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatMetric(metric) {
  const value = metric.value;
  if (typeof value !== "number" || !Number.isFinite(value)) return missingValue;
  if (metric.format === "eur") return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(value);
  if (metric.format === "percent") return number.format(value) + "%";
  if (metric.format === "integer") return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0, useGrouping: "always" }).format(value);
  return number.format(value);
}

function metrics(items = []) {
  const list = element("dl", "metrics");
  for (const metric of items) {
    const pair = element("div");
    const value = formatMetric(metric);
    pair.append(element("dt", "", metric.label), element("dd", value === missingValue ? "unknown" : "", value));
    list.append(pair);
  }
  return list;
}

function provenance(target, data) {
  if (data.note) target.append(element("p", "note", data.note));
  if (data.missing?.length) {
    const list = element("ul", "missing");
    for (const item of data.missing) list.append(element("li", "", item));
    target.append(list);
  }
  // Local evidence references are integration metadata, never public links.
  const sources = (data.sources || []).map(source => source.label).filter(Boolean);
  target.append(element("p", "source", sources.length ? "Fonte: " + sources.join(" · ") : "Fonte: da integrare. Nessun valore stimato."));
  const links = element("div", "source-links");
  for (const source of data.sources || []) {
    // Only existing public report paths are accepted, never private IDs or arbitrary URLs.
    if (!/^(Seller\/adv_seller_|vendor\/report_adv\/adv_vendor_)2026_0[1-3]\.html$/.test(source.href || "")) continue;
    const link = element("a", "", source.label);
    link.href = source.href;
    links.append(link);
  }
  if (links.childElementCount) target.append(links);
}

function badge(status) {
  return element("span", "badge" + (status !== "verified" ? " pending" : ""), labels[status] || missingValue);
}

function renderMonthly(data) {
  const target = document.getElementById("monthly-channels");
  target.replaceChildren();
  for (const key of ["seller", "vendor", "ebay"]) {
    const channel = data.monthly[key];
    const card = element("article", "panel");
    const heading = element("div", "panel-heading");
    heading.append(element("h3", "", channel.title), badge(channel.status));
    card.append(heading, metrics(channel.metrics));
    provenance(card, channel);
    target.append(card);
  }
}

function renderAdv(data) {
  const target = document.getElementById("adv-data");
  target.replaceChildren(metrics(data.metrics));
  if (data.coverage?.length) target.append(element("p", "note", "Copertura documentata: " + data.coverage.join(", ")));
  const headingBadge = target.parentElement.querySelector(".badge");
  headingBadge.textContent = data.status === "verified" ? "Copertura verificata" : "Copertura parziale";
  headingBadge.classList.toggle("pending", data.status !== "verified");
  if (data.historical_monthly?.length) {
    const history = element("div", "historical-grid");
    for (const role of ["seller", "vendor"]) {
      const section = element("section", "historical-card");
      section.append(element("h4", "", "Storico " + (role === "seller" ? "Seller" : "Vendor") + " / gennaio-marzo 2026"));
      section.append(metrics([{ label: "Spesa Q1 / solo storico pubblicato", value: data.q1?.[role + "Cost"], format: "eur" }]));
      const table = element("table", "historical-table");
      const caption = element("caption", "", "Dettaglio mensile pubblicato / " + role);
      const head = element("thead");
      const headings = element("tr");
      for (const text of ["Mese", "Spesa", "Vendite attribuite"]) {
        const cell = element("th", "", text);
        cell.scope = "col";
        headings.append(cell);
      }
      head.append(headings);
      const body = element("tbody");
      for (const month of data.historical_monthly.filter(item => item.role === role)) {
        const row = element("tr");
        const name = element("th", "", month.month);
        name.scope = "row";
        row.append(name, element("td", "", formatMetric({ value: month.cost, format: "eur" })),
          element("td", "", formatMetric({ value: month.ad_attributed_sales, format: "eur" })));
        body.append(row);
      }
      table.append(caption, head, body);
      section.append(table);
      history.append(section);
    }
    target.append(history);
  }
  // Each point needs its own source: no fabricated series, projections or null-to-zero coercion.
  const points = (data.series || []).filter(point =>
    point.status === "verified" && typeof point.value === "number" &&
    Number.isFinite(point.value) && point.value >= 0 && point.source &&
    typeof point.label === "string"
  );
  if (points.length) {
    const max = Math.max(...points.map(point => point.value));
    const chart = element("figure", "bar-chart");
    chart.append(element("figcaption", "note", "ADV / soli punti verificati; nessuna interpolazione dei mesi mancanti"));
    for (const point of points) chart.append(barRow(point.label, point.value, max, point.format));
    target.append(chart);
  }
  provenance(target, data);
}

function barRow(label, value, total, format = "integer") {
  const row = element("div", "bar-row");
  const track = element("div", "bar-track");
  track.setAttribute("aria-hidden", "true");
  const fill = element("span", "bar-fill");
  fill.style.width = (total > 0 ? Math.min(100, value / total * 100) : 0) + "%";
  track.append(fill);
  row.append(element("span", "", label), track, element("strong", "", formatMetric({ value, format })));
  return row;
}

function renderEbay(data) {
  const target = document.getElementById("ebay-snapshots");
  target.replaceChildren();
  for (const snapshot of data.snapshots || []) {
    const section = element("section", "snapshot");
    section.append(element("h4", "", "Snapshot " + snapshot.date.split("-").reverse().join(".") + " / " + (labels[snapshot.status] || missingValue)), metrics(snapshot.metrics));
    const counts = snapshot.availability;
    if (snapshot.status === "verified" && counts &&
        [counts.total, counts.purchasable, counts.zeroStock].every(value => Number.isInteger(value) && value >= 0) &&
        counts.total === counts.purchasable + counts.zeroStock && counts.total > 0) {
      const chart = element("figure", "bar-chart");
      chart.append(element("figcaption", "note", "Disponibilità catalogo / " + counts.total + " inserzioni"),
        barRow("Comprabili", counts.purchasable, counts.total),
        barRow("Stock zero", counts.zeroStock, counts.total));
      section.append(chart);
    }
    provenance(section, snapshot);
    target.append(section);
  }
  const window = data.advertisingWindow;
  if (window) {
    const section = element("section", "snapshot");
    section.append(element("h4", "", "Pubblicità / 3-9 ottobre 2026 / ultimi 7 giorni"), metrics(window.metrics));
    section.append(element("p", "note", "Impression giornaliere disponibili (9 ottobre parziale)"));
    section.append(metrics((window.daily || []).map(day => ({
      label: day.date.split("-").reverse().join(".") + (day.status === "partial" ? " / parziale" : ""),
      value: day.impressions, format: "integer"
    }))));
    section.append(element("p", "note", "Impression per gruppo / finestra 3-9 ottobre"));
    section.append(metrics((window.groups || []).map(group => ({
      label: group.label, value: group.impressions, format: "integer"
    }))));
    provenance(section, window);
    target.append(section);
  }
}

function renderKlaviyo(data) {
  const target = document.getElementById("klaviyo-data");
  target.replaceChildren(metrics(data.metrics));
  if (data.plan) {
    const plan = element("div", "plan");
    plan.append(element("span", "", "Checkout verificato / piano non acquistato"),
      element("strong", "", formatMetric({ value: data.plan.monthlyUsd, format: "decimal" }) + " USD / mese"),
      element("p", "", formatMetric({ value: data.plan.profiles, format: "integer" }) + " profili · " +
        formatMetric({ value: data.plan.sends, format: "integer" }) + " invii"),
      element("span", "badge pending", data.plan.purchased === false ? "Nessun acquisto effettuato" : "Stato acquisto da verificare"));
    target.append(plan);
  }
  provenance(target, data);
}

function renderActivities(items) {
  const target = document.getElementById("activities");
  target.replaceChildren();
  for (const item of items || []) {
    const card = element("article", "activity");
    card.append(element("span", "badge pending", item.status), element("h3", "", item.title), element("p", "", item.description));
    target.append(card);
  }
}

async function loadReport() {
  const status = document.getElementById("load-status");
  try {
    const response = await fetch("report-data.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Report non disponibile");
    const data = await response.json();
    if (data.schemaVersion !== 1 || data.reportPeriod?.id !== "2026-09" ||
        data.operationalAsOf !== "2026-10-09" ||
        !["seller", "vendor", "ebay"].every(key => data.monthly?.[key]) ||
        !data.operations?.ebay || !data.operations?.klaviyo || !data.adv2026) {
      throw new Error("Struttura dati non compatibile");
    }
    renderMonthly(data);
    renderAdv(data.adv2026);
    renderEbay(data.operations.ebay);
    renderKlaviyo(data.operations.klaviyo);
    renderActivities(data.activities);
    // Coverage text follows the JSON, including future parent integrations.
    const verified = Object.values(data.monthly).filter(channel => channel.status === "verified").map(channel => channel.title);
    status.textContent = "Settembre 2026 / canali verificati: " + (verified.join(", ") || "Da verificare") +
      ". I dati mancanti sono indicati come «Da verificare», mai come zero. Stato operativo separato al 9 ottobre.";
  } catch (error) {
    for (const id of ["monthly-channels", "adv-data", "ebay-snapshots", "klaviyo-data", "activities"]) {
      document.getElementById(id).replaceChildren(element("p", "data-notice", missingValue + ": dati non disponibili. Ricaricare la pagina o verificare il file report-data.json."));
    }
    status.textContent = "Dati del report non disponibili. Nessun valore sostitutivo mostrato; l'archivio resta accessibile.";
  }
}
loadReport();
