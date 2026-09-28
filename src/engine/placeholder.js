/* Procedural demo artwork — no network, no binary assets in the bundle. */

let _c = null;      // the full circuit board
let _cache = new Map();

function circuitCanvas() {
  if (_c) return _c;
  const c = document.createElement('canvas'); c.width = 1600; c.height = 900;
  const g = c.getContext('2d');
  g.fillStyle = '#ece9e1'; g.fillRect(0, 0, 1600, 900);
  for (let i = 0; i < 260; i++) { g.fillStyle = 'rgba(40,40,45,' + (Math.random() * 0.07) + ')'; g.fillRect(Math.random() * 1600, Math.random() * 900, 2.2, 2.2); }
  g.strokeStyle = '#2b2b31'; g.fillStyle = '#2b2b31'; g.lineWidth = 5; g.lineCap = 'round'; g.lineJoin = 'round';
  const wire = p => { g.beginPath(); g.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]); g.stroke(); };
  const and = (x, y) => { g.beginPath(); g.moveTo(x - 55, y - 48); g.lineTo(x - 14, y - 48); g.arc(x - 14, y, 48, -Math.PI / 2, Math.PI / 2); g.lineTo(x - 55, y + 48); g.closePath(); g.fill(); };
  const org = (x, y) => { g.beginPath(); g.moveTo(x - 58, y - 48); g.quadraticCurveTo(x + 12, y - 48, x + 46, y); g.quadraticCurveTo(x + 12, y + 48, x - 58, y + 48); g.quadraticCurveTo(x - 28, y, x - 58, y - 48); g.closePath(); g.fill(); };
  const tri = (x, y) => { g.beginPath(); g.moveTo(x - 34, y - 30); g.lineTo(x + 32, y); g.lineTo(x - 34, y + 30); g.closePath(); g.fill(); };
  const bub = (x, y) => { g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); g.fillStyle = '#ece9e1'; g.beginPath(); g.arc(x, y, 4.5, 0, 7); g.fill(); g.fillStyle = '#2b2b31'; };
  const lab = (t, x, y, s, col) => { g.fillStyle = col || '#2b2b31'; g.font = 'italic 700 ' + s + 'px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, x, y); };
  const bn = (t, x, y, s) => { g.fillStyle = '#3c3c44'; g.font = '600 ' + s + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, x, y); };
  wire([[150, 186], [927, 186]]); wire([[150, 486], [705, 486]]);
  wire([[285, 486], [285, 585], [316, 585]]); wire([[150, 640], [440, 640], [440, 609], [457, 609]]);
  wire([[398, 585], [430, 585], [430, 561], [457, 561]]);
  wire([[561, 585], [640, 585], [640, 534], [705, 534]]);
  wire([[813, 510], [860, 510]]); wire([[860, 510], [860, 234], [927, 234]]);
  wire([[860, 510], [1160, 510], [1160, 274], [1212, 274]]);
  wire([[1031, 210], [1140, 210], [1140, 225], [1212, 225]]); wire([[1333, 250], [1435, 250]]);
  tri(350, 585); bub(391, 585); org(515, 585); and(760, 510); bub(804, 510);
  org(985, 210); org(1270, 250); bub(1324, 250);
  g.beginPath(); g.arc(860, 510, 7, 0, 7); g.fill();
  g.fillStyle = '#ece9e1'; g.beginPath(); g.arc(860, 510, 3, 0, 7); g.fill(); g.fillStyle = '#2b2b31';
  g.strokeRect(1080, 600, 300, 150);
  const arr = (x1, y, x2) => { wire([[x1, y], [x2, y]]); g.beginPath(); g.moveTo(x2, y); g.lineTo(x2 - 12, y - 6); g.lineTo(x2 - 12, y + 6); g.closePath(); g.fill(); };
  arr(990, 635, 1072); arr(990, 680, 1072); arr(990, 725, 1072); arr(1390, 660, 1470); arr(1390, 705, 1470);
  lab('A', 120, 186, 40); lab('B', 120, 486, 40); lab('C', 120, 640, 40);
  lab('F', 1462, 250, 44, '#8a2c2c'); lab('P', 826, 562, 34, '#8a2c2c'); lab('Q', 1258, 250, 30, '#ece9e1');
  bn('চিত্র-১', 430, 830, 34); bn('চিত্র-২', 1230, 795, 30);
  _c = c;
  return c;
}

export function placeholderImage() {
  if (_cache.has('full')) return _cache.get('full');
  const u = circuitCanvas().toDataURL('image/png');
  _cache.set('full', u);
  return u;
}

/* the same board, zoomed into the gate cluster — stands in for "a second
   photo of the same thing", which is the classic multi-image case */
export function placeholderZoom() {
  if (_cache.has('zoom')) return _cache.get('zoom');
  const src = circuitCanvas();
  const c = document.createElement('canvas'); c.width = 1600; c.height = 900;
  const g = c.getContext('2d');
  g.fillStyle = '#0e1422'; g.fillRect(0, 0, 1600, 900);
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 300, 380, 560, 315, 0, 0, 1600, 900);
  g.strokeStyle = '#ffd60a'; g.lineWidth = 4; g.setLineDash([16, 12]);
  g.strokeRect(40, 40, 1520, 820); g.setLineDash([]);
  g.fillStyle = '#ffd60a'; g.font = '700 40px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'top';
  g.fillText('ZOOM · GATE CLUSTER', 68, 66);
  const u = c.toDataURL('image/png');
  _cache.set('zoom', u);
  return u;
}

/* a dark "formula card" used as the top layer */
export function placeholderCard() {
  if (_cache.has('card')) return _cache.get('card');
  const c = document.createElement('canvas'); c.width = 1600; c.height = 900;
  const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 1600, 900);
  bg.addColorStop(0, '#0a0d15'); bg.addColorStop(1, '#182342');
  g.fillStyle = bg; g.fillRect(0, 0, 1600, 900);
  g.strokeStyle = 'rgba(255,214,10,.55)'; g.lineWidth = 3;
  g.strokeRect(70, 70, 1460, 760);
  g.fillStyle = '#ffd60a'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '700 150px Georgia, serif'; g.fillText('F = ĀBC', 800, 380);
  g.font = '600 46px sans-serif'; g.fillStyle = '#e8ecf5';
  g.fillText('De Morgan’s Theorem', 800, 540);
  g.strokeStyle = 'rgba(255,214,10,.35)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(560, 640); g.lineTo(1040, 640); g.stroke();
  g.fillStyle = '#8b94a8'; g.font = '600 32px sans-serif';
  g.fillText('NAND = AND + NOT', 800, 700);
  const u = c.toDataURL('image/png');
  _cache.set('card', u);
  return u;
}
