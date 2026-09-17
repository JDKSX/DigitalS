/* =================================================================
   Export — JDKS ARENA (§31)
   CSV built natively; XLSX via SheetJS lazy-loaded from CDN only when
   requested (keeps the initial page light — §36).
   ================================================================= */
import { levelForXp, badgeById } from './content.js';

/** Neutralise spreadsheet formula injection (=, +, -, @ leading chars). */
function safeCell(v) {
  const s = String(v == null ? '' : v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

/** Build a rows matrix (array of arrays) shared by CSV + XLSX. */
export function buildRows(users, content) {
  const missions = (content.missions || []).filter((m) => m.id !== 'boss');
  const boss = (content.missions || []).find((m) => m.id === 'boss');
  const header = ['Player ID', 'Nickname', 'Room',
    ...missions.map((m, i) => `M${i + 1} Score`),
    'Final Score', 'XP', 'Level', 'Badges', 'Completion'];
  const rows = users
    .slice()
    .sort((a, b) => (b.xp || 0) - (a.xp || 0))
    .map((u) => {
      const lv = levelForXp(content.levels || [], u.xp || 0);
      const badgeNames = (u.badges || []).map((id) => { const b = badgeById(content, id); return b ? (b.nameTh || b.name) : id; }).join(' | ');
      const done = (u.progress || 0);
      return [
        safeCell(u.playerId), safeCell(u.nickname), safeCell(u.room),
        ...missions.map((m) => (u.missionScores && u.missionScores[m.id]) || 0),
        (boss && u.missionScores && u.missionScores[boss.id]) || 0,
        u.xp || 0, lv ? `${lv.level} ${lv.nameTh || lv.name}` : '1',
        safeCell(badgeNames), `${done}/${missions.length}`,
      ];
    });
  return { header, rows };
}

export function toCSV(users, content) {
  const { header, rows } = buildRows(users, content);
  const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [header, ...rows].map((r) => r.map(esc).join(','));
  return '﻿' + lines.join('\r\n'); // BOM for Excel Thai support
}

export function download(filename, content, mime) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 500);
}

export function exportCSV(users, content, name = 'digital-survival') {
  download(`${name}.csv`, toCSV(users, content), 'text/csv;charset=utf-8');
}

export async function exportXLSX(users, content, name = 'digital-survival') {
  const XLSX = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm');
  const { header, rows } = buildRows(users, content);
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws['!cols'] = header.map((h) => ({ wch: Math.max(10, String(h).length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Results');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  download(`${name}.xlsx`, new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}
