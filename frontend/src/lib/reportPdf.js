import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const SLATE_900 = [15, 23, 42];
const SLATE_500 = [100, 116, 139];
const SLATE_200 = [226, 232, 240];
const SLATE_50 = [248, 250, 252];
const BLUE_600 = [37, 99, 235];
const MARGIN = 14;

export const TONE_COLORS = {
  green: [5, 150, 105],
  amber: [217, 119, 6],
  red: [220, 38, 38],
  blue: BLUE_600,
  slate: SLATE_500,
};

// Intl uses non-breaking spaces (e.g. "R$ 1.234,56"), which the built-in PDF fonts render inconsistently.
export const pdfText = (value) => String(value ?? "").replace(/[\u00a0\u202f]/g, " ");

const imageFormat = (dataUrl) => {
  const m = /^data:image\/(png|jpe?g)/i.exec(dataUrl || "");
  if (!m) return null;
  return m[1].toLowerCase() === "png" ? "PNG" : "JPEG";
};

function drawHeader(doc, { clinic, title, subtitle }) {
  const pageWidth = doc.internal.pageSize.getWidth();
  let x = MARGIN;
  const top = 12;

  const format = imageFormat(clinic?.logo);
  if (format) {
    try {
      const props = doc.getImageProperties(clinic.logo);
      const h = 14;
      const w = Math.min(40, (props.width / props.height) * h);
      doc.addImage(clinic.logo, format, x, top, w, h);
      x += w + 4;
    } catch {
      // Logo inválida não deve impedir a geração do relatório.
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...SLATE_900);
  doc.text(pdfText(clinic?.clinic_name || "CliniFlow"), x, top + 5);

  const contact = [clinic?.phone, clinic?.email, clinic?.website].filter(Boolean).join("  ·  ");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...SLATE_500);
  if (clinic?.address) doc.text(pdfText(clinic.address), x, top + 10);
  if (contact) doc.text(pdfText(contact), x, top + (clinic?.address ? 14 : 10));

  const lineY = top + 19;
  doc.setDrawColor(...BLUE_600);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, lineY, pageWidth - MARGIN, lineY);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...SLATE_900);
  doc.text(pdfText(title), MARGIN, lineY + 10);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...SLATE_500);
  doc.text(pdfText(subtitle), MARGIN, lineY + 16);

  return lineY + 22;
}

function drawSummary(doc, items, startY) {
  if (!items?.length) return startY;
  const pageWidth = doc.internal.pageSize.getWidth();
  const gap = 4;
  const width = (pageWidth - MARGIN * 2 - gap * (items.length - 1)) / items.length;
  const height = 17;

  items.forEach((item, i) => {
    const x = MARGIN + i * (width + gap);
    doc.setFillColor(...SLATE_50);
    doc.setDrawColor(...SLATE_200);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, startY, width, height, 2, 2, "FD");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...SLATE_500);
    doc.text(pdfText(item.label).toUpperCase(), x + 4, startY + 6);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...(TONE_COLORS[item.tone] || SLATE_900));
    doc.text(pdfText(item.value), x + 4, startY + 13);
  });

  return startY + height + 6;
}

function drawFooters(doc, clinicName, generatedAt) {
  const pages = doc.internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setDrawColor(...SLATE_200);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, pageHeight - 12, pageWidth - MARGIN, pageHeight - 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...SLATE_500);
    doc.text(pdfText(`${clinicName} · Gerado pelo CliniFlow em ${generatedAt}`), MARGIN, pageHeight - 7);
    doc.text(`Página ${i} de ${pages}`, pageWidth - MARGIN, pageHeight - 7, { align: "right" });
  }
}

/**
 * columns: [{ header, key, width?, align?, tone?: (row) => toneName }]
 * summary: [{ label, value, tone? }]
 */
export function buildReportPdf({ title, period, clinic, columns, rows, summary, landscape = false, truncatedNote, footnote }) {
  const doc = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "mm", format: "a4" });
  const now = new Date();
  const generatedAt = `${now.toLocaleDateString("pt-BR")} às ${now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;

  let y = drawHeader(doc, { clinic, title, subtitle: period });
  y = drawSummary(doc, summary, y);

  if (truncatedNote) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(...TONE_COLORS.amber);
    doc.text(pdfText(truncatedNote), MARGIN, y);
    y += 5;
  }

  const body = rows.length
    ? rows.map((row) => columns.map((col) => pdfText(row[col.key]) || "—"))
    : [[{ content: "Nenhum registro encontrado no período selecionado.", colSpan: columns.length, styles: { halign: "center", textColor: SLATE_500, fontStyle: "italic" } }]];

  const columnStyles = {};
  columns.forEach((col, i) => {
    columnStyles[i] = { halign: col.align || "left", ...(col.width ? { cellWidth: col.width } : {}) };
  });

  autoTable(doc, {
    startY: y,
    head: [columns.map((c) => c.header)],
    body,
    theme: "plain",
    margin: { left: MARGIN, right: MARGIN, bottom: 18, top: 16 },
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: { top: 2.4, bottom: 2.4, left: 2.5, right: 2.5 }, textColor: SLATE_900, lineColor: SLATE_200, overflow: "linebreak", valign: "middle" },
    headStyles: { fillColor: SLATE_900, textColor: 255, fontStyle: "bold", fontSize: 8 },
    alternateRowStyles: { fillColor: SLATE_50 },
    bodyStyles: { lineWidth: { bottom: 0.15 } },
    columnStyles,
    didParseCell: (data) => {
      if (data.section === "head") {
        data.cell.styles.halign = columns[data.column.index]?.align || "left";
        return;
      }
      if (data.section !== "body" || !rows.length) return;
      const col = columns[data.column.index];
      const toneName = col?.tone?.(rows[data.row.index]);
      if (toneName) {
        data.cell.styles.textColor = TONE_COLORS[toneName] || SLATE_900;
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  if (footnote) {
    const pageHeight = doc.internal.pageSize.getHeight();
    let noteY = (doc.lastAutoTable?.finalY || y) + 6;
    if (noteY > pageHeight - 20) {
      doc.addPage();
      noteY = 20;
    }
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(...SLATE_500);
    doc.text(pdfText(footnote), MARGIN, noteY);
  }

  drawFooters(doc, clinic?.clinic_name || "CliniFlow", generatedAt);
  return doc;
}
