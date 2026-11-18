import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ApprovedRecipe, MonitoringSession } from '../types/monitoring';

export function exportSessionToExcel(session: MonitoringSession, recipe?: ApprovedRecipe): void {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Session Summary
  const summaryRows = [
    ['MoldWatch Monitoring Session Report', ''],
    ['Session ID', session.id],
    ['Machine', `${session.machineName} (${session.controllerModel})`],
    ['Product', session.product],
    ['Mold', session.mold],
    ['Shift', session.shift],
    ['Scheduled Date', session.scheduledDate],
    ['Scheduled Time', session.scheduledTime],
    ['Grace Period (min)', session.gracePeriodMinutes],
    ['Assigned Operator', session.assignedOperator],
    ['Session Status', session.status],
    ['Compliance State', session.complianceState],
    ['Completion %', `${session.completionPercent}%`],
    ['Recipe Reference', recipe ? `${recipe.name} (v${recipe.version})` : session.recipeId],
    ['Created At', session.createdAt],
    ['Completed At', session.completedAt ?? 'In Progress'],
    ['Immutable Record', session.isImmutableHistorical ? 'Yes (Locked)' : 'No'],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 24 }, { wch: 48 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Session Summary');

  // Sheet 2: Screen Captures & Extracted Parameters
  const paramHeader = [
    'Screen Order',
    'Screen Name',
    'Mandatory',
    'Screen Status',
    'Captured At',
    'Captured By',
    'Retakes',
    'Parameter',
    'Unit',
    'Extracted OCR',
    'Verified Value',
    'Approved Target',
    'Min Tol',
    'Max Tol',
    'Verified',
    'Manually Corrected',
    'Correction Reason',
    'Deviation Flag',
  ];
  const paramRows: (string | number | boolean)[][] = [paramHeader];

  for (const screen of session.screens) {
    if (screen.readings.length === 0) {
      paramRows.push([
        screen.order,
        screen.screenName,
        screen.mandatory ? 'Yes' : 'Additional',
        screen.status,
        screen.capturedAt ?? '-',
        screen.capturedBy ?? '-',
        screen.retakeCount,
        '-',
        '-',
        '-',
        '-',
        '-',
        '-',
        '-',
        false,
        false,
        '-',
        'none',
      ]);
      continue;
    }

    for (const r of screen.readings) {
      paramRows.push([
        screen.order,
        screen.screenName,
        screen.mandatory ? 'Yes' : 'Additional',
        screen.status,
        screen.capturedAt ?? '-',
        screen.capturedBy ?? '-',
        screen.retakeCount,
        r.label,
        r.unit,
        r.extractedValue ?? '',
        r.verifiedValue ?? '',
        r.approvedTarget,
        r.toleranceMin,
        r.toleranceMax,
        r.verified ? 'Yes' : 'No',
        r.manuallyCorrected ? 'Yes' : 'No',
        r.correctionReason ?? '',
        r.deviationFlag,
      ]);
    }
  }
  const wsParams = XLSX.utils.aoa_to_sheet(paramRows);
  wsParams['!cols'] = paramHeader.map(() => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(wb, wsParams, 'Parameters & OCR');

  // Sheet 3: Alarms & Corrections
  const alarmHeader = ['Timestamp', 'Severity', 'Type', 'Parameter', 'Message', 'Acknowledged'];
  const alarmRows = [
    alarmHeader,
    ...session.alarms.map((a) => [
      a.timestamp,
      a.severity,
      a.type,
      a.parameterKey ?? '-',
      a.message,
      a.acknowledged ? 'Yes' : 'No',
    ]),
  ];
  const wsAlarms = XLSX.utils.aoa_to_sheet(alarmRows);
  wsAlarms['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 52 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsAlarms, 'Alarms');

  // Sheet 4: Audit Log & Corrections
  const auditHeader = ['Timestamp', 'Actor', 'Role', 'Action', 'Detail'];
  const auditRows = [
    auditHeader,
    ...session.corrections.map((c) => [c.timestamp, c.actor, c.role, c.action, c.detail]),
    ...session.auditLog.map((a) => [a.timestamp, a.actor, a.role, a.action, a.detail]),
  ];
  const wsAudit = XLSX.utils.aoa_to_sheet(auditRows);
  wsAudit['!cols'] = [{ wch: 22 }, { wch: 20 }, { wch: 16 }, { wch: 24 }, { wch: 56 }];
  XLSX.utils.book_append_sheet(wb, wsAudit, 'Audit Trail');

  XLSX.writeFile(wb, `Session_${session.id}.xlsx`);
}

export function exportAllSessionsToExcel(sessions: MonitoringSession[]): void {
  const wb = XLSX.utils.book_new();
  const header = [
    'Session ID',
    'Date',
    'Time',
    'Machine',
    'Controller',
    'Product',
    'Mold',
    'Shift',
    'Operator',
    'Status',
    'Compliance State',
    'Completion %',
    'Alarms',
    'Corrections',
    'Completed At',
  ];
  const rows = [
    header,
    ...sessions.map((s) => [
      s.id,
      s.scheduledDate,
      s.scheduledTime,
      s.machineName,
      s.controllerModel,
      s.product,
      s.mold,
      s.shift,
      s.assignedOperator,
      s.status,
      s.complianceState,
      s.completionPercent,
      s.alarms.length,
      s.corrections.length,
      s.completedAt ?? '-',
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = header.map(() => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(wb, ws, 'Monitoring Sessions');
  XLSX.writeFile(wb, `MoldWatch_Sessions_Archive.xlsx`);
}

export function exportSessionToPdf(session: MonitoringSession, recipe?: ApprovedRecipe): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text('MoldWatch — Monitoring Session Traceability Report', 40, 44);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(`Session ID: ${session.id}   |   Generated: ${new Date().toISOString().slice(0, 19)}`, 40, 62);

  // Metadata table
  autoTable(doc, {
    startY: 78,
    head: [['Session Metadata', 'Value', 'Operational Context', 'Value']],
    body: [
      ['Machine', `${session.machineName}`, 'Product', session.product],
      ['Controller', session.controllerModel, 'Mold', session.mold],
      ['Scheduled Slot', `${session.scheduledDate} ${session.scheduledTime}`, 'Shift', session.shift],
      ['Operator', session.assignedOperator, 'Status / Completion', `${session.status} (${session.completionPercent}%)`],
      ['Compliance', session.complianceState, 'Approved Recipe', recipe ? `${recipe.name} v${recipe.version}` : session.recipeId],
    ],
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 5 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255 },
  });

  // Screen Checklist Table
  const afterMetaY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('Captured Parameter Screens', 40, afterMetaY);

  autoTable(doc, {
    startY: afterMetaY + 8,
    head: [['#', 'Screen Name', 'Type', 'Status', 'Captured At', 'Operator', 'Retakes']],
    body: session.screens.map((sc) => [
      sc.order,
      sc.screenName,
      sc.mandatory ? 'Mandatory' : 'Additional',
      sc.status,
      sc.capturedAt ? sc.capturedAt.replace('T', ' ').slice(0, 19) : 'Pending',
      sc.capturedBy ?? '-',
      sc.retakeCount,
    ]),
    theme: 'striped',
    styles: { fontSize: 8.5, cellPadding: 4.5 },
    headStyles: { fillColor: [29, 78, 216], textColor: 255 },
  });

  // Detailed Readings Table
  const afterScreensY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Extracted & Verified Process Parameters', 40, afterScreensY);

  const readingRows: (string | number)[][] = [];
  for (const sc of session.screens) {
    for (const r of sc.readings) {
      readingRows.push([
        sc.screenName.replace(' Screen', ''),
        r.label,
        r.unit,
        r.extractedValue !== null ? r.extractedValue : '-',
        r.verifiedValue !== null ? r.verifiedValue : '-',
        `${r.approvedTarget} (${r.toleranceMin}–${r.toleranceMax})`,
        r.verified ? 'Yes' : 'No',
        r.deviationFlag === 'none' ? 'Nominal' : r.deviationFlag,
      ]);
    }
  }

  autoTable(doc, {
    startY: afterScreensY + 8,
    head: [['Screen', 'Parameter', 'Unit', 'OCR', 'Verified', 'Recipe Target (Tol)', 'OK', 'Flag']],
    body: readingRows,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255 },
  });

  // Alarms & Audit Log
  const afterReadingsY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;
  if (session.alarms.length > 0 || session.corrections.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Alarms & Correction History', 40, afterReadingsY);

    autoTable(doc, {
      startY: afterReadingsY + 8,
      head: [['Timestamp', 'Category', 'Details']],
      body: [
        ...session.alarms.map((a) => [a.timestamp.replace('T', ' '), `Alarm (${a.type})`, a.message]),
        ...session.corrections.map((c) => [c.timestamp.replace('T', ' '), `Correction (${c.actor})`, c.detail]),
      ],
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [185, 28, 28], textColor: 255 },
    });
  }

  doc.save(`Session_${session.id}.pdf`);
}
