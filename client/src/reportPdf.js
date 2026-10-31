import { jsPDF } from 'jspdf';

const printableText = (value) => String(value ?? '')
  .replace(/[–—]/g, '-')
  .replace(/[^\x20-\x7E]/g, ' ');

export function createReportPdf(report, { token, patientName }) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 20;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const addPageIfNeeded = (height) => {
    if (y + height > pageHeight - margin) {
      pdf.addPage();
      y = margin;
    }
  };

  pdf.setProperties({
    title: `VisitWeave medical report - ${printableText(report.testName)}`,
    subject: 'Patient report summary',
  });
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  pdf.text('VisitWeave Medical Report', margin, y);
  y += 12;

  const demo = token === 'T-000' || String(report.summary).includes('DEMO ONLY');
  if (demo) {
    pdf.setFontSize(11);
    pdf.setTextColor(180, 50, 35);
    pdf.text('DEMO SAMPLE - NOT A REAL MEDICAL RECORD', margin, y);
    y += 9;
    pdf.setTextColor(0, 0, 0);
  }

  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Patient', margin, y);
  pdf.setFont('helvetica', 'normal');
  pdf.text(printableText(patientName), margin + 28, y);
  y += 7;

  pdf.setFont('helvetica', 'bold');
  pdf.text('Visit token', margin, y);
  pdf.setFont('helvetica', 'normal');
  pdf.text(printableText(token), margin + 28, y);
  y += 7;

  pdf.setFont('helvetica', 'bold');
  pdf.text('Test', margin, y);
  pdf.setFont('helvetica', 'normal');
  const testLines = pdf.splitTextToSize(printableText(report.testName), contentWidth - 28);
  pdf.text(testLines, margin + 28, y);
  y += Math.max(7, testLines.length * 5);

  pdf.setFont('helvetica', 'bold');
  pdf.text('Released', margin, y);
  pdf.setFont('helvetica', 'normal');
  const releaseDate = new Date(report.releasedAt);
  pdf.text(
    Number.isNaN(releaseDate.getTime()) ? 'Date unavailable' : releaseDate.toLocaleString('en-US'),
    margin + 28,
    y,
  );
  y += 12;

  addPageIfNeeded(12);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.text('Report summary', margin, y);
  y += 8;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  const summaryLines = pdf.splitTextToSize(printableText(report.summary), contentWidth);
  summaryLines.forEach((line) => {
    addPageIfNeeded(6);
    pdf.text(line, margin, y);
    y += 6;
  });

  if (demo) {
    y += 8;
    addPageIfNeeded(12);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(180, 50, 35);
    pdf.text('Fictional demonstration only. Not for clinical use.', margin, y);
    pdf.setTextColor(0, 0, 0);
  }

  const filename = printableText(`VisitWeave-${token}-${report.testName}`)
    .replace(/[^A-Za-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return {
    save: () => pdf.save(`${filename || 'medical-report'}.pdf`),
    output: (...args) => pdf.output(...args),
  };
}
